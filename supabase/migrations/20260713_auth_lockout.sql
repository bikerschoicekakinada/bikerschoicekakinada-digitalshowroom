-- ================================================================
-- BCK Digital Catalog - Admin PIN Lockout Schema Update
-- 2026-07-13
-- ================================================================

ALTER TABLE public.admin_settings
  ADD COLUMN IF NOT EXISTS failed_attempts int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until timestamptz;
