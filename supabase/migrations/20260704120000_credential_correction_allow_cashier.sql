-- ============================================================
-- 20260704120000: السماح للكاشير بتصحيح يوزر/باقة
-- ============================================================

CREATE OR REPLACE FUNCTION is_tenant_staff() RETURNS BOOLEAN AS $$
  SELECT EXISTS(
    SELECT 1 FROM users
    WHERE id = auth.uid()
      AND role IN ('admin', 'employee')
      AND is_active = true
      AND tenant_id IS NOT NULL
  )
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION reassign_customer_credential(
  p_customer_id       UUID,
  p_new_credential_id UUID,
  p_new_speed         TEXT,
  p_new_price         NUMERIC,
  p_fix_amounts       BOOLEAN DEFAULT true,
  p_notes             TEXT DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
  v_tenant_id UUID;
  v_username  TEXT;
  v_note      TEXT;
BEGIN
  IF NOT (is_tenant_staff() OR is_super_admin()) THEN
    RAISE EXCEPTION 'staff_only';
  END IF;

  v_tenant_id := get_tenant_id();
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_customer_id IS NULL OR p_new_credential_id IS NULL THEN
    RAISE EXCEPTION 'missing_required_fields';
  END IF;

  PERFORM _release_customer_credential_usage(v_tenant_id, p_customer_id);

  v_username := _assign_credential_to_customer(
    v_tenant_id, p_customer_id, p_new_credential_id
  );

  v_note := COALESCE(NULLIF(trim(p_notes), ''), 'تصحيح: إعادة تعيين يوزر/باقة');

  PERFORM _sync_customer_subscription_assignment(
    v_tenant_id, p_customer_id, p_new_credential_id,
    v_username, p_new_speed, p_new_price, COALESCE(p_fix_amounts, true), v_note
  );

  INSERT INTO audit_logs (tenant_id, table_name, record_id, action, new_data, performed_by)
  VALUES (
    v_tenant_id,
    'customer_credential_usage',
    p_customer_id,
    'CREDENTIAL_REASSIGN',
    jsonb_build_object(
      'customer_id', p_customer_id,
      'new_credential_id', p_new_credential_id,
      'username', v_username,
      'speed', p_new_speed,
      'price', p_new_price,
      'fix_amounts', COALESCE(p_fix_amounts, true),
      'notes', v_note
    ),
    auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION swap_customer_credentials(
  p_customer_a_id UUID,
  p_customer_b_id UUID,
  p_fix_amounts   BOOLEAN DEFAULT false,
  p_notes         TEXT DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
  v_tenant_id   UUID;
  v_cred_a      UUID;
  v_cred_b      UUID;
  v_user_a      TEXT;
  v_user_b      TEXT;
  v_speed_a     TEXT;
  v_price_a     NUMERIC;
  v_speed_b     TEXT;
  v_price_b     NUMERIC;
  v_note        TEXT;
BEGIN
  IF NOT (is_tenant_staff() OR is_super_admin()) THEN
    RAISE EXCEPTION 'staff_only';
  END IF;

  v_tenant_id := get_tenant_id();
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_customer_a_id IS NULL OR p_customer_b_id IS NULL THEN
    RAISE EXCEPTION 'missing_required_fields';
  END IF;

  IF p_customer_a_id = p_customer_b_id THEN
    RAISE EXCEPTION 'same_customer';
  END IF;

  SELECT ccu.credential_id INTO v_cred_a
  FROM customer_credential_usage ccu
  WHERE ccu.tenant_id = v_tenant_id
    AND ccu.customer_id = p_customer_a_id
    AND ccu.is_deleted = false
    AND ccu.released_at IS NULL
  ORDER BY ccu.assigned_at DESC
  LIMIT 1;

  SELECT ccu.credential_id INTO v_cred_b
  FROM customer_credential_usage ccu
  WHERE ccu.tenant_id = v_tenant_id
    AND ccu.customer_id = p_customer_b_id
    AND ccu.is_deleted = false
    AND ccu.released_at IS NULL
  ORDER BY ccu.assigned_at DESC
  LIMIT 1;

  IF v_cred_a IS NULL OR v_cred_b IS NULL THEN
    RAISE EXCEPTION 'both_customers_need_active_credential';
  END IF;

  SELECT ic.username INTO v_user_a
  FROM internet_credentials ic WHERE ic.id = v_cred_a;

  SELECT ic.username INTO v_user_b
  FROM internet_credentials ic WHERE ic.id = v_cred_b;

  SELECT s.speed, s.price INTO v_speed_a, v_price_a
  FROM subscriptions s
  WHERE s.tenant_id = v_tenant_id
    AND s.customer_id = p_customer_a_id
    AND s.is_deleted = false
  ORDER BY s.created_at DESC
  LIMIT 1;

  SELECT s.speed, s.price INTO v_speed_b, v_price_b
  FROM subscriptions s
  WHERE s.tenant_id = v_tenant_id
    AND s.customer_id = p_customer_b_id
    AND s.is_deleted = false
  ORDER BY s.created_at DESC
  LIMIT 1;

  PERFORM _release_customer_credential_usage(v_tenant_id, p_customer_a_id);
  PERFORM _release_customer_credential_usage(v_tenant_id, p_customer_b_id);

  PERFORM _assign_credential_to_customer(v_tenant_id, p_customer_a_id, v_cred_b);
  PERFORM _assign_credential_to_customer(v_tenant_id, p_customer_b_id, v_cred_a);

  v_note := COALESCE(NULLIF(trim(p_notes), ''), 'تصحيح: تبديل يوزر بين مشتركين');

  PERFORM _sync_customer_subscription_assignment(
    v_tenant_id, p_customer_a_id, v_cred_b,
    v_user_b, v_speed_b, v_price_b, COALESCE(p_fix_amounts, false), v_note
  );

  PERFORM _sync_customer_subscription_assignment(
    v_tenant_id, p_customer_b_id, v_cred_a,
    v_user_a, v_speed_a, v_price_a, COALESCE(p_fix_amounts, false), v_note
  );

  INSERT INTO audit_logs (tenant_id, table_name, record_id, action, new_data, performed_by)
  VALUES (
    v_tenant_id,
    'customer_credential_usage',
    p_customer_a_id,
    'CREDENTIAL_SWAP',
    jsonb_build_object(
      'customer_a_id', p_customer_a_id,
      'customer_b_id', p_customer_b_id,
      'credential_a_id', v_cred_a,
      'credential_b_id', v_cred_b,
      'username_a', v_user_a,
      'username_b', v_user_b,
      'fix_amounts', COALESCE(p_fix_amounts, false),
      'notes', v_note
    ),
    auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

NOTIFY pgrst, 'reload schema';
