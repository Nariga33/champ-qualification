const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-filename",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT = `Você é um SDR sênior especialista em qualificação de cold calls B2B (metodologia BANT/SPIN).
Receberá a transcrição de uma cold call em português.

CONTEXTO FIXO DOS PAPÉIS (NÃO MISTURE):
- "Matheus" é SEMPRE o SDR/vendedor da OXY (também chamada de "O2"). Tudo que ele fala — incluindo apresentação da OXY/O2, pitch, perguntas, soluções, casos — é DISCURSO DE VENDA e NÃO deve ser tratado como dor, cenário ou contexto do lead.
- O LEAD é a outra pessoa na ligação (qualquer voz que não seja o Matheus). SOMENTE as falas do lead contam para qualificação.

Regras de extração (CRÍTICO):
1. Identifique quem é o lead pela diarização/contexto e ignore TUDO que o Matheus disser ao preencher "Cenário Atual", "Principais Dores", "Impactos", "Urgência" e "Autoridade".
2. "Principais Dores" deve conter EXCLUSIVAMENTE dores ditas pelo próprio lead sobre a empresa/operação dele. Nunca liste dores genéricas do mercado, nem dores que o Matheus sugeriu/induziu, nem benefícios da OXY/O2 invertidos como dor.
3. Se o lead não mencionou explicitamente uma dor, escreva "Não informado" — não invente nem deduza.
4. "Fit OXY" é a única seção onde você pode citar a OXY/O2: conecte a solução às dores REAIS do lead.
5. O score (BANT/SPIN) avalia o LEAD, não a performance do Matheus.

Retorne EXCLUSIVAMENTE um resumo no formato Markdown EXATAMENTE como o template abaixo, pronto para colar no CRM. Não adicione comentários antes ou depois. Se algo não foi mencionado pelo lead, escreva "Não informado".

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

    // 1) Receber áudio como corpo binário cru (evita issues de multipart no gateway)
    const contentType = req.headers.get("content-type") || "audio/webm";
    const filename = req.headers.get("x-filename") || "audio.webm";
    const audioBuffer = await req.arrayBuffer();
    if (!audioBuffer.byteLength) throw new Error("Arquivo de áudio é obrigatório");
    const audioBlob = new Blob([audioBuffer], { type: contentType });

    // 2) Transcrever — tenta ElevenLabs Scribe; fallback OpenAI Whisper; fallback final Gemini (gratuito via Lovable AI)
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
        console.log("ElevenLabs falhou — tentando fallback");
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
      if (wRes.ok) {
        const wData = await wRes.json();
        transcript = wData.text || "";
        provider = "openai-whisper";
      } else {
        const t = await wRes.text();
        console.error("OpenAI Whisper error:", wRes.status, t);
      }
    }

    // Fallback final: Gemini via Lovable AI Gateway (gratuito, sem precisar de chave extra)
    if (!transcript) {
      const bytes = new Uint8Array(audioBuffer);
      let binary = "";
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
      }
      const base64Audio = btoa(binary);
      // Normaliza mime type para o que o Gemini aceita
      let mime = contentType.split(";")[0].trim();
      if (mime === "audio/webm") mime = "audio/webm";
      else if (mime === "audio/mp3") mime = "audio/mpeg";

      const gRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: "Transcreva integralmente este áudio em português, sem comentários, apenas o texto falado." },
                { type: "input_audio", input_audio: { data: base64Audio, format: mime } },
              ],
            },
          ],
        }),
      });
      if (!gRes.ok) {
        const t = await gRes.text();
        console.error("Gemini STT error:", gRes.status, t);
        const elevenMsg = elevenError ? ` ElevenLabs ${elevenError.status}.` : "";
        throw new Error(`Falha na transcrição.${elevenMsg} Gemini ${gRes.status}: ${t.slice(0, 200)}`);
      }
      const gData = await gRes.json();
      transcript = gData.choices?.[0]?.message?.content ?? "";
      provider = "gemini";
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