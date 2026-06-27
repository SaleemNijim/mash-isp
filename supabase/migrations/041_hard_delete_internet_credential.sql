-- ============================================================================
-- 041: حذف نهائي لسجل PPP (internet_credentials)
-- ============================================================================
-- يُسمح فقط بعد soft delete (is_deleted = true) وللسجلات غير مرتبطة
-- بفترات اشتراك أو سجل استخدام نشط. يُسجَّل في audit_logs قبل الحذف.

CREATE OR REPLACE FUNCTION hard_delete_internet_credential(p_credential_id UUID)
RETURNS VOID AS $$
DECLARE
  v_tenant_id       UUID;
  v_row             internet_credentials%ROWTYPE;
  v_secret_id       UUID;
BEGIN
  IF NOT has_permission(auth.uid(), 'delete_records') THEN
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

  IF v_row.is_deleted IS NOT TRUE THEN
    RAISE EXCEPTION 'must soft delete before permanent delete';
  END IF;

  IF v_row.is_used IS TRUE THEN
    RAISE EXCEPTION 'cannot permanently delete a used credential';
  END IF;

  IF EXISTS (
    SELECT 1 FROM subscription_periods sp
    WHERE sp.credential_id = p_credential_id AND sp.is_deleted = false
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

REVOKE ALL ON FUNCTION hard_delete_internet_credential(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hard_delete_internet_credential(UUID) TO authenticated;
