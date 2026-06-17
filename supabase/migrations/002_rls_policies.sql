-- ============================================================
-- MASH ISP — 002_rls_policies.sql
-- Blueprint v3.1 — Row Level Security Policies
-- ============================================================

-- ============================================================
-- أ) الدوال المساعدة
-- ============================================================

-- 1) get_tenant_id: يجلب tenant_id للمستخدم الحالي
CREATE OR REPLACE FUNCTION get_tenant_id() RETURNS UUID AS $$
  SELECT tenant_id FROM users WHERE id = auth.uid()
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- 2) has_permission: §5.1 حرفياً — مع فحص is_active = true (B2)
CREATE OR REPLACE FUNCTION has_permission(p_user_id UUID, p_permission TEXT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_permissions up
    JOIN users u ON u.id = up.user_id
    WHERE up.user_id = p_user_id
      AND up.permission = p_permission
      AND u.is_active = true  -- ← مُضاف: مستخدم معلَّق لا يجتاز
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- 3) is_super_admin: دالة مساعدة للسياسات
CREATE OR REPLACE FUNCTION is_super_admin() RETURNS BOOLEAN AS $$
  SELECT EXISTS(SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin')
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ============================================================
-- ب) ENABLE + FORCE ROW LEVEL SECURITY — كل الجداول (30) — §4.1
-- ============================================================

-- SaaS (4)
ALTER TABLE subscription_plans        ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_plans        FORCE  ROW LEVEL SECURITY;

ALTER TABLE tenants                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants                   FORCE  ROW LEVEL SECURITY;

ALTER TABLE mash_invoices             ENABLE ROW LEVEL SECURITY;
ALTER TABLE mash_invoices             FORCE  ROW LEVEL SECURITY;

ALTER TABLE mash_payments             ENABLE ROW LEVEL SECURITY;
ALTER TABLE mash_payments             FORCE  ROW LEVEL SECURITY;

-- Users & Auth (3)
ALTER TABLE users                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE users                     FORCE  ROW LEVEL SECURITY;

ALTER TABLE permissions               ENABLE ROW LEVEL SECURITY;
ALTER TABLE permissions               FORCE  ROW LEVEL SECURITY;

ALTER TABLE user_permissions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_permissions          FORCE  ROW LEVEL SECURITY;

-- ISP (23)
ALTER TABLE customers                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers                 FORCE  ROW LEVEL SECURITY;

ALTER TABLE subscriptions             ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions             FORCE  ROW LEVEL SECURITY;

ALTER TABLE internet_credentials      ENABLE ROW LEVEL SECURITY;
ALTER TABLE internet_credentials      FORCE  ROW LEVEL SECURITY;

ALTER TABLE card_products             ENABLE ROW LEVEL SECURITY;
ALTER TABLE card_products             FORCE  ROW LEVEL SECURITY;

ALTER TABLE company_bank_accounts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_bank_accounts     FORCE  ROW LEVEL SECURITY;

ALTER TABLE card_batches              ENABLE ROW LEVEL SECURITY;
ALTER TABLE card_batches              FORCE  ROW LEVEL SECURITY;

ALTER TABLE card_batch_items          ENABLE ROW LEVEL SECURITY;
ALTER TABLE card_batch_items          FORCE  ROW LEVEL SECURITY;

ALTER TABLE card_distributor_sales    ENABLE ROW LEVEL SECURITY;
ALTER TABLE card_distributor_sales    FORCE  ROW LEVEL SECURITY;

ALTER TABLE card_sale_items           ENABLE ROW LEVEL SECURITY;
ALTER TABLE card_sale_items           FORCE  ROW LEVEL SECURITY;

ALTER TABLE payments                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments                  FORCE  ROW LEVEL SECURITY;

ALTER TABLE payment_proofs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_proofs            FORCE  ROW LEVEL SECURITY;

ALTER TABLE pending_tasks             ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_tasks             FORCE  ROW LEVEL SECURITY;

ALTER TABLE debts                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE debts                     FORCE  ROW LEVEL SECURITY;

ALTER TABLE network_ports             ENABLE ROW LEVEL SECURITY;
ALTER TABLE network_ports             FORCE  ROW LEVEL SECURITY;

ALTER TABLE network_routers           ENABLE ROW LEVEL SECURITY;
ALTER TABLE network_routers           FORCE  ROW LEVEL SECURITY;

ALTER TABLE network_extenders         ENABLE ROW LEVEL SECURITY;
ALTER TABLE network_extenders         FORCE  ROW LEVEL SECURITY;

ALTER TABLE router_mac_history        ENABLE ROW LEVEL SECURITY;
ALTER TABLE router_mac_history        FORCE  ROW LEVEL SECURITY;

ALTER TABLE customer_credential_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_credential_usage FORCE  ROW LEVEL SECURITY;

ALTER TABLE warehouse_items           ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouse_items           FORCE  ROW LEVEL SECURITY;

ALTER TABLE warehouse_movements       ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouse_movements       FORCE  ROW LEVEL SECURITY;

ALTER TABLE imports                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE imports                   FORCE  ROW LEVEL SECURITY;

ALTER TABLE audit_logs                ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs                FORCE  ROW LEVEL SECURITY;

ALTER TABLE sync_nonces               ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_nonces               FORCE  ROW LEVEL SECURITY;

-- ============================================================
-- ج) subscription_plans — §3.6 حرفياً
-- ============================================================

-- أي مستخدم يستطيع قراءة الخطط النشطة (للـ Pricing Page)
CREATE POLICY "plans_read_active" ON subscription_plans
  FOR SELECT USING (is_active = true OR is_coming_soon = true);

-- Super Admin فقط يكتب
CREATE POLICY "plans_write_superadmin" ON subscription_plans
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin')
  );

-- ============================================================
-- د) mash_invoices — §3.6 حرفياً
-- ============================================================

-- Admin يرى فواتير شركته فقط
CREATE POLICY "invoices_tenant_read" ON mash_invoices
  FOR SELECT USING (tenant_id = get_tenant_id());

-- Super Admin يرى ويعدِّل الكل
CREATE POLICY "invoices_superadmin_all" ON mash_invoices
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin')
  );

-- ============================================================
-- هـ) mash_payments
-- ============================================================

CREATE POLICY "mash_payments_tenant_read" ON mash_payments
  FOR SELECT USING (
    invoice_id IN (
      SELECT id FROM mash_invoices WHERE tenant_id = get_tenant_id()
    )
  );

CREATE POLICY "mash_payments_superadmin_all" ON mash_payments
  FOR ALL USING (is_super_admin());

-- ============================================================
-- و) tenants
-- ============================================================

CREATE POLICY "tenants_tenant_select" ON tenants
  FOR SELECT USING (id = get_tenant_id());

CREATE POLICY "tenants_superadmin_all" ON tenants
  FOR ALL USING (is_super_admin());

-- ============================================================
-- ز) users
-- ============================================================

CREATE POLICY "users_tenant_select" ON users
  FOR SELECT USING (tenant_id = get_tenant_id());

CREATE POLICY "users_superadmin_all" ON users
  FOR ALL USING (is_super_admin());

-- ============================================================
-- ح) permissions — جدول بحث عام
-- ============================================================

CREATE POLICY "permissions_read_all" ON permissions
  FOR SELECT USING (true);

CREATE POLICY "permissions_superadmin_all" ON permissions
  FOR ALL USING (is_super_admin());

-- ============================================================
-- ط) user_permissions
-- ============================================================

CREATE POLICY "user_permissions_tenant_select" ON user_permissions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = user_id
        AND u.tenant_id = get_tenant_id()
    )
  );

CREATE POLICY "user_permissions_superadmin_all" ON user_permissions
  FOR ALL USING (is_super_admin());

-- ============================================================
-- ي) جداول ISP — سياسة موحدة: tenant_id + super_admin
-- ============================================================

-- customers
CREATE POLICY "customers_tenant_all"     ON customers
  FOR ALL USING (tenant_id = get_tenant_id());
CREATE POLICY "customers_superadmin_all" ON customers
  FOR ALL USING (is_super_admin());

-- subscriptions
CREATE POLICY "subscriptions_tenant_all"     ON subscriptions
  FOR ALL USING (tenant_id = get_tenant_id());
CREATE POLICY "subscriptions_superadmin_all" ON subscriptions
  FOR ALL USING (is_super_admin());

-- internet_credentials
CREATE POLICY "internet_credentials_tenant_all"     ON internet_credentials
  FOR ALL USING (tenant_id = get_tenant_id());
CREATE POLICY "internet_credentials_superadmin_all" ON internet_credentials
  FOR ALL USING (is_super_admin());

-- card_products
CREATE POLICY "card_products_tenant_all"     ON card_products
  FOR ALL USING (tenant_id = get_tenant_id());
CREATE POLICY "card_products_superadmin_all" ON card_products
  FOR ALL USING (is_super_admin());

-- company_bank_accounts
CREATE POLICY "company_bank_accounts_tenant_all"     ON company_bank_accounts
  FOR ALL USING (tenant_id = get_tenant_id());
CREATE POLICY "company_bank_accounts_superadmin_all" ON company_bank_accounts
  FOR ALL USING (is_super_admin());

-- card_batches
CREATE POLICY "card_batches_tenant_all"     ON card_batches
  FOR ALL USING (tenant_id = get_tenant_id());
CREATE POLICY "card_batches_superadmin_all" ON card_batches
  FOR ALL USING (is_super_admin());

-- card_batch_items
CREATE POLICY "card_batch_items_tenant_all"     ON card_batch_items
  FOR ALL USING (tenant_id = get_tenant_id());
CREATE POLICY "card_batch_items_superadmin_all" ON card_batch_items
  FOR ALL USING (is_super_admin());

-- card_distributor_sales
CREATE POLICY "card_distributor_sales_tenant_all"     ON card_distributor_sales
  FOR ALL USING (tenant_id = get_tenant_id());
CREATE POLICY "card_distributor_sales_superadmin_all" ON card_distributor_sales
  FOR ALL USING (is_super_admin());

-- card_sale_items
CREATE POLICY "card_sale_items_tenant_all"     ON card_sale_items
  FOR ALL USING (tenant_id = get_tenant_id());
CREATE POLICY "card_sale_items_superadmin_all" ON card_sale_items
  FOR ALL USING (is_super_admin());

-- payments
CREATE POLICY "payments_tenant_all"     ON payments
  FOR ALL USING (tenant_id = get_tenant_id());
CREATE POLICY "payments_superadmin_all" ON payments
  FOR ALL USING (is_super_admin());

-- payment_proofs
CREATE POLICY "payment_proofs_tenant_all"     ON payment_proofs
  FOR ALL USING (tenant_id = get_tenant_id());
CREATE POLICY "payment_proofs_superadmin_all" ON payment_proofs
  FOR ALL USING (is_super_admin());

-- pending_tasks
CREATE POLICY "pending_tasks_tenant_all"     ON pending_tasks
  FOR ALL USING (tenant_id = get_tenant_id());
CREATE POLICY "pending_tasks_superadmin_all" ON pending_tasks
  FOR ALL USING (is_super_admin());

-- debts
CREATE POLICY "debts_tenant_all"     ON debts
  FOR ALL USING (tenant_id = get_tenant_id());
CREATE POLICY "debts_superadmin_all" ON debts
  FOR ALL USING (is_super_admin());

-- network_ports
CREATE POLICY "network_ports_tenant_all"     ON network_ports
  FOR ALL USING (tenant_id = get_tenant_id());
CREATE POLICY "network_ports_superadmin_all" ON network_ports
  FOR ALL USING (is_super_admin());

-- network_routers
CREATE POLICY "network_routers_tenant_all"     ON network_routers
  FOR ALL USING (tenant_id = get_tenant_id());
CREATE POLICY "network_routers_superadmin_all" ON network_routers
  FOR ALL USING (is_super_admin());

-- network_extenders
CREATE POLICY "network_extenders_tenant_all"     ON network_extenders
  FOR ALL USING (tenant_id = get_tenant_id());
CREATE POLICY "network_extenders_superadmin_all" ON network_extenders
  FOR ALL USING (is_super_admin());

-- router_mac_history
CREATE POLICY "router_mac_history_tenant_all"     ON router_mac_history
  FOR ALL USING (tenant_id = get_tenant_id());
CREATE POLICY "router_mac_history_superadmin_all" ON router_mac_history
  FOR ALL USING (is_super_admin());

-- customer_credential_usage
CREATE POLICY "customer_credential_usage_tenant_all"     ON customer_credential_usage
  FOR ALL USING (tenant_id = get_tenant_id());
CREATE POLICY "customer_credential_usage_superadmin_all" ON customer_credential_usage
  FOR ALL USING (is_super_admin());

-- warehouse_items
CREATE POLICY "warehouse_items_tenant_all"     ON warehouse_items
  FOR ALL USING (tenant_id = get_tenant_id());
CREATE POLICY "warehouse_items_superadmin_all" ON warehouse_items
  FOR ALL USING (is_super_admin());

-- warehouse_movements
CREATE POLICY "warehouse_movements_tenant_all"     ON warehouse_movements
  FOR ALL USING (tenant_id = get_tenant_id());
CREATE POLICY "warehouse_movements_superadmin_all" ON warehouse_movements
  FOR ALL USING (is_super_admin());

-- imports
CREATE POLICY "imports_tenant_all"     ON imports
  FOR ALL USING (tenant_id = get_tenant_id());
CREATE POLICY "imports_superadmin_all" ON imports
  FOR ALL USING (is_super_admin());

-- sync_nonces
CREATE POLICY "sync_nonces_tenant_all"     ON sync_nonces
  FOR ALL USING (tenant_id = get_tenant_id());
CREATE POLICY "sync_nonces_superadmin_all" ON sync_nonces
  FOR ALL USING (is_super_admin());

-- ============================================================
-- ك) audit_logs — INSERT للجميع، SELECT للـ admin/super_admin فقط
-- ============================================================

-- أي مستخدم داخل tenant_id الخاص به
CREATE POLICY "audit_logs_insert" ON audit_logs
  FOR INSERT WITH CHECK (tenant_id = get_tenant_id());

-- Admin يقرأ سجلات شركته فقط
CREATE POLICY "audit_logs_admin_read" ON audit_logs
  FOR SELECT USING (
    tenant_id = get_tenant_id()
    AND EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
        AND role IN ('admin', 'super_admin')
        AND is_active = true
    )
  );

-- Super Admin يقرأ ويعدِّل الكل
CREATE POLICY "audit_logs_superadmin_all" ON audit_logs
  FOR ALL USING (is_super_admin());
