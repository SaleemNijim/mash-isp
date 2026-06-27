-- ============================================================
-- MASH ISP — 040_network_routers_excel_fields.sql
-- حقول Excel للراوترات + جدول Bypassed
-- ============================================================

ALTER TABLE network_routers
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT;

CREATE TABLE IF NOT EXISTS network_bypassed (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  port_id     UUID REFERENCES network_ports(id),
  name        TEXT,
  mac_address TEXT,
  ip_address  TEXT,
  location    TEXT,
  device_type TEXT,
  phone       TEXT,
  notes       TEXT,
  is_deleted  BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE network_bypassed ENABLE ROW LEVEL SECURITY;
ALTER TABLE network_bypassed FORCE ROW LEVEL SECURITY;

CREATE POLICY "network_bypassed_tenant_all" ON network_bypassed
  FOR ALL USING (tenant_id = get_tenant_id());

CREATE POLICY "network_bypassed_superadmin_all" ON network_bypassed
  FOR ALL USING (is_super_admin());
