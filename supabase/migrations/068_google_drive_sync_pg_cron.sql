-- ============================================================
-- MASH ISP — جدولة مزامنة Google Drive عبر pg_cron + pg_net
-- بديل مجاني عن Vercel Cron (خطة Hobby = مرة يومياً فقط)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION invoke_google_drive_sync()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_url    TEXT;
  v_secret TEXT;
BEGIN
  SELECT decrypted_secret INTO v_url
  FROM vault.decrypted_secrets
  WHERE name = 'google_drive_sync_app_url'
  LIMIT 1;

  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'google_drive_sync_cron_secret'
  LIMIT 1;

  IF v_url IS NULL OR v_secret IS NULL OR btrim(v_url) = '' OR btrim(v_secret) = '' THEN
    RAISE WARNING 'google_drive_sync cron skipped: configure vault secrets google_drive_sync_app_url and google_drive_sync_cron_secret';
    RETURN;
  END IF;

  PERFORM net.http_get(
    url := rtrim(v_url, '/') || '/api/google-drive/sync',
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret)
  );
END;
$$;

REVOKE ALL ON FUNCTION invoke_google_drive_sync() FROM PUBLIC;

SELECT cron.unschedule('google-drive-sync')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'google-drive-sync');

SELECT cron.schedule(
  'google-drive-sync',
  '0 * * * *',
  $$SELECT invoke_google_drive_sync();$$
);
