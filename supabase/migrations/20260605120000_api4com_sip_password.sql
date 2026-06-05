-- Senha SIP do ramal, usada pelo softphone WebRTC embarcado (Fase 3).
-- Só é exposta ao próprio dono via server function (getMySipCredentials).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS api4com_sip_password text;
