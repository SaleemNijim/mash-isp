-- ============================================================
-- 031: وحدات المستودع + إنشاء صنف + كميات عشرية (متر)
-- ============================================================

ALTER TABLE warehouse_items
  ADD COLUMN IF NOT EXISTS unit TEXT NOT NULL DEFAULT 'piece'
    CHECK (unit IN ('piece', 'meter')),
  ADD COLUMN IF NOT EXISTS notes TEXT;

ALTER TABLE warehouse_items
  ALTER COLUMN quantity TYPE NUMERIC(12,3) USING quantity::NUMERIC(12,3),
  ALTER COLUMN min_quantity TYPE NUMERIC(12,3) USING min_quantity::NUMERIC(12,3);

ALTER TABLE warehouse_movements
  ALTER COLUMN quantity TYPE NUMERIC(12,3) USING quantity::NUMERIC(12,3);

-- ── إنشاء صنف مستودع (مع رصيد افتتاحي اختياري) ──
CREATE OR REPLACE FUNCTION create_warehouse_item(
  p_name             TEXT,
  p_category         TEXT DEFAULT NULL,
  p_unit             TEXT DEFAULT 'piece',
  p_min_quantity     NUMERIC DEFAULT 0,
  p_notes            TEXT DEFAULT NULL,
  p_initial_quantity NUMERIC DEFAULT 0
) RETURNS UUID AS $$
DECLARE
  v_tenant_id UUID;
  v_item_id   UUID;
  v_initial   NUMERIC;
BEGIN
  v_tenant_id := get_tenant_id();
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_name IS NULL OR trim(p_name) = '' THEN
    RAISE EXCEPTION 'Item name is required';
  END IF;

  IF p_unit NOT IN ('piece', 'meter') THEN
    RAISE EXCEPTION 'Invalid unit';
  END IF;

  v_initial := COALESCE(p_initial_quantity, 0);
  IF v_initial < 0 THEN
    RAISE EXCEPTION 'Initial quantity cannot be negative';
  END IF;

  INSERT INTO warehouse_items (
    tenant_id, name, category, unit, min_quantity, notes, quantity
  ) VALUES (
    v_tenant_id,
    trim(p_name),
    NULLIF(trim(p_category), ''),
    p_unit,
    COALESCE(p_min_quantity, 0),
    NULLIF(trim(p_notes), ''),
    v_initial
  ) RETURNING id INTO v_item_id;

  IF v_initial > 0 THEN
    INSERT INTO warehouse_movements (
      tenant_id, item_id, movement_type, quantity, notes, performed_by
    ) VALUES (
      v_tenant_id, v_item_id, 'receive', v_initial,
      'رصيد افتتاحي عند إنشاء الصنف', auth.uid()
    );
  END IF;

  RETURN v_item_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── حركة مستودع — كميات عشرية (متر) ──
CREATE OR REPLACE FUNCTION record_warehouse_movement(
  p_item_id       UUID,
  p_movement_type TEXT,
  p_quantity      NUMERIC,
  p_notes         TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_tenant_id    UUID;
  v_current_qty  NUMERIC;
  v_new_qty      NUMERIC;
  v_movement_id  UUID;
  v_unit         TEXT;
BEGIN
  v_tenant_id := get_tenant_id();
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'غير مسجَّل الدخول';
  END IF;

  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'الكمية يجب أن تكون أكبر من صفر';
  END IF;

  IF p_movement_type NOT IN ('receive', 'issue', 'damaged', 'installed') THEN
    RAISE EXCEPTION 'نوع الحركة غير صالح';
  END IF;

  SELECT quantity, unit INTO v_current_qty, v_unit
  FROM warehouse_items
  WHERE id = p_item_id
    AND tenant_id = v_tenant_id
    AND is_deleted = false
  FOR UPDATE;

  IF v_current_qty IS NULL THEN
    RAISE EXCEPTION 'الصنف غير موجود';
  END IF;

  IF v_unit = 'piece' AND p_quantity <> trunc(p_quantity) THEN
    RAISE EXCEPTION 'وحدة «قطعة» تتطلب كمية صحيحة';
  END IF;

  IF p_movement_type = 'receive' THEN
    v_new_qty := v_current_qty + p_quantity;
  ELSE
    IF v_current_qty < p_quantity THEN
      RAISE EXCEPTION 'الكمية المتاحة (% ) أقل من المطلوب (%)',
        v_current_qty, p_quantity;
    END IF;
    v_new_qty := v_current_qty - p_quantity;
  END IF;

  INSERT INTO warehouse_movements (
    tenant_id, item_id, movement_type, quantity, notes, performed_by
  ) VALUES (
    v_tenant_id, p_item_id, p_movement_type, p_quantity, p_notes, auth.uid()
  ) RETURNING id INTO v_movement_id;

  UPDATE warehouse_items
  SET quantity = v_new_qty
  WHERE id = p_item_id
    AND tenant_id = v_tenant_id;

  RETURN v_movement_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION create_warehouse_item(TEXT, TEXT, TEXT, NUMERIC, TEXT, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_warehouse_item(TEXT, TEXT, TEXT, NUMERIC, TEXT, NUMERIC) TO authenticated;

REVOKE ALL ON FUNCTION record_warehouse_movement(UUID, TEXT, NUMERIC, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION record_warehouse_movement(UUID, TEXT, NUMERIC, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
