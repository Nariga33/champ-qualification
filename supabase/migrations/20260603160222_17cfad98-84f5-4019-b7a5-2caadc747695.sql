
-- Enums
CREATE TYPE public.knowledge_source AS ENUM ('manual','pdf','call');
CREATE TYPE public.knowledge_status AS ENUM ('pending','active','inactive','rejected');

-- knowledge_items: versioned/granular knowledge with origin
CREATE TABLE public.knowledge_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  segment_id uuid NOT NULL REFERENCES public.segments(id) ON DELETE CASCADE,
  operation public.operation_type NOT NULL,
  category text NOT NULL,
  title text NOT NULL,
  description text,
  example text,
  priority text NOT NULL DEFAULT 'media',
  source public.knowledge_source NOT NULL DEFAULT 'manual',
  source_ref uuid,
  status public.knowledge_status NOT NULL DEFAULT 'active',
  created_by uuid,
  approved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_knowledge_items_seg ON public.knowledge_items(segment_id, operation, status);
CREATE INDEX idx_knowledge_items_status ON public.knowledge_items(status);
CREATE INDEX idx_knowledge_items_source ON public.knowledge_items(source);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_items TO authenticated;
GRANT ALL ON public.knowledge_items TO service_role;
ALTER TABLE public.knowledge_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read active knowledge" ON public.knowledge_items
  FOR SELECT TO authenticated
  USING (status = 'active' OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins insert knowledge" ON public.knowledge_items
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins update knowledge" ON public.knowledge_items
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins delete knowledge" ON public.knowledge_items
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_knowledge_items_updated_at
  BEFORE UPDATE ON public.knowledge_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- email_templates: saved email templates
CREATE TABLE public.email_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  segment_id uuid REFERENCES public.segments(id) ON DELETE SET NULL,
  operation public.operation_type,
  objective text,
  tone text,
  stage text,
  pain text,
  subject text NOT NULL,
  preview text,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_email_templates_user ON public.email_templates(user_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_templates TO authenticated;
GRANT ALL ON public.email_templates TO service_role;
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own templates" ON public.email_templates
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Users insert own templates" ON public.email_templates
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own templates" ON public.email_templates
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Users delete own templates" ON public.email_templates
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_email_templates_updated_at
  BEFORE UPDATE ON public.email_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
