-- ============================================================
-- MASH ISP — 039_distributors_address.sql
-- عمود العنوان لجدول الموزعين (يتطابق مع نموذج Excel الرسمي)
-- ============================================================

ALTER TABLE distributors
  ADD COLUMN IF NOT EXISTS address TEXT;
