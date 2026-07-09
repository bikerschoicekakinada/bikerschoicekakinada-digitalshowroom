-- Create catalog bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('catalog', 'catalog', false)
ON CONFLICT (id) DO NOTHING;
