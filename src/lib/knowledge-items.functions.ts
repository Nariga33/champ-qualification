import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const opEnum = z.enum(["outbound", "inbound"]);
const sourceEnum = z.enum(["manual", "pdf", "call"]);
const statusEnum = z.enum(["pending", "active", "inactive", "rejected"]);
const priorityEnum = z.enum(["alta", "media", "baixa"]);

const itemInputSchema = z.object({
  id: z.string().uuid().optional(),
  segment_id: z.string().uuid(),
  operation: opEnum,
  category: z.string().min(1).max(60),
  title: z.string().min(1).max(300),
  description: z.string().max(4000).optional().nullable(),
  example: z.string().max(4000).optional().nullable(),
  priority: priorityEnum.default("media"),
  source: sourceEnum.default("manual"),
  source_ref: z.string().uuid().nullable().optional(),
  status: statusEnum.default("active"),
});

export const listKnowledgeItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    segment_id?: string | null;
    operation?: "outbound" | "inbound" | null;
    status?: "pending" | "active" | "inactive" | "rejected" | null;
    source?: "manual" | "pdf" | "call" | null;
    category?: string | null;
    priority?: "alta" | "media" | "baixa" | null;
    search?: string | null;
  }) =>
    z.object({
      segment_id: z.string().uuid().nullable().optional(),
      operation: opEnum.nullable().optional(),
      status: statusEnum.nullable().optional(),
      source: sourceEnum.nullable().optional(),
      category: z.string().max(60).nullable().optional(),
      priority: priorityEnum.nullable().optional(),
      search: z.string().max(200).nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    let q = supabase.from("knowledge_items")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (data.segment_id) q = q.eq("segment_id", data.segment_id);
    if (data.operation) q = q.eq("operation", data.operation);
    if (data.status) q = q.eq("status", data.status);
    if (data.source) q = q.eq("source", data.source);
    if (data.category) q = q.eq("category", data.category);
    if (data.priority) q = q.eq("priority", data.priority);
    if (data.search) q = q.ilike("title", `%${data.search}%`);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const upsertKnowledgeItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => itemInputSchema.parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    if (data.id) {
      const { data: row, error } = await supabase
        .from("knowledge_items")
        .update({
          segment_id: data.segment_id,
          operation: data.operation,
          category: data.category,
          title: data.title,
          description: data.description ?? null,
          example: data.example ?? null,
          priority: data.priority,
          source: data.source,
          source_ref: data.source_ref ?? null,
          status: data.status,
        })
        .eq("id", data.id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return row;
    }
    const { data: row, error } = await supabase
      .from("knowledge_items")
      .insert({
        segment_id: data.segment_id,
        operation: data.operation,
        category: data.category,
        title: data.title,
        description: data.description ?? null,
        example: data.example ?? null,
        priority: data.priority,
        source: data.source,
        source_ref: data.source_ref ?? null,
        status: data.status,
        created_by: userId,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const setKnowledgeItemStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; status: "pending" | "active" | "inactive" | "rejected" }) =>
    z.object({ id: z.string().uuid(), status: statusEnum }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const patch: Record<string, unknown> = { status: data.status };
    if (data.status === "active") patch.approved_by = userId;
    const { data: row, error } = await supabase
      .from("knowledge_items")
      .update(patch)
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteKnowledgeItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { error } = await supabase.from("knowledge_items").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const bulkSchema = z.object({
  segment_id: z.string().uuid(),
  operation: opEnum,
  source: sourceEnum,
  source_ref: z.string().uuid().nullable().optional(),
  status: statusEnum.default("pending"),
  items: z.array(
    z.object({
      category: z.string().min(1).max(60),
      title: z.string().min(1).max(300),
      description: z.string().max(4000).optional().nullable(),
      example: z.string().max(4000).optional().nullable(),
      priority: priorityEnum.default("media"),
    })
  ).min(1).max(200),
});

export const bulkInsertKnowledgeItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => bulkSchema.parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const rows = data.items.map((it) => ({
      segment_id: data.segment_id,
      operation: data.operation,
      category: it.category,
      title: it.title,
      description: it.description ?? null,
      example: it.example ?? null,
      priority: it.priority,
      source: data.source,
      source_ref: data.source_ref ?? null,
      status: data.status,
      created_by: userId,
    }));
    const { data: inserted, error } = await supabase
      .from("knowledge_items")
      .insert(rows)
      .select();
    if (error) throw new Error(error.message);
    return inserted ?? [];
  });

/* ------------------- AI extraction & suggestion ------------------- */

const CATEGORY_KEYS = [
  "discovery_required",
  "discovery_recommended",
  "pains",
  "impacts",
  "urgency_signals",
  "authority_criteria",
  "fit_criteria",
  "objections",
  "objection_breaks",
  "budget_questions",
  "authority_questions",
  "need_questions",
  "timing_questions",
  "intent_signals",
  "pains_inbound",
];

async function callGemini(systemPrompt: string, userPrompt: string): Promise<string> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY ausente no ambiente");
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`AI gateway ${res.status}: ${t.slice(0, 300)}`);
  }
  const json = await res.json();
  return json?.choices?.[0]?.message?.content ?? "{}";
}

function parseAiItems(raw: string): Array<{
  category: string; title: string; description?: string; example?: string; priority?: "alta" | "media" | "baixa";
}> {
  let parsed: any;
  try { parsed = JSON.parse(raw); } catch { return []; }
  const arr: any[] = Array.isArray(parsed?.items) ? parsed.items : Array.isArray(parsed) ? parsed : [];
  const out: any[] = [];
  for (const it of arr) {
    if (!it || typeof it.title !== "string" || !it.title.trim()) continue;
    const category = String(it.category ?? "").trim();
    if (!CATEGORY_KEYS.includes(category)) continue;
    const priority = ["alta","media","baixa"].includes(it.priority) ? it.priority : "media";
    out.push({
      category,
      title: it.title.trim().slice(0, 300),
      description: typeof it.description === "string" ? it.description.slice(0, 4000) : "",
      example: typeof it.example === "string" ? it.example.slice(0, 4000) : "",
      priority,
    });
  }
  return out;
}

export const extractKnowledgeFromText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { segment_id: string; operation: "outbound" | "inbound"; text: string }) =>
    z.object({
      segment_id: z.string().uuid(),
      operation: opEnum,
      text: z.string().min(20).max(120000),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    // gate: admin only
    const { data: roleRow } = await supabase
      .from("user_roles").select("role").eq("user_id", context.userId).eq("role","admin").maybeSingle();
    if (!roleRow) throw new Error("Apenas admin pode importar playbook");

    const system = `Você é um especialista em estruturação de playbooks comerciais B2B.
Receberá o texto de um PDF de playbook/material interno e deve extrair itens organizados por categoria.
Operação alvo: ${data.operation === "outbound" ? "Outbound (CHAMP)" : "Inbound (BANT)"}.
Categorias permitidas:
- Outbound: discovery_required, discovery_recommended, pains, impacts, urgency_signals, authority_criteria, fit_criteria, objections, objection_breaks
- Inbound: budget_questions, authority_questions, need_questions, timing_questions, intent_signals, pains_inbound, objections, objection_breaks

Retorne JSON estrito no formato: {"items":[{"category":"<chave>","title":"...","description":"...","example":"...","priority":"alta|media|baixa"}]}
- title: curto e direto (até 120 chars)
- description: contexto/explicação
- example: frase pronta para uso na call quando aplicável (pode ficar vazio)
- priority: estimar com base na importância no playbook
Não invente conteúdo que não esteja no texto. Se não houver itens para uma categoria, simplesmente não inclua.`;
    const userPrompt = `Texto do playbook (já extraído do PDF):\n\n${data.text.slice(0, 100000)}`;
    const raw = await callGemini(system, userPrompt);
    return parseAiItems(raw);
  });

export const suggestKnowledgeFromCall = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { analysis_id: string }) =>
    z.object({ analysis_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: roleRow } = await supabase
      .from("user_roles").select("role").eq("user_id", userId).eq("role","admin").maybeSingle();
    if (!roleRow) throw new Error("Apenas admin pode gerar sugestões de conhecimento");

    const { data: analysis, error } = await supabase
      .from("call_analyses")
      .select("id, segment_id, operation, transcript, summary, insights, company")
      .eq("id", data.analysis_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!analysis) throw new Error("Análise não encontrada");
    if (!analysis.segment_id) throw new Error("Esta análise não está vinculada a um segmento");
    const operation = (analysis.operation as "outbound" | "inbound") ?? "outbound";

    const system = `Você é um analista sênior de cold calls B2B.
A partir da transcrição, resumo CRM e insights de uma ligação, sugira NOVOS itens de conhecimento para a base do segmento.
Foque em aprendizados reais observados na call: novas objeções, novas dores, perguntas que funcionaram, perguntas que faltaram, boas quebras de objeção, sinais de compra.
Operação: ${operation === "outbound" ? "Outbound (CHAMP)" : "Inbound (BANT)"}.
Categorias permitidas:
- Outbound: discovery_required, discovery_recommended, pains, impacts, urgency_signals, authority_criteria, fit_criteria, objections, objection_breaks
- Inbound: budget_questions, authority_questions, need_questions, timing_questions, intent_signals, pains_inbound, objections, objection_breaks

Retorne JSON estrito: {"items":[{"category":"<chave>","title":"...","description":"...","example":"...","priority":"alta|media|baixa"}]}
- Cite no description o trecho/contexto da call que motivou a sugestão.
- Máximo 12 sugestões. Não invente, baseie-se na conversa.`;
    const userPrompt = `Empresa: ${analysis.company ?? "—"}

RESUMO CRM:
${analysis.summary ?? ""}

INSIGHTS:
${JSON.stringify(analysis.insights ?? {}, null, 2).slice(0, 6000)}

TRANSCRIÇÃO (parcial):
${(analysis.transcript ?? "").slice(0, 30000)}`;
    const raw = await callGemini(system, userPrompt);
    const items = parseAiItems(raw);

    if (items.length === 0) return { inserted: 0, items: [] };

    const rows = items.map((it) => ({
      segment_id: analysis.segment_id!,
      operation,
      category: it.category,
      title: it.title,
      description: it.description ?? null,
      example: it.example ?? null,
      priority: it.priority ?? "media",
      source: "call" as const,
      source_ref: analysis.id,
      status: "pending" as const,
      created_by: userId,
    }));
    const { data: inserted, error: insErr } = await supabase
      .from("knowledge_items")
      .insert(rows)
      .select();
    if (insErr) throw new Error(insErr.message);
    return { inserted: inserted?.length ?? 0, items: inserted ?? [] };
  });