-- ============================================================================
-- 058: سلة المحذوفات (Recycle Bin) + مهلة 30 يوماً
--   - عمود deleted_at + trigger يضبطه تلقائياً عند الحذف/الاسترجاع
--   - دوال: list_deleted_records / restore_record / hard_delete_record
--   - دالة purge_expired_deleted للحذف النهائي التلقائي للبيانات الآمنة فقط
--   - جدولة pg_cron يومية
--
-- المجموعات:
--   FINANCIAL (استرجاع فقط — لا حذف تلقائي):
--     customers, subscriptions, subscription_periods, payments, debts
--   SAFE (حذف تلقائي بعد 30 يوماً):
--     network_routers, network_ports, network_bypassed,
--     ppp_plans, ppp_batches, card_products, card_batches, pending_tasks
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) عمود deleted_at على كل جداول سلة المحذوفات
-- ----------------------------------------------------------------------------
ALTER TABLE customers            ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE subscriptions        ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE subscription_periods ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE payments             ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE debts                ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE ppp_plans            ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE ppp_batches          ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE card_products        ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE card_batches         ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE pending_tasks        ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE network_routers      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE network_ports        ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE network_bypassed     ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- ----------------------------------------------------------------------------
-- 2) trigger: ضبط deleted_at تلقائياً
--    is_deleted false→true ⇒ deleted_at = now()
--    is_deleted ⇒ false     ⇒ deleted_at = NULL (استرجاع)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION stamp_deleted_at() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_deleted = true AND COALESCE(OLD.is_deleted, false) = false THEN
    NEW.deleted_at := now();
  ELSIF NEW.is_deleted = false THEN
    NEW.deleted_at := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'customers','subscriptions','subscription_periods','payments','debts',
    'ppp_plans','ppp_batches','card_products','card_batches','pending_tasks',
    'network_routers','network_ports','network_bypassed'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_stamp_deleted_at ON %I', t);
    EXECUTE format(
      'CREATE TRIGGER trg_stamp_deleted_at BEFORE UPDATE ON %I
         FOR EACH ROW EXECUTE FUNCTION stamp_deleted_at()', t);
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 3) Backfill: السجلات المحذوفة مسبقاً تأخذ مهلة جديدة من الآن
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'customers','subscriptions','subscription_periods','payments','debts',
    'ppp_plans','ppp_batches','card_products','card_batches','pending_tasks',
    'network_routers','network_ports','network_bypassed'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format(
      'UPDATE %I SET deleted_at = now() WHERE is_deleted = true AND deleted_at IS NULL', t);
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 4) list_deleted_records — قائمة موحّدة لكل المحذوفات (tenant الحالي)
-- ----------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------
-- 5) restore_record — استرجاع سجل واحد
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION restore_record(p_table TEXT, p_id UUID)
RETURNS VOID AS $$
DECLARE
  v_tenant UUID := get_tenant_id();
  v_admin  BOOLEAN := is_tenant_admin() OR is_super_admin();
  v_allowed TEXT[] := ARRAY[
    'customers','subscriptions','subscription_periods','payments','debts',
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

-- ----------------------------------------------------------------------------
-- 6) hard_delete_record — حذف نهائي فوري لسجل واحد من السلة
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION hard_delete_record(p_table TEXT, p_id UUID)
RETURNS VOID AS $$
DECLARE
  v_tenant UUID := get_tenant_id();
  v_admin  BOOLEAN := is_tenant_admin() OR is_super_admin();
  v_old    JSON;
  v_allowed TEXT[] := ARRAY[
    'customers','subscriptions','subscription_periods','payments','debts',
    'ppp_plans','ppp_batches','card_products','card_batches','pending_tasks',
    'network_bypassed'
  ];
BEGIN
  IF NOT (v_admin OR has_permission(auth.uid(), 'delete_records')) THEN
    RAISE EXCEPTION 'insufficient permission';
  END IF;

  -- شبكة: إعادة استخدام دوال الحذف المتسلسل (058 يعتمد على 057)
  IF p_table = 'network_ports' THEN
    PERFORM hard_delete_network_port_cascade(p_id);
    RETURN;
  ELSIF p_table = 'network_routers' THEN
    PERFORM hard_delete_network_router(p_id);
    RETURN;
  END IF;

  IF NOT (p_table = ANY(v_allowed)) THEN
    RAISE EXCEPTION 'table not allowed';
  END IF;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'tenant not resolved';
  END IF;

  EXECUTE format('SELECT row_to_json(t) FROM %I t WHERE id = $1 AND tenant_id = $2', p_table)
    INTO v_old USING p_id, v_tenant;
  IF v_old IS NULL THEN
    RAISE EXCEPTION 'record not found or access denied';
  END IF;

  INSERT INTO audit_logs (tenant_id, table_name, record_id, action, old_data, performed_by)
  VALUES (v_tenant, p_table, p_id, 'HARD_DELETED', v_old, auth.uid());

  -- تنظيف أبناء card_batches قبل الحذف
  IF p_table = 'card_batches' THEN
    DELETE FROM card_batch_items WHERE batch_id = p_id AND tenant_id = v_tenant;
  END IF;

  EXECUTE format('DELETE FROM %I WHERE id = $1 AND tenant_id = $2', p_table)
    USING p_id, v_tenant;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 7) purge_expired_deleted — حذف نهائي تلقائي للبيانات الآمنة فقط
--    يعمل عبر كل الـ tenants (سياق نظامي بلا auth). آمن من ناحية FK عبر
--    حُرّاس NOT EXISTS — السجلات المُشار إليها تبقى حتى تزول مراجعها.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION purge_expired_deleted()
RETURNS INTEGER AS $$
DECLARE
  v_cutoff TIMESTAMPTZ := now() - INTERVAL '30 days';
  v_total  INTEGER := 0;
  v_n      INTEGER;
  v_port_ids   UUID[];
  v_router_ids UUID[];
BEGIN
  -- ---- شبكة: راوترات منتهية المهلة ----
  SELECT array_agg(id) INTO v_router_ids
    FROM network_routers WHERE is_deleted AND deleted_at < v_cutoff;
  IF v_router_ids IS NOT NULL THEN
    DELETE FROM router_mac_history WHERE router_id = ANY(v_router_ids);
    DELETE FROM network_extenders  WHERE router_id = ANY(v_router_ids);
    DELETE FROM network_routers    WHERE id = ANY(v_router_ids);
    GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  END IF;

  -- ---- شبكة: متجاوَزة منتهية المهلة ----
  DELETE FROM network_bypassed WHERE is_deleted AND deleted_at < v_cutoff;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;

  -- ---- شبكة: بورتات منتهية المهلة (نظّف الراوترات/المتجاوَزة المرتبطة) ----
  SELECT array_agg(id) INTO v_port_ids
    FROM network_ports WHERE is_deleted AND deleted_at < v_cutoff;
  IF v_port_ids IS NOT NULL THEN
    SELECT array_agg(id) INTO v_router_ids
      FROM network_routers WHERE port_id = ANY(v_port_ids);
    IF v_router_ids IS NOT NULL THEN
      DELETE FROM router_mac_history WHERE router_id = ANY(v_router_ids);
      DELETE FROM network_extenders  WHERE router_id = ANY(v_router_ids);
      DELETE FROM network_routers    WHERE id = ANY(v_router_ids);
    END IF;
    DELETE FROM network_bypassed WHERE port_id = ANY(v_port_ids);

    -- احذف البورتات من الأوراق للأعلى (يتفادى self-FK)
    LOOP
      DELETE FROM network_ports p
        WHERE p.is_deleted AND p.deleted_at < v_cutoff
          AND NOT EXISTS (SELECT 1 FROM network_ports c WHERE c.parent_port_id = p.id);
      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_total := v_total + v_n;
      EXIT WHEN v_n = 0;
    END LOOP;
  END IF;

  -- ---- المهام المعلقة (غير مرتبطة بدين) ----
  DELETE FROM pending_tasks pt
    WHERE pt.is_deleted AND pt.deleted_at < v_cutoff
      AND NOT EXISTS (SELECT 1 FROM debts d WHERE d.related_task_id = pt.id);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;

  -- ---- دفعات البطاقات (غير مستخدمة في مبيعات) ----
  DELETE FROM card_batch_items cbi
    USING card_batches cb
    WHERE cbi.batch_id = cb.id
      AND cb.is_deleted AND cb.deleted_at < v_cutoff
      AND NOT EXISTS (SELECT 1 FROM card_sale_items csi WHERE csi.batch_id = cb.id);
  DELETE FROM card_batches cb
    WHERE cb.is_deleted AND cb.deleted_at < v_cutoff
      AND NOT EXISTS (SELECT 1 FROM card_sale_items csi WHERE csi.batch_id = cb.id);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;

  -- ---- منتجات البطاقات (غير مرجعية) ----
  DELETE FROM card_products cp
    WHERE cp.is_deleted AND cp.deleted_at < v_cutoff
      AND NOT EXISTS (SELECT 1 FROM card_batch_items i WHERE i.product_id = cp.id)
      AND NOT EXISTS (SELECT 1 FROM card_sale_items  i WHERE i.product_id = cp.id);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;

  -- ---- دفعات PPP (لا أسماء مستخدمين مرتبطة) ----
  DELETE FROM ppp_batches pb
    WHERE pb.is_deleted AND pb.deleted_at < v_cutoff
      AND NOT EXISTS (SELECT 1 FROM internet_credentials ic WHERE ic.batch_id = pb.id);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;

  -- ---- فئات PPP (لا دفعات ولا أسماء مستخدمين) ----
  DELETE FROM ppp_plans pp
    WHERE pp.is_deleted AND pp.deleted_at < v_cutoff
      AND NOT EXISTS (SELECT 1 FROM ppp_batches pb WHERE pb.plan_id = pp.id)
      AND NOT EXISTS (SELECT 1 FROM internet_credentials ic WHERE ic.plan_id = pp.id);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;

  RETURN v_total;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 8) الصلاحيات + الجدولة
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION list_deleted_records()              FROM PUBLIC;
REVOKE ALL ON FUNCTION restore_record(TEXT, UUID)          FROM PUBLIC;
REVOKE ALL ON FUNCTION hard_delete_record(TEXT, UUID)      FROM PUBLIC;
REVOKE ALL ON FUNCTION purge_expired_deleted()             FROM PUBLIC;
GRANT EXECUTE ON FUNCTION list_deleted_records()           TO authenticated;
GRANT EXECUTE ON FUNCTION restore_record(TEXT, UUID)       TO authenticated;
GRANT EXECUTE ON FUNCTION hard_delete_record(TEXT, UUID)   TO authenticated;

-- جدولة يومية 03:30 — حذف نهائي تلقائي للبيانات الآمنة بعد 30 يوماً
SELECT cron.unschedule('purge-expired-deleted')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-expired-deleted');

SELECT cron.schedule('purge-expired-deleted', '30 3 * * *', $$
  SELECT purge_expired_deleted();
$$);
