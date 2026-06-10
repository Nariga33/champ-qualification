// Edge Function: api4com-indicators
// Consulta o endpoint /api/v1/calls do API4Com (LoopBack), pagina TODAS as
// páginas e devolve métricas normalizadas para o dashboard de Indicadores.
// Reusa o mesmo API4COM_TOKEN/API4COM_BASE_URL já configurados. Nunca expõe
// o token ao frontend e nunca tenta auto-retry agressivo em 429.

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const API4COM_TOKEN = Deno.env.get("API4COM_TOKEN");
const API4COM_BASE_URL = Deno.env.get("API4COM_BASE_URL") ?? "https://api.api4com.com";
const PAGE_LIMIT = 1000;
const MAX_PAGES = 50; // hard cap: 50k registros / consulta

type Period = { from: string; to: string }; // ISO
type Body = {
  from?: string;
  to?: string;
  operation?: "all" | "outbound" | "inbound";
  scope?: "me" | "all";
  extension?: string | null;
};

// ----- normalização -----
function parseTariff(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v).replace(/R\$\s*/i, "").trim().replace(/\./g, "").replace(",", ".");
  // fallback: se tinha ponto decimal padrão US ("0.12"), o replace acima quebra. Tenta direto.
  const direct = Number(String(v).replace(/R\$\s*/i, "").trim().replace(",", "."));
  if (Number.isFinite(direct) && direct > 0) return direct;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}
function parseDurationSec(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0;
  const s = String(v).trim();
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  const parts = s.split(":").map((p) => parseInt(p, 10));
  if (parts.some((p) => Number.isNaN(p))) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] ?? 0;
}
function pickTariff(c: Record<string, unknown>): unknown {
  return c.tariff ?? c.tarifa ?? c.cost ?? c.price ?? c.value ?? c.billsec_cost ?? null;
}
function pickDuration(c: Record<string, unknown>): unknown {
  return c.billsec ?? c.duration ?? c.billDuration ?? c.talkTime ?? c.callDuration ?? null;
}
function pickExtension(c: Record<string, unknown>): string | null {
  const v = c.extension ?? c.ramal ?? c.agent ?? c.user ?? c.from ?? c.caller ?? null;
  return v == null ? null : String(v);
}
function pickDirection(c: Record<string, unknown>): "outbound" | "inbound" | null {
  const v = String(c.direction ?? c.call_type ?? c.callType ?? "").toLowerCase();
  if (v.includes("out")) return "outbound";
  if (v.includes("in")) return "inbound";
  return null;
}
function pickCreatedAt(c: Record<string, unknown>): string | null {
  const v = c.createdAt ?? c.created_at ?? c.startTime ?? c.start_time ?? c.start ?? c.date ?? null;
  return v == null ? null : String(v);
}

// ----- API4Com pagination -----
async function fetchAllCalls(period: Period, extensionFilter: string | null) {
  const where: Record<string, unknown> = {
    createdAt: { between: [period.from, period.to] },
  };
  if (extensionFilter) where.extension = extensionFilter;

  const out: Array<Record<string, unknown>> = [];
  let pages = 0;
  let sawFullPage = false;
  for (let skip = 0; pages < MAX_PAGES; skip += PAGE_LIMIT) {
    const filter = encodeURIComponent(JSON.stringify({ where, limit: PAGE_LIMIT, skip, order: "createdAt ASC" }));
    const url = `${API4COM_BASE_URL}/api/v1/calls?filter=${filter}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${API4COM_TOKEN}` } });
    if (res.status === 429) {
      const err: any = new Error("API4Com rate limit (429)");
      err.status = 429;
      err.detail = await res.text();
      throw err;
    }
    if (!res.ok) {
      const err: any = new Error(`API4Com erro ${res.status}`);
      err.status = res.status;
      err.detail = await res.text();
      throw err;
    }
    const data = await res.json();
    const arr: Array<Record<string, unknown>> = Array.isArray(data) ? data : (data.calls ?? data.data ?? data.items ?? []);
    out.push(...arr);
    pages++;
    if (arr.length >= PAGE_LIMIT) sawFullPage = true;
    if (arr.length < PAGE_LIMIT) break;
  }
  return { calls: out, pages, sawFullPage };
}

// ----- agregação -----
function aggregate(calls: Array<Record<string, unknown>>, opFilter: "all" | "outbound" | "inbound") {
  let total = 0;
  let answered = 0;
  let talkedSec = 0;
  let costCents = 0;
  let emptyTariffs = 0;
  let goodTariffs = 0;
  let firstTs: string | null = null;
  let lastTs: string | null = null;
  const perExt = new Map<string, { extension: string; total: number; answered: number; talkedSec: number }>();
  const extSet = new Set<string>();

  for (const c of calls) {
    const dir = pickDirection(c);
    if (opFilter !== "all" && dir && dir !== opFilter) continue;
    if (opFilter !== "all" && !dir) continue;

    total++;
    const tariff = parseTariff(pickTariff(c));
    const duration = parseDurationSec(pickDuration(c));
    const ext = pickExtension(c) ?? "—";
    if (ext) extSet.add(ext);

    const ts = pickCreatedAt(c);
    if (ts) {
      if (!firstTs || ts < firstTs) firstTs = ts;
      if (!lastTs || ts > lastTs) lastTs = ts;
    }

    if (tariff <= 0) emptyTariffs++;
    const isAnswered = tariff >= 0.12;
    if (isAnswered) {
      answered++;
      goodTariffs++;
      talkedSec += duration;
      costCents += Math.round(tariff * 100);
    }

    const bucket = perExt.get(ext) ?? { extension: ext, total: 0, answered: 0, talkedSec: 0 };
    bucket.total++;
    if (isAnswered) {
      bucket.answered++;
      bucket.talkedSec += duration;
    }
    perExt.set(ext, bucket);
  }

  const notAnswered = total - answered;
  const hitRate = total > 0 ? answered / total : 0;
  const tma = answered > 0 ? Math.round(talkedSec / answered) : 0;

  return {
    total,
    answered,
    notAnswered,
    hitRate,
    talkedSec,
    tma,
    costCents,
    totalExtensions: extSet.size,
    emptyTariffs,
    goodTariffs,
    firstTs,
    lastTs,
    perExtension: [...perExt.values()].sort((a, b) => b.total - a.total),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!API4COM_TOKEN) return json({ error: "api4com_not_configured", message: "API4COM_TOKEN ausente — peça ao admin para completar a configuração." }, 412);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "unauthorized" }, 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return json({ error: "unauthorized" }, 401);

  const { data: roleRow } = await supabase
    .from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
  const isAdmin = !!roleRow;

  const { data: profile } = await supabase
    .from("profiles").select("api4com_extension, operation").eq("user_id", user.id).maybeSingle();

  let body: Body = {};
  try { body = await req.json(); } catch { /* aceita vazio */ }

  const to = body.to ? new Date(body.to) : new Date();
  const from = body.from ? new Date(body.from) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  if (Number.isNaN(+from) || Number.isNaN(+to)) return json({ error: "invalid_dates" }, 400);
  const period: Period = { from: from.toISOString(), to: to.toISOString() };

  const opFilter = (body.operation ?? "all") as "all" | "outbound" | "inbound";
  // Escopo: usuário comum SEMPRE limitado ao próprio ramal. Admin pode escolher.
  let extensionFilter: string | null = null;
  if (!isAdmin) {
    extensionFilter = profile?.api4com_extension ?? null;
    if (!extensionFilter) {
      return json({
        error: "missing_extension",
        message: "Seu ramal API4Com não está configurado. Peça ao admin para preencher em Admin → Usuários.",
      }, 412);
    }
  } else if (body.scope === "me") {
    extensionFilter = profile?.api4com_extension ?? null;
  } else if (body.extension) {
    extensionFilter = body.extension;
  }

  console.log("[api4com-indicators] req", { userId: user.id, isAdmin, period, opFilter, extensionFilter });

  try {
    const { calls, pages, sawFullPage } = await fetchAllCalls(period, extensionFilter);
    const metrics = aggregate(calls, opFilter);
    console.log("[api4com-indicators] result", {
      pages, sawFullPage, totalRecords: calls.length,
      totalAfterOpFilter: metrics.total,
      goodTariffs: metrics.goodTariffs, emptyTariffs: metrics.emptyTariffs,
      firstTs: metrics.firstTs, lastTs: metrics.lastTs,
    });
    return json({
      metrics,
      meta: {
        pages,
        rawCount: calls.length,
        pageLimit: PAGE_LIMIT,
        sawFullPage,
        period,
        opFilter,
        scope: extensionFilter ? "extension" : "all",
        extensionFilter,
        isAdmin,
      },
    });
  } catch (e: any) {
    if (e?.status === 429) {
      console.warn("[api4com-indicators] 429", e?.detail?.slice?.(0, 200));
      return json({ error: "rate_limited", message: "Limite de consultas da API4Com atingido. Aguarde alguns segundos e tente novamente." }, 429);
    }
    console.error("[api4com-indicators] erro", e?.status, e?.detail?.slice?.(0, 300));
    return json({ error: "api4com_error", status: e?.status ?? 500, detail: isAdmin ? e?.detail?.slice?.(0, 500) : undefined, message: "Não foi possível consultar a API4Com." }, 502);
  }
});
