-- ============================================================================
-- 049: عزل صارم لباقات PPP — كل باقة مخزون منفصل (مثل network_ports)
-- ============================================================================

-- 1) ensure_ppp_plan: مطابقة بالاسم فقط — لا دمج باقات بنفس السرعة
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

  IF p_name IS NULL OR TRIM(p_name) = '' THEN
    RAISE EXCEPTION 'plan name required';
  END IF;

  SELECT id INTO v_id
    FROM ppp_plans
    WHERE tenant_id = v_tenant_id
      AND name = TRIM(p_name)
      AND is_deleted = false
    LIMIT 1;

  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  INSERT INTO ppp_plans (tenant_id, name, speed, price, batch_number)
  VALUES (
    v_tenant_id,
    TRIM(p_name),
    TRIM(p_speed),
    COALESCE(p_price, 0),
    NULLIF(TRIM(p_batch_number), '')
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2) التحقق: BB يجب plan_id من نفس الشركة — WE بدون plan
CREATE OR REPLACE FUNCTION validate_internet_credential_plan() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_deleted IS TRUE THEN
    RETURN NEW;
  END IF;

  IF NEW.type = 'bb' THEN
    IF NEW.plan_id IS NULL THEN
      RAISE EXCEPTION 'bb credential requires plan_id';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM ppp_plans p
      WHERE p.id = NEW.plan_id
        AND p.tenant_id = NEW.tenant_id
        AND p.is_deleted = false
    ) THEN
      RAISE EXCEPTION 'plan not found or wrong tenant';
    END IF;
  ELSIF NEW.type = 'we' THEN
    NEW.plan_id := NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_credential_plan ON internet_credentials;
CREATE TRIGGER trg_validate_credential_plan
  BEFORE INSERT OR UPDATE OF plan_id, type, tenant_id, is_deleted ON internet_credentials
  FOR EACH ROW EXECUTE FUNCTION validate_internet_credential_plan();

-- 3) list_available_bb_credentials: plan_id إلزامي + تحقق tenant
DROP FUNCTION IF EXISTS list_available_bb_credentials(UUID);

CREATE OR REPLACE FUNCTION list_available_bb_credentials(p_plan_id UUID)
RETURNS TABLE(id UUID, username TEXT, password TEXT, plan_id UUID) AS $$
DECLARE
  v_tenant_id UUID := get_tenant_id();
BEGIN
  IF NOT has_permission(auth.uid(), 'view_full_password') THEN
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

-- 4) bulk_insert: تحقق plan_id لكل صف BB
CREATE OR REPLACE FUNCTION bulk_insert_credentials(p_rows JSONB)
RETURNS INTEGER AS $$
DECLARE
  v_tenant_id  UUID := get_tenant_id();
  r            JSONB;
  v_secret_id  UUID;
  v_plan_id    UUID;
  v_type       TEXT;
  v_count      INTEGER := 0;
BEGIN
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'no tenant context';
  END IF;

  FOR r IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    v_secret_id := NULL;
    v_plan_id := NULL;
    v_type := COALESCE(r->>'type', 'bb');

    IF v_type = 'bb' THEN
      IF (r->>'plan_id') IS NULL OR (r->>'plan_id') = '' THEN
        RAISE EXCEPTION 'bb row missing plan_id';
      END IF;
      v_plan_id := (r->>'plan_id')::UUID;
      IF NOT EXISTS (
        SELECT 1 FROM ppp_plans p
        WHERE p.id = v_plan_id
          AND p.tenant_id = v_tenant_id
          AND p.is_deleted = false
      ) THEN
        RAISE EXCEPTION 'invalid plan_id for tenant';
      END IF;
    END IF;

    IF (r->>'password') IS NOT NULL AND (r->>'password') <> '' THEN
      v_secret_id := vault.create_secret(r->>'password');
    END IF;

    INSERT INTO internet_credentials (
      tenant_id, username, password_secret_id, type, is_used, is_deleted, plan_id
    ) VALUES (
      v_tenant_id,
      r->>'username',
      v_secret_id,
      v_type,
      COALESCE((r->>'is_used')::boolean, false),
      false,
      v_plan_id
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5) حذf جماعي ضمن باقة واحدة فقط
DROP FUNCTION IF EXISTS bulk_hard_delete_internet_credentials();
DROP FUNCTION IF EXISTS bulk_hard_delete_internet_credentials(UUID);

CREATE OR REPLACE FUNCTION bulk_hard_delete_internet_credentials(p_plan_id UUID DEFAULT NULL)
RETURNS JSONB AS $$
DECLARE
  v_tenant_id UUID := get_tenant_id();
  r           internet_credentials%ROWTYPE;
  v_deleted   INTEGER := 0;
  v_skipped   INTEGER := 0;
  v_admin     BOOLEAN := is_tenant_admin() OR is_super_admin();
BEGIN
  IF NOT (
    v_admin
    OR has_permission(auth.uid(), 'delete_records')
  ) THEN
    RAISE EXCEPTION 'insufficient permission';
  END IF;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'no tenant context';
  END IF;

  IF p_plan_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM ppp_plans p
    WHERE p.id = p_plan_id AND p.tenant_id = v_tenant_id AND p.is_deleted = false
  ) THEN
    RAISE EXCEPTION 'plan not found or access denied';
  END IF;

  FOR r IN
    SELECT * FROM internet_credentials
    WHERE tenant_id = v_tenant_id
      AND (p_plan_id IS NULL OR plan_id = p_plan_id)
    ORDER BY username
  LOOP
    IF NOT v_admin THEN
      IF EXISTS (
        SELECT 1 FROM subscription_periods sp
        WHERE sp.credential_id = r.id AND sp.is_deleted = false
      ) THEN
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;
      IF EXISTS (
        SELECT 1 FROM customer_credential_usage ccu
        WHERE ccu.credential_id = r.id
          AND ccu.is_deleted = false
          AND ccu.released_at IS NULL
      ) THEN
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;
    ELSE
      UPDATE subscription_periods
        SET credential_id = NULL
        WHERE credential_id = r.id AND tenant_id = v_tenant_id;

      DELETE FROM customer_credential_usage
        WHERE credential_id = r.id AND tenant_id = v_tenant_id;
    END IF;

    INSERT INTO audit_logs (tenant_id, table_name, record_id, action, old_data, performed_by)
    VALUES (
      r.tenant_id, 'internet_credentials', r.id, 'HARD_DELETED', row_to_json(r), auth.uid()
    );

    DELETE FROM internet_credentials WHERE id = r.id;

    IF r.password_secret_id IS NOT NULL THEN
      DELETE FROM vault.secrets WHERE id = r.password_secret_id;
    END IF;

    v_deleted := v_deleted + 1;
  END LOOP;

  RETURN jsonb_build_object('deleted', v_deleted, 'skipped', v_skipped);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION bulk_hard_delete_internet_credentials(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bulk_hard_delete_internet_credentials(UUID) TO authenticated;

REVOKE ALL ON FUNCTION list_available_bb_credentials(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION list_available_bb_credentials(UUID) TO authenticated;
