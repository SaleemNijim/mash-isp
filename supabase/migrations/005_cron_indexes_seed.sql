-- ============================================================
-- MASH ISP — 005_cron_indexes_seed.sql
-- Blueprint v3.1 — Indexes + pg_cron jobs + Seed data
-- ============================================================

-- ============================================================
-- 1. Indexes للأداء
-- ============================================================

-- internet_credentials: البحث بـ tenant + username
-- ملاحظة: UNIQUE(tenant_id, username) موجود في 001، هذا index إضافي للـ query planner
CREATE INDEX IF NOT EXISTS idx_credentials_tenant_username
  ON internet_credentials (tenant_id, username);

-- subscriptions: استعلامات انتهاء الاشتراكات لكل شركة
CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant_end_date
  ON subscriptions (tenant_id, end_date);

-- payments: تقارير المدفوعات حسب التاريخ
CREATE INDEX IF NOT EXISTS idx_payments_tenant_paid_at
  ON payments (tenant_id, paid_at);

-- pending_tasks: Cron + فلترة المهام المتأخرة
CREATE INDEX IF NOT EXISTS idx_pending_tasks_tenant_status_due
  ON pending_tasks (tenant_id, status, due_at);

-- audit_logs: سجل الأحداث حسب الشركة والتاريخ
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_performed_at
  ON audit_logs (tenant_id, performed_at);


-- ============================================================
-- 2. Cron Jobs (pg_cron)
-- يتطلب تفعيل امتداد pg_cron من لوحة Supabase أولاً
-- ============================================================

-- ① overdue-to-debt — كل ساعة — §5.3 حرفياً (NOT EXISTS إلزامي لمنع تكرار الديون)
SELECT cron.schedule('overdue-to-debt', '0 * * * *', $$
  INSERT INTO debts (tenant_id, customer_id, original_amount, reason, status, related_task_id)
  SELECT p.tenant_id, p.customer_id, p.amount,
    'إشعار دفع معلق > 24 ساعة — دين مؤقت', 'temporary', pt.id
  FROM pending_tasks pt JOIN payments p ON p.id = pt.related_payment_id
  WHERE pt.status IN ('pending','reminded') AND pt.due_at < now()
  AND NOT EXISTS (SELECT 1 FROM debts WHERE related_task_id = pt.id);

  UPDATE pending_tasks SET status = 'converted_to_debt'
  WHERE status IN ('pending','reminded') AND due_at < now();
$$);

-- ② remind-pending — كل 4 ساعات
SELECT cron.schedule('remind-pending', '0 */4 * * *', $$
  UPDATE pending_tasks SET status = 'reminded'
  WHERE status = 'pending' AND due_at < now() + INTERVAL '4 hours';
$$);

-- ③ clean-nonces — كل ساعة
SELECT cron.schedule('clean-nonces', '0 * * * *', $$
  DELETE FROM sync_nonces WHERE used_at < now() - INTERVAL '24 hours';
$$);


-- ============================================================
-- 3. Seed: subscription_plans — §2.4 حرفياً
-- (الأسعار 20/180 أمثلة seed فقط — الفعلي يُعدَّل من Super Admin)
-- ============================================================

INSERT INTO subscription_plans
  (slug, name, billing_cycle, price_monthly, price_annual,
   trial_days, is_active, is_coming_soon, promotional_message, sort_order, features)
VALUES
  -- ① Free Trial
  ('free_trial', 'تجربة مجانية', 'trial',
   NULL, NULL, 30, true, false, NULL, 0,
   '["وصول كامل لكل المميزات","30 يوم مجاناً","لا بطاقة ائتمان"]'),

  -- ② Pro Monthly
  ('pro_monthly', 'Pro — شهري', 'monthly',
   20.00, NULL, NULL, true, false, NULL, 1,
   '["وصول كامل","لا قيود على المشتركين","دعم فني"]'),

  -- ③ Pro Annual (price_annual مثال: 180 = وفِّر 25%)
  ('pro_annual', 'Pro — سنوي', 'annual',
   20.00, 180.00, NULL, true, false, NULL, 2,
   '["وصول كامل","لا قيود على المشتركين","دعم فني","وفِّر مع الدفع السنوي"]'),

  -- ④ Enterprise — Coming Soon
  ('enterprise', 'Enterprise', 'coming_soon',
   NULL, NULL, NULL, false, true,
   'حلول Enterprise للفرق الكبيرة قيد التطوير. ميزات متقدمة وإدارة الفرق وأدوات المؤسسات ستكون متاحة قريباً.',
   3,
   '[]')
ON CONFLICT (slug) DO NOTHING;


-- ============================================================
-- 4. Seed: permissions — 12 كود
-- ============================================================

INSERT INTO permissions (code, label) VALUES
  ('view_full_password',   'عرض كلمة المرور كاملة'),
  ('delete_records',       'حذف السجلات'),
  ('manage_users',         'إدارة المستخدمين'),
  ('manage_permissions',   'إدارة الصلاحيات'),
  ('manage_bank_accounts', 'إدارة الحسابات البنكية'),
  ('renew_subscriptions',  'تجديد الاشتراكات'),
  ('sell_cards',           'بيع البطاقات'),
  ('manage_network',       'إدارة الشبكة'),
  ('manage_warehouse',     'إدارة المستودع'),
  ('import_excel',         'استيراد Excel'),
  ('view_reports',         'عرض التقارير'),
  ('confirm_payments',     'تأكيد المدفوعات')
ON CONFLICT (code) DO NOTHING;
