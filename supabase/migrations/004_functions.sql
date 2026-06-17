-- ============================================================
-- MASH ISP — 004_functions.sql
-- Blueprint v3.1 — RPC Functions (Atomic Operations)
-- ============================================================

-- ============================================================
-- 1) create_tenant_with_trial — §2.4 حرفياً
--    بدون tenant guard — تُستدعى قبل وجود tenant للمستخدم
-- ============================================================

CREATE OR REPLACE FUNCTION create_tenant_with_trial(
  p_company_name TEXT,
  p_admin_name   TEXT
) RETURNS UUID AS $$
DECLARE
  v_tenant_id  UUID;
  v_trial_plan UUID;
  v_trial_days INTEGER;
BEGIN
  -- جلب خطة Trial من DB (لا hard-coded values)
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

  -- فاتورة مجانية للـ Trial
  INSERT INTO mash_invoices (
    tenant_id, plan_id, billing_cycle, amount,
    period_start, period_end, status, paid_at
  ) VALUES (
    v_tenant_id, v_trial_plan, 'monthly', 0,
    CURRENT_DATE, CURRENT_DATE + v_trial_days, 'paid', now()
  );

  RETURN v_tenant_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 2) renew_subscription — عملية ذرية
--    nonce check → extend end_date → credential → payment → nonce
-- ============================================================

CREATE OR REPLACE FUNCTION renew_subscription(
  p_subscription_id UUID,
  p_credential_id   UUID,
  p_amount          NUMERIC,
  p_method          TEXT,
  p_bank_account_id UUID,
  p_nonce           TEXT
) RETURNS VOID AS $$
DECLARE
  v_tenant_id   UUID;
  v_customer_id UUID;
  v_cred_type   TEXT;
BEGIN
  IF get_tenant_id() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- فحص الـ nonce: رفض التكرار — PostgREST يُترجم 23505 → HTTP 409
  IF EXISTS (SELECT 1 FROM sync_nonces WHERE nonce = p_nonce) THEN
    RAISE EXCEPTION 'Duplicate nonce — 409 Conflict'
      USING ERRCODE = '23505';
  END IF;

  -- التحقق من الاشتراك وجلب بيانات المستأجر والعميل
  SELECT s.tenant_id, s.customer_id
  INTO v_tenant_id, v_customer_id
  FROM subscriptions s
  WHERE s.id = p_subscription_id
    AND s.tenant_id = get_tenant_id()
    AND s.is_deleted = false;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Subscription not found';
  END IF;

  -- تمديد end_date بشهر واحد
  UPDATE subscriptions
  SET end_date = end_date + INTERVAL '1 month'
  WHERE id = p_subscription_id;

  -- تعليم الكريدنشال is_used=true — فقط للنوع BB
  IF p_credential_id IS NOT NULL THEN
    SELECT type INTO v_cred_type
    FROM internet_credentials
    WHERE id = p_credential_id AND tenant_id = v_tenant_id;

    IF v_cred_type = 'bb' THEN
      UPDATE internet_credentials
      SET is_used = true
      WHERE id = p_credential_id AND tenant_id = v_tenant_id;
    END IF;
  END IF;

  -- تسجيل الدفعة
  INSERT INTO payments (
    tenant_id, customer_id, subscription_id,
    amount, method, bank_account_id, paid_at
  ) VALUES (
    v_tenant_id, v_customer_id, p_subscription_id,
    p_amount, p_method, p_bank_account_id, now()
  );

  -- تسجيل الـ nonce لمنع الإعادة
  INSERT INTO sync_nonces (tenant_id, nonce)
  VALUES (v_tenant_id, p_nonce);

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 3) receive_card_batch — عملية ذرية
--    INSERT card_batches → INSERT card_batch_items
--    trigger 003 يتكفل بتحديث quantity_in_stock
-- ============================================================

CREATE OR REPLACE FUNCTION receive_card_batch(
  p_supplier TEXT,
  p_notes    TEXT,
  p_items    JSONB
) RETURNS UUID AS $$
DECLARE
  v_tenant_id UUID;
  v_batch_id  UUID;
  v_item      JSONB;
BEGIN
  v_tenant_id := get_tenant_id();
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- إنشاء دفعة الاستلام
  INSERT INTO card_batches (tenant_id, supplier, received_at, notes)
  VALUES (v_tenant_id, p_supplier, now(), p_notes)
  RETURNING id INTO v_batch_id;

  -- إدراج عناصر الدفعة — trigger trg_update_stock_on_batch يُحدِّث المخزون
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO card_batch_items (tenant_id, batch_id, product_id, quantity, unit_cost)
    VALUES (
      v_tenant_id,
      v_batch_id,
      (v_item->>'product_id')::UUID,
      (v_item->>'quantity')::INTEGER,
      (v_item->>'unit_cost')::NUMERIC
    );
  END LOOP;

  RETURN v_batch_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
