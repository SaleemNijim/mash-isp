-- ============================================================
-- MASH ISP — 009_distributors_debts_proofs.sql
-- سجل الموزعين + إثباتات الدفع + sell_cards v2
-- ============================================================

-- ── 1) جدول الموزعين (يُدار من Admin — الكاشير يختار فقط) ──
CREATE TABLE IF NOT EXISTS distributors (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id),
  name         TEXT NOT NULL,
  phone        TEXT,
  notes        TEXT,
  balance_due  NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (balance_due >= 0),
  is_deleted   BOOLEAN DEFAULT false,
  created_at   TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT uq_distributor_name_per_tenant UNIQUE (tenant_id, name)
);

ALTER TABLE distributors ENABLE ROW LEVEL SECURITY;
ALTER TABLE distributors FORCE ROW LEVEL SECURITY;

CREATE POLICY "distributors_tenant_all" ON distributors
  FOR ALL USING (tenant_id = get_tenant_id());

CREATE POLICY "distributors_superadmin_all" ON distributors
  FOR ALL USING (is_super_admin());

-- ── 2) ربط المبيعات بالموزع + إثبات الدفع ──
ALTER TABLE card_distributor_sales
  ADD COLUMN IF NOT EXISTS distributor_id UUID REFERENCES distributors(id),
  ADD COLUMN IF NOT EXISTS payment_method TEXT
    CHECK (payment_method IS NULL OR payment_method IN ('cash','debt','reflect','jawwal_pay','bank')),
  ADD COLUMN IF NOT EXISTS proof_url TEXT;

ALTER TABLE card_retail_sales
  ADD COLUMN IF NOT EXISTS proof_url TEXT;

-- ── 3) sell_cards v2 — موزع من السجل + طريقة دفع + إثبات ──
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
  v_qty              INTEGER;
  v_unit_price       NUMERIC;
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
      RAISE EXCEPTION 'Insufficient stock';
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

    INSERT INTO card_sale_items (tenant_id, sale_id, product_id, quantity, unit_price)
    VALUES (v_tenant_id, v_sale_id, v_product_id, v_qty, v_unit_price);

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

-- ── 4) sell_retail_cards v2 — إثبات إلزامي للدفع الإلكتروني ──
CREATE OR REPLACE FUNCTION sell_retail_cards(
  p_product_id      UUID,
  p_quantity        INTEGER,
  p_unit_price      NUMERIC,
  p_sale_type       TEXT,
  p_method          TEXT,
  p_bank_account_id UUID,
  p_notes           TEXT,
  p_proof_url       TEXT,
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

  IF p_method IN ('reflect','jawwal_pay','bank') THEN
    IF p_bank_account_id IS NULL THEN
      RAISE EXCEPTION 'bank_account_id required';
    END IF;
    IF p_proof_url IS NULL OR trim(p_proof_url) = '' THEN
      RAISE EXCEPTION 'proof_url required for electronic payment';
    END IF;
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
    sale_type, method, bank_account_id, sold_by, notes, proof_url
  ) VALUES (
    v_tenant_id, p_product_id, p_quantity, p_unit_price, v_total,
    p_sale_type, p_method, p_bank_account_id, auth.uid(), p_notes, p_proof_url
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
