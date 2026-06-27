-- ============================================================================
-- 050: الحد الأدنى لـ usernames المتاحة لكل باقة PPP
-- ============================================================================

ALTER TABLE ppp_plans
  ADD COLUMN IF NOT EXISTS min_available_usernames INTEGER NOT NULL DEFAULT 0
  CHECK (min_available_usernames >= 0);

COMMENT ON COLUMN ppp_plans.min_available_usernames IS
  'تنبيه عندما يقل عدد usernames BB المتاحة (is_used=false) عن هذا الحد. 0 = بدون تنبيه.';
