# Integração API4Com — Fase 1+2

Conecta o discador **API4Com** ao Qualificador de Cold Calls. Origina ligações
pelo app e, ao desligar, transcreve e qualifica automaticamente a gravação dos
**dois lados** da conversa, reusando o pipeline `transcribe-call`.

## Fluxo

```
[Ligar no app] → Edge Function `dial` → POST /api/v1/dialer (API4Com)
   API4Com toca no ramal do SDR → conecta no lead → ao desligar:
API4Com → channel-hangup → Edge Function `api4com-webhook`
   → baixa recordUrl (2 lados) → transcribe-call → call_analyses
   → aparece no /history
```

A `metadata` enviada no `dial` (userId, segmentId, company, operation) volta no
webhook, então não há tabela intermediária — o webhook reconstrói o contexto.

## O que foi adicionado

| Arquivo | Função |
|---|---|
| `supabase/functions/dial/` | Origina a ligação (token só no servidor; exige sessão) |
| `supabase/functions/api4com-webhook/` | Recebe `channel-hangup`, baixa gravação, qualifica, salva |
| `supabase/migrations/20260604170000_*.sql` | `profiles.api4com_extension` + campos de rastreio em `call_analyses` |
| `src/routes/_authenticated/index.tsx` | Campo de telefone + botão **Ligar** |
| `supabase/config.toml` | Registra as duas funções (`dial` com JWT, webhook sem) |

## Setup

1. **Migrar o banco**
   ```bash
   supabase db push
   ```

2. **Secrets das functions**
   ```bash
   supabase secrets set \
     API4COM_TOKEN="<bearer-token-da-api4com>" \
     API4COM_BASE_URL="https://api.api4com.com" \
     API4COM_WEBHOOK_SECRET="$(openssl rand -hex 24)" \
     API4COM_DEFAULT_EXTENSION="<ramal-padrao-opcional>"
   ```
   > `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` são
   > injetados automaticamente pelo Supabase.

3. **Deploy das functions**
   ```bash
   supabase functions deploy dial
   supabase functions deploy api4com-webhook --no-verify-jwt
   ```

4. **Registrar o webhook no API4Com** (uma vez)

   A URL a cadastrar é:
   ```
   https://<PROJECT_REF>.supabase.co/functions/v1/api4com-webhook?secret=<API4COM_WEBHOOK_SECRET>
   ```
   > ⚠️ Testado: o token de chamadas retorna **401 em `PATCH /api/v1/integrations`**
   > — ou seja, o registro do webhook provavelmente é feito **pelo painel** da
   > API4Com (conta `joaosoares.api4com.com`), não via API. Confirme com o suporte
   > onde cadastrar a URL de callback/webhook de `channel-hangup`.

   O handler aceita tanto o formato camelCase da doc (`recordUrl`, `called`)
   quanto o snake_case da API REST (`record_url`, `to`), então funciona com
   qualquer um que o painel enviar.

5. **Ramal de cada SDR** — preencher `profiles.api4com_extension`:
   ```sql
   update public.profiles set api4com_extension = '1000' where username = 'matheus';
   ```
   (ou deixar o `API4COM_DEFAULT_EXTENSION` como fallback)

## Pré-requisitos (você)

- [ ] Token Bearer do API4Com
- [ ] Ramal(is) dos SDRs
- [ ] Confirmar com o suporte API4Com o nome do campo de webhook e se a gravação
      (`recordUrl`) exige autenticação para download

## Próxima fase (3) — near real-time (~15s)

Softphone WebRTC (SIP.js) embarcado capturando os dois MediaStreams ao vivo,
fatiando o áudio em janelas de ~15-20s que alimentam o `transcribe-call`, com
painel de qualificação atualizando durante a ligação. Não incluído nesta fase.
