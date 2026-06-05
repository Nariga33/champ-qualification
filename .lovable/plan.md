## Objetivo

Transformar cada ligação enviada/gravada num registro permanente: áudio + transcrição diarizada + análises + estado de processamento, com regras fixas de papel (Outbound→BDR/CHAMP, Inbound→SDR/BANT) e tela de Detalhes da Call.

---

## 1. Banco de dados (migration)

**Bucket privado `call-audio`** com RLS: dono (`(storage.foldername(name))[1] = auth.uid()::text`) ou admin (`has_role`).

**Enum `call_status`**: `received | transcribing | awaiting_speaker_review | summarizing | analyzing | completed | error`.

**Enum `audio_origin`**: `upload | recording`.

**Tabela `calls`** (nova, separada de `call_analyses` que fica intacta para histórico antigo):
- `user_id`, `operation` (outbound/inbound), `commercial_role` (derivado: BDR/SDR), `qualification_model` (derivado: CHAMP/BANT)
- `segment_id`, `company`, `lead_name`, `lead_phone`, `lead_email`
- `audio_path` (storage), `audio_origin`, `audio_duration_seconds`, `audio_mime`
- `status`, `error_message`
- `transcript_segments` (jsonb: `[{start, end, speaker_raw, speaker_role: "lead"|"bdr"|"sdr", confidence, text}]`)
- `transcript_text`, `speaker_review_required` (bool), `speakers_reviewed_at`
- `summary` (text CRM), `score` (int), `classification`, `insights` (jsonb), `feedback_segments` (jsonb por trecho)

RLS: usuário vê só `auth.uid() = user_id`; admin vê tudo (via `has_role`). GRANTs para `authenticated` e `service_role`.

---

## 2. Edge function `transcribe-call` (reescrita)

Entradas:
- **`multipart/form-data`**: áudio + `operation`, `segment_id`, `company`, `lead_*`, `audio_origin` → cria `calls`, sobe áudio em `{user_id}/{call_id}.{ext}`, processa.
- **JSON `{call_id, action: "reprocess"}`**: rebaixa speakers e refaz análise sem reupload.
- **JSON `{call_id, action: "confirm_speakers", segments}`**: salva versão revisada e segue para summary/insights.

Pipeline:
1. `status='transcribing'` → ElevenLabs Scribe (`scribe_v2`, `diarize=true`).
2. Heurística: speaker com mais palavras de script de abertura → BDR/SDR (conforme `operation`); outro → Lead. Se confiança baixa → `awaiting_speaker_review`, parar.
3. `status='summarizing'` → Lovable AI gera resumo CRM apenas com falas do Lead para dores/budget/autoridade, e BDR/SDR para condução.
4. `status='analyzing'` → score CHAMP (outbound) ou BANT (inbound) + insights + feedback por trecho.
5. `status='completed'`. Erro → `status='error'`, áudio preservado, mensagem em `error_message`.

---

## 3. Server functions (`src/lib/calls.functions.ts`)
- `listCalls(filters)` — empresa, lead, usuário, operação, segmento, status, período.
- `getCall(id)` — retorna call + signed URL do áudio (1h).
- `confirmSpeakers(call_id, segments)` — chama edge `confirm_speakers`.
- `reprocessCall(call_id)` — chama edge `reprocess`.
- `deleteCall(id)` — admin ou dono.

`auth.functions.ts`: `getMyProfile` retorna `commercial_role` e `qualification_model` derivados de `operation`.

---

## 4. Frontend (`src/features/calls/`)

**Componentes reutilizáveis**:
- `OperationRoleBadge.tsx` — renderiza "Outbound — BDR — CHAMP" / "Inbound — SDR — BANT".
- `CallStatusBadge.tsx` — chips coloridos por status.
- `TranscriptView.tsx` — formato conversa, filtro por speaker, balões Lead/BDR/SDR.
- `SpeakerReviewDialog.tsx` — corrigir rótulos antes do resumo.
- `CallAudioPlayer.tsx` — player fixo com signed URL.
- `CallFilters.tsx`, `CallListItem.tsx`.

**Rotas**:
- `_authenticated/index.tsx` — substituir uso de localStorage: upload/gravação grava em `calls` e redireciona para detalhes quando concluído (ou review se necessário).
- `_authenticated/history.tsx` — listar `calls` com novos filtros (mantém análises antigas em aba separada se necessário).
- `_authenticated/calls.$id.tsx` (novo) — Detalhes: player, transcrição filtrada, resumo copiável, insights, feedback, botão "Reprocessar".
- `_authenticated/admin.tsx` — no form de usuário, só "Outbound" ou "Inbound"; mostra tag derivada.

---

## 5. Segurança & permissões
- Storage policies por prefixo `{user_id}/`; admin via `has_role`.
- Signed URLs apenas para usuários autorizados (server fn checa ownership/admin).
- Sem URLs públicas para áudio.

---

## 6. Fora de escopo
- Seek bidirecional transcrição↔áudio (waveform sync).
- Treinamento custom de diarização.
- Migração dos registros antigos de `call_analyses` para `calls` (ficam coexistindo; histórico novo passa a usar `calls`).
- Export em massa.

---

## Estrutura técnica

```
src/
├── features/calls/
│   ├── types.ts
│   ├── OperationRoleBadge.tsx
│   ├── CallStatusBadge.tsx
│   ├── CallAudioPlayer.tsx
│   ├── TranscriptView.tsx
│   ├── SpeakerReviewDialog.tsx
│   ├── CallFilters.tsx
│   └── CallListItem.tsx
├── lib/calls.functions.ts
├── routes/_authenticated/
│   ├── calls.$id.tsx        (novo)
│   ├── history.tsx          (refeito sobre `calls`)
│   └── index.tsx            (upload/gravação → `calls`)
└── supabase/functions/transcribe-call/index.ts  (reescrita)
```

Após aprovação, executo migration → reescrita da edge function → server fns → componentes/rotas.