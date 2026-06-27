-- ============================================================================
-- إصلاح محاسبة تجديد PPP — الدفعة الفعلية لا تساوي المستحق دائماً
-- ============================================================================
-- payments.amount يجب أن يمثل ما تم تحصيله فعلاً (نقداً + تطبيق).
-- subscription_periods.amount_due يبقى هو المستحق الكامل، والباقي يُحسب كدين.

CREATE OR REPLACE FUNCTION renew_subscription(
  p_subscription_id   UUID,
  p_credential_id     UUID,
  p_amount            NUMERIC,
  p_method            TEXT,
  p_bank_account_id   UUID,
  p_nonce             TEXT,
  p_mac_address       TEXT DEFAULT NULL,
  p_cash_amount       NUMERIC DEFAULT NULL,
  p_app_amount        NUMERIC DEFAULT NULL,
  p_discount_amount   NUMERIC DEFAULT 0,
  p_balance_remaining NUMERIC DEFAULT 0,
  p_notes             TEXT DEFAULT NULL,
  p_source_account_label TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_tenant_id      UUID;
  v_customer_id    UUID;
  v_speed          TEXT;
  v_price          NUMERIC;
  v_old_end        DATE;
  v_period_start   DATE;
  v_username       TEXT;
  v_payment_id     UUID;
  v_period_id      UUID;
  v_cash           NUMERIC;
  v_app            NUMERIC;
  v_discount       NUMERIC;
  v_balance        NUMERIC;
  v_received       NUMERIC;
  v_payment_method TEXT;
BEGIN
  IF get_tenant_id() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF EXISTS (SELECT 1 FROM sync_nonces WHERE nonce = p_nonce) THEN
    RAISE EXCEPTION 'Duplicate nonce — 409 Conflict'
      USING ERRCODE = '23505';
  END IF;

  SELECT s.tenant_id, s.customer_id, s.speed, s.price, s.end_date
  INTO v_tenant_id, v_customer_id, v_speed, v_price, v_old_end
  FROM subscriptions s
  WHERE s.id = p_subscription_id
    AND s.tenant_id = get_tenant_id()
    AND s.is_deleted = false;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Subscription not found';
  END IF;

  IF p_credential_id IS NULL THEN
    RAISE EXCEPTION 'credential_id required for BB renewal';
  END IF;

  IF p_amount IS NULL OR p_amount < 0 THEN
    RAISE EXCEPTION 'amount_due must be valid';
  END IF;

  v_period_start := COALESCE(v_old_end, CURRENT_DATE);
  v_cash := COALESCE(p_cash_amount, CASE WHEN p_method = 'cash' THEN p_amount ELSE 0 END, 0);
  v_app := COALESCE(p_app_amount, CASE WHEN p_method IN ('reflect','jawwal_pay','bank') THEN p_amount ELSE 0 END, 0);
  v_discount := COALESCE(p_discount_amount, 0);

  IF v_cash < 0 OR v_app < 0 OR v_discount < 0 THEN
    RAISE EXCEPTION 'payment amounts must be non-negative';
  END IF;

  IF v_cash + v_app + v_discount > p_amount THEN
    RAISE EXCEPTION 'payment exceeds amount due';
  END IF;

  v_balance := GREATEST(p_amount - v_cash - v_app - v_discount, 0);
  v_received := v_cash + v_app;
  v_payment_method := CASE
    WHEN v_app > 0 THEN 'bank'
    WHEN v_cash > 0 THEN 'cash'
    ELSE p_method
  END;

  IF v_app > 0 AND p_bank_account_id IS NULL THEN
    RAISE EXCEPTION 'bank_account_id required for app amount';
  END IF;

  UPDATE subscriptions
  SET end_date = end_date + INTERVAL '1 month'
  WHERE id = p_subscription_id;

  SELECT username INTO v_username
  FROM internet_credentials
  WHERE id = p_credential_id
    AND tenant_id = v_tenant_id
    AND type = 'bb'
    AND is_deleted = false;

  IF v_username IS NULL THEN
    RAISE EXCEPTION 'Credential not found';
  END IF;

  UPDATE internet_credentials
  SET is_used = true
  WHERE id = p_credential_id AND tenant_id = v_tenant_id;

  INSERT INTO customer_credential_usage (
    tenant_id, customer_id, credential_id
  ) VALUES (
    v_tenant_id, v_customer_id, p_credential_id
  );

  IF v_received > 0 THEN
    INSERT INTO payments (
      tenant_id, customer_id, subscription_id,
      amount, method, bank_account_id, source_account_label, paid_at, notes
    ) VALUES (
      v_tenant_id, v_customer_id, p_subscription_id,
      v_received, v_payment_method, p_bank_account_id,
      NULLIF(trim(p_source_account_label), ''), now(), p_notes
    ) RETURNING id INTO v_payment_id;
  END IF;

  IF v_app > 0 AND p_bank_account_id IS NOT NULL THEN
    UPDATE company_bank_accounts
    SET current_total = COALESCE(current_total, 0) + v_app
    WHERE id = p_bank_account_id AND tenant_id = v_tenant_id;
  END IF;

  INSERT INTO subscription_periods (
    tenant_id, customer_id, subscription_id, credential_id, username,
    period_month, period_start, speed, mac_address, price, billing_label,
    amount_due, cash_amount, app_amount, discount_amount, balance_remaining,
    paid_at, payment_id, notes
  ) VALUES (
    v_tenant_id, v_customer_id, p_subscription_id, p_credential_id, v_username,
    EXTRACT(MONTH FROM v_period_start)::INTEGER,
    v_period_start, v_speed, NULLIF(trim(p_mac_address), ''), v_price, 'شهري',
    p_amount, v_cash, v_app, v_discount, v_balance,
    CASE WHEN v_received > 0 THEN now() ELSE NULL END, v_payment_id, p_notes
  ) RETURNING id INTO v_period_id;

  PERFORM upsert_subscription_period_debt(
    v_tenant_id, v_customer_id, v_period_id, v_balance,
    CASE
      WHEN p_method = 'debt' THEN 'تجديد PPP — دفع آجل (دين)'
      ELSE 'تجديد PPP — باقٍ غير مسدد'
    END
  );

  INSERT INTO sync_nonces (tenant_id, nonce)
  VALUES (v_tenant_id, p_nonce);

  RETURN v_period_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION renew_subscription(UUID, UUID, NUMERIC, TEXT, UUID, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION renew_subscription(UUID, UUID, NUMERIC, TEXT, UUID, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
