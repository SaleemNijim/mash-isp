-- ============================================================
-- MASH ISP — 018_employee_permissions_rpc.sql
-- منح/سحب/قراءة صلاحيات الكاشير — RPC (SECURITY DEFINER)
-- ============================================================

-- ① قراءة صلاحيات موظفي الشركة (admin + employee في tenant)
CREATE OR REPLACE FUNCTION list_tenant_user_permissions()
RETURNS TABLE (
  user_id    UUID,
  permission TEXT
) AS $$
DECLARE
  v_tenant_id UUID;
BEGIN
  v_tenant_id := get_tenant_id();
  IF v_tenant_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT up.user_id, up.permission
  FROM user_permissions up
  JOIN users u ON u.id = up.user_id
  WHERE u.tenant_id = v_tenant_id
    AND u.role = 'employee'
    AND u.is_active = true;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION list_tenant_user_permissions() TO authenticated;

-- ② منح أو سحب صلاحية لموظف (كاشير) — idempotent
CREATE OR REPLACE FUNCTION set_employee_permission(
  p_user_id    UUID,
  p_permission TEXT,
  p_grant      BOOLEAN
) RETURNS VOID AS $$
DECLARE
  v_tenant_id UUID;
BEGIN
  IF NOT is_tenant_admin() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  v_tenant_id := get_tenant_id();
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'no_tenant_context';
  END IF;

  IF p_permission IS NULL OR p_permission = '' THEN
    RAISE EXCEPTION 'invalid_permission';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM permissions WHERE code = p_permission) THEN
    RAISE EXCEPTION 'unknown_permission';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = p_user_id
      AND u.tenant_id = v_tenant_id
      AND u.role = 'employee'
      AND u.is_active = true
  ) THEN
    RAISE EXCEPTION 'employee_not_found';
  END IF;

  IF p_grant THEN
    INSERT INTO user_permissions (user_id, permission)
    VALUES (p_user_id, p_permission)
    ON CONFLICT (user_id, permission) DO NOTHING;
  ELSE
    DELETE FROM user_permissions
    WHERE user_id = p_user_id
      AND permission = p_permission;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION set_employee_permission(UUID, TEXT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_employee_permission(UUID, TEXT, BOOLEAN) TO authenticated;
