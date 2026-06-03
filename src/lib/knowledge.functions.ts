import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const knowledgeItemSchema = z.object({
  id: z.string(),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional().default(""),
  example: z.string().max(2000).optional().default(""),
  priority: z.enum(["alta", "media", "baixa"]).default("media"),
});

const knowledgeSchema = z.record(z.string(), z.array(knowledgeItemSchema)).default({});

export const listSegments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("segments")
      .select("id, name, description, knowledge, updated_at")
      .order("name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getSegment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { data: row, error } = await supabase
      .from("segments")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });

export const upsertSegment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id?: string; name: string; description?: string; knowledge: unknown }) =>
    z
      .object({
        id: z.string().uuid().optional(),
        name: z.string().min(1).max(120),
        description: z.string().max(2000).optional().default(""),
        knowledge: knowledgeSchema,
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const payload = {
      name: data.name,
      description: data.description,
      knowledge: data.knowledge,
      created_by: userId,
    };
    if (data.id) {
      const { data: row, error } = await supabase
        .from("segments")
        .update(payload)
        .eq("id", data.id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return row;
    }
    const { data: row, error } = await supabase
      .from("segments")
      .insert(payload)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteSegment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { error } = await supabase.from("segments").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const saveAnalysis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    segment_id?: string | null;
    label?: string;
    transcript?: string;
    summary?: string;
    score?: number | null;
    classification?: string | null;
    score_reasoning?: string;
    insights?: unknown;
  }) =>
    z
      .object({
        segment_id: z.string().uuid().nullable().optional(),
        label: z.string().max(300).optional(),
        transcript: z.string().optional(),
        summary: z.string().optional(),
        score: z.number().min(0).max(100).nullable().optional(),
        classification: z.string().max(20).nullable().optional(),
        score_reasoning: z.string().optional(),
        insights: z.unknown().optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("call_analyses")
      .insert({
        user_id: userId,
        segment_id: data.segment_id ?? null,
        label: data.label ?? null,
        transcript: data.transcript ?? null,
        summary: data.summary ?? null,
        score: data.score ?? null,
        classification: data.classification ?? null,
        score_reasoning: data.score_reasoning ?? null,
        insights: (data.insights ?? null) as any,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });