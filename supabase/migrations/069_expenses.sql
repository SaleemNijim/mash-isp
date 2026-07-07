-- ============================================================
-- MASH ISP — 069_expenses.sql
-- P-Exp-1: expense_categories + expenses + record_expense RPC
--            + bank balance sync on soft delete / restore
-- ============================================================

-- ── 1) expense_categories ───────────────────────────────────

CREATE TABLE expense_categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  name        TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_system   BOOLEAN NOT NULL DEFAULT false,
  is_deleted  BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_expense_category_name_active
  ON expense_categories (tenant_id, name)
  WHERE is_deleted = false;

CREATE INDEX idx_expense_categories_tenant_sort
  ON expense_categories (tenant_id, sort_order);

ALTER TABLE expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_categories FORCE ROW LEVEL SECURITY;

CREATE POLICY "expense_categories_tenant_all" ON expense_categories
  FOR ALL
  USING (tenant_id = get_tenant_id())
  WITH CHECK (tenant_id = get_tenant_id());

CREATE POLICY "expense_categories_superadmin_all" ON expense_categories
  FOR ALL
  USING (is_super_admin());

CREATE TRIGGER trg_soft_delete_expense_categories
  AFTER UPDATE ON expense_categories
  FOR EACH ROW EXECUTE FUNCTION log_soft_delete();

-- ── 2) expenses ─────────────────────────────────────────────

CREATE TABLE expenses (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL REFERENCES tenants(id),
  category_id          UUID NOT NULL REFERENCES expense_categories(id),
  amount               NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  method               TEXT NOT NULL
                       CHECK (method IN ('cash', 'reflect', 'jawwal_pay', 'bank')),
  bank_account_id      UUID REFERENCES company_bank_accounts(id),
  source_account_label TEXT,
  description          TEXT,
  beneficiary          TEXT,
  notes                TEXT,
  paid_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  recorded_by          UUID REFERENCES users(id),
  is_deleted           BOOLEAN NOT NULL DEFAULT false,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_expense_bank_required
    CHECK (method = 'cash' OR bank_account_id IS NOT NULL)
);

CREATE INDEX idx_expenses_tenant_paid_at
  ON expenses (tenant_id, paid_at);

CREATE INDEX idx_expenses_tenant_category
  ON expenses (tenant_id, category_id);

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses FORCE ROW LEVEL SECURITY;

-- SELECT + UPDATE للمستأجر (soft delete / تعديل وصف لاحقاً) — INSERT عبر RPC فقط
CREATE POLICY "expenses_tenant_select" ON expenses
  FOR SELECT
  USING (tenant_id = get_tenant_id());

CREATE POLICY "expenses_tenant_update" ON expenses
  FOR UPDATE
  USING (tenant_id = get_tenant_id())
  WITH CHECK (tenant_id = get_tenant_id());

CREATE POLICY "expenses_superadmin_all" ON expenses
  FOR ALL
  USING (is_super_admin());

CREATE TRIGGER trg_soft_delete_expenses
  AFTER UPDATE ON expenses
  FOR EACH ROW EXECUTE FUNCTION log_soft_delete();

-- ── 3) seed_expense_categories_for_tenant ───────────────────

CREATE OR REPLACE FUNCTION seed_expense_categories_for_tenant(p_tenant_id UUID)
RETURNS VOID AS $$
DECLARE
  v_names TEXT[] := ARRAY[
    'رواتب وأجور',
    'إيجار ومرافق',
    'اتصالات وباكبون',
    'صيانة ومعدات',
    'وقود ومواصلات',
    'تسويق وإعلان',
    'ضرائب ورسوم',
    'متفرقات'
  ];
  v_name  TEXT;
  v_sort  INTEGER := 0;
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id required';
  END IF;

  FOREACH v_name IN ARRAY v_names LOOP
    INSERT INTO expense_categories (tenant_id, name, sort_order, is_system)
    SELECT p_tenant_id, v_name, v_sort, true
    WHERE NOT EXISTS (
      SELECT 1
      FROM expense_categories ec
      WHERE ec.tenant_id = p_tenant_id
        AND ec.name = v_name
        AND ec.is_deleted = false
    );
    v_sort := v_sort + 1;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION seed_expense_categories_for_tenant(UUID) FROM PUBLIC;

-- ── 4) record_expense ───────────────────────────────────────

CREATE OR REPLACE FUNCTION record_expense(
  p_category_id          UUID,
  p_amount               NUMERIC,
  p_method               TEXT,
  p_bank_account_id      UUID DEFAULT NULL,
  p_source_account_label TEXT DEFAULT NULL,
  p_description          TEXT DEFAULT NULL,
  p_beneficiary          TEXT DEFAULT NULL,
  p_notes                TEXT DEFAULT NULL,
  p_paid_at              TIMESTAMPTZ DEFAULT now()
) RETURNS UUID AS $$
DECLARE
  v_tenant_id    UUID;
  v_expense_id   UUID;
  v_balance      NUMERIC;
BEGIN
  v_tenant_id := get_tenant_id();
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT (is_tenant_admin() OR has_permission(auth.uid(), 'manage_expenses')) THEN
    RAISE EXCEPTION 'insufficient permission';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  IF p_method NOT IN ('cash', 'reflect', 'jawwal_pay', 'bank') THEN
    RAISE EXCEPTION 'Invalid payment method';
  END IF;

  IF p_method <> 'cash' AND p_bank_account_id IS NULL THEN
    RAISE EXCEPTION 'bank_account_id required for electronic payment';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM expense_categories ec
    WHERE ec.id = p_category_id
      AND ec.tenant_id = v_tenant_id
      AND ec.is_deleted = false
  ) THEN
    RAISE EXCEPTION 'expense category not found';
  END IF;

  IF p_method <> 'cash' THEN
    SELECT current_total INTO v_balance
    FROM company_bank_accounts
    WHERE id = p_bank_account_id
      AND tenant_id = v_tenant_id
      AND is_deleted = false
    FOR UPDATE;

    IF v_balance IS NULL THEN
      RAISE EXCEPTION 'bank account not found';
    END IF;

    IF p_amount > v_balance THEN
      RAISE EXCEPTION 'insufficient bank balance';
    END IF;

    UPDATE company_bank_accounts
    SET current_total = current_total - p_amount
    WHERE id = p_bank_account_id
      AND tenant_id = v_tenant_id;
  END IF;

  INSERT INTO expenses (
    tenant_id,
    category_id,
    amount,
    method,
    bank_account_id,
    source_account_label,
    description,
    beneficiary,
    notes,
    paid_at,
    recorded_by
  ) VALUES (
    v_tenant_id,
    p_category_id,
    p_amount,
    p_method,
    p_bank_account_id,
    NULLIF(trim(p_source_account_label), ''),
    NULLIF(trim(p_description), ''),
    NULLIF(trim(p_beneficiary), ''),
    NULLIF(trim(p_notes), ''),
    COALESCE(p_paid_at, now()),
    auth.uid()
  )
  RETURNING id INTO v_expense_id;

  RETURN v_expense_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION record_expense(
  UUID, NUMERIC, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION record_expense(
  UUID, NUMERIC, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ
) TO authenticated;

-- ── 5) sync_expense_bank_balance (soft delete / restore) ────

CREATE OR REPLACE FUNCTION sync_expense_bank_balance() RETURNS TRIGGER AS $$
DECLARE
  v_balance NUMERIC;
BEGIN
  IF NEW.is_deleted = true AND COALESCE(OLD.is_deleted, false) = false THEN
    IF OLD.method <> 'cash' AND OLD.bank_account_id IS NOT NULL THEN
      UPDATE company_bank_accounts
      SET current_total = COALESCE(current_total, 0) + OLD.amount
      WHERE id = OLD.bank_account_id
        AND tenant_id = OLD.tenant_id;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.is_deleted = false AND OLD.is_deleted = true THEN
    IF OLD.method <> 'cash' AND OLD.bank_account_id IS NOT NULL THEN
      SELECT current_total INTO v_balance
      FROM company_bank_accounts
      WHERE id = OLD.bank_account_id
        AND tenant_id = OLD.tenant_id
        AND is_deleted = false
      FOR UPDATE;

      IF v_balance IS NULL THEN
        RAISE EXCEPTION 'bank account not found';
      END IF;

      IF OLD.amount > v_balance THEN
        RAISE EXCEPTION 'insufficient bank balance';
      END IF;

      UPDATE company_bank_accounts
      SET current_total = current_total - OLD.amount
      WHERE id = OLD.bank_account_id
        AND tenant_id = OLD.tenant_id;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_sync_expense_bank_balance
  AFTER UPDATE ON expenses
  FOR EACH ROW
  WHEN (OLD.is_deleted IS DISTINCT FROM NEW.is_deleted)
  EXECUTE FUNCTION sync_expense_bank_balance();

-- ── 6) permission seed ──────────────────────────────────────

INSERT INTO permissions (code, label) VALUES
  ('manage_expenses', 'إدارة المصروفات')
ON CONFLICT (code) DO NOTHING;

-- ── 7) create_tenant_with_trial — seed فئات المصروفات ───────

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

  PERFORM seed_expense_categories_for_tenant(v_tenant_id);

  RETURN v_tenant_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ── 8) backfill فئات للشركات الموجودة ───────────────────────

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM tenants LOOP
    PERFORM seed_expense_categories_for_tenant(r.id);
  END LOOP;
END $$;
