## Evolução da Base de Conhecimento + Gerador de E-mails

Vou adicionar 4 grandes capacidades à área admin de Base de Conhecimento e criar um novo módulo de geração de e-mails, mantendo a arquitetura feature-based atual (`src/features/knowledge-base/`, `src/lib/*.functions.ts`).

### 1. Schema (nova migration)

**Nova tabela `knowledge_items`** (versionada, granular, com origem):
- `id`, `segment_id` (fk), `operation` (outbound/inbound), `category` (texto: discovery_required, pains, objections, etc.)
- `title`, `description`, `example`, `priority` (alta/media/baixa)
- `source` (enum: `manual` | `pdf` | `call`), `source_ref` (uuid nullable — call_analysis_id ou pdf import id)
- `status` (enum: `pending` | `active` | `inactive` | `rejected`)
- `created_by`, `approved_by`, `created_at`, `updated_at`
- RLS: admin full; authenticated SELECT só `active`.

**Nova tabela `email_templates`** (templates salvos):
- `id`, `user_id`, `segment_id`, `operation`, `objective`, `tone`, `subject`, `preview`, `body`, `created_at`. RLS por user_id + admin.

A JSONB `segments.knowledge` continua funcionando (legado/cadastro rápido manual). A tela de Base passa a unificar leitura: items da JSONB + items da nova tabela com `status='active'`. Novos itens passam por `knowledge_items` para ter origem/versionamento.

### 2. Server functions (`src/lib/knowledge.functions.ts` + novos)

- `listKnowledgeItems({ segment_id, operation, status?, source?, category?, search? })`
- `upsertKnowledgeItem`, `approveKnowledgeItem`, `rejectKnowledgeItem`, `setKnowledgeItemStatus`
- `importPdfPlaybook({ segment_id, base64Pdf })` — extrai texto via `pdfjs-dist` (server), envia ao Lovable AI (gemini-2.5-flash) com prompt estruturado → retorna lista de itens `pending` agrupados por categoria, persiste como `source='pdf'`, `status='pending'`.
- `suggestFromCall({ analysis_id })` — pega call_analysis, manda transcript+insights ao gemini → retorna sugestões `pending` com `source='call'`, `source_ref=analysis_id`.
- `generateEmail({ segment_id, operation, pain, stage, objective, tone, analysis_id? })` — busca apenas knowledge `active` aprovado + dados opcionais da call → gera assunto/preview/corpo via Lovable AI; **prompt restringe a usar somente dores/objeções/argumentos fornecidos**.
- `saveEmailTemplate`, `listEmailTemplates`.

### 3. UI — `src/routes/_authenticated/knowledge-base.tsx`

Reorganiza com tabs (`Tabs` shadcn):
- **Manual** — fluxo atual de edição da JSONB por segmento.
- **Importar PDF** — upload, loading, tela de revisão com lista agrupada por categoria; cada item tem Aprovar/Editar/Rejeitar; "Aprovar todos" em massa.
- **Sugestões de Calls** — lista global de itens `pending` com `source='call'`, filtros por segmento/operação; mesmo fluxo Aprovar/Editar/Rejeitar.
- **Base Ativa** — tabela unificada de itens `active` com filtros (segmento, categoria, origem, prioridade, busca textual), badge de origem, toggle ativo/inativo.

Componentes novos em `src/features/knowledge-base/`:
- `PdfImportTab.tsx`, `CallSuggestionsTab.tsx`, `ActiveBaseTab.tsx`
- `KnowledgeItemCard.tsx` (reusável: badge origem, ações)
- `ReviewList.tsx` (lista de revisão genérica)

### 4. Integração com tela de análise (`src/routes/_authenticated/index.tsx`)

Botão "Gerar conhecimento desta ligação" (apenas admin) ao lado de "Salvar análise" → chama `suggestFromCall` → toast "X sugestões criadas, revise em Base de Conhecimento > Sugestões de Calls".

### 5. Novo módulo Gerador de E-mails

Nova rota `src/routes/_authenticated/emails.tsx` + feature `src/features/emails/`:
- `EmailGeneratorForm.tsx` — selects: segmento, operação, dor principal (carregada de knowledge ativo do segmento), estágio, objetivo (prospecção/follow-up/retomada/quebra-objeção/material), tom (direto/consultivo/provocativo). Quando objetivo=follow-up, mostra select com últimas análises do usuário.
- `EmailPreview.tsx` — exibe assunto, preview, corpo; botões Copiar/Gerar nova versão/Salvar template.
- `TemplatesList.tsx` — templates salvos.

Link no header do `_authenticated` para `/emails`.

### Tecnologias / pacotes

- `pdfjs-dist` para extrair texto do PDF no server (Worker-compatível em modo legacy).
- Reusa Lovable AI Gateway (`LOVABLE_API_KEY` já configurado) com `google/gemini-2.5-flash`.

### Arquivos a criar/editar

**Criar:**
- `supabase/migrations/{ts}_knowledge_items_and_emails.sql`
- `src/lib/knowledge-items.functions.ts`
- `src/lib/emails.functions.ts`
- `src/lib/pdf-extract.server.ts`
- `src/features/knowledge-base/PdfImportTab.tsx`
- `src/features/knowledge-base/CallSuggestionsTab.tsx`
- `src/features/knowledge-base/ActiveBaseTab.tsx`
- `src/features/knowledge-base/KnowledgeItemCard.tsx`
- `src/features/emails/EmailGeneratorForm.tsx`
- `src/features/emails/EmailPreview.tsx`
- `src/features/emails/types.ts`
- `src/routes/_authenticated/emails.tsx`

**Editar:**
- `src/routes/_authenticated/knowledge-base.tsx` (adiciona tabs)
- `src/routes/_authenticated/index.tsx` (botão "Gerar conhecimento")
- `src/routes/_authenticated/route.tsx` (link header)
- `supabase/functions/transcribe-call/index.ts` (passa a buscar knowledge_items active além da JSONB para enriquecer prompt)

### Critérios de sucesso

1. Admin importa PDF → vê itens extraídos agrupados por categoria → aprova/edita/rejeita → itens viram parte ativa da base.
2. Em qualquer análise de call, admin clica "Gerar conhecimento" → sugestões aparecem na aba dedicada para revisão.
3. Cada item tem origem visível (manual/pdf/call), segmento, operação, status, autor, data.
4. Base ativa filtrável por segmento, categoria, origem, prioridade, busca.
5. Gerador produz e-mail usando **apenas** dores/objeções/argumentos com `status='active'`; follow-up usa dados da call sem inventar.
