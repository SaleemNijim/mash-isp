-- ============================================================================
-- 062: توسيع صلاحيات الكاشير لتغطية كل ما يفعله المدير (بإذنه)
-- ============================================================================

INSERT INTO permissions (code, label) VALUES
  ('manage_customers',     'إدارة المشتركين'),
  ('create_subscriptions', 'اشتراك PPP جديد'),
  ('manage_ppp',           'إدارة PPP'),
  ('manage_distributors',  'إدارة الموزعين'),
  ('manage_debts',         'تسديد الديون'),
  ('view_pending_tasks',   'المهام المعلقة')
ON CONFLICT (code) DO NOTHING;
