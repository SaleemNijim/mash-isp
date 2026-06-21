-- ============================================================
-- 028: قبول credential محجوز مسبقاً (إدخال يدوي) عند إنشاء اشتراك
-- ============================================================

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
  p_paid_at           TIMESTAMPTZ DEFAULT NULL,
  p_credential_id     UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_tenant_id       UUID;
  v_subscription_id UUID;
  v_period_id       UUID;
  v_due             NUMERIC;
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
    AND (
      ic.is_used = false
      OR v_pre_reserved
    );

  IF v_username IS NULL THEN
    RAISE EXCEPTION 'Credential not found or already used';
  END IF;

  v_due := COALESCE(p_amount_due, p_price, 0);

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

  INSERT INTO subscription_periods (
    tenant_id, customer_id, subscription_id, credential_id, username,
    period_month, period_start, speed, mac_address, price,
    billing_label, amount_due, cash_amount, app_amount,
    discount_amount, balance_remaining, paid_at, notes
  ) VALUES (
    v_tenant_id, p_customer_id, v_subscription_id, p_credential_id, v_username,
    EXTRACT(MONTH FROM p_start_date)::INTEGER,
    p_start_date, p_speed, NULLIF(trim(p_mac_address), ''), p_price,
    'شهري', v_due,
    COALESCE(p_cash_amount, 0), COALESCE(p_app_amount, 0),
    COALESCE(p_discount_amount, 0), COALESCE(p_balance_remaining, 0),
    p_paid_at, p_notes
  ) RETURNING id INTO v_period_id;

  v_debt := calc_subscription_debt_amount(
    v_due, p_cash_amount, p_app_amount, p_discount_amount,
    p_balance_remaining, p_paid_at, NULL, NULL
  );

  PERFORM upsert_subscription_period_debt(
    v_tenant_id, p_customer_id, v_period_id, v_debt,
    'اشتراك PPP — باقٍ غير مسدد'
  );

  RETURN v_subscription_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION create_subscription_with_period(UUID, TEXT, NUMERIC, DATE, DATE, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TIMESTAMPTZ, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_subscription_with_period(UUID, TEXT, NUMERIC, DATE, DATE, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TIMESTAMPTZ, UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
