-- ============================================================
-- 027: إصلاح update_subscription_period_with_debt + إدخال يدوي BB
-- ============================================================

ALTER TABLE debts
  ADD COLUMN IF NOT EXISTS subscription_period_id UUID REFERENCES subscription_periods(id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_debt_subscription_period
  ON debts (subscription_period_id)
  WHERE subscription_period_id IS NOT NULL AND is_deleted = false;

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

  IF v_debt <= 0 THEN
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

CREATE OR REPLACE FUNCTION upsert_subscription_period_debt(
  p_tenant_id             UUID,
  p_customer_id           UUID,
  p_period_id             UUID,
  p_amount                NUMERIC,
  p_reason                TEXT,
  p_related_task_id       UUID DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
  IF p_period_id IS NULL THEN
    RETURN;
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    UPDATE debts
    SET status = 'cancelled', remaining_amount = 0
    WHERE subscription_period_id = p_period_id
      AND is_deleted = false
      AND status IN ('active', 'temporary');
    RETURN;
  END IF;

  UPDATE debts
  SET
    original_amount = p_amount,
    remaining_amount = p_amount,
    reason = p_reason,
    status = 'active',
    related_task_id = COALESCE(p_related_task_id, related_task_id)
  WHERE subscription_period_id = p_period_id
    AND is_deleted = false;

  IF NOT FOUND THEN
    INSERT INTO debts (
      tenant_id, customer_id, original_amount, remaining_amount,
      reason, status, related_task_id, subscription_period_id
    ) VALUES (
      p_tenant_id, p_customer_id, p_amount, p_amount,
      p_reason, 'active', p_related_task_id, p_period_id
    );
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_subscription_period_with_debt(
  p_period_id         UUID,
  p_username          TEXT DEFAULT NULL,
  p_period_month      INTEGER DEFAULT NULL,
  p_period_start      DATE DEFAULT NULL,
  p_speed             TEXT DEFAULT NULL,
  p_mac_address       TEXT DEFAULT NULL,
  p_price             NUMERIC DEFAULT NULL,
  p_billing_label     TEXT DEFAULT NULL,
  p_amount_due        NUMERIC DEFAULT NULL,
  p_cash_amount       NUMERIC DEFAULT 0,
  p_app_amount        NUMERIC DEFAULT 0,
  p_discount_amount   NUMERIC DEFAULT 0,
  p_balance_remaining NUMERIC DEFAULT 0,
  p_paid_at           TIMESTAMPTZ DEFAULT NULL,
  p_notes             TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_tenant_id   UUID;
  v_customer_id UUID;
  v_due         NUMERIC;
  v_debt        NUMERIC;
BEGIN
  v_tenant_id := get_tenant_id();
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE subscription_periods sp
  SET
    username = NULLIF(trim(p_username), ''),
    period_month = p_period_month,
    period_start = p_period_start,
    speed = NULLIF(trim(p_speed), ''),
    mac_address = NULLIF(trim(p_mac_address), ''),
    price = p_price,
    billing_label = COALESCE(NULLIF(trim(p_billing_label), ''), billing_label),
    amount_due = p_amount_due,
    cash_amount = COALESCE(p_cash_amount, 0),
    app_amount = COALESCE(p_app_amount, 0),
    discount_amount = COALESCE(p_discount_amount, 0),
    balance_remaining = COALESCE(p_balance_remaining, 0),
    paid_at = p_paid_at,
    notes = p_notes
  WHERE sp.id = p_period_id
    AND sp.tenant_id = v_tenant_id
    AND sp.is_deleted = false
  RETURNING sp.customer_id INTO v_customer_id;

  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'Period not found';
  END IF;

  v_due := COALESCE(p_amount_due, 0);

  v_debt := calc_subscription_debt_amount(
    v_due, p_cash_amount, p_app_amount, p_discount_amount,
    p_balance_remaining, p_paid_at, NULL, NULL
  );

  PERFORM upsert_subscription_period_debt(
    v_tenant_id, v_customer_id, p_period_id, v_debt,
    'اشتراك PPP — باقٍ غير مسدد'
  );

  RETURN p_period_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── إنشاء/حجز BB يدوياً (إدخال username + password) ──
CREATE OR REPLACE FUNCTION create_and_reserve_bb_credential(
  p_username    TEXT,
  p_password    TEXT,
  p_customer_id UUID
) RETURNS UUID AS $$
DECLARE
  v_tenant_id UUID;
  v_id        UUID;
  v_existing  UUID;
  v_used      BOOLEAN;
BEGIN
  v_tenant_id := get_tenant_id();
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_customer_id IS NULL OR NULLIF(trim(p_username), '') IS NULL THEN
    RAISE EXCEPTION 'username and customer required';
  END IF;

  IF p_password IS NULL OR trim(p_password) = '' THEN
    RAISE EXCEPTION 'password required';
  END IF;

  SELECT id, is_used INTO v_existing, v_used
  FROM internet_credentials
  WHERE tenant_id = v_tenant_id
    AND username = trim(p_username)
    AND type = 'bb'
    AND is_deleted = false;

  IF v_existing IS NOT NULL THEN
    IF v_used THEN
      RAISE EXCEPTION 'Username already used';
    END IF;
    v_id := v_existing;
  ELSE
    INSERT INTO internet_credentials (tenant_id, username, type, is_used)
    VALUES (v_tenant_id, trim(p_username), 'bb', false)
    RETURNING id INTO v_id;
  END IF;

  PERFORM set_credential_password(v_id, p_password);

  UPDATE internet_credentials
  SET is_used = true
  WHERE id = v_id AND tenant_id = v_tenant_id;

  INSERT INTO customer_credential_usage (tenant_id, customer_id, credential_id)
  VALUES (v_tenant_id, p_customer_id, v_id);

  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION update_subscription_period_with_debt(UUID, TEXT, INTEGER, DATE, TEXT, TEXT, NUMERIC, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TIMESTAMPTZ, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_subscription_period_with_debt(UUID, TEXT, INTEGER, DATE, TEXT, TEXT, NUMERIC, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TIMESTAMPTZ, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION create_and_reserve_bb_credential(TEXT, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_and_reserve_bb_credential(TEXT, TEXT, UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
