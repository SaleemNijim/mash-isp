-- ============================================================
-- 032: إزالة overload INTEGER — PostgREST لا يختار بين نسختين
-- ============================================================

DROP FUNCTION IF EXISTS public.record_warehouse_movement(UUID, TEXT, INTEGER, TEXT);

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
      RAISE EXCEPTION 'الكمية المتاحة (%) أقل من المطلوب (%)',
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

REVOKE ALL ON FUNCTION record_warehouse_movement(UUID, TEXT, NUMERIC, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION record_warehouse_movement(UUID, TEXT, NUMERIC, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
