-- ================================================================
-- BCK Digital Catalog - Shared Configurations Schema Migration
-- 2026-07-14
-- ================================================================

CREATE TABLE IF NOT EXISTS public.shared_configurations (
  id text PRIMARY KEY,
  model_id uuid NOT NULL REFERENCES public.models(id) ON DELETE CASCADE,
  active_idx integer NOT NULL DEFAULT 0,
  selected_item_ids uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Secure access limits:
REVOKE ALL ON public.shared_configurations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.shared_configurations TO anon, authenticated;
GRANT ALL ON public.shared_configurations TO service_role;

ALTER TABLE public.shared_configurations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Shared configurations are readable by anyone" 
  ON public.shared_configurations 
  FOR SELECT 
  USING (true);
