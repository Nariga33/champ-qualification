import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const opEnum = z.enum(["outbound", "inbound"]);
const toneEnum = z.enum(["direto", "consultivo", "provocativo"]);
const objectiveEnum = z.enum(["prospeccao", "follow_up", "retomada", "quebra_objecao", "envio_material"]);
const stageEnum = z.enum(["primeiro_contato", "pos_call", "negociacao", "fechamento", "reativacao"]);

const OBJECTIVE_LABEL: Record<string, string> = {
  prospeccao: "Prospecção (primeiro contato)",
  follow_up: "Follow-up pós-call",
  retomada: "Retomada de conversa fria",
  quebra_objecao: "Quebra de objeção",
  envio_material: "Envio de material",
};
const TONE_LABEL: Record<string, string> = {
  direto: "Direto e objetivo",
  consultivo: "Consultivo (recomendado O2)",
  provocativo: "Provocativo (questionador)",
};

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

export const generateEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    segment_id: string;
    operation: "outbound" | "inbound";
    objective: z.infer<typeof objectiveEnum>;
    tone: z.infer<typeof toneEnum>;
    stage?: z.infer<typeof stageEnum>;
    pain?: string;
    extra_context?: string;
    analysis_id?: string | null;
  }) =>
    z.object({
      segment_id: z.string().uuid(),
      operation: opEnum,
      objective: objectiveEnum,
      tone: toneEnum,
      stage: stageEnum.optional(),
      pain: z.string().max(500).optional(),
      extra_context: z.string().max(2000).optional(),
      analysis_id: z.string().uuid().nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase } = context;

    // 1) Fetch segment basics
    const { data: segment, error: segErr } = await supabase
      .from("segments")
      .select("id, name, description")
      .eq("id", data.segment_id)
      .maybeSingle();
    if (segErr) throw new Error(segErr.message);
    if (!segment) throw new Error("Segmento não encontrado");

    // 2) Only ACTIVE knowledge items for this segment+operation
    const { data: items, error: itemsErr } = await supabase
      .from("knowledge_items")
      .select("category, title, description, example, priority")
      .eq("segment_id", data.segment_id)
      .eq("operation", data.operation)
      .eq("status", "active")
      .limit(200);
    if (itemsErr) throw new Error(itemsErr.message);

    const byCat: Record<string, typeof items> = {} as any;
    for (const it of items ?? []) {
      (byCat[it.category] ??= [] as any).push(it);
    }
    const formatCat = (cat: string, label: string) => {
      const list = byCat[cat] ?? [];
      if (list.length === 0) return "";
      return `### ${label}\n` + list.map((i: any) =>
        `- ${i.title}${i.description ? ` — ${i.description}` : ""}${i.example ? `\n  ex.: ${i.example}` : ""}`
      ).join("\n");
    };

    const knowledgeBlock = [
      formatCat("pains", "Dores aprovadas"),
      formatCat("pains_inbound", "Dores inbound aprovadas"),
      formatCat("impacts", "Impactos aprovados"),
      formatCat("urgency_signals", "Sinais de urgência"),
      formatCat("intent_signals", "Sinais de intenção"),
      formatCat("fit_criteria", "Critérios de fit OXY"),
      formatCat("objections", "Objeções comuns"),
      formatCat("objection_breaks", "Quebras de objeção aprovadas"),
      formatCat("discovery_required", "Perguntas chave"),
    ].filter(Boolean).join("\n\n") || "(base ainda vazia para este segmento)";

    // 3) Optional call context for follow-up
    let callBlock = "";
    if (data.analysis_id) {
      const { data: a } = await supabase
        .from("call_analyses")
        .select("company, summary, insights, score, classification")
        .eq("id", data.analysis_id)
        .maybeSingle();
      if (a) {
        callBlock = `\n\nCONTEXTO DA LIGAÇÃO REAL (use somente o que foi mencionado, não invente):
Empresa: ${a.company ?? "—"}
Classificação: ${a.classification ?? "—"} (score ${a.score ?? "—"})

Resumo CRM:
${a.summary ?? ""}

Insights:
${JSON.stringify(a.insights ?? {}, null, 2).slice(0, 3000)}`;
      }
    }

    const system = `Você é redator comercial sênior da O2 (consultoria de RevOps/comercial B2B).
Escreva e-mails em português brasileiro, tom ${TONE_LABEL[data.tone]}, padrão consultivo da O2.
REGRAS RÍGIDAS:
- Use APENAS dores, objeções, argumentos e impactos listados em "BASE APROVADA". Nada além disso.
- Nunca prometa resultados específicos não cadastrados.
- Se houver "CONTEXTO DA LIGAÇÃO", personalize com o que o lead realmente disse (não invente dados).
- E-mail curto (máx. ~150 palavras), assunto direto (máx. 60 chars), prévia/snippet curta (máx. 90 chars).
- Não use clichês como "espero que esteja bem", "passando para saber".
- Sempre termine com 1 próximo passo claro (call, material, resposta).

Retorne JSON estrito: {"subject":"...","preview":"...","body":"..."}.
O body deve estar em texto puro com quebras de linha (\\n). Não use HTML.`;

    const userPrompt = `SEGMENTO: ${segment.name}
${segment.description ? `Contexto do segmento: ${segment.description}` : ""}
Operação: ${data.operation === "outbound" ? "Outbound (cold)" : "Inbound (lead inbound)"}
Objetivo: ${OBJECTIVE_LABEL[data.objective]}
Estágio: ${data.stage ?? "—"}
Dor principal a explorar: ${data.pain ?? "(escolha a mais relevante da base)"}
Contexto extra do usuário: ${data.extra_context ?? "—"}

BASE APROVADA (use SOMENTE estes argumentos):
${knowledgeBlock}
${callBlock}`;

    const raw = await callGemini(system, userPrompt);
    let parsed: any;
    try { parsed = JSON.parse(raw); } catch { parsed = {}; }
    const subject = String(parsed?.subject ?? "").slice(0, 200);
    const preview = String(parsed?.preview ?? "").slice(0, 200);
    const body = String(parsed?.body ?? "").slice(0, 8000);
    if (!subject || !body) throw new Error("A IA não retornou um e-mail válido. Tente novamente.");
    return { subject, preview, body };
  });

export const saveEmailTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    segment_id?: string | null;
    operation?: "outbound" | "inbound" | null;
    objective?: string | null;
    tone?: string | null;
    stage?: string | null;
    pain?: string | null;
    subject: string;
    preview?: string | null;
    body: string;
  }) =>
    z.object({
      segment_id: z.string().uuid().nullable().optional(),
      operation: opEnum.nullable().optional(),
      objective: z.string().max(40).nullable().optional(),
      tone: z.string().max(40).nullable().optional(),
      stage: z.string().max(40).nullable().optional(),
      pain: z.string().max(500).nullable().optional(),
      subject: z.string().min(1).max(200),
      preview: z.string().max(200).nullable().optional(),
      body: z.string().min(1).max(8000),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("email_templates")
      .insert({
        user_id: userId,
        segment_id: data.segment_id ?? null,
        operation: data.operation ?? null,
        objective: data.objective ?? null,
        tone: data.tone ?? null,
        stage: data.stage ?? null,
        pain: data.pain ?? null,
        subject: data.subject,
        preview: data.preview ?? null,
        body: data.body,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const listEmailTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("email_templates")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const deleteEmailTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { error } = await supabase.from("email_templates").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export { OBJECTIVE_LABEL, TONE_LABEL };