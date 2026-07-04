
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  icon text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.categories TO anon, authenticated;
GRANT ALL ON public.categories TO service_role;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Categories are public" ON public.categories FOR SELECT USING (true);

CREATE TABLE public.brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  logo_path text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.brands TO anon, authenticated;
GRANT ALL ON public.brands TO service_role;
ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Brands are public" ON public.brands FOR SELECT USING (true);

CREATE TABLE public.models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  slug text NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, slug)
);
GRANT SELECT ON public.models TO anon, authenticated;
GRANT ALL ON public.models TO service_role;
ALTER TABLE public.models ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Models are public" ON public.models FOR SELECT USING (true);

CREATE TABLE public.designs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  brand_id uuid REFERENCES public.brands(id) ON DELETE SET NULL,
  model_id uuid REFERENCES public.models(id) ON DELETE SET NULL,
  price_min int,
  price_max int,
  estimated_days int,
  required_parts text[] NOT NULL DEFAULT '{}',
  theme text,
  color text,
  thumbnail_path text NOT NULL,
  image_paths text[] NOT NULL DEFAULT '{}',
  is_trending boolean NOT NULL DEFAULT false,
  is_featured boolean NOT NULL DEFAULT false,
  view_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.designs TO anon, authenticated;
GRANT ALL ON public.designs TO service_role;
ALTER TABLE public.designs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Designs are public" ON public.designs FOR SELECT USING (true);

CREATE INDEX idx_designs_category ON public.designs(category_id);
CREATE INDEX idx_designs_brand ON public.designs(brand_id);
CREATE INDEX idx_designs_model ON public.designs(model_id);
CREATE INDEX idx_designs_created ON public.designs(created_at DESC);
CREATE INDEX idx_designs_trending ON public.designs(is_trending) WHERE is_trending;
CREATE INDEX idx_designs_title_trgm ON public.designs USING gin (title gin_trgm_ops);

CREATE POLICY "Catalog images public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'catalog');

INSERT INTO public.categories (slug, name, icon, sort_order) VALUES
  ('wrapping', 'Wrapping', 'Sparkles', 1),
  ('painting', 'Painting', 'Paintbrush', 2),
  ('hydro-dipping', 'Hydro Dipping', 'Droplets', 3),
  ('ppf', 'PPF', 'ShieldCheck', 4),
  ('graphics', 'Graphics', 'Palette', 5),
  ('accessories', 'Accessories', 'Wrench', 6),
  ('helmet', 'Helmet', 'HardHat', 7),
  ('seat-covers', 'Seat Covers', 'Armchair', 8),
  ('lighting', 'Lighting', 'Lightbulb', 9),
  ('custom-projects', 'Custom Projects', 'Rocket', 10);

INSERT INTO public.brands (slug, name, sort_order) VALUES
  ('ktm', 'KTM', 1),
  ('royal-enfield', 'Royal Enfield', 2),
  ('yamaha', 'Yamaha', 3),
  ('bajaj', 'Bajaj', 4),
  ('honda', 'Honda', 5),
  ('tvs', 'TVS', 6),
  ('suzuki', 'Suzuki', 7),
  ('bmw', 'BMW', 8),
  ('kawasaki', 'Kawasaki', 9);

INSERT INTO public.models (brand_id, slug, name)
SELECT b.id, m.slug, m.name FROM public.brands b
JOIN (VALUES
  ('ktm','duke-200','Duke 200'),('ktm','duke-390','Duke 390'),('ktm','rc-390','RC 390'),
  ('royal-enfield','classic-350','Classic 350'),('royal-enfield','meteor-350','Meteor 350'),('royal-enfield','himalayan','Himalayan'),
  ('yamaha','r15','R15'),('yamaha','mt-15','MT-15'),('yamaha','fz-s','FZ-S'),
  ('bajaj','pulsar-ns200','Pulsar NS200'),('bajaj','dominar-400','Dominar 400'),
  ('honda','cb350','CB350'),('honda','hornet-2-0','Hornet 2.0'),
  ('tvs','apache-rtr-200','Apache RTR 200'),('tvs','ronin','Ronin'),
  ('suzuki','gixxer','Gixxer'),
  ('bmw','g310r','G 310 R'),
  ('kawasaki','ninja-300','Ninja 300')
) m(brand_slug, slug, name) ON b.slug = m.brand_slug;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER trg_designs_updated
BEFORE UPDATE ON public.designs
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
