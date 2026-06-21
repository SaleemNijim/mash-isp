-- ============================================================
-- 029: تسديد الديون — مشتركون (اشتراك / مهمة) + موزعون
-- ============================================================

-- ── BM5: إلغاء ديون المهام المعلقة فقط عند ربطها بالدفعة ──
CREATE OR REPLACE FUNCTION cancel_debt_on_payment() RETURNS TRIGGER AS $$
BEGIN
  UPDATE debts d
  SET
    status = 'cancelled',
    remaining_amount = 0
  FROM pending_tasks pt
  WHERE d.related_task_id = pt.id
    AND pt.related_payment_id = NEW.id
    AND d.tenant_id = NEW.tenant_id
    AND d.subscription_period_id IS NULL
    AND d.status NOT IN ('cancelled', 'paid');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── سجل استلام دفعات الموزعين ──
CREATE TABLE IF NOT EXISTS distributor_payment_receipts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  distributor_id  UUID NOT NULL REFERENCES distributors(id),
  amount          NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  method          TEXT NOT NULL
                  CHECK (method IN ('cash','reflect','jawwal_pay','bank')),
  bank_account_id UUID REFERENCES company_bank_accounts(id),
  proof_url       TEXT,
  notes           TEXT,
  is_deleted      BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_dist_receipt_bank
    CHECK (method = 'cash' OR bank_account_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_dist_payment_receipts_distributor
  ON distributor_payment_receipts (tenant_id, distributor_id, created_at DESC)
  WHERE is_deleted = false;

ALTER TABLE distributor_payment_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE distributor_payment_receipts FORCE ROW LEVEL SECURITY;

CREATE POLICY "dist_payment_receipts_tenant_all" ON distributor_payment_receipts
  FOR ALL USING (tenant_id = get_tenant_id());

CREATE POLICY "dist_payment_receipts_superadmin_all" ON distributor_payment_receipts
  FOR ALL USING (is_super_admin());

CREATE TRIGGER trg_soft_delete_dist_payment_receipts
  AFTER UPDATE ON distributor_payment_receipts
  FOR EACH ROW EXECUTE FUNCTION log_soft_delete();

-- ── تسديد دين مشترك (مرتبط بفترة اشتراك أو مهمة معلقة) ──
CREATE OR REPLACE FUNCTION settle_customer_debt(
  p_debt_id         UUID,
  p_cash_amount     NUMERIC DEFAULT 0,
  p_app_amount      NUMERIC DEFAULT 0,
  p_app_method      TEXT DEFAULT NULL,
  p_bank_account_id UUID DEFAULT NULL,
  p_notes           TEXT DEFAULT NULL,
  p_nonce           TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_tenant_id       UUID;
  v_customer_id     UUID;
  v_debt_remaining  NUMERIC;
  v_period_id       UUID;
  v_subscription_id UUID;
  v_related_task_id UUID;
  v_pay_total       NUMERIC;
  v_method          TEXT;
  v_new_balance     NUMERIC;
  v_payment_id      UUID;
  v_cash            NUMERIC;
  v_app             NUMERIC;
BEGIN
  v_tenant_id := get_tenant_id();
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_nonce IS NOT NULL AND EXISTS (SELECT 1 FROM sync_nonces WHERE nonce = p_nonce) THEN
    RAISE EXCEPTION 'Duplicate nonce — 409 Conflict'
      USING ERRCODE = '23505';
  END IF;

  v_cash := COALESCE(p_cash_amount, 0);
  v_app  := COALESCE(p_app_amount, 0);
  v_pay_total := v_cash + v_app;

  IF v_pay_total <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be positive';
  END IF;

  SELECT
    d.customer_id,
    COALESCE(d.remaining_amount, d.original_amount),
    d.subscription_period_id,
    d.related_task_id
  INTO v_customer_id, v_debt_remaining, v_period_id, v_related_task_id
  FROM debts d
  WHERE d.id = p_debt_id
    AND d.tenant_id = v_tenant_id
    AND d.is_deleted = false
    AND d.status IN ('active', 'temporary');

  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'Debt not found or already settled';
  END IF;

  IF v_pay_total > v_debt_remaining THEN
    RAISE EXCEPTION 'Payment exceeds remaining debt';
  END IF;

  IF v_app > 0 THEN
    IF p_app_method IS NULL OR p_app_method NOT IN ('reflect','jawwal_pay','bank') THEN
      RAISE EXCEPTION 'app_method required for electronic portion';
    END IF;
    IF p_bank_account_id IS NULL THEN
      RAISE EXCEPTION 'bank_account_id required for electronic payment';
    END IF;
    v_method := p_app_method;
  ELSE
    v_method := 'cash';
  END IF;

  IF v_period_id IS NOT NULL THEN
    SELECT sp.subscription_id
    INTO v_subscription_id
    FROM subscription_periods sp
    WHERE sp.id = v_period_id
      AND sp.tenant_id = v_tenant_id
      AND sp.is_deleted = false;

    IF v_subscription_id IS NULL THEN
      RAISE EXCEPTION 'Linked subscription period not found';
    END IF;

    UPDATE subscription_periods sp
    SET
      cash_amount = COALESCE(sp.cash_amount, 0) + v_cash,
      app_amount = COALESCE(sp.app_amount, 0) + v_app,
      balance_remaining = GREATEST(0, COALESCE(sp.balance_remaining, 0) - v_pay_total),
      paid_at = CASE
        WHEN GREATEST(0, COALESCE(sp.balance_remaining, 0) - v_pay_total) <= 0 THEN now()
        ELSE sp.paid_at
      END
    WHERE sp.id = v_period_id
      AND sp.tenant_id = v_tenant_id
      AND sp.is_deleted = false;

    v_new_balance := GREATEST(0, v_debt_remaining - v_pay_total);

    INSERT INTO payments (
      tenant_id, customer_id, subscription_id,
      amount, method, bank_account_id, paid_at, notes
    ) VALUES (
      v_tenant_id, v_customer_id, v_subscription_id,
      v_pay_total, v_method, p_bank_account_id, now(), p_notes
    ) RETURNING id INTO v_payment_id;

    UPDATE subscription_periods
    SET payment_id = v_payment_id
    WHERE id = v_period_id AND tenant_id = v_tenant_id;

    IF v_method NOT IN ('cash', 'debt') AND p_bank_account_id IS NOT NULL THEN
      UPDATE company_bank_accounts
      SET current_total = COALESCE(current_total, 0) + v_app
      WHERE id = p_bank_account_id AND tenant_id = v_tenant_id;
    END IF;

    PERFORM upsert_subscription_period_debt(
      v_tenant_id,
      v_customer_id,
      v_period_id,
      v_new_balance,
      'باقي غير مسدد — PPP اشتراك'
    );

    IF v_new_balance <= 0 THEN
      UPDATE debts
      SET status = 'paid', remaining_amount = 0
      WHERE id = p_debt_id AND tenant_id = v_tenant_id;
    ELSE
      UPDATE debts
      SET remaining_amount = v_new_balance, status = 'active'
      WHERE id = p_debt_id AND tenant_id = v_tenant_id;
    END IF;
  ELSE
    INSERT INTO payments (
      tenant_id, customer_id, subscription_id,
      amount, method, bank_account_id, paid_at, notes
    ) VALUES (
      v_tenant_id, v_customer_id, NULL,
      v_pay_total, v_method, p_bank_account_id, now(), p_notes
    ) RETURNING id INTO v_payment_id;

    IF v_method NOT IN ('cash', 'debt') AND p_bank_account_id IS NOT NULL THEN
      UPDATE company_bank_accounts
      SET current_total = COALESCE(current_total, 0) + v_app
      WHERE id = p_bank_account_id AND tenant_id = v_tenant_id;
    END IF;

    v_new_balance := GREATEST(0, v_debt_remaining - v_pay_total);

    IF v_new_balance <= 0 THEN
      UPDATE debts
      SET status = 'paid', remaining_amount = 0
      WHERE id = p_debt_id AND tenant_id = v_tenant_id;
    ELSE
      UPDATE debts
      SET remaining_amount = v_new_balance, status = 'active'
      WHERE id = p_debt_id AND tenant_id = v_tenant_id;
    END IF;

    IF v_related_task_id IS NOT NULL AND v_new_balance <= 0 THEN
      UPDATE pending_tasks
      SET status = 'completed'
      WHERE id = v_related_task_id
        AND tenant_id = v_tenant_id
        AND status IN ('pending', 'reminded', 'converted_to_debt');
    END IF;
  END IF;

  IF p_nonce IS NOT NULL THEN
    INSERT INTO sync_nonces (tenant_id, nonce) VALUES (v_tenant_id, p_nonce);
  END IF;

  RETURN v_payment_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── استلام دفعة من موزع (تقليل balance_due) ──
CREATE OR REPLACE FUNCTION receive_distributor_payment(
  p_distributor_id    UUID,
  p_amount            NUMERIC,
  p_method            TEXT,
  p_bank_account_id   UUID DEFAULT NULL,
  p_proof_url         TEXT DEFAULT NULL,
  p_notes             TEXT DEFAULT NULL,
  p_nonce             TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_tenant_id   UUID;
  v_balance_due NUMERIC;
  v_receipt_id  UUID;
BEGIN
  v_tenant_id := get_tenant_id();
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_nonce IS NOT NULL AND EXISTS (SELECT 1 FROM sync_nonces WHERE nonce = p_nonce) THEN
    RAISE EXCEPTION 'Duplicate nonce — 409 Conflict'
      USING ERRCODE = '23505';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  IF p_method NOT IN ('cash','reflect','jawwal_pay','bank') THEN
    RAISE EXCEPTION 'Invalid payment method';
  END IF;

  IF p_method <> 'cash' AND p_bank_account_id IS NULL THEN
    RAISE EXCEPTION 'bank_account_id required for electronic payment';
  END IF;

  SELECT balance_due INTO v_balance_due
  FROM distributors
  WHERE id = p_distributor_id
    AND tenant_id = v_tenant_id
    AND is_deleted = false;

  IF v_balance_due IS NULL THEN
    RAISE EXCEPTION 'Distributor not found';
  END IF;

  IF p_amount > v_balance_due THEN
    RAISE EXCEPTION 'Amount exceeds distributor balance due';
  END IF;

  UPDATE distributors
  SET balance_due = balance_due - p_amount
  WHERE id = p_distributor_id AND tenant_id = v_tenant_id;

  IF p_method NOT IN ('cash', 'debt') AND p_bank_account_id IS NOT NULL THEN
    UPDATE company_bank_accounts
    SET current_total = COALESCE(current_total, 0) + p_amount
    WHERE id = p_bank_account_id AND tenant_id = v_tenant_id;
  END IF;

  INSERT INTO distributor_payment_receipts (
    tenant_id, distributor_id, amount, method,
    bank_account_id, proof_url, notes
  ) VALUES (
    v_tenant_id, p_distributor_id, p_amount, p_method,
    p_bank_account_id, p_proof_url, p_notes
  ) RETURNING id INTO v_receipt_id;

  IF p_nonce IS NOT NULL THEN
    INSERT INTO sync_nonces (tenant_id, nonce) VALUES (v_tenant_id, p_nonce);
  END IF;

  RETURN v_receipt_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION settle_customer_debt(UUID, NUMERIC, NUMERIC, TEXT, UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION settle_customer_debt(UUID, NUMERIC, NUMERIC, TEXT, UUID, TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION receive_distributor_payment(UUID, NUMERIC, TEXT, UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION receive_distributor_payment(UUID, NUMERIC, TEXT, UUID, TEXT, TEXT, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
