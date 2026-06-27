-- ============================================================================
-- 052: دفعات PPP — نفس منطق البطاقات (فئة + استلام دفعة)
-- ============================================================================

CREATE TABLE ppp_batches (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id),
  plan_id      UUID NOT NULL REFERENCES ppp_plans(id),
  batch_number TEXT NOT NULL,
  received_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes        TEXT,
  is_deleted   BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_ppp_batch_tenant_number
  ON ppp_batches (tenant_id, batch_number)
  WHERE is_deleted = false;

CREATE INDEX idx_ppp_batches_plan
  ON ppp_batches (tenant_id, plan_id)
  WHERE is_deleted = false;

ALTER TABLE internet_credentials
  ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES ppp_batches(id);

CREATE INDEX idx_internet_credentials_batch
  ON internet_credentials (tenant_id, batch_id)
  WHERE is_deleted = false;

ALTER TABLE ppp_plans
  DROP COLUMN IF EXISTS batch_number;

ALTER TABLE ppp_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE ppp_batches FORCE ROW LEVEL SECURITY;

CREATE POLICY "ppp_batches_tenant_all" ON ppp_batches
  FOR ALL USING (tenant_id = get_tenant_id());

CREATE POLICY "ppp_batches_superadmin_all" ON ppp_batches
  FOR ALL USING (is_super_admin());

CREATE TRIGGER trg_soft_delete_ppp_batches
  AFTER UPDATE ON ppp_batches
  FOR EACH ROW EXECUTE FUNCTION log_soft_delete();

-- ── ترحيل usernames موجودة → دفعة LEGACY لكل فئة ──
DO $$
DECLARE
  p RECORD;
  v_batch_id UUID;
BEGIN
  FOR p IN
    SELECT DISTINCT ic.tenant_id, ic.plan_id, pl.name AS plan_name
    FROM internet_credentials ic
    JOIN ppp_plans pl ON pl.id = ic.plan_id
    WHERE ic.plan_id IS NOT NULL
      AND ic.batch_id IS NULL
      AND ic.is_deleted = false
  LOOP
    SELECT id INTO v_batch_id
      FROM ppp_batches
      WHERE tenant_id = p.tenant_id
        AND plan_id = p.plan_id
        AND batch_number = 'LEGACY-' || left(p.plan_id::text, 8)
        AND is_deleted = false
      LIMIT 1;

    IF v_batch_id IS NULL THEN
      INSERT INTO ppp_batches (tenant_id, plan_id, batch_number, received_at, notes)
      VALUES (
        p.tenant_id,
        p.plan_id,
        'LEGACY-' || left(p.plan_id::text, 8),
        now(),
        'ترحيل تلقائي — usernames قبل تفعيل الدفعات'
      )
      RETURNING id INTO v_batch_id;
    END IF;

    IF v_batch_id IS NOT NULL THEN
      UPDATE internet_credentials
        SET batch_id = v_batch_id
        WHERE tenant_id = p.tenant_id
          AND plan_id = p.plan_id
          AND batch_id IS NULL
          AND is_deleted = false;
    END IF;
  END LOOP;
END;
$$;

-- ── التحقق: BB يتطلب plan_id + batch_id متطابقين ──
CREATE OR REPLACE FUNCTION validate_internet_credential_plan() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_deleted IS TRUE THEN
    RETURN NEW;
  END IF;

  IF NEW.type = 'bb' THEN
    IF NEW.plan_id IS NULL OR NEW.batch_id IS NULL THEN
      RAISE EXCEPTION 'bb credential requires plan_id and batch_id';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM ppp_plans p
      WHERE p.id = NEW.plan_id
        AND p.tenant_id = NEW.tenant_id
        AND p.is_deleted = false
    ) THEN
      RAISE EXCEPTION 'plan not found or wrong tenant';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM ppp_batches b
      WHERE b.id = NEW.batch_id
        AND b.plan_id = NEW.plan_id
        AND b.tenant_id = NEW.tenant_id
        AND b.is_deleted = false
    ) THEN
      RAISE EXCEPTION 'batch not found or plan mismatch';
    END IF;
  ELSIF NEW.type = 'we' THEN
    NEW.plan_id := NULL;
    NEW.batch_id := NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── استلام دفعة PPP (فئة + usernames) ──
CREATE OR REPLACE FUNCTION receive_ppp_batch(
  p_plan_id      UUID,
  p_batch_number TEXT,
  p_notes        TEXT DEFAULT NULL,
  p_rows         JSONB DEFAULT '[]'::jsonb
) RETURNS UUID AS $$
DECLARE
  v_tenant_id UUID := get_tenant_id();
  v_batch_id  UUID;
  r           JSONB;
  v_secret_id UUID;
  v_plan_id   UUID;
  v_batch_id_row UUID;
  v_type      TEXT;
BEGIN
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'no tenant context';
  END IF;

  IF p_plan_id IS NULL THEN
    RAISE EXCEPTION 'plan_id required';
  END IF;

  IF p_batch_number IS NULL OR trim(p_batch_number) = '' THEN
    RAISE EXCEPTION 'batch_number required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM ppp_plans p
    WHERE p.id = p_plan_id AND p.tenant_id = v_tenant_id AND p.is_deleted = false
  ) THEN
    RAISE EXCEPTION 'plan not found';
  END IF;

  IF EXISTS (
    SELECT 1 FROM ppp_batches b
    WHERE b.tenant_id = v_tenant_id
      AND b.batch_number = trim(p_batch_number)
      AND b.is_deleted = false
  ) THEN
    RAISE EXCEPTION 'batch number already exists';
  END IF;

  INSERT INTO ppp_batches (tenant_id, plan_id, batch_number, received_at, notes)
  VALUES (v_tenant_id, p_plan_id, trim(p_batch_number), now(), NULLIF(trim(p_notes), ''))
  RETURNING id INTO v_batch_id;

  FOR r IN SELECT * FROM jsonb_array_elements(COALESCE(p_rows, '[]'::jsonb)) LOOP
    v_secret_id := NULL;
    v_type := COALESCE(r->>'type', 'bb');

    IF (r->>'password') IS NOT NULL AND (r->>'password') <> '' THEN
      v_secret_id := vault.create_secret(r->>'password');
    END IF;

    INSERT INTO internet_credentials (
      tenant_id, username, password_secret_id, type, is_used, is_deleted, plan_id, batch_id
    ) VALUES (
      v_tenant_id,
      r->>'username',
      v_secret_id,
      v_type,
      COALESCE((r->>'is_used')::boolean, false),
      false,
      p_plan_id,
      v_batch_id
    );
  END LOOP;

  RETURN v_batch_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── bulk_insert — batch_id إلزامي لـ BB ──
CREATE OR REPLACE FUNCTION bulk_insert_credentials(p_rows JSONB)
RETURNS INTEGER AS $$
DECLARE
  v_tenant_id  UUID := get_tenant_id();
  r            JSONB;
  v_secret_id  UUID;
  v_plan_id    UUID;
  v_batch_id   UUID;
  v_type       TEXT;
  v_count      INTEGER := 0;
BEGIN
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'no tenant context';
  END IF;

  FOR r IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    v_secret_id := NULL;
    v_plan_id := NULL;
    v_batch_id := NULL;
    v_type := COALESCE(r->>'type', 'bb');

    IF v_type = 'bb' THEN
      IF (r->>'plan_id') IS NULL OR (r->>'plan_id') = '' THEN
        RAISE EXCEPTION 'bb row missing plan_id';
      END IF;
      IF (r->>'batch_id') IS NULL OR (r->>'batch_id') = '' THEN
        RAISE EXCEPTION 'bb row missing batch_id';
      END IF;
      v_plan_id := (r->>'plan_id')::UUID;
      v_batch_id := (r->>'batch_id')::UUID;
      IF NOT EXISTS (
        SELECT 1 FROM ppp_batches b
        WHERE b.id = v_batch_id
          AND b.plan_id = v_plan_id
          AND b.tenant_id = v_tenant_id
          AND b.is_deleted = false
      ) THEN
        RAISE EXCEPTION 'invalid batch_id for plan';
      END IF;
    END IF;

    IF (r->>'password') IS NOT NULL AND (r->>'password') <> '' THEN
      v_secret_id := vault.create_secret(r->>'password');
    END IF;

    INSERT INTO internet_credentials (
      tenant_id, username, password_secret_id, type, is_used, is_deleted, plan_id, batch_id
    ) VALUES (
      v_tenant_id,
      r->>'username',
      v_secret_id,
      v_type,
      COALESCE((r->>'is_used')::boolean, false),
      false,
      v_plan_id,
      v_batch_id
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── حذf جماعي ضمن دفعة ──
DROP FUNCTION IF EXISTS bulk_hard_delete_internet_credentials(UUID);

CREATE OR REPLACE FUNCTION bulk_hard_delete_internet_credentials(p_batch_id UUID)
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

  IF p_batch_id IS NULL THEN
    RAISE EXCEPTION 'batch_id required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM ppp_batches b
    WHERE b.id = p_batch_id AND b.tenant_id = v_tenant_id AND b.is_deleted = false
  ) THEN
    RAISE EXCEPTION 'batch not found or access denied';
  END IF;

  FOR r IN
    SELECT * FROM internet_credentials
    WHERE tenant_id = v_tenant_id
      AND batch_id = p_batch_id
    ORDER BY username
  LOOP
    BEGIN
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
      END IF;

      PERFORM unlink_credential_references(r.id, v_tenant_id);

      INSERT INTO audit_logs (tenant_id, table_name, record_id, action, old_data, performed_by)
      VALUES (
        r.tenant_id, 'internet_credentials', r.id, 'HARD_DELETED', row_to_json(r), auth.uid()
      );

      DELETE FROM internet_credentials WHERE id = r.id;

      IF r.password_secret_id IS NOT NULL THEN
        DELETE FROM vault.secrets WHERE id = r.password_secret_id;
      END IF;

      v_deleted := v_deleted + 1;
    EXCEPTION
      WHEN OTHERS THEN
        v_skipped := v_skipped + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object('deleted', v_deleted, 'skipped', v_skipped);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION receive_ppp_batch(UUID, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION receive_ppp_batch(UUID, TEXT, TEXT, JSONB) TO authenticated;

REVOKE ALL ON FUNCTION bulk_hard_delete_internet_credentials(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bulk_hard_delete_internet_credentials(UUID) TO authenticated;
