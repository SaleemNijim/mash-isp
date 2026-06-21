-- ============================================================
-- 023: إزالة توقيع RPC القديم + توحيد create_subscription_with_period
-- ============================================================

DROP FUNCTION IF EXISTS create_subscription_with_period(UUID, TEXT, NUMERIC, DATE, DATE, TEXT, TEXT);

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

  RETURN v_subscription_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION create_subscription_with_period(UUID, TEXT, NUMERIC, DATE, DATE, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_subscription_with_period(UUID, TEXT, NUMERIC, DATE, DATE, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TIMESTAMPTZ) TO authenticated;
