// Edge Function: api4com-webhook
// Recebe o evento channel-hangup do API4Com, baixa a gravação (os DOIS lados da
// ligação) e reaproveita o pipeline transcribe-call para gerar transcrição +
// qualificação CHAMP/BANT, salvando em call_analyses.
//
// Público (API4Com não envia JWT) → protegido por ?secret=... e por isso
// declarado com verify_jwt = false no config.toml.
//
// Responde 200 na hora e processa em background (a transcrição leva segundos e
// o API4Com espera um ack rápido).

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("API4COM_WEBHOOK_SECRET");
const API4COM_TOKEN = Deno.env.get("API4COM_TOKEN");

// O API4Com varia entre camelCase (doc do webhook) e snake_case (API REST);
// aceitamos ambos.
interface HangupEvent {
  eventType?: string;
  event?: string;
  id?: string;
  direction?: string;
  call_type?: string;
  caller?: string;
  from?: string;
  called?: string;
  to?: string;
  duration?: number;
  recordUrl?: string;
  record_url?: string;
  metadata?: {
    userId?: string;
    segmentId?: string | null;
    company?: string | null;
    operation?: string | null;
  };
}

function normalize(e: HangupEvent) {
  return {
    id: e.id,
    recordUrl: e.recordUrl ?? e.record_url ?? null,
    called: e.called ?? e.to ?? null,
    direction: e.direction ?? e.call_type ?? null,
    duration: e.duration ?? null,
    eventType: e.eventType ?? e.event ?? null,
    metadata: e.metadata ?? {},
  };
}

async function process(event: HangupEvent): Promise<void> {
  const call = normalize(event);
  const meta = call.metadata;
  if (!call.recordUrl || !meta.userId) {
    console.warn("[api4com-webhook] sem recordUrl ou userId — ignorado", call.id);
    return;
  }

  // Já processado? (idempotência por external_call_id)
  if (call.id) {
    const dupe = await fetch(
      `${SUPABASE_URL}/rest/v1/call_analyses?external_call_id=eq.${call.id}&select=id`,
      { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } },
    );
    if (dupe.ok && (await dupe.json()).length > 0) return;
  }

  // 1) Baixa a gravação (tenta com o token; cai p/ sem auth se o link for público).
  let audioRes = await fetch(call.recordUrl, {
    headers: API4COM_TOKEN ? { Authorization: `Bearer ${API4COM_TOKEN}` } : {},
  });
  if (!audioRes.ok && API4COM_TOKEN) audioRes = await fetch(call.recordUrl);
  if (!audioRes.ok) {
    console.error("[api4com-webhook] falha ao baixar gravação", audioRes.status);
    return;
  }
  const contentType = audioRes.headers.get("content-type") ?? "audio/mpeg";
  const audio = await audioRes.arrayBuffer();
  const ext = contentType.includes("wav") ? "wav" : contentType.includes("webm") ? "webm" : "mp3";

  // 2) Reaproveita o pipeline transcribe-call (transcrição + qualificação).
  const operation = (meta.operation ?? "outbound").toLowerCase() === "inbound" ? "inbound" : "outbound";
  const stt = await fetch(`${SUPABASE_URL}/functions/v1/transcribe-call`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": contentType,
      "x-filename": `api4com-${call.id ?? "call"}.${ext}`,
      "x-operation": operation,
      ...(meta.segmentId ? { "x-segment-id": meta.segmentId } : {}),
      ...(meta.company ? { "x-company": encodeURIComponent(meta.company) } : {}),
    },
    body: audio,
  });
  if (!stt.ok) {
    console.error("[api4com-webhook] transcribe-call falhou", stt.status, await stt.text());
    return;
  }
  const result = await stt.json();

  // 3) Persiste a análise (service_role ignora RLS; user_id vem da metadata).
  const label = `API4Com • ${call.called ?? meta.company ?? "ligação"} • ${
    new Date().toLocaleDateString("pt-BR")
  }`;
  const insert = await fetch(`${SUPABASE_URL}/rest/v1/call_analyses`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      user_id: meta.userId,
      segment_id: meta.segmentId ?? null,
      label,
      transcript: result.transcript ?? null,
      summary: result.summary ?? null,
      score: typeof result.score === "number" ? result.score : null,
      classification: result.classification ?? null,
      score_reasoning: result.score_reasoning ?? null,
      insights: result.insights ?? null,
      external_call_id: call.id ?? null,
      record_url: call.recordUrl,
      phone: call.called ?? null,
      direction: call.direction ?? null,
      duration: call.duration ?? null,
    }),
  });
  if (!insert.ok) {
    console.error("[api4com-webhook] insert call_analyses falhou", insert.status, await insert.text());
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method_not_allowed", { status: 405 });

  const url = new URL(req.url);
  if (!WEBHOOK_SECRET || url.searchParams.get("secret") !== WEBHOOK_SECRET) {
    return new Response("forbidden", { status: 403 });
  }

  let event: HangupEvent;
  try {
    event = await req.json();
  } catch {
    return new Response("invalid_json", { status: 400 });
  }

  // Só processa o fim da chamada; demais eventos são ack imediato.
  const evType = event.eventType ?? event.event;
  if (evType && evType !== "channel-hangup" && evType !== "call_ended") {
    return new Response(JSON.stringify({ ok: true, ignored: evType }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // Processa em background; responde já para o API4Com.
  // @ts-ignore EdgeRuntime existe no runtime do Supabase
  EdgeRuntime.waitUntil(process(event).catch((e) => console.error("[api4com-webhook]", e)));

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
