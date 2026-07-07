-- ============================================================
-- MASH ISP — 20260707163000_expenses_recycle_bin.sql
-- P-Exp-2: expenses في سلة المحذوفات (financial — استرجاع فقط)
-- ============================================================

ALTER TABLE expenses ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

DROP TRIGGER IF EXISTS trg_stamp_deleted_at ON expenses;
CREATE TRIGGER trg_stamp_deleted_at
  BEFORE UPDATE ON expenses
  FOR EACH ROW EXECUTE FUNCTION stamp_deleted_at();

UPDATE expenses
SET deleted_at = now()
WHERE is_deleted = true AND deleted_at IS NULL;

-- list_deleted_records — إضافة المصروفات (مجموعة financial)
CREATE OR REPLACE FUNCTION list_deleted_records()
RETURNS TABLE (
  table_name  TEXT,
  table_label TEXT,
  group_kind  TEXT,
  record_id   UUID,
  label       TEXT,
  deleted_at  TIMESTAMPTZ,
  purge_at    TIMESTAMPTZ
) AS $$
DECLARE
  v_tenant UUID := get_tenant_id();
  v_admin  BOOLEAN := is_tenant_admin() OR is_super_admin();
  v_keep   INTERVAL := INTERVAL '30 days';
BEGIN
  IF NOT (v_admin OR has_permission(auth.uid(), 'delete_records')) THEN
    RAISE EXCEPTION 'insufficient permission';
  END IF;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'tenant not resolved';
  END IF;

  RETURN QUERY
  SELECT 'customers'::TEXT, 'المشتركون'::TEXT, 'financial'::TEXT,
         c.id, c.name, c.deleted_at, NULL::TIMESTAMPTZ
    FROM customers c WHERE c.is_deleted AND c.tenant_id = v_tenant
  UNION ALL
  SELECT 'distributors', 'الموزعون', 'financial',
         d.id, d.name, d.deleted_at, NULL
    FROM distributors d WHERE d.is_deleted AND d.tenant_id = v_tenant
  UNION ALL
  SELECT 'subscriptions', 'الاشتراكات', 'financial',
         s.id, 'اشتراك ' || COALESCE(s.speed, s.type), s.deleted_at, NULL
    FROM subscriptions s WHERE s.is_deleted AND s.tenant_id = v_tenant
  UNION ALL
  SELECT 'subscription_periods', 'فترات الاشتراك', 'financial',
         sp.id, COALESCE(sp.username, 'فترة') || ' — ' || to_char(sp.period_start,'YYYY-MM-DD'),
         sp.deleted_at, NULL
    FROM subscription_periods sp WHERE sp.is_deleted AND sp.tenant_id = v_tenant
  UNION ALL
  SELECT 'payments', 'المدفوعات', 'financial',
         p.id, 'دفعة ' || p.amount::TEXT || ' (' || p.method || ')', p.deleted_at, NULL
    FROM payments p WHERE p.is_deleted AND p.tenant_id = v_tenant
  UNION ALL
  SELECT 'debts', 'الديون', 'financial',
         d.id, 'دين ' || d.original_amount::TEXT, d.deleted_at, NULL
    FROM debts d WHERE d.is_deleted AND d.tenant_id = v_tenant
  UNION ALL
  SELECT 'expenses', 'المصروفات', 'financial',
         e.id,
         COALESCE(NULLIF(trim(e.description), ''), NULLIF(trim(e.beneficiary), ''), 'مصروف')
           || ' — ' || e.amount::TEXT || ' (' || e.method || ')',
         e.deleted_at, NULL
    FROM expenses e WHERE e.is_deleted AND e.tenant_id = v_tenant
  UNION ALL
  SELECT 'ppp_plans', 'فئات PPP', 'safe',
         pp.id, pp.name, pp.deleted_at, pp.deleted_at + v_keep
    FROM ppp_plans pp WHERE pp.is_deleted AND pp.tenant_id = v_tenant
  UNION ALL
  SELECT 'ppp_batches', 'دفعات PPP', 'safe',
         pb.id, 'دفعة ' || pb.batch_number, pb.deleted_at, pb.deleted_at + v_keep
    FROM ppp_batches pb WHERE pb.is_deleted AND pb.tenant_id = v_tenant
  UNION ALL
  SELECT 'card_products', 'منتجات البطاقات', 'safe',
         cp.id, cp.name, cp.deleted_at, cp.deleted_at + v_keep
    FROM card_products cp WHERE cp.is_deleted AND cp.tenant_id = v_tenant
  UNION ALL
  SELECT 'card_batches', 'دفعات البطاقات', 'safe',
         cb.id, COALESCE(cb.supplier, 'دفعة بطاقات'), cb.deleted_at, cb.deleted_at + v_keep
    FROM card_batches cb WHERE cb.is_deleted AND cb.tenant_id = v_tenant
  UNION ALL
  SELECT 'pending_tasks', 'المهام المعلقة', 'safe',
         pt.id, 'مهمة ' || COALESCE(pt.amount::TEXT, ''), pt.deleted_at, pt.deleted_at + v_keep
    FROM pending_tasks pt WHERE pt.is_deleted AND pt.tenant_id = v_tenant
  UNION ALL
  SELECT 'network_routers', 'الراوترات', 'safe',
         nr.id, COALESCE(nr.name, nr.ip_address, 'راوتر'), nr.deleted_at, nr.deleted_at + v_keep
    FROM network_routers nr WHERE nr.is_deleted AND nr.tenant_id = v_tenant
  UNION ALL
  SELECT 'network_ports', 'البورتات', 'safe',
         np.id, np.name, np.deleted_at, np.deleted_at + v_keep
    FROM network_ports np WHERE np.is_deleted AND np.tenant_id = v_tenant
  UNION ALL
  SELECT 'network_bypassed', 'الأجهزة المتجاوَزة', 'safe',
         nb.id, COALESCE(nb.name, nb.ip_address, 'جهاز'), nb.deleted_at, nb.deleted_at + v_keep
    FROM network_bypassed nb WHERE nb.is_deleted AND nb.tenant_id = v_tenant
  ORDER BY deleted_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- restore_record — expenses مسموح (العكس المالي عبر trg_sync_expense_bank_balance)
CREATE OR REPLACE FUNCTION restore_record(p_table TEXT, p_id UUID)
RETURNS VOID AS $$
DECLARE
  v_tenant UUID := get_tenant_id();
  v_admin  BOOLEAN := is_tenant_admin() OR is_super_admin();
  v_allowed TEXT[] := ARRAY[
    'customers','distributors','subscriptions','subscription_periods','payments','debts',
    'expenses',
    'ppp_plans','ppp_batches','card_products','card_batches','pending_tasks',
    'network_routers','network_ports','network_bypassed'
  ];
BEGIN
  IF NOT (v_admin OR has_permission(auth.uid(), 'delete_records')) THEN
    RAISE EXCEPTION 'insufficient permission';
  END IF;
  IF NOT (p_table = ANY(v_allowed)) THEN
    RAISE EXCEPTION 'table not allowed';
  END IF;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'tenant not resolved';
  END IF;

  EXECUTE format(
    'UPDATE %I SET is_deleted = false WHERE id = $1 AND tenant_id = $2', p_table)
    USING p_id, v_tenant;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

NOTIFY pgrst, 'reload schema';
