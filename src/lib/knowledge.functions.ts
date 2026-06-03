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

const categoryItemsSchema = z.record(z.string(), z.array(knowledgeItemSchema));
// Aceita formato novo (per-operation) e formato antigo (flat) por compat.
const knowledgeSchema = z.union([
  z.object({
    outbound: categoryItemsSchema.optional(),
    inbound: categoryItemsSchema.optional(),
  }),
  categoryItemsSchema, // legado
]).default({ outbound: {}, inbound: {} });

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
    company?: string;
    operation?: "outbound" | "inbound";
    qualification_model?: "CHAMP" | "BANT";
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
        company: z.string().max(200).optional(),
        operation: z.enum(["outbound", "inbound"]).optional(),
        qualification_model: z.enum(["CHAMP", "BANT"]).optional(),
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
        company: data.company ?? null,
        operation: data.operation ?? null,
        qualification_model: data.qualification_model ?? null,
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

export const listAnalyses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    operation?: "outbound" | "inbound" | null;
    qualification_model?: "CHAMP" | "BANT" | null;
    segment_id?: string | null;
    user_id?: string | null;
    company?: string | null;
  }) =>
    z.object({
      operation: z.enum(["outbound","inbound"]).nullable().optional(),
      qualification_model: z.enum(["CHAMP","BANT"]).nullable().optional(),
      segment_id: z.string().uuid().nullable().optional(),
      user_id: z.string().uuid().nullable().optional(),
      company: z.string().max(200).nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Admin pode ver todas; SDR só vê as suas (RLS já garante, mas restringimos cedo p/ UX).
    const { data: rolesRow } = await supabase
      .from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
    const isAdmin = !!rolesRow;
    const client: any = isAdmin ? supabaseAdmin : supabase;
    let q = client.from("call_analyses")
      .select("id, created_at, label, company, operation, qualification_model, segment_id, score, classification, user_id")
      .order("created_at", { ascending: false })
      .limit(200);
    if (!isAdmin) q = q.eq("user_id", userId);
    if (data.user_id) q = q.eq("user_id", data.user_id);
    if (data.operation) q = q.eq("operation", data.operation);
    if (data.qualification_model) q = q.eq("qualification_model", data.qualification_model);
    if (data.segment_id) q = q.eq("segment_id", data.segment_id);
    if (data.company) q = q.ilike("company", `%${data.company}%`);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getAnalysis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { data: row, error } = await supabase
      .from("call_analyses").select("*").eq("id", data.id).maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });