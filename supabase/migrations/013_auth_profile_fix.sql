-- ============================================================
-- MASH ISP — 013_auth_profile_fix.sql
-- إصلاح: قراءة الملف الشخصي عند الدخول + idempotent tenant setup
-- ============================================================

-- ① جلب ملف المستخدم الحالي — يتجاوز RLS (للدخول و proxy)
CREATE OR REPLACE FUNCTION get_my_user_profile()
RETURNS TABLE (
  role            TEXT,
  is_active       BOOLEAN,
  tenant_id       UUID,
  force_logout_at TIMESTAMPTZ
) AS $$
  SELECT u.role, u.is_active, u.tenant_id, u.force_logout_at
  FROM users u
  WHERE u.id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION get_my_user_profile() TO authenticated;

-- ② create_tenant_with_trial — idempotent (لا duplicate key على users)
CREATE OR REPLACE FUNCTION create_tenant_with_trial(
  p_company_name TEXT,
  p_admin_name   TEXT
) RETURNS UUID AS $$
DECLARE
  v_tenant_id  UUID;
  v_trial_plan UUID;
  v_trial_days INTEGER;
BEGIN
  -- إذا وُجد المستخدم مسبقاً — أعد tenant_id دون إعادة الإدراج
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
    name, plan_id, billing_cycle, is_trial,
    trial_ends_at, subscription_end, is_active
  ) VALUES (
    p_company_name, v_trial_plan, NULL, true,
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
