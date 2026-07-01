-- ============================================================
-- MASH ISP — 20260701120000_create_tenant_with_phone.sql
-- إلزام رقم الهاتف عند تسجيل شركة جديدة
-- ============================================================

CREATE OR REPLACE FUNCTION create_tenant_with_trial(
  p_company_name TEXT,
  p_admin_name   TEXT,
  p_phone        TEXT
) RETURNS UUID AS $$
DECLARE
  v_tenant_id  UUID;
  v_trial_plan UUID;
  v_trial_days INTEGER;
  v_phone      TEXT;
BEGIN
  v_phone := NULLIF(trim(p_phone), '');

  IF v_phone IS NULL THEN
    RAISE EXCEPTION 'phone_required';
  END IF;

  SELECT u.tenant_id INTO v_tenant_id
  FROM users u WHERE u.id = auth.uid();

  IF FOUND THEN
    IF v_tenant_id IS NOT NULL THEN
      RETURN v_tenant_id;
    END IF;
    RAISE EXCEPTION 'incomplete_user_profile';
  END IF;

  SELECT id, trial_days INTO v_trial_plan, v_trial_days
  FROM subscription_plans WHERE slug = 'free_trial' AND is_active = true LIMIT 1;

  IF v_trial_plan IS NULL THEN
    RAISE EXCEPTION 'Free Trial plan not found or inactive';
  END IF;

  INSERT INTO tenants (
    name, phone, plan_id, billing_cycle, is_trial,
    trial_ends_at, subscription_end, is_active
  ) VALUES (
    p_company_name, v_phone, v_trial_plan, NULL, true,
    now() + (v_trial_days || ' days')::INTERVAL,
    now() + (v_trial_days || ' days')::INTERVAL,
    true
  ) RETURNING id INTO v_tenant_id;

  INSERT INTO users (id, tenant_id, role, name)
  VALUES (auth.uid(), v_tenant_id, 'admin', p_admin_name);

  INSERT INTO mash_invoices (
    tenant_id, plan_id, billing_cycle, amount,
    period_start, period_end, status, paid_at
  ) VALUES (
    v_tenant_id, v_trial_plan, 'monthly', 0,
    CURRENT_DATE, CURRENT_DATE + v_trial_days, 'paid', now()
  );

  RETURN v_tenant_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
