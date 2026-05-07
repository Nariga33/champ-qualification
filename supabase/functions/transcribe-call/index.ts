const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `Você é um SDR sênior especialista em qualificação de cold calls B2B (metodologia BANT/SPIN).
Receberá o áudio (ou transcrição) de uma cold call em português.

Sua tarefa:
1. Transcrever mentalmente a conversa.
2. Extrair as informações de qualificação.
3. Retornar EXCLUSIVAMENTE um resumo no formato Markdown EXATAMENTE como o template abaixo, pronto para colar no CRM. Não adicione comentários antes ou depois. Preencha cada seção com base no áudio. Se algo não foi mencionado, escreva "Não informado".

Template OBRIGATÓRIO (mantenha emojis, títulos e ordem):

🧾 Resumo CRM – {Nome do Lead} | {Empresa}

🎯 Cenário Atual

{Descrição do cenário atual da empresa, sistemas usados, processos.}

🔴 Principais Dores

- {dor 1}
- {dor 2}
- {dor 3}

💥 Impactos

- {impacto 1}
- {impacto 2}

⚡ Urgência

{Nível e prazo de urgência mencionado pelo lead.}

👥 Autoridade

{Cargo, papel e nível de decisão do lead.}

💡 Fit OXY
- {fit 1}
- {fit 2}
- {fit 3}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
    if (!ELEVENLABS_API_KEY) throw new Error("ELEVENLABS_API_KEY não configurada");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY não configurada");

    // 1) Receber áudio como corpo binário cru (evita issues de multipart no gateway)
    const contentType = req.headers.get("content-type") || "audio/webm";
    const filename = req.headers.get("x-filename") || "audio.webm";
    const audioBuffer = await req.arrayBuffer();
    if (!audioBuffer.byteLength) throw new Error("Arquivo de áudio é obrigatório");
    const audioBlob = new Blob([audioBuffer], { type: contentType });

    // 2) Transcrever com ElevenLabs Scribe
    const sttForm = new FormData();
    sttForm.append("file", audioBlob, filename);
    sttForm.append("model_id", "scribe_v2");
    sttForm.append("language_code", "por");
    sttForm.append("diarize", "true");

    const sttRes = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST",
      headers: { "xi-api-key": ELEVENLABS_API_KEY },
      body: sttForm,
    });
    if (!sttRes.ok) {
      const t = await sttRes.text();
      console.error("ElevenLabs STT error:", sttRes.status, t);
      throw new Error(`Transcrição falhou (${sttRes.status}): ${t.slice(0, 200)}`);
    }
    const sttData = await sttRes.json();
    const transcript: string = sttData.text || "";
    if (!transcript.trim()) throw new Error("Não foi possível transcrever o áudio");

    // 3) Gerar resumo CRM com Lovable AI
    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Transcrição da cold call:\n\n${transcript}\n\nGere o resumo CRM no formato definido.` },
        ],
      }),
    });

    if (!aiRes.ok) {
      const t = await aiRes.text();
      console.error("Gateway error:", aiRes.status, t);
      if (aiRes.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições atingido. Tente novamente em instantes." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiRes.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos de IA esgotados. Adicione créditos no workspace." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway erro ${aiRes.status}`);
    }

    const data = await aiRes.json();
    const summary = data.choices?.[0]?.message?.content ?? "";

    return new Response(JSON.stringify({ summary, transcript }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("transcribe-call error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});