-- ============================================================================
-- 054: تجاوز admin/super_admin في عرض كلمات مرور PPP
-- ============================================================================
-- has_permission() لا يمنح admin تلقائياً view_full_password — بينما الواجهة
-- (usePermissions) تمرّره. النتيجة: عمود كلمة المرور يعرض «—» رغم أن المسؤول
-- يرى بقية الصفحة (نفس نمط 044 لحذف السجلات).

CREATE OR REPLACE FUNCTION reveal_credential_password(p_credential_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_tenant_id UUID;
  v_secret_id UUID;
  v_plain     TEXT;
BEGIN
  IF NOT (
    is_tenant_admin()
    OR is_super_admin()
    OR has_permission(auth.uid(), 'view_full_password')
  ) THEN
    RAISE EXCEPTION 'insufficient permission';
  END IF;

  SELECT tenant_id, password_secret_id INTO v_tenant_id, v_secret_id
    FROM internet_credentials WHERE id = p_credential_id;

  IF v_tenant_id IS NULL OR v_tenant_id <> get_tenant_id() THEN
    RAISE EXCEPTION 'credential not found or access denied';
  END IF;

  IF v_secret_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT decrypted_secret INTO v_plain
    FROM vault.decrypted_secrets WHERE id = v_secret_id;

  RETURN v_plain;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION list_available_bb_credentials(p_plan_id UUID)
RETURNS TABLE(id UUID, username TEXT, password TEXT, plan_id UUID) AS $$
DECLARE
  v_tenant_id UUID := get_tenant_id();
BEGIN
  IF NOT (
    is_tenant_admin()
    OR is_super_admin()
    OR has_permission(auth.uid(), 'view_full_password')
  ) THEN
    RAISE EXCEPTION 'insufficient permission';
  END IF;

  IF p_plan_id IS NULL THEN
    RAISE EXCEPTION 'plan_id required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM ppp_plans p
    WHERE p.id = p_plan_id
      AND p.tenant_id = v_tenant_id
      AND p.is_deleted = false
  ) THEN
    RAISE EXCEPTION 'plan not found or access denied';
  END IF;

  RETURN QUERY
  SELECT
    ic.id,
    ic.username,
    ds.decrypted_secret,
    ic.plan_id
  FROM internet_credentials ic
  LEFT JOIN vault.decrypted_secrets ds ON ds.id = ic.password_secret_id
  WHERE ic.tenant_id = v_tenant_id
    AND ic.type = 'bb'
    AND ic.is_used = false
    AND ic.is_deleted = false
    AND ic.plan_id = p_plan_id
  ORDER BY ic.username;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION reveal_credential_password(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION list_available_bb_credentials(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION reveal_credential_password(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION list_available_bb_credentials(UUID) TO authenticated;
