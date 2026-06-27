-- ============================================================================
-- 059: إفراغ سلة المحذوفات — حذف نهائي لكل السجلات المحذوفة (tenant الحالي)
-- ============================================================================

CREATE OR REPLACE FUNCTION hard_delete_all_recycle_bin()
RETURNS INTEGER AS $$
DECLARE
  v_tenant     UUID := get_tenant_id();
  v_admin      BOOLEAN := is_tenant_admin() OR is_super_admin();
  v_total      INTEGER := 0;
  v_n          INTEGER;
  v_port_ids   UUID[];
  v_router_ids UUID[];
BEGIN
  IF NOT (v_admin OR has_permission(auth.uid(), 'delete_records')) THEN
    RAISE EXCEPTION 'insufficient permission';
  END IF;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'tenant not resolved';
  END IF;

  INSERT INTO audit_logs (tenant_id, table_name, record_id, action, old_data, performed_by)
  VALUES (
    v_tenant, 'recycle_bin', v_tenant, 'HARD_DELETED_ALL',
    json_build_object('scope', 'recycle_bin_empty'), auth.uid()
  );

  -- ---- شبكة: راوترات محذوفة ----
  SELECT array_agg(id) INTO v_router_ids
    FROM network_routers
    WHERE tenant_id = v_tenant AND is_deleted;

  IF v_router_ids IS NOT NULL THEN
    DELETE FROM router_mac_history WHERE router_id = ANY(v_router_ids);
    DELETE FROM network_extenders  WHERE router_id = ANY(v_router_ids);
    DELETE FROM network_routers
      WHERE id = ANY(v_router_ids) AND tenant_id = v_tenant;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_total := v_total + v_n;
  END IF;

  DELETE FROM router_mac_history WHERE tenant_id = v_tenant AND is_deleted;
  DELETE FROM network_extenders  WHERE tenant_id = v_tenant AND is_deleted;

  DELETE FROM network_bypassed WHERE tenant_id = v_tenant AND is_deleted;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_total := v_total + v_n;

  -- ---- شبكة: بورتات محذوفة (مع الراوترات/المتجاوَزة المرتبطة) ----
  SELECT array_agg(id) INTO v_port_ids
    FROM network_ports
    WHERE tenant_id = v_tenant AND is_deleted;

  IF v_port_ids IS NOT NULL THEN
    SELECT array_agg(id) INTO v_router_ids
      FROM network_routers
      WHERE port_id = ANY(v_port_ids);

    IF v_router_ids IS NOT NULL THEN
      DELETE FROM router_mac_history WHERE router_id = ANY(v_router_ids);
      DELETE FROM network_extenders  WHERE router_id = ANY(v_router_ids);
      DELETE FROM network_routers    WHERE id = ANY(v_router_ids);
    END IF;

    DELETE FROM network_bypassed WHERE port_id = ANY(v_port_ids);

    LOOP
      DELETE FROM network_ports p
        WHERE p.tenant_id = v_tenant
          AND p.is_deleted
          AND NOT EXISTS (SELECT 1 FROM network_ports c WHERE c.parent_port_id = p.id);
      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_total := v_total + v_n;
      EXIT WHEN v_n = 0;
    END LOOP;
  END IF;

  -- ---- مالية: ترتيب يحترم FK ----
  DELETE FROM subscription_periods WHERE tenant_id = v_tenant AND is_deleted;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_total := v_total + v_n;

  DELETE FROM debts WHERE tenant_id = v_tenant AND is_deleted;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_total := v_total + v_n;

  DELETE FROM payments WHERE tenant_id = v_tenant AND is_deleted;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_total := v_total + v_n;

  DELETE FROM pending_tasks WHERE tenant_id = v_tenant AND is_deleted;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_total := v_total + v_n;

  DELETE FROM subscriptions WHERE tenant_id = v_tenant AND is_deleted;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_total := v_total + v_n;

  DELETE FROM customers WHERE tenant_id = v_tenant AND is_deleted;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_total := v_total + v_n;

  -- ---- بطاقات و PPP (مع حُرّاس FK) ----
  DELETE FROM card_batch_items cbi
    USING card_batches cb
    WHERE cbi.batch_id = cb.id
      AND cb.tenant_id = v_tenant
      AND cb.is_deleted
      AND NOT EXISTS (SELECT 1 FROM card_sale_items csi WHERE csi.batch_id = cb.id);

  DELETE FROM card_batches cb
    WHERE cb.tenant_id = v_tenant
      AND cb.is_deleted
      AND NOT EXISTS (SELECT 1 FROM card_sale_items csi WHERE csi.batch_id = cb.id);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_total := v_total + v_n;

  DELETE FROM card_products cp
    WHERE cp.tenant_id = v_tenant
      AND cp.is_deleted
      AND NOT EXISTS (SELECT 1 FROM card_batch_items i WHERE i.product_id = cp.id)
      AND NOT EXISTS (SELECT 1 FROM card_sale_items  i WHERE i.product_id = cp.id);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_total := v_total + v_n;

  DELETE FROM ppp_batches pb
    WHERE pb.tenant_id = v_tenant
      AND pb.is_deleted
      AND NOT EXISTS (SELECT 1 FROM internet_credentials ic WHERE ic.batch_id = pb.id);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_total := v_total + v_n;

  DELETE FROM ppp_plans pp
    WHERE pp.tenant_id = v_tenant
      AND pp.is_deleted
      AND NOT EXISTS (SELECT 1 FROM ppp_batches pb WHERE pb.plan_id = pp.id)
      AND NOT EXISTS (SELECT 1 FROM internet_credentials ic WHERE ic.plan_id = pp.id);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_total := v_total + v_n;

  RETURN v_total;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION hard_delete_all_recycle_bin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hard_delete_all_recycle_bin() TO authenticated;
