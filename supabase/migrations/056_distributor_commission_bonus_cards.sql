-- ============================================================================
-- 056: بيع الموزع — بطاقات مدفوعة + بطاقات عمولة من المخزون
-- ============================================================================
-- مثال: مبلغ 100، سعر البطاقة 2، عمولة 10%
--   مدفوع = 50 بطاقة، عمولة = 5 بطاقات، يُخصم من المخزون = 55

ALTER TABLE card_sale_items
  ADD COLUMN IF NOT EXISTS paid_quantity INTEGER,
  ADD COLUMN IF NOT EXISTS bonus_quantity INTEGER NOT NULL DEFAULT 0;

UPDATE card_sale_items
SET
  paid_quantity = quantity,
  bonus_quantity = 0
WHERE paid_quantity IS NULL;

ALTER TABLE card_sale_items
  ALTER COLUMN paid_quantity SET NOT NULL;

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
  v_paid_qty         INTEGER;
  v_bonus_qty        INTEGER;
  v_total_qty        INTEGER;
  v_line_amount      NUMERIC;
  v_unit_price       NUMERIC;
  v_list_price       NUMERIC;
  v_stock            INTEGER;
  v_total            NUMERIC := 0;
  v_commission       NUMERIC;
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

  v_commission := GREATEST(COALESCE(p_commission_percent, 0), 0);
  IF v_commission > 100 THEN
    RAISE EXCEPTION 'commission_percent cannot exceed 100';
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
    v_unit_price := (v_item->>'unit_price')::NUMERIC;

    IF v_unit_price IS NULL OR v_unit_price <= 0 THEN
      RAISE EXCEPTION 'Invalid unit_price';
    END IF;

    IF (v_item->>'line_amount') IS NOT NULL AND (v_item->>'line_amount') <> '' THEN
      v_line_amount := (v_item->>'line_amount')::NUMERIC;
      IF v_line_amount IS NULL OR v_line_amount <= 0 THEN
        RAISE EXCEPTION 'Invalid line_amount';
      END IF;
      v_paid_qty := FLOOR(v_line_amount / v_unit_price)::INTEGER;
    ELSIF (v_item->>'quantity') IS NOT NULL AND (v_item->>'quantity') <> '' THEN
      v_paid_qty := (v_item->>'quantity')::INTEGER;
      v_line_amount := v_paid_qty * v_unit_price;
    ELSE
      RAISE EXCEPTION 'line_amount or quantity required';
    END IF;

    IF v_paid_qty IS NULL OR v_paid_qty <= 0 THEN
      RAISE EXCEPTION 'line_amount too small for unit_price';
    END IF;

    v_bonus_qty := FLOOR((v_paid_qty * v_commission) / 100)::INTEGER;
    v_total_qty := v_paid_qty + v_bonus_qty;

    SELECT quantity_in_stock INTO v_stock
    FROM card_products
    WHERE id = v_product_id
      AND tenant_id = v_tenant_id
      AND is_deleted = false;

    IF v_stock IS NULL THEN
      RAISE EXCEPTION 'Product not found';
    END IF;

    IF v_total_qty > v_stock THEN
      RAISE EXCEPTION 'Insufficient stock for product %', v_product_id;
    END IF;

    v_total := v_total + v_line_amount;
  END LOOP;

  INSERT INTO card_distributor_sales (
    tenant_id, distributor_id, distributor_name, total_amount,
    commission_percent, previous_balance, bank_account_id,
    payment_method, proof_url, source_account_label
  ) VALUES (
    v_tenant_id, p_distributor_id, v_distributor_name, v_total,
    v_commission, v_balance_due, p_bank_account_id,
    p_payment_method, p_proof_url, NULLIF(trim(p_source_account_label), '')
  ) RETURNING id INTO v_sale_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_unit_price := (v_item->>'unit_price')::NUMERIC;
    v_batch_id   := NULLIF(v_item->>'batch_id', '')::UUID;

    IF (v_item->>'line_amount') IS NOT NULL AND (v_item->>'line_amount') <> '' THEN
      v_line_amount := (v_item->>'line_amount')::NUMERIC;
      v_paid_qty := FLOOR(v_line_amount / v_unit_price)::INTEGER;
    ELSE
      v_paid_qty := (v_item->>'quantity')::INTEGER;
      v_line_amount := v_paid_qty * v_unit_price;
    END IF;

    v_bonus_qty := FLOOR((v_paid_qty * v_commission) / 100)::INTEGER;
    v_total_qty := v_paid_qty + v_bonus_qty;

    SELECT COALESCE(sale_price, v_unit_price) INTO v_list_price
    FROM card_products
    WHERE id = v_product_id AND tenant_id = v_tenant_id;

    v_batch_id := deduct_batch_stock_fifo(
      v_tenant_id, v_product_id, v_total_qty, v_batch_id
    );

    INSERT INTO card_sale_items (
      tenant_id, sale_id, product_id, quantity,
      paid_quantity, bonus_quantity,
      unit_price, list_price, batch_id
    ) VALUES (
      v_tenant_id, v_sale_id, v_product_id, v_total_qty,
      v_paid_qty, v_bonus_qty,
      v_unit_price, v_list_price, v_batch_id
    );

    UPDATE card_products
    SET quantity_in_stock = quantity_in_stock - v_total_qty
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

REVOKE ALL ON FUNCTION sell_cards(UUID, NUMERIC, TEXT, UUID, TEXT, JSONB, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sell_cards(UUID, NUMERIC, TEXT, UUID, TEXT, JSONB, TEXT, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
