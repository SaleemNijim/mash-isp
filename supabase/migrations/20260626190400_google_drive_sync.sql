-- ============================================================
-- MASH ISP — Google Drive Sync
-- ربط Google Drive لكل شركة مدفوعة + حالة آخر مزامنة
-- ============================================================

CREATE TABLE IF NOT EXISTS tenant_drive_sync (
  tenant_id              UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  google_email           TEXT,
  drive_folder_id        TEXT,
  drive_folder_name      TEXT,
  access_token_encrypted TEXT,
  refresh_token_encrypted TEXT,
  token_expires_at       TIMESTAMPTZ,
  scope                  TEXT NOT NULL DEFAULT 'https://www.googleapis.com/auth/drive.file',
  is_connected           BOOLEAN NOT NULL DEFAULT false,
  last_sync_at           TIMESTAMPTZ,
  last_success_at        TIMESTAMPTZ,
  last_error_at          TIMESTAMPTZ,
  last_error_message     TEXT,
  sync_cursor            JSONB NOT NULL DEFAULT '{}'::jsonb,
  file_ids               JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenant_drive_sync_connected
  ON tenant_drive_sync (is_connected, last_sync_at)
  WHERE is_connected = true;

CREATE TRIGGER trg_tenant_drive_sync_updated_at
  BEFORE UPDATE ON tenant_drive_sync
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE tenant_drive_sync ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_drive_sync FORCE ROW LEVEL SECURITY;

-- لا توجد Policies مباشرة للـ authenticated لأن الجدول يحتوي Google tokens.
-- القراءة/الكتابة تتم فقط عبر API server بعد التحقق من مدير الشركة.
