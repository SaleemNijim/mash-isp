-- ============================================================
-- 034: إعدادات الشركة والملف الشخصي للمسؤول
-- ============================================================

-- ── تحديث بيانات الشركة (admin فقط) ──
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── تحديث اسم المستخدم الحالي ──
CREATE OR REPLACE FUNCTION update_my_user_name(p_name TEXT)
RETURNS VOID AS $$
BEGIN
  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'name_required';
  END IF;

  UPDATE users
  SET name = trim(p_name)
  WHERE id = auth.uid()
    AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_not_found';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION update_tenant_profile(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_tenant_profile(TEXT, TEXT, TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION update_my_user_name(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_my_user_name(TEXT) TO authenticated;

-- ── bucket شعارات الشركات ──
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'tenant_logos',
  'tenant_logos',
  true,
  2097152,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "tenant_logos_public_read" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'tenant_logos');

CREATE POLICY "tenant_logos_admin_insert" ON storage.objects
  FOR INSERT TO authenticated
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
  );

CREATE POLICY "tenant_logos_admin_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'tenant_logos'
    AND EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND u.role = 'admin'
        AND u.is_active = true
        AND u.tenant_id::text = (storage.foldername(name))[1]
    )
  );
