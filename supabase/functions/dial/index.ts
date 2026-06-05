// Edge Function: dial
// Origina uma ligação no API4Com. O token Bearer fica só no servidor.
// O frontend chama com { phone, segmentId?, company? } e a sessão do usuário.
// A metadata enviada ao API4Com volta no webhook channel-hangup, permitindo
// reconstruir o contexto (quem ligou, segmento, operação) sem tabela intermediária.

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const API4COM_TOKEN = Deno.env.get("API4COM_TOKEN");
const API4COM_BASE_URL = Deno.env.get("API4COM_BASE_URL") ?? "https://api.api4com.com";
const API4COM_DEFAULT_EXTENSION = Deno.env.get("API4COM_DEFAULT_EXTENSION");

function sanitizePhone(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw.replace(/[^\d+]/g, "");
  return /^\+?\d{8,15}$/.test(cleaned) ? cleaned : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!API4COM_TOKEN) return json({ error: "API4COM_TOKEN não configurado" }, 500);

  // Autentica o usuário pela sessão do Supabase.
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "unauthorized" }, 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return json({ error: "unauthorized" }, 401);

  let body: { phone?: string; segmentId?: string; company?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const phone = sanitizePhone(body.phone);
  if (!phone) return json({ error: "invalid_phone" }, 400);

  // Ramal e operação vêm do perfil do SDR (fallback p/ ramal default do env).
  const { data: profile } = await supabase
    .from("profiles")
    .select("api4com_extension, operation")
    .eq("user_id", user.id)
    .maybeSingle();

  const extension = profile?.api4com_extension ?? API4COM_DEFAULT_EXTENSION;
  if (!extension) return json({ error: "no_extension" }, 400);

  // Atenção: o endpoint /dialer da API4Com usa o token cru no Authorization,
  // SEM o prefixo "Bearer" (diferente do restante da API, que usa Bearer).
  const res = await fetch(`${API4COM_BASE_URL}/api/v1/dialer`, {
    method: "POST",
    headers: {
      Authorization: API4COM_TOKEN,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      extension,
      phone,
      metadata: {
        userId: user.id,
        segmentId: body.segmentId ?? null,
        company: body.company ?? null,
        operation: profile?.operation ?? "outbound",
      },
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    return json({ error: "api4com_error", status: res.status, detail }, 502);
  }

  const data = await res.json(); // { id, message }
  return json({ callId: data.id });
});
