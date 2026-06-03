
DO $$ BEGIN
  CREATE TYPE public.operation_type AS ENUM ('outbound','inbound');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS operation public.operation_type NOT NULL DEFAULT 'outbound';

ALTER TABLE public.call_analyses
  ADD COLUMN IF NOT EXISTS operation public.operation_type,
  ADD COLUMN IF NOT EXISTS qualification_model text,
  ADD COLUMN IF NOT EXISTS company text;

UPDATE public.segments
SET knowledge = jsonb_build_object('outbound', COALESCE(knowledge, '{}'::jsonb), 'inbound', '{}'::jsonb)
WHERE knowledge IS NOT NULL
  AND NOT (knowledge ? 'outbound' OR knowledge ? 'inbound');

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _username TEXT;
  _full_name TEXT;
  _role public.app_role;
  _operation public.operation_type;
BEGIN
  _username := COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1));
  _full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', _username);
  _role := COALESCE((NEW.raw_user_meta_data->>'role')::public.app_role, 'sdr');
  _operation := COALESCE((NEW.raw_user_meta_data->>'operation')::public.operation_type, 'outbound');

  INSERT INTO public.profiles (user_id, username, full_name, operation)
  VALUES (NEW.id, _username, _full_name, _operation)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, _role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$function$;
