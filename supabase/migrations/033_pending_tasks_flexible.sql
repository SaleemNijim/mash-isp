-- ============================================================
-- 033: مهام معلقة مرنة — مشترك / جهة / تذكير شخصي
-- ============================================================

ALTER TABLE pending_tasks
  ALTER COLUMN customer_id DROP NOT NULL;

ALTER TABLE pending_tasks
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS contact_label TEXT,
  ADD COLUMN IF NOT EXISTS contact_phone TEXT;

ALTER TABLE pending_tasks
  DROP CONSTRAINT IF EXISTS chk_pending_task_subject;

ALTER TABLE pending_tasks
  ADD CONSTRAINT chk_pending_task_subject CHECK (
    customer_id IS NOT NULL
    OR (contact_label IS NOT NULL AND length(trim(contact_label)) > 0)
    OR (title IS NOT NULL AND length(trim(title)) > 0)
  );
