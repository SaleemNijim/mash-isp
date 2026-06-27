-- ============================================================
-- 035: إصلاح حفظ إعدادات الشركة + سياسات التخزين
-- ============================================================

-- سياسة تحديث الشركة للمسؤول (FORCE RLS كان يمنع الحفظ)
CREATE POLICY "tenants_admin_update" ON tenants
  FOR UPDATE TO authenticated
  USING (
    id = get_tenant_id()
    AND EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND u.role = 'admin'
        AND u.is_active = true
    )
  )
  WITH CHECK (id = get_tenant_id());

CREATE OR REPLACE FUNCTION update_tenant_profile(
  p_name          TEXT DEFAULT NULL,
  p_phone         TEXT DEFAULT NULL,
  p_logo_url      TEXT DEFAULT NULL,
  p_primary_color TEXT DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
  v_tenant_id UUID;
  v_role      TEXT;
BEGIN
  SELECT u.tenant_id, u.role
  INTO v_tenant_id, v_role
  FROM users u
  WHERE u.id = auth.uid()
    AND u.is_active = true;

  IF v_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'admin_only';
  END IF;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_not_found';
  END IF;

  UPDATE tenants
  SET
    name = COALESCE(NULLIF(trim(p_name), ''), name),
    phone = CASE
      WHEN p_phone IS NOT NULL THEN NULLIF(trim(p_phone), '')
      ELSE phone
    END,
    logo_url = CASE
      WHEN p_logo_url IS NOT NULL THEN NULLIF(trim(p_logo_url), '')
      ELSE logo_url
    END,
    primary_color = CASE
      WHEN p_primary_color IS NOT NULL THEN NULLIF(trim(p_primary_color), '')
      ELSE primary_color
    END
  WHERE id = v_tenant_id;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off;

REVOKE ALL ON FUNCTION update_tenant_profile(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_tenant_profile(TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- إصلاح upsert الشعار: WITH CHECK على UPDATE
DROP POLICY IF EXISTS "tenant_logos_admin_update" ON storage.objects;

CREATE POLICY "tenant_logos_admin_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'tenant_logos'
    AND EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND u.role = 'admin'
        AND u.is_active = true
        AND u.tenant_id::text = (storage.foldername(name))[1]
    )
  )
  WITH CHECK (
    bucket_id = 'tenant_logos'
    AND EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND u.role = 'admin'
        AND u.is_active = true
        AND u.tenant_id::text = (storage.foldername(name))[1]
    )
  );
