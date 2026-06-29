-- ============================================================
-- retail_sale_debt_and_correct: دين بيع التجزئة + تعديل/إلغاء المبيعات
-- ============================================================

ALTER TABLE card_retail_sales
  ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id),
  ADD COLUMN IF NOT EXISTS contact_label TEXT,
  ADD COLUMN IF NOT EXISTS contact_phone TEXT,
  ADD COLUMN IF NOT EXISTS pending_task_id UUID REFERENCES pending_tasks(id);

ALTER TABLE debts
  ADD COLUMN IF NOT EXISTS card_retail_sale_id UUID REFERENCES card_retail_sales(id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_debt_card_retail_sale
  ON debts (card_retail_sale_id)
  WHERE card_retail_sale_id IS NOT NULL AND is_deleted = false;

-- ── استعادة مخزون الدفعة عند إلغاء بيع تجزئة ──
CREATE OR REPLACE FUNCTION restore_retail_sale_stock(
  p_tenant_id  UUID,
  p_product_id UUID,
  p_quantity   INTEGER,
  p_batch_id   UUID
) RETURNS VOID AS $$
BEGIN
  IF p_batch_id IS NOT NULL THEN
    UPDATE card_batch_items
    SET quantity_remaining = LEAST(quantity, quantity_remaining + p_quantity)
    WHERE batch_id = p_batch_id
      AND product_id = p_product_id
      AND tenant_id = p_tenant_id
      AND is_deleted = false;
  END IF;

  UPDATE card_products
  SET quantity_in_stock = quantity_in_stock + p_quantity
  WHERE id = p_product_id AND tenant_id = p_tenant_id;
END;
$$ LANGUAGE plpgsql;

-- ── إلغاء بيع تجزئة (استرجاع مخزون + عكس بنك + إلغاء دين) ──
CREATE OR REPLACE FUNCTION void_retail_sale(
  p_sale_id UUID,
  p_nonce   TEXT DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
  v_tenant_id UUID;
  v_sale      RECORD;
  v_task_id   UUID;
BEGIN
  v_tenant_id := get_tenant_id();
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_nonce IS NOT NULL AND EXISTS (SELECT 1 FROM sync_nonces WHERE nonce = p_nonce) THEN
    RAISE EXCEPTION 'Duplicate nonce — 409 Conflict'
      USING ERRCODE = '23505';
  END IF;

  SELECT *
  INTO v_sale
  FROM card_retail_sales
  WHERE id = p_sale_id
    AND tenant_id = v_tenant_id
    AND is_deleted = false;

  IF v_sale IS NULL THEN
    RAISE EXCEPTION 'Sale not found';
  END IF;

  IF EXISTS (
    SELECT 1 FROM debts d
    WHERE d.card_retail_sale_id = p_sale_id
      AND d.is_deleted = false
      AND d.status = 'active'
      AND d.remaining_amount < d.original_amount
  ) THEN
    RAISE EXCEPTION 'Cannot void sale with partial debt payment';
  END IF;

  PERFORM restore_retail_sale_stock(
    v_tenant_id, v_sale.product_id, v_sale.quantity, v_sale.batch_id
  );

  IF v_sale.bank_account_id IS NOT NULL
    AND v_sale.method NOT IN ('cash', 'debt') THEN
    UPDATE company_bank_accounts
    SET current_total = GREATEST(0, COALESCE(current_total, 0) - v_sale.total_amount)
    WHERE id = v_sale.bank_account_id AND tenant_id = v_tenant_id;
  END IF;

  UPDATE debts
  SET status = 'cancelled', remaining_amount = 0
  WHERE card_retail_sale_id = p_sale_id
    AND tenant_id = v_tenant_id
    AND is_deleted = false
    AND status IN ('active', 'temporary');

  SELECT pending_task_id INTO v_task_id
  FROM card_retail_sales
  WHERE id = p_sale_id;

  IF v_task_id IS NOT NULL THEN
    UPDATE pending_tasks
    SET status = 'completed'
    WHERE id = v_task_id AND tenant_id = v_tenant_id AND is_deleted = false;
  END IF;

  UPDATE card_retail_sales
  SET is_deleted = true
  WHERE id = p_sale_id AND tenant_id = v_tenant_id;

  IF p_nonce IS NOT NULL THEN
    INSERT INTO sync_nonces (tenant_id, nonce) VALUES (v_tenant_id, p_nonce);
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── sell_retail_cards — دين + ربط زبون/مهمة ──
DROP FUNCTION IF EXISTS sell_retail_cards(UUID, INTEGER, NUMERIC, TEXT, TEXT, UUID, TEXT, TEXT, UUID, TEXT, TEXT);

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
  p_source_account_label TEXT DEFAULT NULL,
  p_customer_id          UUID DEFAULT NULL,
  p_contact_label        TEXT DEFAULT NULL,
  p_contact_phone        TEXT DEFAULT NULL,
  p_due_at               TIMESTAMPTZ DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_tenant_id   UUID;
  v_sale_id     UUID;
  v_stock       INTEGER;
  v_total       NUMERIC;
  v_list_price  NUMERIC;
  v_batch_used  UUID;
  v_customer_id UUID;
  v_task_id     UUID;
  v_debt_id     UUID;
  v_due_at      TIMESTAMPTZ;
  v_reason      TEXT;
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

  IF p_method = 'debt' THEN
    IF p_customer_id IS NULL
      AND (p_contact_label IS NULL OR length(trim(p_contact_label)) = 0) THEN
      RAISE EXCEPTION 'customer_id or contact_label required for debt sale';
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
    source_account_label, customer_id, contact_label, contact_phone
  ) VALUES (
    v_tenant_id, p_product_id, p_quantity, p_unit_price, v_list_price, v_total,
    p_sale_type, p_method, p_bank_account_id, auth.uid(), p_notes, p_proof_url, v_batch_used,
    NULLIF(trim(p_source_account_label), ''),
    p_customer_id,
    NULLIF(trim(p_contact_label), ''),
    NULLIF(trim(p_contact_phone), '')
  ) RETURNING id INTO v_sale_id;

  UPDATE card_products
  SET quantity_in_stock = quantity_in_stock - p_quantity
  WHERE id = p_product_id AND tenant_id = v_tenant_id;

  IF p_bank_account_id IS NOT NULL AND p_method NOT IN ('cash', 'debt') THEN
    UPDATE company_bank_accounts
    SET current_total = COALESCE(current_total, 0) + v_total
    WHERE id = p_bank_account_id AND tenant_id = v_tenant_id;
  END IF;

  IF p_method = 'debt' THEN
    IF p_customer_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM customers c
        WHERE c.id = p_customer_id
          AND c.tenant_id = v_tenant_id
          AND c.is_deleted = false
      ) THEN
        RAISE EXCEPTION 'Customer not found';
      END IF;
      v_customer_id := p_customer_id;
    ELSE
      INSERT INTO customers (tenant_id, name, phone)
      VALUES (
        v_tenant_id,
        trim(p_contact_label),
        NULLIF(trim(p_contact_phone), '')
      )
      RETURNING id INTO v_customer_id;

      UPDATE card_retail_sales
      SET customer_id = v_customer_id
      WHERE id = v_sale_id;
    END IF;

    v_due_at := COALESCE(p_due_at, now() + INTERVAL '7 days');
    v_reason := 'بيع بطاقة تجزئة — دين';

    INSERT INTO pending_tasks (
      tenant_id, customer_id, amount, due_at, status, title, notes
    ) VALUES (
      v_tenant_id, v_customer_id, v_total, v_due_at, 'pending',
      v_reason, p_notes
    ) RETURNING id INTO v_task_id;

    INSERT INTO debts (
      tenant_id, customer_id, original_amount, remaining_amount,
      reason, status, related_task_id, card_retail_sale_id
    ) VALUES (
      v_tenant_id, v_customer_id, v_total, v_total,
      v_reason, 'active', v_task_id, v_sale_id
    ) RETURNING id INTO v_debt_id;

    UPDATE card_retail_sales
    SET pending_task_id = v_task_id, customer_id = v_customer_id
    WHERE id = v_sale_id;
  END IF;

  INSERT INTO sync_nonces (tenant_id, nonce) VALUES (v_tenant_id, p_nonce);

  RETURN v_sale_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── تصحيح بيع تجزئة (إلغاء + إعادة تسجيل ذري) ──
CREATE OR REPLACE FUNCTION correct_retail_sale(
  p_sale_id              UUID,
  p_quantity             INTEGER,
  p_unit_price           NUMERIC,
  p_method               TEXT,
  p_bank_account_id      UUID,
  p_notes                TEXT,
  p_proof_url            TEXT,
  p_source_account_label TEXT DEFAULT NULL,
  p_customer_id          UUID DEFAULT NULL,
  p_contact_label        TEXT DEFAULT NULL,
  p_contact_phone        TEXT DEFAULT NULL,
  p_due_at               TIMESTAMPTZ DEFAULT NULL,
  p_nonce                TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_tenant_id  UUID;
  v_sale       RECORD;
  v_new_id     UUID;
  v_void_nonce TEXT;
BEGIN
  v_tenant_id := get_tenant_id();
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_nonce IS NOT NULL AND EXISTS (SELECT 1 FROM sync_nonces WHERE nonce = p_nonce) THEN
    RAISE EXCEPTION 'Duplicate nonce — 409 Conflict'
      USING ERRCODE = '23505';
  END IF;

  SELECT product_id, sale_type, batch_id
  INTO v_sale
  FROM card_retail_sales
  WHERE id = p_sale_id
    AND tenant_id = v_tenant_id
    AND is_deleted = false;

  IF v_sale IS NULL THEN
    RAISE EXCEPTION 'Sale not found';
  END IF;

  v_void_nonce := gen_random_uuid()::TEXT;
  PERFORM void_retail_sale(p_sale_id, v_void_nonce);

  v_new_id := sell_retail_cards(
    v_sale.product_id,
    p_quantity,
    p_unit_price,
    v_sale.sale_type,
    p_method,
    p_bank_account_id,
    p_notes,
    p_proof_url,
    v_sale.batch_id,
    COALESCE(p_nonce, gen_random_uuid()::TEXT),
    p_source_account_label,
    p_customer_id,
    p_contact_label,
    p_contact_phone,
    p_due_at
  );

  RETURN v_new_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION void_retail_sale(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION void_retail_sale(UUID, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION correct_retail_sale(UUID, INTEGER, NUMERIC, TEXT, UUID, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TIMESTAMPTZ, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION correct_retail_sale(UUID, INTEGER, NUMERIC, TEXT, UUID, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TIMESTAMPTZ, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION sell_retail_cards(UUID, INTEGER, NUMERIC, TEXT, TEXT, UUID, TEXT, TEXT, UUID, TEXT, TEXT, UUID, TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sell_retail_cards(UUID, INTEGER, NUMERIC, TEXT, TEXT, UUID, TEXT, TEXT, UUID, TEXT, TEXT, UUID, TEXT, TEXT, TIMESTAMPTZ) TO authenticated;
