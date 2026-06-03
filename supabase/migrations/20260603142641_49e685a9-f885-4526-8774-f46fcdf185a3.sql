-- ============ SEGMENTS (knowledge base) ============
CREATE TABLE public.segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  knowledge jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.segments TO authenticated;
GRANT ALL ON public.segments TO service_role;

ALTER TABLE public.segments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read segments"
  ON public.segments FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins insert segments"
  ON public.segments FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update segments"
  ON public.segments FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins delete segments"
  ON public.segments FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER segments_set_updated_at
  BEFORE UPDATE ON public.segments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ CALL ANALYSES ============
CREATE TABLE public.call_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  segment_id uuid REFERENCES public.segments(id) ON DELETE SET NULL,
  label text,
  transcript text,
  summary text,
  score int,
  classification text,
  score_reasoning text,
  insights jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.call_analyses TO authenticated;
GRANT ALL ON public.call_analyses TO service_role;

ALTER TABLE public.call_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own analyses"
  ON public.call_analyses FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users insert own analyses"
  ON public.call_analyses FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own analyses"
  ON public.call_analyses FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users delete own analyses"
  ON public.call_analyses FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE INDEX call_analyses_user_id_idx ON public.call_analyses(user_id);
CREATE INDEX call_analyses_segment_id_idx ON public.call_analyses(segment_id);