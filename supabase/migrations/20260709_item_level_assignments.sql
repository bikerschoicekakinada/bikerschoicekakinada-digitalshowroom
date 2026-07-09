-- ================================================================
-- BCK Digital Catalog - Item-Level Bike Assignments
-- 2026-07-09
-- ================================================================

-- 1. New table: per-option bike assignment
CREATE TABLE IF NOT EXISTS public.category_item_model_assignments (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id     uuid        NOT NULL REFERENCES public.category_items(id)  ON DELETE CASCADE,
  model_id    uuid        NOT NULL REFERENCES public.models(id)           ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (item_id, model_id)
);

GRANT SELECT ON public.category_item_model_assignments TO anon, authenticated;
GRANT ALL   ON public.category_item_model_assignments TO service_role;

ALTER TABLE public.category_item_model_assignments ENABLE ROW LEVEL SECURITY;

-- Drop policy if it already exists to prevent error 42710
DROP POLICY IF EXISTS "Item assignments are public" ON public.category_item_model_assignments;

CREATE POLICY "Item assignments are public"
  ON public.category_item_model_assignments FOR SELECT USING (true);

CREATE INDEX IF NOT EXISTS idx_item_assignments_item
  ON public.category_item_model_assignments(item_id);

CREATE INDEX IF NOT EXISTS idx_item_assignments_model
  ON public.category_item_model_assignments(model_id);

-- 2. Migrate existing data: only run if the old category_model_assignments table still exists
DO 
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'category_model_assignments') THEN
    INSERT INTO public.category_item_model_assignments (item_id, model_id)
    SELECT ci.id, cma.model_id
    FROM   public.category_model_assignments cma
    JOIN   public.category_items ci ON ci.category_id = cma.category_id
    ON CONFLICT DO NOTHING;
    
    DROP TABLE public.category_model_assignments;
  END IF;
END ;
