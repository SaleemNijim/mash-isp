-- ============================================================
-- MASH ISP — 008_sell_cards_retail.sql
-- RPC: sell_cards (موزع) + sell_retail_cards (يومي/شهري)
-- ============================================================

-- تصنيف المنتجات: يومي / شهري / أخرى
ALTER TABLE card_products
  ADD COLUMN IF NOT EXISTS card_type TEXT NOT NULL DEFAULT 'other'
  CHECK (card_type IN ('daily', 'monthly', 'other'));

-- مبيعات التجزئة (كاشير — بدون موزع)
CREATE TABLE IF NOT EXISTS card_retail_sales (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  product_id      UUID NOT NULL REFERENCES card_products(id),
  quantity        INTEGER NOT NULL CHECK (quantity > 0),
  unit_price      NUMERIC(10,2) NOT NULL,
  total_amount    NUMERIC(10,2) NOT NULL,
  sale_type       TEXT NOT NULL CHECK (sale_type IN ('daily', 'monthly')),
  method          TEXT NOT NULL CHECK (method IN ('cash', 'debt', 'reflect', 'jawwal_pay', 'bank')),
  bank_account_id UUID REFERENCES company_bank_accounts(id),
  sold_by         UUID REFERENCES users(id),
  notes           TEXT,
  is_deleted      BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT chk_retail_bank_required
    CHECK (method IN ('cash', 'debt') OR bank_account_id IS NOT NULL)
);

ALTER TABLE card_retail_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE card_retail_sales FORCE ROW LEVEL SECURITY;

CREATE POLICY "card_retail_sales_tenant_all" ON card_retail_sales
  FOR ALL USING (tenant_id = get_tenant_id());

CREATE POLICY "card_retail_sales_superadmin_all" ON card_retail_sales
  FOR ALL USING (is_super_admin());

-- ============================================================
-- sell_cards — بيع بطاقات لموزع (ذري)
-- ============================================================

CREATE OR REPLACE FUNCTION sell_cards(
  p_distributor_name   TEXT,
  p_commission_percent NUMERIC,
  p_previous_balance   NUMERIC,
  p_bank_account_id    UUID,
  p_items              JSONB,
  p_nonce              TEXT
) RETURNS UUID AS $$
DECLARE
  v_tenant_id  UUID;
  v_sale_id    UUID;
  v_item       JSONB;
  v_product_id UUID;
  v_qty        INTEGER;
  v_unit_price NUMERIC;
  v_stock      INTEGER;
  v_total      NUMERIC := 0;
BEGIN
  v_tenant_id := get_tenant_id();
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF EXISTS (SELECT 1 FROM sync_nonces WHERE nonce = p_nonce) THEN
    RAISE EXCEPTION 'Duplicate nonce — 409 Conflict'
      USING ERRCODE = '23505';
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
    tenant_id, distributor_name, total_amount,
    commission_percent, previous_balance, bank_account_id
  ) VALUES (
    v_tenant_id, p_distributor_name, v_total,
    p_commission_percent, p_previous_balance, p_bank_account_id
  ) RETURNING id INTO v_sale_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_qty        := (v_item->>'quantity')::INTEGER;
    v_unit_price := (v_item->>'unit_price')::NUMERIC;

    INSERT INTO card_sale_items (tenant_id, sale_id, product_id, quantity, unit_price)
    VALUES (v_tenant_id, v_sale_id, v_product_id, v_qty, v_unit_price);

    UPDATE card_products
    SET quantity_in_stock = quantity_in_stock - v_qty
    WHERE id = v_product_id AND tenant_id = v_tenant_id;
  END LOOP;

  IF p_bank_account_id IS NOT NULL THEN
    UPDATE company_bank_accounts
    SET current_total = COALESCE(current_total, 0) + v_total
    WHERE id = p_bank_account_id AND tenant_id = v_tenant_id;
  END IF;

  INSERT INTO sync_nonces (tenant_id, nonce) VALUES (v_tenant_id, p_nonce);

  RETURN v_sale_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- sell_retail_cards — بيع تجزئة (يومي / شهري)
-- ============================================================

CREATE OR REPLACE FUNCTION sell_retail_cards(
  p_product_id      UUID,
  p_quantity        INTEGER,
  p_unit_price      NUMERIC,
  p_sale_type       TEXT,
  p_method          TEXT,
  p_bank_account_id UUID,
  p_notes           TEXT,
  p_nonce           TEXT
) RETURNS UUID AS $$
DECLARE
  v_tenant_id UUID;
  v_sale_id   UUID;
  v_stock     INTEGER;
  v_total     NUMERIC;
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

  SELECT quantity_in_stock INTO v_stock
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

  INSERT INTO card_retail_sales (
    tenant_id, product_id, quantity, unit_price, total_amount,
    sale_type, method, bank_account_id, sold_by, notes
  ) VALUES (
    v_tenant_id, p_product_id, p_quantity, p_unit_price, v_total,
    p_sale_type, p_method, p_bank_account_id, auth.uid(), p_notes
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
