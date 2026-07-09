-- ================================================================
-- BCK Digital Catalog — Image Management Migration
-- 2026-07-07: adds description, tags, file_hash, file_size to designs
-- (Run this AFTER 20260706_configurator_schema.sql)
-- ================================================================

ALTER TABLE public.designs
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS tags        text[]  DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS file_hash   text,
  ADD COLUMN IF NOT EXISTS file_size   int;

-- Prevent duplicate images: same hash on same bike model = duplicate
-- Uses partial index (only when file_hash is not null)
CREATE UNIQUE INDEX IF NOT EXISTS idx_designs_hash_model
  ON public.designs(model_id, file_hash)
  WHERE file_hash IS NOT NULL;
