-- ================================================================
-- BCK Digital Catalog - Cryptographic Admin Authentication Settings
-- 2026-07-11
-- ================================================================

CREATE TABLE IF NOT EXISTS public.admin_settings (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_pin_hash text        NOT NULL,
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- Secure access limits:
REVOKE ALL ON public.admin_settings FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.admin_settings TO service_role;

ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;

-- Insert default admin PIN hash (bcrypt of "202620") if not already set
INSERT INTO public.admin_settings (id, admin_pin_hash)
VALUES ('00000000-0000-0000-0000-000000000001', '$2b$10$iDCc5FomNarzKN.YEE6fdOKFR4rPVr.xYdZvzahjdQNXHhcz0HjY2')
ON CONFLICT (id) DO NOTHING;
