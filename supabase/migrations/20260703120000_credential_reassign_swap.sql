-- ============================================================
-- 20260703120000: تصحيح خلط يوزر/باقة — إعادة تعيين + تبديل
-- ============================================================

-- ── فك ربط يوزر نشط عن مشترك ──
CREATE OR REPLACE FUNCTION _release_customer_credential_usage(
  p_tenant_id   UUID,
  p_customer_id UUID
) RETURNS UUID AS $$
DECLARE
  v_cred_id UUID;
BEGIN
  SELECT ccu.credential_id INTO v_cred_id
  FROM customer_credential_usage ccu
  WHERE ccu.tenant_id = p_tenant_id
    AND ccu.customer_id = p_customer_id
    AND ccu.is_deleted = false
    AND ccu.released_at IS NULL
  ORDER BY ccu.assigned_at DESC
  LIMIT 1;

  IF v_cred_id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE customer_credential_usage
  SET released_at = now()
  WHERE tenant_id = p_tenant_id
    AND customer_id = p_customer_id
    AND credential_id = v_cred_id
    AND is_deleted = false
    AND released_at IS NULL;

  IF NOT EXISTS (
    SELECT 1 FROM customer_credential_usage ccu
    WHERE ccu.credential_id = v_cred_id
      AND ccu.tenant_id = p_tenant_id
      AND ccu.is_deleted = false
      AND ccu.released_at IS NULL
  ) THEN
    UPDATE internet_credentials
    SET is_used = false
    WHERE id = v_cred_id AND tenant_id = p_tenant_id;
  END IF;

  RETURN v_cred_id;
END;
$$ LANGUAGE plpgsql;

-- ── ربط يوزر بمشترك ──
CREATE OR REPLACE FUNCTION _assign_credential_to_customer(
  p_tenant_id     UUID,
  p_customer_id   UUID,
  p_credential_id UUID
) RETURNS TEXT AS $$
DECLARE
  v_username     TEXT;
  v_pre_reserved BOOLEAN;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM customers c
    WHERE c.id = p_customer_id
      AND c.tenant_id = p_tenant_id
      AND c.is_deleted = false
  ) THEN
    RAISE EXCEPTION 'customer_not_found';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM customer_credential_usage ccu
    WHERE ccu.credential_id = p_credential_id
      AND ccu.customer_id = p_customer_id
      AND ccu.tenant_id = p_tenant_id
      AND ccu.is_deleted = false
      AND ccu.released_at IS NULL
  ) INTO v_pre_reserved;

  SELECT ic.username INTO v_username
  FROM internet_credentials ic
  WHERE ic.id = p_credential_id
    AND ic.tenant_id = p_tenant_id
    AND ic.type = 'bb'
    AND ic.is_deleted = false
    AND (ic.is_used = false OR v_pre_reserved);

  IF v_username IS NULL THEN
    RAISE EXCEPTION 'credential_not_available';
  END IF;

  UPDATE internet_credentials
  SET is_used = true
  WHERE id = p_credential_id AND tenant_id = p_tenant_id;

  IF NOT v_pre_reserved THEN
    INSERT INTO customer_credential_usage (tenant_id, customer_id, credential_id)
    VALUES (p_tenant_id, p_customer_id, p_credential_id);
  END IF;

  RETURN v_username;
END;
$$ LANGUAGE plpgsql;

-- ── تحديث آخر اشتراك/فترة بعد التصحيح ──
CREATE OR REPLACE FUNCTION _sync_customer_subscription_assignment(
  p_tenant_id     UUID,
  p_customer_id   UUID,
  p_credential_id UUID,
  p_username      TEXT,
  p_speed         TEXT,
  p_price         NUMERIC,
  p_fix_amounts   BOOLEAN,
  p_note_suffix   TEXT DEFAULT 'تصحيح ربط يوزر/باقة'
) RETURNS VOID AS $$
DECLARE
  v_sub_id    UUID;
  v_period_id UUID;
  v_cash      NUMERIC;
  v_app       NUMERIC;
  v_discount  NUMERIC;
  v_due       NUMERIC;
  v_balance   NUMERIC;
  v_debt      NUMERIC;
  v_paid_at   TIMESTAMPTZ;
  v_old_notes TEXT;
BEGIN
  SELECT s.id INTO v_sub_id
  FROM subscriptions s
  WHERE s.tenant_id = p_tenant_id
    AND s.customer_id = p_customer_id
    AND s.is_deleted = false
  ORDER BY s.created_at DESC
  LIMIT 1;

  IF v_sub_id IS NOT NULL THEN
    UPDATE subscriptions
    SET speed = NULLIF(trim(p_speed), ''), price = p_price
    WHERE id = v_sub_id;
  END IF;

  SELECT sp.id, sp.cash_amount, sp.app_amount, sp.discount_amount, sp.paid_at, sp.notes
  INTO v_period_id, v_cash, v_app, v_discount, v_paid_at, v_old_notes
  FROM subscription_periods sp
  WHERE sp.tenant_id = p_tenant_id
    AND sp.customer_id = p_customer_id
    AND sp.is_deleted = false
  ORDER BY sp.period_start DESC, sp.created_at DESC
  LIMIT 1;

  IF v_period_id IS NULL THEN
    RETURN;
  END IF;

  IF p_fix_amounts THEN
    v_due := COALESCE(p_price, 0);
    v_balance := GREATEST(
      v_due - COALESCE(v_cash, 0) - COALESCE(v_app, 0) - COALESCE(v_discount, 0),
      0
    );
  ELSE
    SELECT sp.amount_due, sp.balance_remaining
    INTO v_due, v_balance
    FROM subscription_periods sp
    WHERE sp.id = v_period_id;
  END IF;

  UPDATE subscription_periods
  SET
    credential_id = p_credential_id,
    username = NULLIF(trim(p_username), ''),
    speed = NULLIF(trim(p_speed), ''),
    price = p_price,
    amount_due = v_due,
    balance_remaining = v_balance,
    notes = CASE
      WHEN v_old_notes IS NULL OR trim(v_old_notes) = '' THEN p_note_suffix
      WHEN position(p_note_suffix in v_old_notes) > 0 THEN v_old_notes
      ELSE v_old_notes || ' | ' || p_note_suffix
    END
  WHERE id = v_period_id;

  v_debt := calc_subscription_debt_amount(
    v_due, v_cash, v_app, v_discount, v_balance, v_paid_at, NULL, NULL
  );

  PERFORM upsert_subscription_period_debt(
    p_tenant_id, p_customer_id, v_period_id, v_debt,
    'تصحيح باقة — باقٍ غير مسدد'
  );
END;
$$ LANGUAGE plpgsql;

-- ── إعادة تعيين: مشترك واحد — باقة/يوزر خاطئ ──
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
  IF NOT (is_tenant_admin() OR is_super_admin()) THEN
    RAISE EXCEPTION 'admin_only';
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

-- ── تبديل: مشتركان اختلط عليهم اليوزر ──
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
  IF NOT (is_tenant_admin() OR is_super_admin()) THEN
    RAISE EXCEPTION 'admin_only';
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

REVOKE ALL ON FUNCTION reassign_customer_credential(UUID, UUID, TEXT, NUMERIC, BOOLEAN, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION reassign_customer_credential(UUID, UUID, TEXT, NUMERIC, BOOLEAN, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION swap_customer_credentials(UUID, UUID, BOOLEAN, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION swap_customer_credentials(UUID, UUID, BOOLEAN, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
