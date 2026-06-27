-- ============================================================
-- 036: إصلاح سياسات شعارات الشركات
-- المشكلة: داخل EXISTS (FROM users u) كان name يُفسَّر كـ u.name
-- ============================================================

CREATE OR REPLACE FUNCTION can_manage_tenant_logo(p_object_name TEXT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role = 'admin'
      AND u.is_active = true
      AND u.tenant_id::text = (storage.foldername(p_object_name))[1]
  );
$$ LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public, storage
SET row_security = off;

REVOKE ALL ON FUNCTION can_manage_tenant_logo(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION can_manage_tenant_logo(TEXT) TO authenticated;

DROP POLICY IF EXISTS "tenant_logos_admin_insert" ON storage.objects;
DROP POLICY IF EXISTS "tenant_logos_admin_update" ON storage.objects;
DROP POLICY IF EXISTS "tenant_logos_admin_delete" ON storage.objects;

CREATE POLICY "tenant_logos_admin_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'tenant_logos'
    AND can_manage_tenant_logo(name)
  );

CREATE POLICY "tenant_logos_admin_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'tenant_logos'
    AND can_manage_tenant_logo(name)
  )
  WITH CHECK (
    bucket_id = 'tenant_logos'
    AND can_manage_tenant_logo(name)
  );

CREATE POLICY "tenant_logos_admin_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'tenant_logos'
    AND can_manage_tenant_logo(name)
  );
