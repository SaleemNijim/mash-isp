-- ============================================================
-- 037: تقييد لون التمييز بالألوان المعتمدة فقط
-- ============================================================

CREATE OR REPLACE FUNCTION update_tenant_profile(
  p_name          TEXT DEFAULT NULL,
  p_phone         TEXT DEFAULT NULL,
  p_logo_url      TEXT DEFAULT NULL,
  p_primary_color TEXT DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
  v_tenant_id UUID;
  v_role      TEXT;
  v_color     TEXT;
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

  IF p_primary_color IS NOT NULL THEN
    v_color := NULLIF(upper(trim(p_primary_color)), '');
    IF v_color IS NOT NULL AND v_color NOT IN (
      '#0F6E56', '#085041', '#0F766E', '#0C447C',
      '#0369A1', '#1E3A5F', '#4338CA', '#6D28D9'
    ) THEN
      RAISE EXCEPTION 'invalid_accent_color';
    END IF;
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
      WHEN p_primary_color IS NOT NULL THEN NULLIF(upper(trim(p_primary_color)), '')
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
