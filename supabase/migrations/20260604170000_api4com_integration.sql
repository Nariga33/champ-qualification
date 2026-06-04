-- Integração API4Com: ramal do SDR + rastreio da chamada na análise.

-- Ramal (extension) do SDR no API4Com — usado para originar a ligação.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS api4com_extension text;

-- Campos de rastreio da chamada API4Com na análise gerada pelo webhook.
ALTER TABLE public.call_analyses
  ADD COLUMN IF NOT EXISTS external_call_id text,
  ADD COLUMN IF NOT EXISTS record_url      text,
  ADD COLUMN IF NOT EXISTS phone           text,
  ADD COLUMN IF NOT EXISTS direction       text,
  ADD COLUMN IF NOT EXISTS duration        integer;

-- Idempotência do webhook: uma análise por chamada externa.
CREATE UNIQUE INDEX IF NOT EXISTS call_analyses_external_call_id_key
  ON public.call_analyses (external_call_id)
  WHERE external_call_id IS NOT NULL;
