-- ================================================================
-- BCK Digital Catalog — Image Management & Delivery Migration
-- 2026-07-12: Adds original_path, small_path, medium_path, large_path
-- ================================================================

ALTER TABLE public.designs
  ADD COLUMN IF NOT EXISTS original_path text,
  ADD COLUMN IF NOT EXISTS small_path text,
  ADD COLUMN IF NOT EXISTS medium_path text,
  ADD COLUMN IF NOT EXISTS large_path text;
