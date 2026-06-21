-- ============================================================
-- 024: الخيار 1 — دين فوري عند عدم الدفع / الباقي / طريقة «دين»
-- ============================================================

CREATE OR REPLACE FUNCTION calc_subscription_debt_amount(
  p_amount_due        NUMERIC,
  p_cash_amount       NUMERIC,
  p_app_amount        NUMERIC,
  p_discount_amount   NUMERIC,
  p_balance_remaining NUMERIC,
  p_paid_at           TIMESTAMPTZ,
  p_method            TEXT DEFAULT NULL,
  p_payment_amount    NUMERIC DEFAULT NULL
) RETURNS NUMERIC AS $$
DECLARE
  v_due  NUMERIC;
  v_debt NUMERIC;
BEGIN
  v_due := COALESCE(p_amount_due, 0);
  v_debt := COALESCE(p_balance_remaining, 0);

  IF v_debt <= 0 AND p_paid_at IS NULL THEN
    v_debt := GREATEST(
      v_due
        - COALESCE(p_cash_amount, 0)
        - COALESCE(p_app_amount, 0)
        - COALESCE(p_discount_amount, 0),
      0
    );
  END IF;

  IF p_method = 'debt' AND COALESCE(p_payment_amount, 0) > 0 THEN
    v_debt := GREATEST(v_debt, p_payment_amount);
  END IF;

  RETURN v_debt;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION insert_customer_debt_if_positive(
  p_tenant_id       UUID,
  p_customer_id     UUID,
  p_amount          NUMERIC,
  p_reason          TEXT,
  p_related_task_id UUID DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN;
  END IF;

  INSERT INTO debts (
    tenant_id, customer_id, original_amount, remaining_amount,
    reason, status, related_task_id
  ) VALUES (
    p_tenant_id, p_customer_id, p_amount, p_amount,
    p_reason, 'active', p_related_task_id
  );
END;
$$ LANGUAGE plpgsql;

-- ── create_subscription_with_period + دين ──
CREATE OR REPLACE FUNCTION create_subscription_with_period(
  p_customer_id       UUID,
  p_speed             TEXT,
  p_price             NUMERIC,
  p_start_date        DATE,
  p_end_date          DATE,
  p_mac_address       TEXT DEFAULT NULL,
  p_notes             TEXT DEFAULT NULL,
  p_amount_due        NUMERIC DEFAULT NULL,
  p_cash_amount       NUMERIC DEFAULT 0,
  p_app_amount        NUMERIC DEFAULT 0,
  p_discount_amount   NUMERIC DEFAULT 0,
  p_balance_remaining NUMERIC DEFAULT 0,
  p_paid_at           TIMESTAMPTZ DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_tenant_id       UUID;
  v_subscription_id UUID;
  v_due             NUMERIC;
  v_debt            NUMERIC;
BEGIN
  v_tenant_id := get_tenant_id();
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_customer_id IS NULL OR p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'Missing required fields';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM customers c
    WHERE c.id = p_customer_id
      AND c.tenant_id = v_tenant_id
      AND c.is_deleted = false
  ) THEN
    RAISE EXCEPTION 'Customer not found';
  END IF;

  v_due := COALESCE(p_amount_due, p_price, 0);

  INSERT INTO subscriptions (
    tenant_id, customer_id, type, speed, price,
    start_date, end_date, status
  ) VALUES (
    v_tenant_id, p_customer_id, 'bb', p_speed, p_price,
    p_start_date, p_end_date, 'active'
  ) RETURNING id INTO v_subscription_id;

  INSERT INTO subscription_periods (
    tenant_id, customer_id, subscription_id,
    period_month, period_start, speed, mac_address, price,
    billing_label, amount_due, cash_amount, app_amount,
    discount_amount, balance_remaining, paid_at, notes
  ) VALUES (
    v_tenant_id, p_customer_id, v_subscription_id,
    EXTRACT(MONTH FROM p_start_date)::INTEGER,
    p_start_date, p_speed, NULLIF(trim(p_mac_address), ''), p_price,
    'شهري', v_due,
    COALESCE(p_cash_amount, 0), COALESCE(p_app_amount, 0),
    COALESCE(p_discount_amount, 0), COALESCE(p_balance_remaining, 0),
    p_paid_at, p_notes
  );

  v_debt := calc_subscription_debt_amount(
    v_due, p_cash_amount, p_app_amount, p_discount_amount,
    p_balance_remaining, p_paid_at, NULL, NULL
  );

  PERFORM insert_customer_debt_if_positive(
    v_tenant_id, p_customer_id, v_debt,
    'اشتراك PPP — دورة أولى غير مسددة'
  );

  RETURN v_subscription_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── record_unpaid_subscription_period + دين ──
CREATE OR REPLACE FUNCTION record_unpaid_subscription_period(
  p_subscription_id UUID,
  p_mac_address       TEXT DEFAULT NULL,
  p_amount_due        NUMERIC DEFAULT NULL,
  p_notes             TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_tenant_id   UUID;
  v_customer_id UUID;
  v_speed       TEXT;
  v_price       NUMERIC;
  v_end_date    DATE;
  v_period_id   UUID;
  v_task_id     UUID;
  v_due_at      TIMESTAMPTZ;
  v_due         NUMERIC;
BEGIN
  v_tenant_id := get_tenant_id();
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT s.customer_id, s.speed, s.price, s.end_date
  INTO v_customer_id, v_speed, v_price, v_end_date
  FROM subscriptions s
  WHERE s.id = p_subscription_id
    AND s.tenant_id = v_tenant_id
    AND s.is_deleted = false;

  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'Subscription not found';
  END IF;

  v_due := COALESCE(p_amount_due, v_price, 0);
  v_due_at := COALESCE(v_end_date::TIMESTAMPTZ, now());

  INSERT INTO pending_tasks (
    tenant_id, customer_id, amount, due_at, status
  ) VALUES (
    v_tenant_id, v_customer_id, v_due, v_due_at, 'pending'
  ) RETURNING id INTO v_task_id;

  INSERT INTO subscription_periods (
    tenant_id, customer_id, subscription_id,
    period_month, period_start, speed, mac_address, price,
    billing_label, amount_due, pending_task_id, notes
  ) VALUES (
    v_tenant_id, v_customer_id, p_subscription_id,
    EXTRACT(MONTH FROM COALESCE(v_end_date, CURRENT_DATE))::INTEGER,
    COALESCE(v_end_date, CURRENT_DATE),
    v_speed, NULLIF(trim(p_mac_address), ''), v_price,
    'شهري', v_due, v_task_id, p_notes
  ) RETURNING id INTO v_period_id;

  PERFORM insert_customer_debt_if_positive(
    v_tenant_id, v_customer_id, v_due,
    'تجديد PPP — إشعار لاحقاً (غير مسدد)',
    v_task_id
  );

  RETURN v_period_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── renew_subscription + دين عند الباقي أو طريقة «دين» ──
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
  p_notes             TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_tenant_id     UUID;
  v_customer_id   UUID;
  v_speed         TEXT;
  v_price         NUMERIC;
  v_old_end       DATE;
  v_period_start  DATE;
  v_username      TEXT;
  v_payment_id    UUID;
  v_period_id     UUID;
  v_cash          NUMERIC;
  v_app           NUMERIC;
  v_discount      NUMERIC;
  v_balance       NUMERIC;
  v_debt          NUMERIC;
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

  v_period_start := COALESCE(v_old_end, CURRENT_DATE);
  v_cash := COALESCE(p_cash_amount, CASE WHEN p_method = 'cash' THEN p_amount ELSE 0 END, 0);
  v_app := COALESCE(p_app_amount, CASE WHEN p_method IN ('reflect','jawwal_pay','bank') THEN p_amount ELSE 0 END, 0);
  v_discount := COALESCE(p_discount_amount, 0);
  v_balance := COALESCE(p_balance_remaining, 0);

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

  INSERT INTO payments (
    tenant_id, customer_id, subscription_id,
    amount, method, bank_account_id, paid_at, notes
  ) VALUES (
    v_tenant_id, v_customer_id, p_subscription_id,
    p_amount, p_method, p_bank_account_id, now(), p_notes
  ) RETURNING id INTO v_payment_id;

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
    now(), v_payment_id, p_notes
  ) RETURNING id INTO v_period_id;

  v_debt := calc_subscription_debt_amount(
    p_amount, v_cash, v_app, v_discount, v_balance,
    now(), p_method, p_amount
  );

  IF p_method = 'debt' OR v_balance > 0 THEN
    PERFORM insert_customer_debt_if_positive(
      v_tenant_id, v_customer_id, v_debt,
      CASE
        WHEN p_method = 'debt' THEN 'تجديد PPP — دفع آجل (دين)'
        ELSE 'تجديد PPP — باقٍ غير مسدد'
      END
    );
  END IF;

  INSERT INTO sync_nonces (tenant_id, nonce)
  VALUES (v_tenant_id, p_nonce);

  RETURN v_period_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── Cron: تحويل مهام متأخرة لدين (بدون اشتراط related_payment_id) ──
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'overdue-to-debt') THEN
    PERFORM cron.unschedule('overdue-to-debt');
  END IF;
END $$;

SELECT cron.schedule('overdue-to-debt', '0 * * * *', $$
  INSERT INTO debts (tenant_id, customer_id, original_amount, remaining_amount, reason, status, related_task_id)
  SELECT
    pt.tenant_id,
    pt.customer_id,
    pt.amount,
    pt.amount,
    'مهمة متابعة متأخرة — دين',
    'temporary',
    pt.id
  FROM pending_tasks pt
  WHERE pt.status IN ('pending', 'reminded')
    AND pt.is_deleted = false
    AND pt.due_at < now() - INTERVAL '24 hours'
    AND pt.amount > 0
    AND NOT EXISTS (SELECT 1 FROM debts d WHERE d.related_task_id = pt.id AND d.is_deleted = false);

  UPDATE pending_tasks
  SET status = 'converted_to_debt'
  WHERE status IN ('pending', 'reminded')
    AND is_deleted = false
    AND due_at < now() - INTERVAL '24 hours'
    AND amount > 0
    AND EXISTS (SELECT 1 FROM debts d WHERE d.related_task_id = pending_tasks.id AND d.is_deleted = false);
$$);

REVOKE ALL ON FUNCTION calc_subscription_debt_amount(NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TIMESTAMPTZ, TEXT, NUMERIC) FROM PUBLIC;
REVOKE ALL ON FUNCTION insert_customer_debt_if_positive(UUID, UUID, NUMERIC, TEXT, UUID) FROM PUBLIC;

REVOKE ALL ON FUNCTION create_subscription_with_period(UUID, TEXT, NUMERIC, DATE, DATE, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_subscription_with_period(UUID, TEXT, NUMERIC, DATE, DATE, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TIMESTAMPTZ) TO authenticated;

REVOKE ALL ON FUNCTION record_unpaid_subscription_period(UUID, TEXT, NUMERIC, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION record_unpaid_subscription_period(UUID, TEXT, NUMERIC, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION renew_subscription(UUID, UUID, NUMERIC, TEXT, UUID, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION renew_subscription(UUID, UUID, NUMERIC, TEXT, UUID, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT) TO authenticated;
