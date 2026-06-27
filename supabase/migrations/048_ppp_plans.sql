-- ============================================================================
-- 048: باقات PPP (ppp_plans) + ربط internet_credentials
-- ============================================================================

CREATE TABLE ppp_plans (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id),
  name         TEXT NOT NULL,
  speed        TEXT NOT NULL,
  price        NUMERIC(10,2) NOT NULL DEFAULT 0,
  batch_number TEXT,
  is_deleted   BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_ppp_plan_tenant_name UNIQUE (tenant_id, name)
);

CREATE INDEX idx_ppp_plans_tenant_active
  ON ppp_plans (tenant_id, speed)
  WHERE is_deleted = false;

ALTER TABLE internet_credentials
  ADD COLUMN plan_id UUID REFERENCES ppp_plans(id);

CREATE INDEX idx_internet_credentials_plan
  ON internet_credentials (tenant_id, plan_id)
  WHERE is_deleted = false;

ALTER TABLE ppp_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE ppp_plans FORCE ROW LEVEL SECURITY;

CREATE POLICY "ppp_plans_tenant_all" ON ppp_plans
  FOR ALL USING (tenant_id = get_tenant_id());

CREATE POLICY "ppp_plans_superadmin_all" ON ppp_plans
  FOR ALL USING (is_super_admin());

CREATE TRIGGER trg_soft_delete_ppp_plans
  AFTER UPDATE ON ppp_plans
  FOR EACH ROW EXECUTE FUNCTION log_soft_delete();

-- ── إنشاء/جلب باقة حسب السرعة (استيراد Excel) ──
CREATE OR REPLACE FUNCTION ensure_ppp_plan(
  p_name         TEXT,
  p_speed        TEXT,
  p_price        NUMERIC DEFAULT 0,
  p_batch_number TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_tenant_id UUID := get_tenant_id();
  v_id        UUID;
BEGIN
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'no tenant context';
  END IF;

  SELECT id INTO v_id
    FROM ppp_plans
    WHERE tenant_id = v_tenant_id
      AND speed = p_speed
      AND is_deleted = false
    LIMIT 1;

  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  INSERT INTO ppp_plans (tenant_id, name, speed, price, batch_number)
  VALUES (
    v_tenant_id,
    p_name,
    p_speed,
    COALESCE(p_price, 0),
    NULLIF(TRIM(p_batch_number), '')
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── كريدنشالات BB المتاحة — فلتر اختياري بالباقة ──
DROP FUNCTION IF EXISTS list_available_bb_credentials();

CREATE OR REPLACE FUNCTION list_available_bb_credentials(p_plan_id UUID DEFAULT NULL)
RETURNS TABLE(id UUID, username TEXT, password TEXT, plan_id UUID) AS $$
BEGIN
  IF NOT has_permission(auth.uid(), 'view_full_password') THEN
    RAISE EXCEPTION 'insufficient permission';
  END IF;

  RETURN QUERY
  SELECT
    ic.id,
    ic.username,
    ds.decrypted_secret,
    ic.plan_id
  FROM internet_credentials ic
  LEFT JOIN vault.decrypted_secrets ds ON ds.id = ic.password_secret_id
  WHERE ic.tenant_id = get_tenant_id()
    AND ic.type = 'bb'
    AND ic.is_used = false
    AND ic.is_deleted = false
    AND (p_plan_id IS NULL OR ic.plan_id = p_plan_id)
  ORDER BY ic.username;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── إدراج دفعي — مع plan_id ──
CREATE OR REPLACE FUNCTION bulk_insert_credentials(p_rows JSONB)
RETURNS INTEGER AS $$
DECLARE
  v_tenant_id  UUID := get_tenant_id();
  r            JSONB;
  v_secret_id  UUID;
  v_plan_id    UUID;
  v_count      INTEGER := 0;
BEGIN
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'no tenant context';
  END IF;

  FOR r IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    v_secret_id := NULL;
    v_plan_id := NULL;

    IF (r->>'password') IS NOT NULL AND (r->>'password') <> '' THEN
      v_secret_id := vault.create_secret(r->>'password');
    END IF;

    IF (r->>'plan_id') IS NOT NULL AND (r->>'plan_id') <> '' THEN
      v_plan_id := (r->>'plan_id')::UUID;
    END IF;

    INSERT INTO internet_credentials (
      tenant_id, username, password_secret_id, type, is_used, is_deleted, plan_id
    ) VALUES (
      v_tenant_id,
      r->>'username',
      v_secret_id,
      COALESCE(r->>'type', 'bb'),
      COALESCE((r->>'is_used')::boolean, false),
      false,
      v_plan_id
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION ensure_ppp_plan(TEXT, TEXT, NUMERIC, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ensure_ppp_plan(TEXT, TEXT, NUMERIC, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION list_available_bb_credentials(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION list_available_bb_credentials(UUID) TO authenticated;

REVOKE ALL ON FUNCTION bulk_insert_credentials(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bulk_insert_credentials(JSONB) TO authenticated;
