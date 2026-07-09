-- ================================================================
-- BCK Digital Catalog — Configurator Schema Migration
-- 2026-07-06
-- ================================================================

-- 1. Simplify designs table: remove old per-image metadata columns
--    that are now managed through the Category Library + Items system.
ALTER TABLE public.designs
  DROP COLUMN IF EXISTS category_id,
  DROP COLUMN IF EXISTS price_min,
  DROP COLUMN IF EXISTS price_max,
  DROP COLUMN IF EXISTS estimated_days,
  DROP COLUMN IF EXISTS required_parts,
  DROP COLUMN IF EXISTS theme,
  DROP COLUMN IF EXISTS color,
  DROP COLUMN IF EXISTS is_trending,
  DROP COLUMN IF EXISTS is_featured,
  DROP COLUMN IF EXISTS view_count;

-- Give each design image an optional display sort order within its model
ALTER TABLE public.designs
  ADD COLUMN IF NOT EXISTS sort_order int NOT NULL DEFAULT 0;

-- Drop the old trgm index on title (column still exists but no longer primary search)
DROP INDEX IF EXISTS idx_designs_title_trgm;
-- Add composite index for efficient paginated model galleries
CREATE INDEX IF NOT EXISTS idx_designs_model_created ON public.designs(model_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_designs_brand ON public.designs(brand_id);

-- 2. Extend categories table: becomes the Category Library
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- 3. Category Items — line items with individual prices inside a category
--    Price is stored as integer rupees (e.g. 1800 = ₹1,800).
CREATE TABLE IF NOT EXISTS public.category_items (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid        NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  name        text        NOT NULL,
  price       int         NOT NULL DEFAULT 0,
  description text,
  is_active   boolean     NOT NULL DEFAULT true,
  is_recommended boolean  NOT NULL DEFAULT false,
  sort_order  int         NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.category_items TO anon, authenticated;
GRANT ALL   ON public.category_items TO service_role;
ALTER TABLE public.category_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Items are public" ON public.category_items FOR SELECT USING (true);

CREATE INDEX IF NOT EXISTS idx_items_category ON public.category_items(category_id);
CREATE INDEX IF NOT EXISTS idx_items_sort     ON public.category_items(category_id, sort_order);

CREATE OR REPLACE FUNCTION public.touch_category_items_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER trg_category_items_updated
BEFORE UPDATE ON public.category_items
FOR EACH ROW EXECUTE FUNCTION public.touch_category_items_updated_at();

-- 4. Category–Model Assignments — many-to-many join
--    One category can be assigned to unlimited models.
--    The UNIQUE constraint prevents duplicate assignments.
CREATE TABLE IF NOT EXISTS public.category_model_assignments (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid        NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  model_id    uuid        NOT NULL REFERENCES public.models(id)     ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (category_id, model_id)
);

GRANT SELECT ON public.category_model_assignments TO anon, authenticated;
GRANT ALL   ON public.category_model_assignments TO service_role;
ALTER TABLE public.category_model_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Assignments are public" ON public.category_model_assignments FOR SELECT USING (true);

CREATE INDEX IF NOT EXISTS idx_assignments_model    ON public.category_model_assignments(model_id);
CREATE INDEX IF NOT EXISTS idx_assignments_category ON public.category_model_assignments(category_id);

-- 5. Fast trigram search on model names (for customer model search)
CREATE INDEX IF NOT EXISTS idx_models_name_trgm ON public.models USING gin (name gin_trgm_ops);
