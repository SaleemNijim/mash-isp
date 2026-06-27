-- ============================================================================
-- 053: حذف نهائي لفئات PPP ودفعاتها
-- ============================================================================

CREATE OR REPLACE FUNCTION hard_delete_ppp_batch(p_batch_id UUID)
RETURNS VOID AS $$
DECLARE
  v_tenant_id UUID;
  v_row       ppp_batches%ROWTYPE;
  v_admin     BOOLEAN := is_tenant_admin() OR is_super_admin();
BEGIN
  IF NOT (
    v_admin
    OR has_permission(auth.uid(), 'delete_records')
  ) THEN
    RAISE EXCEPTION 'insufficient permission';
  END IF;

  SELECT * INTO v_row
    FROM ppp_batches
    WHERE id = p_batch_id;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'batch not found';
  END IF;

  v_tenant_id := get_tenant_id();
  IF v_tenant_id IS NULL OR v_row.tenant_id <> v_tenant_id THEN
    RAISE EXCEPTION 'batch not found or access denied';
  END IF;

  IF EXISTS (
    SELECT 1 FROM internet_credentials ic
    WHERE ic.batch_id = p_batch_id
  ) THEN
    RAISE EXCEPTION 'batch still has usernames';
  END IF;

  INSERT INTO audit_logs (tenant_id, table_name, record_id, action, old_data, performed_by)
  VALUES (
    v_row.tenant_id,
    'ppp_batches',
    v_row.id,
    'HARD_DELETED',
    row_to_json(v_row),
    auth.uid()
  );

  DELETE FROM ppp_batches WHERE id = p_batch_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION hard_delete_ppp_plan(p_plan_id UUID)
RETURNS VOID AS $$
DECLARE
  v_tenant_id UUID;
  v_row       ppp_plans%ROWTYPE;
  v_admin     BOOLEAN := is_tenant_admin() OR is_super_admin();
BEGIN
  IF NOT (
    v_admin
    OR has_permission(auth.uid(), 'delete_records')
  ) THEN
    RAISE EXCEPTION 'insufficient permission';
  END IF;

  SELECT * INTO v_row
    FROM ppp_plans
    WHERE id = p_plan_id;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'plan not found';
  END IF;

  v_tenant_id := get_tenant_id();
  IF v_tenant_id IS NULL OR v_row.tenant_id <> v_tenant_id THEN
    RAISE EXCEPTION 'plan not found or access denied';
  END IF;

  IF EXISTS (
    SELECT 1 FROM internet_credentials ic
    WHERE ic.plan_id = p_plan_id
  ) THEN
    RAISE EXCEPTION 'plan still has usernames';
  END IF;

  IF EXISTS (
    SELECT 1 FROM ppp_batches pb
    WHERE pb.plan_id = p_plan_id
  ) THEN
    RAISE EXCEPTION 'plan still has batches';
  END IF;

  INSERT INTO audit_logs (tenant_id, table_name, record_id, action, old_data, performed_by)
  VALUES (
    v_row.tenant_id,
    'ppp_plans',
    v_row.id,
    'HARD_DELETED',
    row_to_json(v_row),
    auth.uid()
  );

  DELETE FROM ppp_plans WHERE id = p_plan_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION hard_delete_ppp_batch(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION hard_delete_ppp_plan(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hard_delete_ppp_batch(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION hard_delete_ppp_plan(UUID) TO authenticated;
