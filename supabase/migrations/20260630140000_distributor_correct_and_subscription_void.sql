-- ============================================================
-- correct_distributor_sale + void_subscription_period
-- ============================================================

-- تصحيح بيع موزع (إلغاء + إعادة تسجيل ذري — يسترجع المخزون ثم يخصم من جديد)
CREATE OR REPLACE FUNCTION correct_distributor_sale(
  p_sale_id              UUID,
  p_distributor_id       UUID,
  p_commission_percent   NUMERIC,
  p_payment_method       TEXT,
  p_bank_account_id      UUID,
  p_proof_url            TEXT,
  p_items                JSONB,
  p_nonce                TEXT,
  p_source_account_label TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_void_nonce TEXT;
  v_new_id     UUID;
BEGIN
  IF get_tenant_id() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF EXISTS (SELECT 1 FROM sync_nonces WHERE nonce = p_nonce) THEN
    RAISE EXCEPTION 'Duplicate nonce — 409 Conflict'
      USING ERRCODE = '23505';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM card_distributor_sales
    WHERE id = p_sale_id
      AND tenant_id = get_tenant_id()
      AND is_deleted = false
  ) THEN
    RAISE EXCEPTION 'Sale not found';
  END IF;

  v_void_nonce := gen_random_uuid()::TEXT;
  PERFORM void_distributor_sale(p_sale_id, v_void_nonce);

  v_new_id := sell_cards(
    p_distributor_id,
    p_commission_percent,
    p_payment_method,
    p_bank_account_id,
    p_proof_url,
    p_items,
    p_nonce,
    p_source_account_label
  );

  RETURN v_new_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- إلغاء فترة اشتراك من سجل المبيعات (عكس بنك + إلغاء دين + حذف ناعم)
CREATE OR REPLACE FUNCTION void_subscription_period(
  p_period_id UUID,
  p_nonce     TEXT DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
  v_tenant_id UUID;
  v_period    RECORD;
  v_payment   RECORD;
BEGIN
  v_tenant_id := get_tenant_id();
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_nonce IS NOT NULL AND EXISTS (SELECT 1 FROM sync_nonces WHERE nonce = p_nonce) THEN
    RAISE EXCEPTION 'Duplicate nonce — 409 Conflict'
      USING ERRCODE = '23505';
  END IF;

  SELECT id, payment_id, pending_task_id, app_amount
  INTO v_period
  FROM subscription_periods
  WHERE id = p_period_id
    AND tenant_id = v_tenant_id
    AND is_deleted = false;

  IF v_period.id IS NULL THEN
    RAISE EXCEPTION 'Period not found';
  END IF;

  IF EXISTS (
    SELECT 1 FROM debts d
    WHERE d.subscription_period_id = p_period_id
      AND d.tenant_id = v_tenant_id
      AND d.is_deleted = false
      AND d.status = 'active'
      AND d.remaining_amount < d.original_amount
  ) THEN
    RAISE EXCEPTION 'Cannot void period with partial debt payment';
  END IF;

  IF v_period.payment_id IS NOT NULL THEN
    SELECT amount, method, bank_account_id
    INTO v_payment
    FROM payments
    WHERE id = v_period.payment_id
      AND tenant_id = v_tenant_id
      AND is_deleted = false;

    IF v_payment.bank_account_id IS NOT NULL
      AND COALESCE(v_payment.amount, 0) > 0
      AND v_payment.method NOT IN ('cash', 'debt') THEN
      UPDATE company_bank_accounts
      SET current_total = GREATEST(0, COALESCE(current_total, 0) - v_payment.amount)
      WHERE id = v_payment.bank_account_id AND tenant_id = v_tenant_id;
    END IF;

    UPDATE payments
    SET is_deleted = true
    WHERE id = v_period.payment_id AND tenant_id = v_tenant_id;
  END IF;

  UPDATE debts
  SET status = 'cancelled', remaining_amount = 0
  WHERE subscription_period_id = p_period_id
    AND tenant_id = v_tenant_id
    AND is_deleted = false
    AND status IN ('active', 'temporary');

  IF v_period.pending_task_id IS NOT NULL THEN
    UPDATE pending_tasks
    SET status = 'completed'
    WHERE id = v_period.pending_task_id
      AND tenant_id = v_tenant_id
      AND is_deleted = false;
  END IF;

  UPDATE subscription_periods
  SET is_deleted = true, payment_id = NULL, pending_task_id = NULL
  WHERE id = p_period_id AND tenant_id = v_tenant_id;

  IF p_nonce IS NOT NULL THEN
    INSERT INTO sync_nonces (tenant_id, nonce) VALUES (v_tenant_id, p_nonce);
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION correct_distributor_sale(UUID, UUID, NUMERIC, TEXT, UUID, TEXT, JSONB, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION correct_distributor_sale(UUID, UUID, NUMERIC, TEXT, UUID, TEXT, JSONB, TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION void_subscription_period(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION void_subscription_period(UUID, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
