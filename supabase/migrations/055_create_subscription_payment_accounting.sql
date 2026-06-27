-- ============================================================================
-- 055: ربط إنشاء اشتراك PPP بسجل الدفعات والحسابات البنكية
-- ============================================================================
-- إنشاء الاشتراك كان يسجل subscription_periods والديون فقط، لكنه لا ينشئ
-- payment ولا يزيد رصيد حساب الشركة عند وجود مبلغ عبر التطبيق.

DROP FUNCTION IF EXISTS create_subscription_with_period(
  UUID, TEXT, NUMERIC, DATE, DATE, TEXT, TEXT,
  NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TIMESTAMPTZ, UUID
);

CREATE OR REPLACE FUNCTION create_subscription_with_period(
  p_customer_id           UUID,
  p_speed                 TEXT,
  p_price                 NUMERIC,
  p_start_date            DATE,
  p_end_date              DATE,
  p_mac_address           TEXT DEFAULT NULL,
  p_notes                 TEXT DEFAULT NULL,
  p_amount_due            NUMERIC DEFAULT NULL,
  p_cash_amount           NUMERIC DEFAULT 0,
  p_app_amount            NUMERIC DEFAULT 0,
  p_discount_amount       NUMERIC DEFAULT 0,
  p_balance_remaining     NUMERIC DEFAULT 0,
  p_paid_at               TIMESTAMPTZ DEFAULT NULL,
  p_credential_id         UUID DEFAULT NULL,
  p_bank_account_id       UUID DEFAULT NULL,
  p_source_account_label  TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_tenant_id       UUID;
  v_subscription_id UUID;
  v_period_id       UUID;
  v_payment_id      UUID;
  v_due             NUMERIC;
  v_cash            NUMERIC;
  v_app             NUMERIC;
  v_paid_total      NUMERIC;
  v_method          TEXT;
  v_paid_at         TIMESTAMPTZ;
  v_debt            NUMERIC;
  v_username        TEXT;
  v_pre_reserved    BOOLEAN := false;
BEGIN
  v_tenant_id := get_tenant_id();
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_customer_id IS NULL OR p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'Missing required fields';
  END IF;

  IF p_credential_id IS NULL THEN
    RAISE EXCEPTION 'credential_id required — اختر username BB غير مستخدم';
  END IF;

  v_due := COALESCE(p_amount_due, p_price, 0);
  v_cash := COALESCE(p_cash_amount, 0);
  v_app := COALESCE(p_app_amount, 0);
  v_paid_total := v_cash + v_app;
  v_paid_at := COALESCE(p_paid_at, now());

  IF v_cash < 0 OR v_app < 0 OR COALESCE(p_discount_amount, 0) < 0 OR COALESCE(p_balance_remaining, 0) < 0 THEN
    RAISE EXCEPTION 'Payment values cannot be negative';
  END IF;

  IF v_app > 0 AND p_bank_account_id IS NULL THEN
    RAISE EXCEPTION 'bank_account_id required for app payment';
  END IF;

  IF v_app > 0 AND NOT EXISTS (
    SELECT 1 FROM company_bank_accounts a
    WHERE a.id = p_bank_account_id
      AND a.tenant_id = v_tenant_id
      AND a.is_deleted = false
  ) THEN
    RAISE EXCEPTION 'bank account not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM customers c
    WHERE c.id = p_customer_id
      AND c.tenant_id = v_tenant_id
      AND c.is_deleted = false
  ) THEN
    RAISE EXCEPTION 'Customer not found';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM customer_credential_usage ccu
    WHERE ccu.credential_id = p_credential_id
      AND ccu.customer_id = p_customer_id
      AND ccu.tenant_id = v_tenant_id
      AND ccu.is_deleted = false
  ) INTO v_pre_reserved;

  SELECT ic.username INTO v_username
  FROM internet_credentials ic
  WHERE ic.id = p_credential_id
    AND ic.tenant_id = v_tenant_id
    AND ic.type = 'bb'
    AND ic.is_deleted = false
    AND (ic.is_used = false OR v_pre_reserved);

  IF v_username IS NULL THEN
    RAISE EXCEPTION 'Credential not found or already used';
  END IF;

  INSERT INTO subscriptions (
    tenant_id, customer_id, type, speed, price,
    start_date, end_date, status
  ) VALUES (
    v_tenant_id, p_customer_id, 'bb', p_speed, p_price,
    p_start_date, p_end_date, 'active'
  ) RETURNING id INTO v_subscription_id;

  UPDATE internet_credentials
  SET is_used = true
  WHERE id = p_credential_id AND tenant_id = v_tenant_id;

  IF NOT v_pre_reserved THEN
    INSERT INTO customer_credential_usage (
      tenant_id, customer_id, credential_id
    ) VALUES (
      v_tenant_id, p_customer_id, p_credential_id
    );
  END IF;

  IF v_paid_total > 0 THEN
    v_method := CASE WHEN v_app > 0 THEN 'bank' ELSE 'cash' END;

    INSERT INTO payments (
      tenant_id, customer_id, subscription_id,
      amount, method, bank_account_id, source_account_label, paid_at, notes
    ) VALUES (
      v_tenant_id, p_customer_id, v_subscription_id,
      v_paid_total,
      v_method,
      CASE WHEN v_app > 0 THEN p_bank_account_id ELSE NULL END,
      CASE WHEN v_app > 0 THEN NULLIF(trim(p_source_account_label), '') ELSE NULL END,
      v_paid_at,
      p_notes
    ) RETURNING id INTO v_payment_id;

    IF v_app > 0 THEN
      UPDATE company_bank_accounts
      SET current_total = COALESCE(current_total, 0) + v_app
      WHERE id = p_bank_account_id AND tenant_id = v_tenant_id;
    END IF;
  END IF;

  INSERT INTO subscription_periods (
    tenant_id, customer_id, subscription_id, credential_id, username,
    period_month, period_start, speed, mac_address, price,
    billing_label, amount_due, cash_amount, app_amount,
    discount_amount, balance_remaining, paid_at, payment_id, notes
  ) VALUES (
    v_tenant_id, p_customer_id, v_subscription_id, p_credential_id, v_username,
    EXTRACT(MONTH FROM p_start_date)::INTEGER,
    p_start_date, p_speed, NULLIF(trim(p_mac_address), ''), p_price,
    'شهري', v_due,
    v_cash, v_app,
    COALESCE(p_discount_amount, 0), COALESCE(p_balance_remaining, 0),
    CASE WHEN v_paid_total > 0 THEN v_paid_at ELSE NULL END,
    v_payment_id,
    p_notes
  ) RETURNING id INTO v_period_id;

  v_debt := calc_subscription_debt_amount(
    v_due, v_cash, v_app, p_discount_amount,
    p_balance_remaining, CASE WHEN v_paid_total > 0 THEN v_paid_at ELSE NULL END,
    v_method, v_paid_total
  );

  PERFORM upsert_subscription_period_debt(
    v_tenant_id, p_customer_id, v_period_id, v_debt,
    'اشتراك PPP — باقٍ غير مسدد'
  );

  RETURN v_subscription_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION create_subscription_with_period(
  UUID, TEXT, NUMERIC, DATE, DATE, TEXT, TEXT,
  NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TIMESTAMPTZ, UUID, UUID, TEXT
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_subscription_with_period(
  UUID, TEXT, NUMERIC, DATE, DATE, TEXT, TEXT,
  NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TIMESTAMPTZ, UUID, UUID, TEXT
) TO authenticated;

NOTIFY pgrst, 'reload schema';
