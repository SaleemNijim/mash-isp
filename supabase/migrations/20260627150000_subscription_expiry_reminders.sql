-- ============================================================
-- تنبيهات انتهاء الاشتراك (3 أيام أو أقل) — رسالة داخلية تلقائية
-- ============================================================

CREATE TABLE IF NOT EXISTS subscription_expiry_reminders (
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  expiry_at   TIMESTAMPTZ NOT NULL,
  reminded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, expiry_at)
);

ALTER TABLE subscription_expiry_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_expiry_reminders FORCE ROW LEVEL SECURITY;

CREATE POLICY "subscription_expiry_reminders_superadmin_read"
  ON subscription_expiry_reminders
  FOR SELECT
  USING (is_super_admin());

REVOKE ALL ON subscription_expiry_reminders FROM PUBLIC;
GRANT SELECT ON subscription_expiry_reminders TO authenticated;

CREATE OR REPLACE FUNCTION _arabic_days_remaining_label(p_days INT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_days <= 0 THEN 'أقل من يوم واحد'
    WHEN p_days = 1 THEN 'يوم واحد'
    WHEN p_days = 2 THEN 'يومان'
    WHEN p_days BETWEEN 3 AND 10 THEN p_days::TEXT || ' أيام'
    ELSE p_days::TEXT || ' يوماً'
  END;
$$;

CREATE OR REPLACE FUNCTION notify_subscription_expiring_soon()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sender     UUID;
  v_tenant     RECORD;
  v_expiry     TIMESTAMPTZ;
  v_days       INT;
  v_recipients UUID[];
  v_title      TEXT := 'تنبيه: اشتراككم على وشك الانتهاء';
  v_body       TEXT;
  v_days_label TEXT;
  v_expiry_ar  TEXT;
BEGIN
  SELECT u.id INTO v_sender
  FROM users u
  WHERE u.role = 'super_admin'
    AND u.is_active = true
  ORDER BY u.created_at
  LIMIT 1;

  IF v_sender IS NULL THEN
    RETURN;
  END IF;

  FOR v_tenant IN
    SELECT t.id, t.name, t.is_trial, t.trial_ends_at, t.subscription_end
    FROM tenants t
    WHERE t.is_active = true
  LOOP
    v_expiry := CASE
      WHEN v_tenant.is_trial THEN v_tenant.trial_ends_at
      ELSE v_tenant.subscription_end
    END;

    IF v_expiry IS NULL THEN
      CONTINUE;
    END IF;

    v_days := CEIL(EXTRACT(EPOCH FROM (v_expiry - now())) / 86400)::INT;

    IF v_days < 0 OR v_days > 3 THEN
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM subscription_expiry_reminders r
      WHERE r.tenant_id = v_tenant.id
        AND r.expiry_at = v_expiry
    ) THEN
      CONTINUE;
    END IF;

    SELECT array_agg(u.id) INTO v_recipients
    FROM users u
    WHERE u.tenant_id = v_tenant.id
      AND u.role = 'admin'
      AND u.is_active = true;

    IF v_recipients IS NULL OR array_length(v_recipients, 1) IS NULL THEN
      CONTINUE;
    END IF;

    v_days_label := _arabic_days_remaining_label(v_days);
    v_expiry_ar := to_char(v_expiry AT TIME ZONE 'Asia/Jerusalem', 'DD/MM/YYYY');

    v_body := format(
      E'السلام عليكم ورحمة الله وبركاته،\n\n'
      'نودّ إعلامكم بأن اشتراك شركة «%s» في منصة MASH ISP يقترب من تاريخ انتهائه.\n'
      'يتبقى %s على انتهاء الاشتراك (بتاريخ %s).\n\n'
      'نرجو منكم تسوية تجديد الاشتراك في أقرب وقت ممكن لضمان استمرار الخدمة دون انقطاع.\n\n'
      'مع خالص التقدير،\n'
      'م.سليم نجم',
      v_tenant.name,
      v_days_label,
      v_expiry_ar
    );

    PERFORM _dispatch_internal_message(
      v_sender,
      v_tenant.id,
      'super_to_tenant',
      v_title,
      v_body,
      CASE WHEN v_days <= 1 THEN 'urgent' ELSE 'high' END,
      'billing',
      v_recipients
    );

    INSERT INTO subscription_expiry_reminders (tenant_id, expiry_at)
    VALUES (v_tenant.id, v_expiry);
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION notify_subscription_expiring_soon() FROM PUBLIC;

SELECT cron.unschedule('notify-subscription-expiring')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notify-subscription-expiring');

SELECT cron.schedule(
  'notify-subscription-expiring',
  '0 5 * * *',
  $$SELECT notify_subscription_expiring_soon();$$
);
