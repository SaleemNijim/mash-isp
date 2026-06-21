-- ============================================================
-- 030: الحساب الصادر + إثبات اختياري + توحيد التحويل البنكي
-- ============================================================

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS source_account_label TEXT;

ALTER TABLE distributor_payment_receipts
  ADD COLUMN IF NOT EXISTS source_account_label TEXT;

ALTER TABLE card_distributor_sales
  ADD COLUMN IF NOT EXISTS source_account_label TEXT;

ALTER TABLE card_retail_sales
  ADD COLUMN IF NOT EXISTS source_account_label TEXT;

-- ── settle_customer_debt + source_account_label ──
CREATE OR REPLACE FUNCTION settle_customer_debt(
  p_debt_id              UUID,
  p_cash_amount          NUMERIC DEFAULT 0,
  p_app_amount           NUMERIC DEFAULT 0,
  p_app_method           TEXT DEFAULT NULL,
  p_bank_account_id      UUID DEFAULT NULL,
  p_source_account_label TEXT DEFAULT NULL,
  p_notes                TEXT DEFAULT NULL,
  p_nonce                TEXT DEFAULT NULL
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
      RAISE EXCEPTION 'app_method required for bank transfer';
    END IF;
    IF p_bank_account_id IS NULL THEN
      RAISE EXCEPTION 'bank_account_id required for bank transfer';
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
      amount, method, bank_account_id, source_account_label, paid_at, notes
    ) VALUES (
      v_tenant_id, v_customer_id, v_subscription_id,
      v_pay_total, v_method, p_bank_account_id, NULLIF(trim(p_source_account_label), ''), now(), p_notes
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
      amount, method, bank_account_id, source_account_label, paid_at, notes
    ) VALUES (
      v_tenant_id, v_customer_id, NULL,
      v_pay_total, v_method, p_bank_account_id, NULLIF(trim(p_source_account_label), ''), now(), p_notes
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

-- ── receive_distributor_payment + source_account_label ──
CREATE OR REPLACE FUNCTION receive_distributor_payment(
  p_distributor_id       UUID,
  p_amount               NUMERIC,
  p_method               TEXT,
  p_bank_account_id      UUID DEFAULT NULL,
  p_source_account_label TEXT DEFAULT NULL,
  p_proof_url            TEXT DEFAULT NULL,
  p_notes                TEXT DEFAULT NULL,
  p_nonce                TEXT DEFAULT NULL
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
    RAISE EXCEPTION 'bank_account_id required for bank transfer';
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
    bank_account_id, source_account_label, proof_url, notes
  ) VALUES (
    v_tenant_id, p_distributor_id, p_amount, p_method,
    p_bank_account_id, NULLIF(trim(p_source_account_label), ''), p_proof_url, p_notes
  ) RETURNING id INTO v_receipt_id;

  IF p_nonce IS NOT NULL THEN
    INSERT INTO sync_nonces (tenant_id, nonce) VALUES (v_tenant_id, p_nonce);
  END IF;

  RETURN v_receipt_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── sell_cards — إثبات اختياري + source_account_label ──
CREATE OR REPLACE FUNCTION sell_cards(
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
  v_tenant_id        UUID;
  v_sale_id          UUID;
  v_distributor_name TEXT;
  v_balance_due      NUMERIC;
  v_item             JSONB;
  v_product_id       UUID;
  v_batch_id         UUID;
  v_qty              INTEGER;
  v_unit_price       NUMERIC;
  v_list_price       NUMERIC;
  v_stock            INTEGER;
  v_total            NUMERIC := 0;
BEGIN
  v_tenant_id := get_tenant_id();
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF EXISTS (SELECT 1 FROM sync_nonces WHERE nonce = p_nonce) THEN
    RAISE EXCEPTION 'Duplicate nonce — 409 Conflict'
      USING ERRCODE = '23505';
  END IF;

  IF p_payment_method NOT IN ('cash','debt','reflect','jawwal_pay','bank') THEN
    RAISE EXCEPTION 'Invalid payment_method';
  END IF;

  IF p_payment_method IN ('reflect','jawwal_pay','bank') THEN
    IF p_bank_account_id IS NULL THEN
      RAISE EXCEPTION 'bank_account_id required for bank transfer';
    END IF;
  END IF;

  SELECT name, balance_due
  INTO v_distributor_name, v_balance_due
  FROM distributors
  WHERE id = p_distributor_id
    AND tenant_id = v_tenant_id
    AND is_deleted = false;

  IF v_distributor_name IS NULL THEN
    RAISE EXCEPTION 'Distributor not found';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'At least one item is required';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_qty        := (v_item->>'quantity')::INTEGER;
    v_unit_price := (v_item->>'unit_price')::NUMERIC;

    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'Invalid quantity';
    END IF;

    SELECT quantity_in_stock INTO v_stock
    FROM card_products
    WHERE id = v_product_id
      AND tenant_id = v_tenant_id
      AND is_deleted = false;

    IF v_stock IS NULL THEN
      RAISE EXCEPTION 'Product not found';
    END IF;

    IF v_qty > v_stock THEN
      RAISE EXCEPTION 'Insufficient stock for product %', v_product_id;
    END IF;

    v_total := v_total + (v_qty * v_unit_price);
  END LOOP;

  INSERT INTO card_distributor_sales (
    tenant_id, distributor_id, distributor_name, total_amount,
    commission_percent, previous_balance, bank_account_id,
    payment_method, proof_url, source_account_label
  ) VALUES (
    v_tenant_id, p_distributor_id, v_distributor_name, v_total,
    p_commission_percent, v_balance_due, p_bank_account_id,
    p_payment_method, p_proof_url, NULLIF(trim(p_source_account_label), '')
  ) RETURNING id INTO v_sale_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_qty        := (v_item->>'quantity')::INTEGER;
    v_unit_price := (v_item->>'unit_price')::NUMERIC;
    v_batch_id   := NULLIF(v_item->>'batch_id', '')::UUID;

    SELECT COALESCE(sale_price, v_unit_price) INTO v_list_price
    FROM card_products
    WHERE id = v_product_id AND tenant_id = v_tenant_id;

    v_batch_id := deduct_batch_stock_fifo(
      v_tenant_id, v_product_id, v_qty, v_batch_id
    );

    INSERT INTO card_sale_items (
      tenant_id, sale_id, product_id, quantity, unit_price, list_price, batch_id
    ) VALUES (
      v_tenant_id, v_sale_id, v_product_id, v_qty, v_unit_price, v_list_price, v_batch_id
    );

    UPDATE card_products
    SET quantity_in_stock = quantity_in_stock - v_qty
    WHERE id = v_product_id AND tenant_id = v_tenant_id;
  END LOOP;

  IF p_payment_method = 'debt' THEN
    UPDATE distributors
    SET balance_due = balance_due + v_total
    WHERE id = p_distributor_id AND tenant_id = v_tenant_id;
  ELSIF p_bank_account_id IS NOT NULL
    AND p_payment_method IN ('reflect','jawwal_pay','bank') THEN
    UPDATE company_bank_accounts
    SET current_total = COALESCE(current_total, 0) + v_total
    WHERE id = p_bank_account_id AND tenant_id = v_tenant_id;
  END IF;

  INSERT INTO sync_nonces (tenant_id, nonce) VALUES (v_tenant_id, p_nonce);

  RETURN v_sale_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── sell_retail_cards — إثبات اختياري + source_account_label ──
CREATE OR REPLACE FUNCTION sell_retail_cards(
  p_product_id           UUID,
  p_quantity             INTEGER,
  p_unit_price           NUMERIC,
  p_sale_type            TEXT,
  p_method               TEXT,
  p_bank_account_id      UUID,
  p_notes                TEXT,
  p_proof_url            TEXT,
  p_batch_id             UUID,
  p_nonce                TEXT,
  p_source_account_label TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_tenant_id  UUID;
  v_sale_id    UUID;
  v_stock      INTEGER;
  v_total      NUMERIC;
  v_list_price NUMERIC;
  v_batch_used UUID;
BEGIN
  v_tenant_id := get_tenant_id();
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF EXISTS (SELECT 1 FROM sync_nonces WHERE nonce = p_nonce) THEN
    RAISE EXCEPTION 'Duplicate nonce — 409 Conflict'
      USING ERRCODE = '23505';
  END IF;

  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Invalid quantity';
  END IF;

  IF p_sale_type NOT IN ('daily', 'monthly') THEN
    RAISE EXCEPTION 'Invalid sale_type';
  END IF;

  IF p_method IN ('reflect','jawwal_pay','bank') THEN
    IF p_bank_account_id IS NULL THEN
      RAISE EXCEPTION 'bank_account_id required';
    END IF;
  END IF;

  SELECT quantity_in_stock, COALESCE(sale_price, p_unit_price)
  INTO v_stock, v_list_price
  FROM card_products
  WHERE id = p_product_id
    AND tenant_id = v_tenant_id
    AND is_deleted = false;

  IF v_stock IS NULL THEN
    RAISE EXCEPTION 'Product not found';
  END IF;

  IF p_quantity > v_stock THEN
    RAISE EXCEPTION 'Insufficient stock';
  END IF;

  v_total := p_quantity * p_unit_price;

  v_batch_used := deduct_batch_stock_fifo(
    v_tenant_id, p_product_id, p_quantity, p_batch_id
  );

  INSERT INTO card_retail_sales (
    tenant_id, product_id, quantity, unit_price, list_price, total_amount,
    sale_type, method, bank_account_id, sold_by, notes, proof_url, batch_id,
    source_account_label
  ) VALUES (
    v_tenant_id, p_product_id, p_quantity, p_unit_price, v_list_price, v_total,
    p_sale_type, p_method, p_bank_account_id, auth.uid(), p_notes, p_proof_url, v_batch_used,
    NULLIF(trim(p_source_account_label), '')
  ) RETURNING id INTO v_sale_id;

  IF p_bank_account_id IS NOT NULL AND p_method NOT IN ('cash', 'debt') THEN
    UPDATE company_bank_accounts
    SET current_total = COALESCE(current_total, 0) + v_total
    WHERE id = p_bank_account_id AND tenant_id = v_tenant_id;
  END IF;

  INSERT INTO sync_nonces (tenant_id, nonce) VALUES (v_tenant_id, p_nonce);

  RETURN v_sale_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION settle_customer_debt(UUID, NUMERIC, NUMERIC, TEXT, UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION settle_customer_debt(UUID, NUMERIC, NUMERIC, TEXT, UUID, TEXT, TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION receive_distributor_payment(UUID, NUMERIC, TEXT, UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION receive_distributor_payment(UUID, NUMERIC, TEXT, UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION sell_cards(UUID, NUMERIC, TEXT, UUID, TEXT, JSONB, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sell_cards(UUID, NUMERIC, TEXT, UUID, TEXT, JSONB, TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION sell_retail_cards(UUID, INTEGER, NUMERIC, TEXT, TEXT, UUID, TEXT, TEXT, UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sell_retail_cards(UUID, INTEGER, NUMERIC, TEXT, TEXT, UUID, TEXT, TEXT, UUID, TEXT, TEXT) TO authenticated;

-- ── renew_subscription + source_account_label ──
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
    amount, method, bank_account_id, source_account_label, paid_at, notes
  ) VALUES (
    v_tenant_id, v_customer_id, p_subscription_id,
    p_amount, p_method, p_bank_account_id, NULLIF(trim(p_source_account_label), ''), now(), p_notes
  ) RETURNING id INTO v_payment_id;

  IF p_method NOT IN ('cash', 'debt') AND p_bank_account_id IS NOT NULL THEN
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
    now(), v_payment_id, p_notes
  ) RETURNING id INTO v_period_id;

  v_debt := calc_subscription_debt_amount(
    p_amount, v_cash, v_app, v_discount, v_balance,
    now(), p_method, p_amount
  );

  PERFORM upsert_subscription_period_debt(
    v_tenant_id, v_customer_id, v_period_id, v_debt,
    CASE
      WHEN p_method = 'debt' THEN 'تجديد PPP — دفع آجل (دين)'
      WHEN v_balance > 0 THEN 'تجديد PPP — باقٍ غير مسدد'
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
