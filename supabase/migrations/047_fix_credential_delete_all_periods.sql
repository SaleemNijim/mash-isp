-- ============================================================================
-- 047: فك subscription_periods المحذوفة soft أيضاً قبل حذf PPP
-- ============================================================================
-- FK subscription_periods_credential_id_fkey يشمل is_deleted=true —
-- كان UPDATE يقتصر على is_deleted=false فبقي الربط.

CREATE OR REPLACE FUNCTION hard_delete_internet_credential(p_credential_id UUID)
RETURNS VOID AS $$
DECLARE
  v_tenant_id UUID;
  v_row       internet_credentials%ROWTYPE;
  v_secret_id UUID;
  v_admin     BOOLEAN := is_tenant_admin() OR is_super_admin();
BEGIN
  IF NOT (
    v_admin
    OR has_permission(auth.uid(), 'delete_records')
  ) THEN
    RAISE EXCEPTION 'insufficient permission';
  END IF;

  SELECT * INTO v_row
    FROM internet_credentials
    WHERE id = p_credential_id;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'credential not found';
  END IF;

  v_tenant_id := get_tenant_id();
  IF v_tenant_id IS NULL OR v_row.tenant_id <> v_tenant_id THEN
    RAISE EXCEPTION 'credential not found or access denied';
  END IF;

  IF NOT v_admin THEN
    IF EXISTS (
      SELECT 1 FROM subscription_periods sp
      WHERE sp.credential_id = p_credential_id
        AND sp.is_deleted = false
    ) THEN
      RAISE EXCEPTION 'credential linked to subscription period';
    END IF;

    IF EXISTS (
      SELECT 1 FROM customer_credential_usage ccu
      WHERE ccu.credential_id = p_credential_id
        AND ccu.is_deleted = false
        AND ccu.released_at IS NULL
    ) THEN
      RAISE EXCEPTION 'credential still assigned to customer';
    END IF;
  ELSE
    UPDATE subscription_periods
      SET credential_id = NULL
      WHERE credential_id = p_credential_id
        AND tenant_id = v_tenant_id;

    DELETE FROM customer_credential_usage
      WHERE credential_id = p_credential_id
        AND tenant_id = v_tenant_id;
  END IF;

  v_secret_id := v_row.password_secret_id;

  INSERT INTO audit_logs (tenant_id, table_name, record_id, action, old_data, performed_by)
  VALUES (
    v_row.tenant_id,
    'internet_credentials',
    v_row.id,
    'HARD_DELETED',
    row_to_json(v_row),
    auth.uid()
  );

  DELETE FROM internet_credentials WHERE id = p_credential_id;

  IF v_secret_id IS NOT NULL THEN
    DELETE FROM vault.secrets WHERE id = v_secret_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION bulk_hard_delete_internet_credentials()
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

  FOR r IN
    SELECT * FROM internet_credentials
    WHERE tenant_id = v_tenant_id
    ORDER BY username
  LOOP
    IF NOT v_admin THEN
      IF EXISTS (
        SELECT 1 FROM subscription_periods sp
        WHERE sp.credential_id = r.id
          AND sp.is_deleted = false
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
        WHERE credential_id = r.id
          AND tenant_id = v_tenant_id;

      DELETE FROM customer_credential_usage
        WHERE credential_id = r.id
          AND tenant_id = v_tenant_id;
    END IF;

    INSERT INTO audit_logs (tenant_id, table_name, record_id, action, old_data, performed_by)
    VALUES (
      r.tenant_id,
      'internet_credentials',
      r.id,
      'HARD_DELETED',
      row_to_json(r),
      auth.uid()
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

REVOKE ALL ON FUNCTION hard_delete_internet_credential(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION bulk_hard_delete_internet_credentials() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hard_delete_internet_credential(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION bulk_hard_delete_internet_credentials() TO authenticated;
