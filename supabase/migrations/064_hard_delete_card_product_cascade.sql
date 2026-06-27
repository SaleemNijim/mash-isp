-- ============================================================================
-- 064: حذف نهائي متسلسل لمنتجات البطاقات في سلة المحذوفات
-- ============================================================================
-- hard_delete_record كان يحذف card_products مباشرة بينما card_batch_items
-- (ومبيعات التجزئة/الموزعين) ما زالت مرتبطة → FK violation.

CREATE OR REPLACE FUNCTION hard_delete_card_product_cascade(
  p_product_id UUID,
  p_tenant_id  UUID
) RETURNS VOID AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM card_sale_items csi
    WHERE csi.product_id = p_product_id
      AND csi.tenant_id = p_tenant_id
  ) THEN
    RAISE EXCEPTION 'product_has_distributor_sales';
  END IF;

  IF EXISTS (
    SELECT 1 FROM card_retail_sales crs
    WHERE crs.product_id = p_product_id
      AND crs.tenant_id = p_tenant_id
  ) THEN
    RAISE EXCEPTION 'product_has_retail_sales';
  END IF;

  DELETE FROM card_batch_items
  WHERE product_id = p_product_id
    AND tenant_id = p_tenant_id;

  DELETE FROM card_products
  WHERE id = p_product_id
    AND tenant_id = p_tenant_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION hard_delete_record(p_table TEXT, p_id UUID)
RETURNS VOID AS $$
DECLARE
  v_tenant UUID := get_tenant_id();
  v_admin  BOOLEAN := is_tenant_admin() OR is_super_admin();
  v_old    JSON;
  v_allowed TEXT[] := ARRAY[
    'customers','subscriptions','subscription_periods','payments','debts',
    'ppp_plans','ppp_batches','card_products','card_batches','pending_tasks',
    'network_bypassed'
  ];
BEGIN
  IF NOT (v_admin OR has_permission(auth.uid(), 'delete_records')) THEN
    RAISE EXCEPTION 'insufficient permission';
  END IF;

  IF p_table = 'network_ports' THEN
    PERFORM hard_delete_network_port_cascade(p_id);
    RETURN;
  ELSIF p_table = 'network_routers' THEN
    PERFORM hard_delete_network_router(p_id);
    RETURN;
  END IF;

  IF NOT (p_table = ANY(v_allowed)) THEN
    RAISE EXCEPTION 'table not allowed';
  END IF;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'tenant not resolved';
  END IF;

  EXECUTE format('SELECT row_to_json(t) FROM %I t WHERE id = $1 AND tenant_id = $2', p_table)
    INTO v_old USING p_id, v_tenant;
  IF v_old IS NULL THEN
    RAISE EXCEPTION 'record not found or access denied';
  END IF;

  INSERT INTO audit_logs (tenant_id, table_name, record_id, action, old_data, performed_by)
  VALUES (v_tenant, p_table, p_id, 'HARD_DELETED', v_old, auth.uid());

  IF p_table = 'customers' THEN
    PERFORM hard_delete_customer_cascade(p_id, v_tenant);
    RETURN;
  ELSIF p_table = 'subscriptions' THEN
    PERFORM hard_delete_subscription_cascade(p_id, v_tenant);
    RETURN;
  ELSIF p_table = 'subscription_periods' THEN
    DELETE FROM debts
    WHERE subscription_period_id = p_id
      AND tenant_id = v_tenant;
    UPDATE subscription_periods
    SET payment_id = NULL, pending_task_id = NULL
    WHERE id = p_id AND tenant_id = v_tenant;
    DELETE FROM subscription_periods
    WHERE id = p_id AND tenant_id = v_tenant;
    RETURN;
  ELSIF p_table = 'payments' THEN
    DELETE FROM payment_proofs
    WHERE payment_id = p_id
      AND tenant_id = v_tenant;
    UPDATE subscription_periods
    SET payment_id = NULL
    WHERE payment_id = p_id AND tenant_id = v_tenant;
    UPDATE pending_tasks
    SET related_payment_id = NULL
    WHERE related_payment_id = p_id AND tenant_id = v_tenant;
    DELETE FROM payments
    WHERE id = p_id AND tenant_id = v_tenant;
    RETURN;
  ELSIF p_table = 'debts' THEN
    DELETE FROM debts
    WHERE id = p_id AND tenant_id = v_tenant;
    RETURN;
  ELSIF p_table = 'pending_tasks' THEN
    DELETE FROM debts
    WHERE related_task_id = p_id
      AND tenant_id = v_tenant;
    UPDATE subscription_periods
    SET pending_task_id = NULL
    WHERE pending_task_id = p_id AND tenant_id = v_tenant;
    DELETE FROM pending_tasks
    WHERE id = p_id AND tenant_id = v_tenant;
    RETURN;
  ELSIF p_table = 'card_batches' THEN
    DELETE FROM card_batch_items
    WHERE batch_id = p_id AND tenant_id = v_tenant;
    DELETE FROM card_batches
    WHERE id = p_id AND tenant_id = v_tenant;
    RETURN;
  ELSIF p_table = 'card_products' THEN
    PERFORM hard_delete_card_product_cascade(p_id, v_tenant);
    RETURN;
  END IF;

  EXECUTE format('DELETE FROM %I WHERE id = $1 AND tenant_id = $2', p_table)
    USING p_id, v_tenant;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- hard_delete_all_recycle_bin: تجاهل منتجات مُستخدمة في مبيعات التجزئة أيضاً
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
    v_tenant, 'recycle_bin', v_tenant, 'HARD_DELETED_ALL_SAFE',
    json_build_object('scope', 'recycle_bin_safe'), auth.uid()
  );

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

  DELETE FROM network_bypassed WHERE tenant_id = v_tenant AND is_deleted;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_total := v_total + v_n;

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

  DELETE FROM pending_tasks pt
    WHERE pt.tenant_id = v_tenant
      AND pt.is_deleted
      AND NOT EXISTS (SELECT 1 FROM debts d WHERE d.related_task_id = pt.id);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_total := v_total + v_n;

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
      AND NOT EXISTS (SELECT 1 FROM card_sale_items  i WHERE i.product_id = cp.id)
      AND NOT EXISTS (SELECT 1 FROM card_retail_sales rs WHERE rs.product_id = cp.id);
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

REVOKE ALL ON FUNCTION hard_delete_card_product_cascade(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION hard_delete_record(TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION hard_delete_all_recycle_bin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hard_delete_card_product_cascade(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION hard_delete_record(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION hard_delete_all_recycle_bin() TO authenticated;

NOTIFY pgrst, 'reload schema';
