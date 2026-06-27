-- ============================================================================
-- 063: حذف نهائي متسلسل للبيانات المالية في سلة المحذوفات
-- ============================================================================
-- hard_delete_record كان يحذف customers مباشرة بينما الاشتراكات والدفعات
-- والديون ما زالت مرتبطة → FK violation (يظهر أحياناً كـ Failed to fetch).

CREATE OR REPLACE FUNCTION hard_delete_customer_cascade(
  p_customer_id UUID,
  p_tenant_id   UUID
) RETURNS VOID AS $$
BEGIN
  DELETE FROM payment_proofs pp
  USING payments p
  WHERE pp.payment_id = p.id
    AND p.customer_id = p_customer_id
    AND p.tenant_id = p_tenant_id;

  DELETE FROM debts
  WHERE customer_id = p_customer_id
    AND tenant_id = p_tenant_id;

  UPDATE subscription_periods
  SET payment_id = NULL,
      pending_task_id = NULL
  WHERE customer_id = p_customer_id
    AND tenant_id = p_tenant_id;

  DELETE FROM subscription_periods
  WHERE customer_id = p_customer_id
    AND tenant_id = p_tenant_id;

  DELETE FROM payments
  WHERE customer_id = p_customer_id
    AND tenant_id = p_tenant_id;

  DELETE FROM pending_tasks
  WHERE customer_id = p_customer_id
    AND tenant_id = p_tenant_id;

  DELETE FROM customer_credential_usage
  WHERE customer_id = p_customer_id
    AND tenant_id = p_tenant_id;

  DELETE FROM subscriptions
  WHERE customer_id = p_customer_id
    AND tenant_id = p_tenant_id;

  DELETE FROM customers
  WHERE id = p_customer_id
    AND tenant_id = p_tenant_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION hard_delete_subscription_cascade(
  p_subscription_id UUID,
  p_tenant_id       UUID
) RETURNS VOID AS $$
DECLARE
  v_customer_id UUID;
BEGIN
  SELECT customer_id INTO v_customer_id
  FROM subscriptions
  WHERE id = p_subscription_id
    AND tenant_id = p_tenant_id;

  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'record not found or access denied';
  END IF;

  DELETE FROM payment_proofs pp
  USING payments p
  WHERE pp.payment_id = p.id
    AND p.subscription_id = p_subscription_id
    AND p.tenant_id = p_tenant_id;

  DELETE FROM debts d
  USING subscription_periods sp
  WHERE d.subscription_period_id = sp.id
    AND sp.subscription_id = p_subscription_id
    AND sp.tenant_id = p_tenant_id;

  UPDATE subscription_periods
  SET payment_id = NULL,
      pending_task_id = NULL
  WHERE subscription_id = p_subscription_id
    AND tenant_id = p_tenant_id;

  DELETE FROM subscription_periods
  WHERE subscription_id = p_subscription_id
    AND tenant_id = p_tenant_id;

  DELETE FROM payments
  WHERE subscription_id = p_subscription_id
    AND tenant_id = p_tenant_id;

  DELETE FROM subscriptions
  WHERE id = p_subscription_id
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
  END IF;

  EXECUTE format('DELETE FROM %I WHERE id = $1 AND tenant_id = $2', p_table)
    USING p_id, v_tenant;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION hard_delete_customer_cascade(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION hard_delete_subscription_cascade(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION hard_delete_record(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hard_delete_record(TEXT, UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
