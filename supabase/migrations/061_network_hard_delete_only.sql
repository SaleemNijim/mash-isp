-- ============================================================================
-- 061: الشبكة — حذف نهائي مباشر (بدون سلة محذوفات)
--   - إزالة جداول الشبكة من list_deleted_records
--   - تنظيف أي سجلات شبكة محذوفة ناعماً سابقاً (is_deleted=true)
-- ============================================================================

-- إزالة الشبكة من سلة المحذوفات — تبقى المالية وباقي البيانات فقط
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
  ORDER BY deleted_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- تنظيف سجلات الشبكة المحذوفة ناعماً سابقاً (حذف نهائي)
DO $$
DECLARE
  v_soft_port_ids UUID[];
  v_router_ids    UUID[];
  v_n             INTEGER;
BEGIN
  SELECT array_agg(id) INTO v_soft_port_ids
    FROM network_ports WHERE is_deleted;

  SELECT array_agg(id) INTO v_router_ids
    FROM network_routers
    WHERE is_deleted
       OR (v_soft_port_ids IS NOT NULL AND port_id = ANY(v_soft_port_ids));

  IF v_router_ids IS NOT NULL THEN
    DELETE FROM router_mac_history WHERE router_id = ANY(v_router_ids);
    DELETE FROM network_extenders  WHERE router_id = ANY(v_router_ids);
    DELETE FROM network_routers    WHERE id = ANY(v_router_ids);
  END IF;

  DELETE FROM router_mac_history WHERE is_deleted;
  DELETE FROM network_extenders  WHERE is_deleted;

  IF v_soft_port_ids IS NOT NULL THEN
    DELETE FROM network_bypassed
      WHERE is_deleted OR port_id = ANY(v_soft_port_ids);

    LOOP
      DELETE FROM network_ports p
        WHERE p.is_deleted
          AND NOT EXISTS (SELECT 1 FROM network_ports c WHERE c.parent_port_id = p.id);
      GET DIAGNOSTICS v_n = ROW_COUNT;
      EXIT WHEN v_n = 0;
    END LOOP;
  ELSE
    DELETE FROM network_bypassed WHERE is_deleted;
  END IF;
END $$;
