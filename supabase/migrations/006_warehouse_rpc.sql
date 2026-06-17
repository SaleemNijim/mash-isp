-- ============================================================
-- MASH ISP — 006_warehouse_rpc.sql
-- حركات المستودع — عملية ذرية (INSERT movement + UPDATE quantity)
-- ============================================================

CREATE OR REPLACE FUNCTION record_warehouse_movement(
  p_item_id       UUID,
  p_movement_type TEXT,
  p_quantity      INTEGER,
  p_notes         TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_tenant_id    UUID;
  v_current_qty  INTEGER;
  v_new_qty      INTEGER;
  v_movement_id  UUID;
BEGIN
  v_tenant_id := get_tenant_id();
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'غير مسجَّل الدخول';
  END IF;

  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'الكمية يجب أن تكون عدداً صحيحاً موجباً';
  END IF;

  IF p_movement_type NOT IN ('receive', 'issue', 'damaged', 'installed') THEN
    RAISE EXCEPTION 'نوع الحركة غير صالح';
  END IF;

  SELECT quantity INTO v_current_qty
  FROM warehouse_items
  WHERE id = p_item_id
    AND tenant_id = v_tenant_id
    AND is_deleted = false
  FOR UPDATE;

  IF v_current_qty IS NULL THEN
    RAISE EXCEPTION 'الصنف غير موجود';
  END IF;

  IF p_movement_type = 'receive' THEN
    v_new_qty := v_current_qty + p_quantity;
  ELSE
    IF p_movement_type = 'issue' AND v_current_qty < p_quantity THEN
      RAISE EXCEPTION 'لا يمكن الإخراج: الكمية المتاحة (% وحدة) أقل من المطلوب (% وحدة)',
        v_current_qty, p_quantity;
    END IF;

    IF p_movement_type IN ('damaged', 'installed') AND v_current_qty < p_quantity THEN
      RAISE EXCEPTION 'الكمية المتاحة (% وحدة) غير كافية لهذه العملية', v_current_qty;
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
