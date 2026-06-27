-- ============================================================================
-- 057: حذف نهائي لبيانات الشبكة (Hard Delete)
--   - حذف راوتر مفرد (مع موسّعاته وسجل MAC الخاص به)
--   - حذف بورت متسلسل (مع الأبناء + الراوترات/المتجاوَزة المرتبطة)
--   - مسح كل بيانات الشبكة للـ tenant الحالي
-- يُسجَّل كل حذف في audit_logs (action = HARD_DELETED) ثم يُنفَّذ DELETE فعلي.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) حذف راوتر مفرد نهائياً
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION hard_delete_network_router(p_id UUID)
RETURNS VOID AS $$
DECLARE
  v_tenant_id UUID;
  v_row       network_routers%ROWTYPE;
  v_admin     BOOLEAN := is_tenant_admin() OR is_super_admin();
BEGIN
  IF NOT (v_admin OR has_permission(auth.uid(), 'delete_records')) THEN
    RAISE EXCEPTION 'insufficient permission';
  END IF;

  SELECT * INTO v_row FROM network_routers WHERE id = p_id;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'router not found';
  END IF;

  v_tenant_id := get_tenant_id();
  IF NOT v_admin AND (v_tenant_id IS NULL OR v_row.tenant_id <> v_tenant_id) THEN
    RAISE EXCEPTION 'router not found or access denied';
  END IF;

  INSERT INTO audit_logs (tenant_id, table_name, record_id, action, old_data, performed_by)
  VALUES (v_row.tenant_id, 'network_routers', v_row.id, 'HARD_DELETED', row_to_json(v_row), auth.uid());

  DELETE FROM router_mac_history WHERE router_id = p_id;
  DELETE FROM network_extenders  WHERE router_id = p_id;
  DELETE FROM network_routers    WHERE id = p_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 2) حذف بورت متسلسل نهائياً (الأبناء + الراوترات/المتجاوَزة المرتبطة)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION hard_delete_network_port_cascade(p_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_tenant_id  UUID;
  v_row        network_ports%ROWTYPE;
  v_admin      BOOLEAN := is_tenant_admin() OR is_super_admin();
  v_port_ids   UUID[];
  v_router_ids UUID[];
  v_count      INTEGER;
BEGIN
  IF NOT (v_admin OR has_permission(auth.uid(), 'delete_records')) THEN
    RAISE EXCEPTION 'insufficient permission';
  END IF;

  SELECT * INTO v_row FROM network_ports WHERE id = p_id;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'port not found';
  END IF;

  v_tenant_id := get_tenant_id();
  IF NOT v_admin AND (v_tenant_id IS NULL OR v_row.tenant_id <> v_tenant_id) THEN
    RAISE EXCEPTION 'port not found or access denied';
  END IF;

  -- اجمع البورت وكل أبنائه (عمقاً) عبر CTE تكراري
  WITH RECURSIVE descendants AS (
    SELECT id FROM network_ports WHERE id = p_id
    UNION ALL
    SELECT np.id
      FROM network_ports np
      JOIN descendants d ON np.parent_port_id = d.id
  )
  SELECT array_agg(id) INTO v_port_ids FROM descendants;

  v_count := COALESCE(array_length(v_port_ids, 1), 0);

  -- راوترات هذه البورتات
  SELECT array_agg(id) INTO v_router_ids
    FROM network_routers
    WHERE port_id = ANY(v_port_ids);

  -- سجّل القيم القديمة قبل الحذف
  INSERT INTO audit_logs (tenant_id, table_name, record_id, action, old_data, performed_by)
  SELECT np.tenant_id, 'network_ports', np.id, 'HARD_DELETED', row_to_json(np), auth.uid()
    FROM network_ports np
    WHERE np.id = ANY(v_port_ids);

  IF v_router_ids IS NOT NULL THEN
    DELETE FROM router_mac_history WHERE router_id = ANY(v_router_ids);
    DELETE FROM network_extenders  WHERE router_id = ANY(v_router_ids);
    DELETE FROM network_routers    WHERE id = ANY(v_router_ids);
  END IF;

  DELETE FROM network_bypassed WHERE port_id = ANY(v_port_ids);

  -- احذف البورتات من الأعمق إلى الأعلى لتفادي انتهاك self-FK
  DELETE FROM network_ports WHERE id = ANY(v_port_ids);

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 3) مسح كل بيانات الشبكة للـ tenant الحالي نهائياً
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION hard_delete_all_network()
RETURNS INTEGER AS $$
DECLARE
  v_tenant_id UUID;
  v_admin     BOOLEAN := is_tenant_admin() OR is_super_admin();
  v_total     INTEGER := 0;
  v_n         INTEGER;
BEGIN
  IF NOT (v_admin OR has_permission(auth.uid(), 'manage_network')) THEN
    RAISE EXCEPTION 'insufficient permission';
  END IF;

  v_tenant_id := get_tenant_id();
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant not resolved';
  END IF;

  -- سجل تدقيقي مجمّع لعملية المسح الشامل
  INSERT INTO audit_logs (tenant_id, table_name, record_id, action, old_data, performed_by)
  VALUES (v_tenant_id, 'network_*', v_tenant_id, 'HARD_DELETED_ALL',
          json_build_object('scope', 'all_network'), auth.uid());

  DELETE FROM router_mac_history WHERE tenant_id = v_tenant_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;

  DELETE FROM network_extenders WHERE tenant_id = v_tenant_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;

  DELETE FROM network_routers WHERE tenant_id = v_tenant_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;

  DELETE FROM network_bypassed WHERE tenant_id = v_tenant_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;

  DELETE FROM network_ports WHERE tenant_id = v_tenant_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;

  RETURN v_total;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION hard_delete_network_router(UUID)         FROM PUBLIC;
REVOKE ALL ON FUNCTION hard_delete_network_port_cascade(UUID)   FROM PUBLIC;
REVOKE ALL ON FUNCTION hard_delete_all_network()                FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hard_delete_network_router(UUID)       TO authenticated;
GRANT EXECUTE ON FUNCTION hard_delete_network_port_cascade(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION hard_delete_all_network()              TO authenticated;
