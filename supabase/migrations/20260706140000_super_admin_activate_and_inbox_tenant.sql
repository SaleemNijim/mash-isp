-- ============================================================
-- 20260706140000: تفعيل اشتراك ذري + اسم الشركة في الوارد
-- ============================================================

CREATE OR REPLACE FUNCTION activate_tenant_subscription(
  p_tenant_id UUID,
  p_plan_id   UUID
) RETURNS VOID AS $$
DECLARE
  v_plan                 subscription_plans%ROWTYPE;
  v_tenant               tenants%ROWTYPE;
  v_amount               NUMERIC;
  v_period_start         DATE;
  v_period_end           DATE;
  v_new_subscription_end TIMESTAMPTZ;
  v_base                 TIMESTAMPTZ;
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT * INTO v_plan
  FROM subscription_plans
  WHERE id = p_plan_id
    AND is_active = true
    AND slug IN ('pro_monthly', 'pro_annual');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'plan_not_found';
  END IF;

  SELECT * INTO v_tenant
  FROM tenants
  WHERE id = p_tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'tenant_not_found';
  END IF;

  v_amount := CASE
    WHEN v_plan.billing_cycle = 'annual' THEN COALESCE(v_plan.price_annual, 0)
    ELSE COALESCE(v_plan.price_monthly, 0)
  END;

  v_period_start := CURRENT_DATE;
  v_period_end := CASE
    WHEN v_plan.billing_cycle = 'annual' THEN (CURRENT_DATE + INTERVAL '1 year')::DATE
    ELSE (CURRENT_DATE + INTERVAL '1 month')::DATE
  END;

  v_base := CASE
    WHEN v_tenant.subscription_end IS NOT NULL AND v_tenant.subscription_end > now()
      THEN v_tenant.subscription_end
    ELSE now()
  END;

  v_new_subscription_end := CASE
    WHEN v_plan.billing_cycle = 'annual' THEN v_base + INTERVAL '1 year'
    ELSE v_base + INTERVAL '1 month'
  END;

  INSERT INTO mash_invoices (
    tenant_id, plan_id, billing_cycle, amount,
    period_start, period_end, status, paid_at
  ) VALUES (
    p_tenant_id, p_plan_id, v_plan.billing_cycle, v_amount,
    v_period_start, v_period_end, 'paid', now()
  );

  UPDATE tenants
  SET
    subscription_end = v_new_subscription_end,
    is_trial = false,
    is_active = true,
    billing_cycle = v_plan.billing_cycle,
    plan_id = p_plan_id
  WHERE id = p_tenant_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION activate_tenant_subscription(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION activate_tenant_subscription(UUID, UUID) TO authenticated;

-- الوارد: إضافة اسم شركة المُرسِل (لرسائل admin_to_platform)
DROP FUNCTION IF EXISTS get_my_inbox();
CREATE FUNCTION get_my_inbox()
RETURNS TABLE (
  recipient_id        UUID,
  read_at             TIMESTAMPTZ,
  received_at         TIMESTAMPTZ,
  message_id          UUID,
  title               TEXT,
  body                TEXT,
  channel             TEXT,
  priority            TEXT,
  category            TEXT,
  sent_at             TIMESTAMPTZ,
  sender_name         TEXT,
  sender_role         TEXT,
  sender_tenant_name  TEXT
) AS $$
  SELECT
    mr.id,
    mr.read_at,
    mr.created_at,
    im.id,
    im.title,
    im.body,
    im.channel,
    im.priority,
    im.category,
    im.created_at,
    u.name,
    u.role,
    t.name
  FROM message_recipients mr
  JOIN internal_messages im ON im.id = mr.message_id
  LEFT JOIN users u ON u.id = im.sender_id
  LEFT JOIN tenants t ON t.id = im.tenant_id
  WHERE mr.recipient_user_id = auth.uid()
  ORDER BY mr.created_at DESC
  LIMIT 100;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION get_my_inbox() TO authenticated;

DROP FUNCTION IF EXISTS peek_inbox_message(UUID);
CREATE FUNCTION peek_inbox_message(p_message_id UUID)
RETURNS TABLE (
  title               TEXT,
  priority            TEXT,
  channel             TEXT,
  sender_tenant_name  TEXT
) AS $$
  SELECT im.title, im.priority, im.channel, t.name
  FROM message_recipients mr
  JOIN internal_messages im ON im.id = mr.message_id
  LEFT JOIN tenants t ON t.id = im.tenant_id
  WHERE mr.recipient_user_id = auth.uid()
    AND im.id = p_message_id
  LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION peek_inbox_message(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
