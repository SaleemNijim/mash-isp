-- ============================================================================
-- 043: حذف جماعي لكل سجلات PPP في الشركة
-- ============================================================================

CREATE OR REPLACE FUNCTION bulk_hard_delete_internet_credentials()
RETURNS JSONB AS $$
DECLARE
  v_tenant_id UUID := get_tenant_id();
  r           internet_credentials%ROWTYPE;
  v_deleted   INTEGER := 0;
  v_skipped   INTEGER := 0;
BEGIN
  IF NOT has_permission(auth.uid(), 'delete_records') THEN
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

REVOKE ALL ON FUNCTION bulk_hard_delete_internet_credentials() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bulk_hard_delete_internet_credentials() TO authenticated;
