-- ============================================================
-- MASH ISP — 001_core_schema.sql
-- Blueprint v3.1 — بدون RLS / Triggers / Seed (برومبتات لاحقة)
-- ============================================================

-- ============================================================
-- أ) دالة مساعدة عامة
-- ============================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- ب) جداول SaaS
-- ============================================================

-- ① subscription_plans — §2.4 حرفياً
CREATE TABLE subscription_plans (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                TEXT NOT NULL UNIQUE,  -- "free_trial" | "pro_monthly" | "pro_annual" | "enterprise"
  name                TEXT NOT NULL,
  billing_cycle       TEXT NOT NULL          -- "trial" | "monthly" | "annual" | "coming_soon"
                      CHECK (billing_cycle IN ('trial','monthly','annual','coming_soon')),
  price_monthly       NUMERIC(10,2),         -- سعر الشهر (للـ monthly plan)
  price_annual        NUMERIC(10,2),         -- سعر السنة (للـ annual plan)
  discount_percent    NUMERIC(5,2)           -- يُحسب تلقائياً ويُخزَّن للعرض
                      GENERATED ALWAYS AS (
                        CASE WHEN price_monthly IS NOT NULL AND price_annual IS NOT NULL
                          AND price_monthly > 0
                          THEN ROUND(((price_monthly * 12 - price_annual) / (price_monthly * 12)) * 100, 1)
                          ELSE NULL
                        END
                      ) STORED,
  trial_days          INTEGER DEFAULT 30,    -- للـ Free Trial فقط
  features            JSONB DEFAULT '[]',    -- قائمة المميزات للعرض
  is_active           BOOLEAN DEFAULT true,  -- تُعطِّل/تُفعِّل الخطة
  is_coming_soon      BOOLEAN DEFAULT false, -- Enterprise = true
  promotional_message TEXT,                  -- رسالة Coming Soon
  sort_order          INTEGER DEFAULT 0,     -- ترتيب العرض في UI
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

-- Trigger: updated_at تلقائي
CREATE TRIGGER trg_plans_updated_at
  BEFORE UPDATE ON subscription_plans
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ② tenants
CREATE TABLE tenants (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  logo_url         TEXT,
  primary_color    TEXT,
  phone            TEXT,
  is_active        BOOLEAN DEFAULT true,
  subscription_end TIMESTAMPTZ,
  plan_id          UUID REFERENCES subscription_plans(id),
  billing_cycle    TEXT CHECK (billing_cycle IN ('monthly','annual')),
  is_trial         BOOLEAN DEFAULT false,
  trial_ends_at    TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT now()
);

-- ③ mash_invoices — §2.4 حرفياً
CREATE TABLE mash_invoices (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  plan_id       UUID NOT NULL REFERENCES subscription_plans(id),
  billing_cycle TEXT NOT NULL CHECK (billing_cycle IN ('monthly','annual')),
  amount        NUMERIC(10,2) NOT NULL,
  period_start  DATE NOT NULL,
  period_end    DATE NOT NULL,
  status        TEXT DEFAULT 'pending'
                CHECK (status IN ('pending','paid','overdue','cancelled')),
  paid_at       TIMESTAMPTZ,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- ج) المستخدمون والصلاحيات
-- ============================================================

-- users — id يطابق auth.uid()
CREATE TABLE users (
  id              UUID PRIMARY KEY,
  tenant_id       UUID REFERENCES tenants(id),
  role            TEXT NOT NULL CHECK (role IN ('super_admin','admin','employee')),
  name            TEXT NOT NULL,
  is_active       BOOLEAN DEFAULT true,
  force_logout_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- ④ mash_payments — §2.4 حرفياً (بعد users لأن confirmed_by → users.id)
CREATE TABLE mash_payments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id     UUID NOT NULL REFERENCES mash_invoices(id),
  amount         NUMERIC(10,2) NOT NULL,
  payment_method TEXT NOT NULL,
  proof_url      TEXT,
  confirmed_by   UUID REFERENCES users(id),
  confirmed_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- permissions
CREATE TABLE permissions (
  code  TEXT PRIMARY KEY,
  label TEXT NOT NULL
);

-- user_permissions
CREATE TABLE user_permissions (
  user_id    UUID NOT NULL REFERENCES users(id),
  permission TEXT NOT NULL,
  granted_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, permission)
);

-- ============================================================
-- د) جداول ISP
-- كلها تحمل: tenant_id UUID NOT NULL REFERENCES tenants(id),
--            is_deleted BOOLEAN DEFAULT false,
--            created_at TIMESTAMPTZ DEFAULT now()
-- ============================================================

-- customers
CREATE TABLE customers (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id),
  name       TEXT NOT NULL,
  phone      TEXT,
  address    TEXT,
  notes      TEXT,
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- subscriptions
CREATE TABLE subscriptions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  customer_id UUID NOT NULL REFERENCES customers(id),
  type        TEXT NOT NULL CHECK (type IN ('bb','we')),
  speed       TEXT,
  price       NUMERIC(10,2),
  start_date  DATE,
  end_date    DATE,
  status      TEXT,
  is_deleted  BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- internet_credentials
-- B1 — §5.2: UNIQUE(tenant_id, username) — ممنوع UNIQUE(username) منفردة
CREATE TABLE internet_credentials (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id),
  username   TEXT NOT NULL,
  password   TEXT,
  type       TEXT NOT NULL CHECK (type IN ('bb','we')),
  is_used    BOOLEAN DEFAULT false,
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT uq_credential_per_tenant UNIQUE (tenant_id, username)
);

-- card_products
CREATE TABLE card_products (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id),
  name              TEXT NOT NULL,
  denomination      NUMERIC(10,2),
  cost_price        NUMERIC(10,2),
  sale_price        NUMERIC(10,2),
  quantity_in_stock INTEGER DEFAULT 0,
  min_quantity      INTEGER DEFAULT 0,
  is_deleted        BOOLEAN DEFAULT false,
  created_at        TIMESTAMPTZ DEFAULT now()
);

-- company_bank_accounts (قبل card_distributor_sales وpayments)
CREATE TABLE company_bank_accounts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id),
  bank_name      TEXT NOT NULL,
  account_name   TEXT,
  account_number TEXT,
  current_total  NUMERIC DEFAULT 0,
  is_deleted     BOOLEAN DEFAULT false,
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- card_batches
CREATE TABLE card_batches (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  supplier    TEXT,
  received_at TIMESTAMPTZ,
  notes       TEXT,
  is_deleted  BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- card_batch_items
CREATE TABLE card_batch_items (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id),
  batch_id   UUID NOT NULL REFERENCES card_batches(id),
  product_id UUID NOT NULL REFERENCES card_products(id),
  quantity   INTEGER NOT NULL,
  unit_cost  NUMERIC(10,2),
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- card_distributor_sales — BM4: previous_balance >= 0
CREATE TABLE card_distributor_sales (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL REFERENCES tenants(id),
  distributor_name   TEXT NOT NULL,
  total_amount       NUMERIC(10,2),
  commission_percent NUMERIC(5,2),
  previous_balance   NUMERIC CHECK (previous_balance >= 0),
  bank_account_id    UUID REFERENCES company_bank_accounts(id),
  is_deleted         BOOLEAN DEFAULT false,
  created_at         TIMESTAMPTZ DEFAULT now()
);

-- card_sale_items
CREATE TABLE card_sale_items (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id),
  sale_id    UUID NOT NULL REFERENCES card_distributor_sales(id),
  product_id UUID NOT NULL REFERENCES card_products(id),
  quantity   INTEGER NOT NULL,
  unit_price NUMERIC(10,2),
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- payments — B7: method NOT IN(cash,debt) → bank_account_id IS NOT NULL
CREATE TABLE payments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  customer_id     UUID NOT NULL REFERENCES customers(id),
  subscription_id UUID REFERENCES subscriptions(id),
  amount          NUMERIC(10,2) NOT NULL,
  method          TEXT NOT NULL
                  CHECK (method IN ('cash','debt','reflect','jawwal_pay','bank')),
  bank_account_id UUID REFERENCES company_bank_accounts(id),
  paid_at         TIMESTAMPTZ,
  notes           TEXT,
  is_deleted      BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT chk_payment_bank_required
    CHECK (method IN ('cash','debt') OR bank_account_id IS NOT NULL)
);

-- payment_proofs
CREATE TABLE payment_proofs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  payment_id  UUID NOT NULL REFERENCES payments(id),
  proof_url   TEXT NOT NULL,
  uploaded_by UUID REFERENCES users(id),
  uploaded_at TIMESTAMPTZ DEFAULT now(),
  is_deleted  BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- pending_tasks — B9: 'reminded' موجودة في CHECK
CREATE TABLE pending_tasks (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL REFERENCES tenants(id),
  customer_id        UUID NOT NULL REFERENCES customers(id),
  related_payment_id UUID REFERENCES payments(id),
  amount             NUMERIC(10,2),
  due_at             TIMESTAMPTZ,
  status             TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','reminded','converted_to_debt','completed')),
  is_deleted         BOOLEAN DEFAULT false,
  created_at         TIMESTAMPTZ DEFAULT now()
);

-- debts — §5.3: uq_task_debt UNIQUE(related_task_id)
CREATE TABLE debts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id),
  customer_id      UUID NOT NULL REFERENCES customers(id),
  original_amount  NUMERIC(10,2) NOT NULL,
  remaining_amount NUMERIC(10,2),
  reason           TEXT,
  status           TEXT NOT NULL DEFAULT 'active'
                   CHECK (status IN ('temporary','active','cancelled','paid')),
  related_task_id  UUID REFERENCES pending_tasks(id),
  is_deleted       BOOLEAN DEFAULT false,
  created_at       TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT uq_task_debt UNIQUE (related_task_id)
);

-- network_ports (self-referential — parent_port_id nullable)
CREATE TABLE network_ports (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id),
  name           TEXT NOT NULL,
  parent_port_id UUID REFERENCES network_ports(id),
  capacity       INTEGER,
  is_deleted     BOOLEAN DEFAULT false,
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- network_routers (بعد network_ports)
CREATE TABLE network_routers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  name        TEXT NOT NULL,
  model       TEXT,
  mac_address TEXT,
  ip_address  TEXT,
  location    TEXT,
  device_type TEXT,
  port_id     UUID REFERENCES network_ports(id),
  is_deleted  BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- network_extenders
CREATE TABLE network_extenders (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  router_id   UUID NOT NULL REFERENCES network_routers(id),
  name        TEXT,
  mac_address TEXT,
  is_deleted  BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- router_mac_history
CREATE TABLE router_mac_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  router_id   UUID NOT NULL REFERENCES network_routers(id),
  old_mac     TEXT,
  new_mac     TEXT,
  changed_by  UUID REFERENCES users(id),
  changed_at  TIMESTAMPTZ DEFAULT now(),
  is_deleted  BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- customer_credential_usage
CREATE TABLE customer_credential_usage (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  customer_id   UUID NOT NULL REFERENCES customers(id),
  credential_id UUID NOT NULL REFERENCES internet_credentials(id),
  assigned_at   TIMESTAMPTZ DEFAULT now(),
  released_at   TIMESTAMPTZ,
  is_deleted    BOOLEAN DEFAULT false,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- warehouse_items
CREATE TABLE warehouse_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id),
  name         TEXT NOT NULL,
  category     TEXT,
  quantity     INTEGER DEFAULT 0,
  min_quantity INTEGER DEFAULT 0,
  is_deleted   BOOLEAN DEFAULT false,
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- warehouse_movements
CREATE TABLE warehouse_movements (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  item_id       UUID NOT NULL REFERENCES warehouse_items(id),
  movement_type TEXT NOT NULL
                CHECK (movement_type IN ('receive','issue','damaged','installed')),
  quantity      INTEGER NOT NULL,
  notes         TEXT,
  performed_by  UUID REFERENCES users(id),
  is_deleted    BOOLEAN DEFAULT false,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- imports
CREATE TABLE imports (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id),
  file_name    TEXT NOT NULL,
  import_type  TEXT NOT NULL,
  total        INTEGER,
  inserted     INTEGER,
  updated      INTEGER,
  skipped      INTEGER,
  errors       JSONB,
  performed_by UUID REFERENCES users(id),
  is_deleted   BOOLEAN DEFAULT false,
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- audit_logs
CREATE TABLE audit_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id),
  table_name   TEXT NOT NULL,
  record_id    UUID,
  action       TEXT NOT NULL,
  old_data     JSONB,
  performed_by UUID REFERENCES users(id),
  performed_at TIMESTAMPTZ DEFAULT now(),
  is_deleted   BOOLEAN DEFAULT false,
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- sync_nonces
CREATE TABLE sync_nonces (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id),
  nonce      TEXT NOT NULL UNIQUE,
  used_at    TIMESTAMPTZ DEFAULT now(),
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
