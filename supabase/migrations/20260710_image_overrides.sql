-- ================================================================
-- BCK Digital Catalog - Image Configuration Overrides
-- 2026-07-10
-- ================================================================

CREATE TABLE IF NOT EXISTS public.image_configuration_overrides (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  design_id        uuid        NOT NULL REFERENCES public.designs(id) ON DELETE CASCADE,
  item_id          uuid        REFERENCES public.category_items(id) ON DELETE CASCADE,
  category_id      uuid        REFERENCES public.categories(id) ON DELETE CASCADE,
  
  is_removed       boolean     NOT NULL DEFAULT false,
  is_added         boolean     NOT NULL DEFAULT false,
  price_override   int,
  is_recommended   boolean,
  is_active        boolean,
  sort_order       int,
  category_hidden  boolean,
  
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  
  -- Prevent having both item_id and category_id set in the same row
  CONSTRAINT check_override_target CHECK (
    (item_id IS NOT NULL AND category_id IS NULL) OR
    (item_id IS NULL AND category_id IS NOT NULL)
  )
);

GRANT SELECT ON public.image_configuration_overrides TO anon, authenticated;
GRANT ALL   ON public.image_configuration_overrides TO service_role;

ALTER TABLE public.image_configuration_overrides ENABLE ROW LEVEL SECURITY;

-- Drop policy if it already exists to prevent error 42710
DROP POLICY IF EXISTS "Overrides are public" ON public.image_configuration_overrides;

CREATE POLICY "Overrides are public"
  ON public.image_configuration_overrides FOR SELECT USING (true);

-- Indexes for performance (especially for paginated catalog loading)
CREATE INDEX IF NOT EXISTS idx_image_overrides_design
  ON public.image_configuration_overrides(design_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_image_overrides_item 
  ON public.image_configuration_overrides(design_id, item_id) 
  WHERE item_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_image_overrides_category 
  ON public.image_configuration_overrides(design_id, category_id) 
  WHERE category_id IS NOT NULL;
