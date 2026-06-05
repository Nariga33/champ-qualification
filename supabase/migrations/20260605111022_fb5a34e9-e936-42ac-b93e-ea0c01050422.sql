ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS api4com_extension text;

ALTER TABLE public.call_analyses
  ADD COLUMN IF NOT EXISTS external_call_id text,
  ADD COLUMN IF NOT EXISTS record_url      text,
  ADD COLUMN IF NOT EXISTS phone           text,
  ADD COLUMN IF NOT EXISTS direction       text,
  ADD COLUMN IF NOT EXISTS duration        integer;

CREATE UNIQUE INDEX IF NOT EXISTS call_analyses_external_call_id_key
  ON public.call_analyses (external_call_id)
  WHERE external_call_id IS NOT NULL;