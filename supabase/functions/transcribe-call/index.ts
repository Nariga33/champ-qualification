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
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY não configurada");
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

    if (!ELEVENLABS_API_KEY && !OPENAI_API_KEY) {
      throw new Error("Nenhum provedor de transcrição configurado (ELEVENLABS_API_KEY ou OPENAI_API_KEY)");
    }

    // 1) Receber áudio como corpo binário cru (evita issues de multipart no gateway)
    const contentType = req.headers.get("content-type") || "audio/webm";
    const filename = req.headers.get("x-filename") || "audio.webm";
    const audioBuffer = await req.arrayBuffer();
    if (!audioBuffer.byteLength) throw new Error("Arquivo de áudio é obrigatório");
    const audioBlob = new Blob([audioBuffer], { type: contentType });

    // 2) Transcrever — tenta ElevenLabs Scribe e faz fallback para OpenAI Whisper
    let transcript = "";
    let provider = "";
    let elevenError: { status: number; body: string } | null = null;

    if (ELEVENLABS_API_KEY) {
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

      if (sttRes.ok) {
        const sttData = await sttRes.json();
        transcript = sttData.text || "";
        provider = "elevenlabs";
      } else {
        const t = await sttRes.text();
        console.error("ElevenLabs STT error:", sttRes.status, t);
        elevenError = { status: sttRes.status, body: t };

        const isPermissionError =
          sttRes.status === 401 ||
          sttRes.status === 403 ||
          /missing_permissions|permission/i.test(t);

        if (!isPermissionError || !OPENAI_API_KEY) {
          if (isPermissionError && !OPENAI_API_KEY) {
            throw new Error(
              "A chave do ElevenLabs não tem permissão de Speech to Text e não há fallback configurado. " +
              "Habilite 'Speech to Text' em https://elevenlabs.io/app/settings/api-keys e reconecte, " +
              "ou configure OPENAI_API_KEY para usar o Whisper como fallback."
            );
          }
          throw new Error(`Transcrição falhou (${sttRes.status}): ${t.slice(0, 200)}`);
        }
        console.log("ElevenLabs sem permissão — usando fallback Whisper");
      }
    }

    if (!transcript && OPENAI_API_KEY) {
      const whisperForm = new FormData();
      whisperForm.append("file", audioBlob, filename);
      whisperForm.append("model", "whisper-1");
      whisperForm.append("language", "pt");

      const wRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
        body: whisperForm,
      });
      if (!wRes.ok) {
        const t = await wRes.text();
        console.error("OpenAI Whisper error:", wRes.status, t);
        const elevenMsg = elevenError ? ` (ElevenLabs ${elevenError.status})` : "";
        throw new Error(`Fallback Whisper falhou (${wRes.status})${elevenMsg}: ${t.slice(0, 200)}`);
      }
      const wData = await wRes.json();
      transcript = wData.text || "";
      provider = "openai-whisper";
    }

    if (!transcript.trim()) throw new Error("Não foi possível transcrever o áudio");
    console.log(`Transcrição via ${provider}`);

    // 3) Gerar resumo CRM + qualificação (score 0-100 + classificação) via tool calling
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
          {
            role: "user",
            content:
              `Transcrição da cold call:\n\n${transcript}\n\n` +
              `Gere:\n` +
              `1) summary: o resumo CRM no formato definido (Markdown com emojis).\n` +
              `2) score: nota de 0 a 100 da qualidade do lead (BANT/SPIN — Budget, Authority, Need, Timing, fit, urgência, dor clara).\n` +
              `3) classification: "Quente" (>=70), "Morno" (40-69) ou "Frio" (<40).\n` +
              `4) score_reasoning: 1-2 frases curtas justificando a nota.`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "qualify_cold_call",
              description: "Retorna o resumo CRM e a qualificação do lead.",
              parameters: {
                type: "object",
                properties: {
                  summary: { type: "string", description: "Resumo CRM em Markdown no template definido." },
                  score: { type: "integer", minimum: 0, maximum: 100 },
                  classification: { type: "string", enum: ["Quente", "Morno", "Frio"] },
                  score_reasoning: { type: "string" },
                },
                required: ["summary", "score", "classification", "score_reasoning"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "qualify_cold_call" } },
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
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    let summary = "";
    let score = 0;
    let classification: "Quente" | "Morno" | "Frio" = "Frio";
    let score_reasoning = "";
    try {
      const args = JSON.parse(toolCall?.function?.arguments ?? "{}");
      summary = args.summary ?? "";
      score = Math.max(0, Math.min(100, Number(args.score) || 0));
      classification = args.classification ?? (score >= 70 ? "Quente" : score >= 40 ? "Morno" : "Frio");
      score_reasoning = args.score_reasoning ?? "";
    } catch (err) {
      console.error("Failed to parse tool call args:", err);
      summary = data.choices?.[0]?.message?.content ?? "";
    }

    return new Response(JSON.stringify({ summary, score, classification, score_reasoning, transcript, provider }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("transcribe-call error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});