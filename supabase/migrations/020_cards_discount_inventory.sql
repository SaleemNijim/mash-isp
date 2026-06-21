-- ============================================================
-- MASH ISP — 020_cards_discount_inventory.sql
-- خصم البيع + مخزون الدفعات + receive/sell v3
-- ============================================================

-- ── 1) صلاحية مخزون البطاقات ──
INSERT INTO permissions (code, label) VALUES
  ('manage_card_inventory', 'إدارة مخزون البطاقات')
ON CONFLICT (code) DO NOTHING;

-- ── 2) فئات البطاقات — خصائص مرنة ──
ALTER TABLE card_products
  ADD COLUMN IF NOT EXISTS attributes JSONB NOT NULL DEFAULT '{}'::jsonb;

-- ── 3) الدفعات — رقم يدوي ──
ALTER TABLE card_batches
  ADD COLUMN IF NOT EXISTS batch_number TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_batch_number_active
  ON card_batches (tenant_id, batch_number)
  WHERE is_deleted = false AND batch_number IS NOT NULL;

-- ── 4) عناصر الدفعة — متبقي per-batch ──
ALTER TABLE card_batch_items
  ADD COLUMN IF NOT EXISTS quantity_remaining INTEGER;

UPDATE card_batch_items
SET quantity_remaining = quantity
WHERE quantity_remaining IS NULL;

ALTER TABLE card_batch_items
  ALTER COLUMN quantity_remaining SET NOT NULL;

ALTER TABLE card_batch_items
  ADD CONSTRAINT chk_batch_item_remaining_nonneg
  CHECK (quantity_remaining >= 0);

ALTER TABLE card_batch_items
  ADD CONSTRAINT chk_batch_item_remaining_lte_qty
  CHECK (quantity_remaining <= quantity);

-- ── 4b) ترحيل مخزون موجود → دفعة LEGACY (بدون مضاعفة المخزون) ──
DO $$
DECLARE
  t RECORD;
  p RECORD;
  v_batch_id UUID;
BEGIN
  FOR t IN
    SELECT DISTINCT tenant_id
    FROM card_products
    WHERE is_deleted = false AND quantity_in_stock > 0
  LOOP
    SELECT id INTO v_batch_id
    FROM card_batches
    WHERE tenant_id = t.tenant_id
      AND batch_number = 'LEGACY-MIGRATION'
      AND is_deleted = false
    LIMIT 1;

    IF v_batch_id IS NULL THEN
      INSERT INTO card_batches (tenant_id, batch_number, supplier, received_at, notes)
      VALUES (
        t.tenant_id,
        'LEGACY-MIGRATION',
        'ترحيل تلقائي',
        now(),
        'مخزون موجود قبل تفعيل تتبع الدفعات'
      )
      RETURNING id INTO v_batch_id;
    END IF;

    FOR p IN
      SELECT id AS product_id, tenant_id, quantity_in_stock
      FROM card_products
      WHERE tenant_id = t.tenant_id
        AND is_deleted = false
        AND quantity_in_stock > 0
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM card_batch_items
        WHERE batch_id = v_batch_id
          AND product_id = p.product_id
          AND is_deleted = false
      ) THEN
        INSERT INTO card_batch_items (
          tenant_id, batch_id, product_id, quantity, quantity_remaining, unit_cost
        ) VALUES (
          p.tenant_id, v_batch_id, p.product_id,
          p.quantity_in_stock, p.quantity_in_stock, NULL
        );

        UPDATE card_products
        SET quantity_in_stock = quantity_in_stock - p.quantity_in_stock
        WHERE id = p.product_id;
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- ── 5) خصم البيع — تجزئة ──
ALTER TABLE card_retail_sales
  ADD COLUMN IF NOT EXISTS list_price NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES card_batches(id);

UPDATE card_retail_sales
SET list_price = unit_price
WHERE list_price IS NULL;

ALTER TABLE card_retail_sales
  ALTER COLUMN list_price SET NOT NULL;

ALTER TABLE card_retail_sales
  ADD COLUMN IF NOT EXISTS discount_percent NUMERIC(5,2)
  GENERATED ALWAYS AS (
    CASE
      WHEN list_price > 0 AND list_price > unit_price
      THEN ROUND(((list_price - unit_price) / list_price * 100)::numeric, 2)
      ELSE 0
    END
  ) STORED;

-- ── 6) خصم البيع — موزع (per item) ──
ALTER TABLE card_sale_items
  ADD COLUMN IF NOT EXISTS list_price NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES card_batches(id);

UPDATE card_sale_items
SET list_price = unit_price
WHERE list_price IS NULL;

ALTER TABLE card_sale_items
  ALTER COLUMN list_price SET NOT NULL;

ALTER TABLE card_sale_items
  ADD COLUMN IF NOT EXISTS discount_percent NUMERIC(5,2)
  GENERATED ALWAYS AS (
    CASE
      WHEN list_price > 0 AND list_price > unit_price
      THEN ROUND(((list_price - unit_price) / list_price * 100)::numeric, 2)
      ELSE 0
    END
  ) STORED;

-- ── 7) عكس مخزون الدفعة عند الحذف — المتبقي فقط ──
CREATE OR REPLACE FUNCTION reverse_stock_on_batch_delete() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_deleted = true AND OLD.is_deleted = false THEN
    UPDATE card_products cp
    SET quantity_in_stock = GREATEST(0, quantity_in_stock - cbi.quantity_remaining)
    FROM card_batch_items cbi
    WHERE cbi.batch_id = NEW.id AND cp.id = cbi.product_id;

    INSERT INTO audit_logs (tenant_id, table_name, record_id, action, performed_by)
    VALUES (OLD.tenant_id, 'card_batches', NEW.id, 'BATCH_DELETED_STOCK_REVERSED', auth.uid());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 8) FIFO — خصم من الدفعات ──
CREATE OR REPLACE FUNCTION deduct_batch_stock_fifo(
  p_tenant_id          UUID,
  p_product_id         UUID,
  p_qty                INTEGER,
  p_preferred_batch_id UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_need    INTEGER := p_qty;
  v_take    INTEGER;
  v_primary UUID;
  v_row     RECORD;
BEGIN
  IF p_qty IS NULL OR p_qty <= 0 THEN
    RAISE EXCEPTION 'Invalid quantity';
  END IF;

  IF p_preferred_batch_id IS NOT NULL THEN
    SELECT cbi.id, cbi.batch_id, cbi.quantity_remaining
    INTO v_row
    FROM card_batch_items cbi
    JOIN card_batches cb ON cb.id = cbi.batch_id
    WHERE cbi.batch_id = p_preferred_batch_id
      AND cbi.product_id = p_product_id
      AND cbi.tenant_id = p_tenant_id
      AND cbi.is_deleted = false
      AND cb.is_deleted = false
      AND cbi.quantity_remaining >= p_qty;

    IF FOUND THEN
      UPDATE card_batch_items
      SET quantity_remaining = quantity_remaining - p_qty
      WHERE id = v_row.id;
      RETURN p_preferred_batch_id;
    END IF;
  END IF;

  FOR v_row IN
    SELECT cbi.id, cbi.batch_id, cbi.quantity_remaining
    FROM card_batch_items cbi
    JOIN card_batches cb ON cb.id = cbi.batch_id
    WHERE cbi.tenant_id = p_tenant_id
      AND cbi.product_id = p_product_id
      AND cbi.is_deleted = false
      AND cb.is_deleted = false
      AND cbi.quantity_remaining > 0
    ORDER BY cb.received_at ASC NULLS LAST, cb.created_at ASC
  LOOP
    v_take := LEAST(v_need, v_row.quantity_remaining);

    UPDATE card_batch_items
    SET quantity_remaining = quantity_remaining - v_take
    WHERE id = v_row.id;

    IF v_primary IS NULL THEN
      v_primary := v_row.batch_id;
    END IF;

    v_need := v_need - v_take;
    EXIT WHEN v_need <= 0;
  END LOOP;

  IF v_need > 0 THEN
    RAISE EXCEPTION 'Insufficient batch stock for product %', p_product_id;
  END IF;

  RETURN v_primary;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 9) receive_card_batch v3 ──
CREATE OR REPLACE FUNCTION receive_card_batch(
  p_batch_number TEXT,
  p_supplier     TEXT,
  p_notes        TEXT,
  p_items        JSONB
) RETURNS UUID AS $$
DECLARE
  v_tenant_id   UUID;
  v_batch_id    UUID;
  v_item        JSONB;
  v_product_id  UUID;
  v_qty         INTEGER;
  v_unit_cost   NUMERIC;
  v_sale_price  NUMERIC;
  v_new         JSONB;
BEGIN
  v_tenant_id := get_tenant_id();
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_batch_number IS NULL OR trim(p_batch_number) = '' THEN
    RAISE EXCEPTION 'batch_number is required';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'At least one item is required';
  END IF;

  IF EXISTS (
    SELECT 1 FROM card_batches
    WHERE tenant_id = v_tenant_id
      AND batch_number = trim(p_batch_number)
      AND is_deleted = false
  ) THEN
    RAISE EXCEPTION 'Batch number already exists';
  END IF;

  INSERT INTO card_batches (tenant_id, batch_number, supplier, received_at, notes)
  VALUES (v_tenant_id, trim(p_batch_number), p_supplier, now(), p_notes)
  RETURNING id INTO v_batch_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty       := (v_item->>'quantity')::INTEGER;
    v_unit_cost := NULLIF(trim(v_item->>'unit_cost'), '')::NUMERIC;
    v_sale_price := NULLIF(trim(v_item->>'sale_price'), '')::NUMERIC;
    v_product_id := NULLIF(v_item->>'product_id', '')::UUID;
    v_new := v_item->'new_product';

    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'Invalid quantity';
    END IF;

    IF v_product_id IS NULL AND v_new IS NULL THEN
      RAISE EXCEPTION 'product_id or new_product required';
    END IF;

    IF v_product_id IS NULL THEN
      INSERT INTO card_products (
        tenant_id, name, denomination, cost_price, sale_price,
        min_quantity, card_type, attributes
      ) VALUES (
        v_tenant_id,
        trim(v_new->>'name'),
        NULLIF(trim(v_new->>'denomination'), '')::NUMERIC,
        COALESCE(v_unit_cost, NULLIF(trim(v_new->>'cost_price'), '')::NUMERIC),
        COALESCE(v_sale_price, NULLIF(trim(v_new->>'sale_price'), '')::NUMERIC),
        COALESCE(NULLIF(trim(v_new->>'min_quantity'), '')::INTEGER, 0),
        COALESCE(NULLIF(trim(v_new->>'card_type'), ''), 'other'),
        COALESCE(v_new->'attributes', '{}'::jsonb)
      ) RETURNING id INTO v_product_id;
    ELSIF v_sale_price IS NOT NULL THEN
      UPDATE card_products
      SET sale_price = v_sale_price
      WHERE id = v_product_id AND tenant_id = v_tenant_id;
    END IF;

    INSERT INTO card_batch_items (
      tenant_id, batch_id, product_id, quantity, quantity_remaining, unit_cost
    ) VALUES (
      v_tenant_id, v_batch_id, v_product_id, v_qty, v_qty, v_unit_cost
    );
  END LOOP;

  RETURN v_batch_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 10) sell_cards v3 — list_price + FIFO batch ──
CREATE OR REPLACE FUNCTION sell_cards(
  p_distributor_id     UUID,
  p_commission_percent NUMERIC,
  p_payment_method     TEXT,
  p_bank_account_id    UUID,
  p_proof_url          TEXT,
  p_items              JSONB,
  p_nonce              TEXT
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
      RAISE EXCEPTION 'bank_account_id required for electronic payment';
    END IF;
    IF p_proof_url IS NULL OR trim(p_proof_url) = '' THEN
      RAISE EXCEPTION 'proof_url required for electronic payment';
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
    v_batch_id   := NULLIF(v_item->>'batch_id', '')::UUID;

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
    payment_method, proof_url
  ) VALUES (
    v_tenant_id, p_distributor_id, v_distributor_name, v_total,
    p_commission_percent, v_balance_due, p_bank_account_id,
    p_payment_method, p_proof_url
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

-- ── 11) sell_retail_cards v3 — list_price + FIFO batch ──
CREATE OR REPLACE FUNCTION sell_retail_cards(
  p_product_id      UUID,
  p_quantity        INTEGER,
  p_unit_price      NUMERIC,
  p_sale_type       TEXT,
  p_method          TEXT,
  p_bank_account_id UUID,
  p_notes           TEXT,
  p_proof_url       TEXT,
  p_batch_id        UUID,
  p_nonce           TEXT
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
    IF p_proof_url IS NULL OR trim(p_proof_url) = '' THEN
      RAISE EXCEPTION 'proof_url required for electronic payment';
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
    sale_type, method, bank_account_id, sold_by, notes, proof_url, batch_id
  ) VALUES (
    v_tenant_id, p_product_id, p_quantity, p_unit_price, v_list_price, v_total,
    p_sale_type, p_method, p_bank_account_id, auth.uid(), p_notes, p_proof_url, v_batch_used
  ) RETURNING id INTO v_sale_id;

  UPDATE card_products
  SET quantity_in_stock = quantity_in_stock - p_quantity
  WHERE id = p_product_id AND tenant_id = v_tenant_id;

  IF p_bank_account_id IS NOT NULL AND p_method NOT IN ('cash', 'debt') THEN
    UPDATE company_bank_accounts
    SET current_total = COALESCE(current_total, 0) + v_total
    WHERE id = p_bank_account_id AND tenant_id = v_tenant_id;
  END IF;

  INSERT INTO sync_nonces (tenant_id, nonce) VALUES (v_tenant_id, p_nonce);

  RETURN v_sale_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
