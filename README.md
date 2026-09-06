# Tecnoar Atendimento

CRM de atendimento WhatsApp com inteligência artificial da **Tecnoar Freios**.

Sistema real: nenhum dado fictício, nenhuma tela de demonstração. Onde ainda não
existe informação, a interface mostra o estado vazio verdadeiro.

---

## Stack

| Camada | Tecnologia |
| --- | --- |
| Frontend | React 19 · Vite · TypeScript · Tailwind CSS 4 · React Router · TanStack Query |
| Backend | Supabase — PostgreSQL, Auth, Realtime, Row Level Security, Edge Functions (Deno) |
| Projeto Supabase | `lpexjkjjzwufebgoiqdu` |

## Como rodar

```bash
npm install
npm run dev
```

Variáveis em `.env.local` (modelo em `.env.example`):

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Scripts: `npm run dev`, `npm run build`, `npm run preview`, `npm run typecheck`.

---

## Identidade visual

| Uso | Cor |
| --- | --- |
| Azul-marinho — estrutura | `#0D1C33` |
| Azul profundo | `#002061` |
| Laranja — ações | `#FF6600` |
| Ciano — IA e tecnologia | `#00AFEF` |
| Cinza claro | `#DFDFDF` |
| Cinza médio | `#AAAFB7` |
| Branco | `#FFFFFF` |
| Fundo | `#F7F8FA` |

Tokens em `src/index.css`. Tipografia Inter. A marca oficial está em
`public/brand/` (extraída do arquivo original da Tecnoar, incluído em
`LOGOS-TECNOAR-original.pdf`).

---

## Estrutura

```
src/
  components/       UI base, layout (sidebar/topbar), gráficos
  contexts/         AuthContext (sessão, empresa, perfil)
  features/
    ai/             provedores, configuração e execuções da IA
    conversations/  atendimentos, mensagens, tempo real, envio
    customers/      CRM de clientes, dados, observações, histórico
    metrics/        dashboard e métricas
    permissions/    permissões efetivas por usuário
    team/           usuários da empresa
    whatsapp/       canais Meta e Evolution
  pages/            telas (auth + aplicação)
  routes/           guardas de sessão e de permissão
supabase/functions/  Edge Functions (Deno)
supabase/migrations/ estrutura do banco — leia o README de la antes de mexer
```

## Edge Functions

| Função | JWT | O que faz |
| --- | --- | --- |
| `send-message` | sim | Grava e entrega a mensagem pelo canal ativo, com idempotência e reenvio |
| `ai-reply` | sim | Motor da IA: contexto, classificação, resumo, dados do cliente, escalonamento |
| `ai-test` | sim | Testa de verdade a chave de um provedor de IA |
| `ai-simulate` | sim | Simulador isolado (não toca no CRM) |
| `whatsapp-webhook` | não | Recebe eventos reais da Meta e da Evolution (protegido por token secreto na URL) |
| `evolution-control` | sim | Status, QR Code, reconexão e webhook da instância Evolution |
| `team-manage` | sim | Criação de contas, convite e redefinição de senha pela gestão |

URL dos webhooks (o token aparece na tela WhatsApp para gestores):

```
https://lpexjkjjzwufebgoiqdu.supabase.co/functions/v1/whatsapp-webhook/meta/<token>
https://lpexjkjjzwufebgoiqdu.supabase.co/functions/v1/whatsapp-webhook/evolution/<token>
```

---

## Segurança

- **RLS em todas as tabelas de negócio**, isolando por empresa.
- **Permissões por usuário** (`profiles.permissions` + padrão do papel) aplicadas
  dentro das políticas RLS — bloquear no banco, não só na tela.
- **Segredos protegidos por privilégio de coluna**: `whatsapp_channels.secrets`,
  `whatsapp_channels.webhook_token` e `ai_providers.api_key` não são legíveis pelo
  papel `authenticated` nem por chamada direta à API. O front lê as views
  `whatsapp_channels_public` e `ai_providers_public`, que expõem apenas
  `has_credentials` / `has_key` e a dica da chave (`••••1234`).
- **Idempotência**: `webhook_events(provider, event_id)` e
  `messages(client_token)` impedem processamento e envio duplicados.
- **Trava da IA** (`ai_locks`) impede resposta dupla na mesma conversa.

## Migrations aplicadas

`01` fundação (empresas, perfis, RLS) · `02` hardening de funções ·
`03` CRM de clientes · `04` correção do histórico · `05` restrição do
`resolve_customer_by_phone` · `06` conversas e mensagens · `07` ações do
atendimento · `08` canais e alertas · `09` conversa iniciada pelo CRM ·
`10` provedores de IA e execuções · `11` gestão de canais e `webhook_events` ·
`12` ordem, reenvio e trava da IA · `13` funções de métricas · `14` fuso nas
métricas · `15` sistema de permissões · `16` simulador · `17` texto padrão dos
alertas · `18` proteção de segredos por coluna · `19` sinalizadores de credencial.

Os tipos do banco ficam em `src/types/database.ts` e devem ser atualizados a cada
migration. **Importante:** usar `type` (não `interface`) nas linhas das tabelas —
interfaces não satisfazem a restrição de índice exigida pelo `supabase-js`.

---

## Produção (VPS Hostinger)

Publicado em **https://srv1917456.hstgr.cloud** (VPS `srv1917456`, IP `85.209.93.22`).

A aplicação roda como container Docker (`tecnoar-crm`) servindo o build estático
com Caddy na porta 80 interna. O **Traefik que já existia na VPS** faz o HTTPS,
com certificado Let's Encrypt renovado automaticamente — nada do que já rodava no
servidor foi alterado.

```
Internet → Traefik (80/443, Let's Encrypt) → tecnoar-crm (Caddy :80) → build estático
                                           → Supabase (API, Auth, Realtime, Functions)
```

Arquivos: `Dockerfile`, `Caddyfile`, `docker-compose.yml`, `deploy.sh`,
`.env.production` (não versionado).

### Publicar uma nova versão

```bash
./deploy.sh
```

O script envia o código, reconstrói a imagem na VPS e reinicia o container.
Manualmente, o equivalente é:

```bash
ssh root@85.209.93.22 "cd /opt/tecnoar-crm && docker compose up -d --build"
```

### Comandos úteis na VPS

```bash
docker compose -f /opt/tecnoar-crm/docker-compose.yml ps       # status
docker compose -f /opt/tecnoar-crm/docker-compose.yml logs -f  # logs
docker compose -f /opt/tecnoar-crm/docker-compose.yml restart  # reiniciar
```

### Evolution API na mesma VPS

Instalada em `/opt/evolution`, publicada em **https://evo.srv1917456.hstgr.cloud**
(HTTPS pelo mesmo Traefik). Stack: `evolution-api` (v2.3.7) + PostgreSQL + Redis.

O canal já está cadastrado no CRM com a instância `tecnoar` e o webhook apontando
para a Edge Function — basta abrir WhatsApp → Evolution API → **Conectar por QR Code**
e ler o código com o celular.

```bash
docker compose -f /opt/evolution/docker-compose.yml ps
docker compose -f /opt/evolution/docker-compose.yml logs -f evolution-api
```

Credenciais em `/opt/evolution/.env` (permissão 600).

**Se o QR parar de ser gerado**, normalmente é a versão do Baileys ficando para
trás do protocolo do WhatsApp. A correção é atualizar a imagem:

```bash
cd /opt/evolution
sed -i 's|evolution-api:v2.3.7|evolution-api:latest|' docker-compose.yml
docker compose pull evolution-api && docker compose up -d
```

Detalhes que custaram para descobrir e **não devem ser revertidos**:

1. `CACHE_REDIS_SAVE_INSTANCES=false` — com `true` a instância entra em laço de
   reconexão.
2. **Não** fixar `CONFIG_SESSION_PHONE_VERSION`.
3. O webhook assina **apenas `MESSAGES_UPSERT` e `MESSAGES_UPDATE`**.
   `CONNECTION_UPDATE` e `QRCODE_UPDATED` são emitidos ~20 vezes por segundo
   enquanto a instância tenta conectar; assiná-los gerou **1.400 chamadas por
   minuto** à Edge Function e derrubou o desempenho de todo o projeto Supabase
   (consultas simples passaram de 0,1 s para 30 s). O status e o QR passam a vir
   de consultas sob demanda, e o handler ignora eventos repetidos que não mudam
   nada no banco.

### Depois de trocar o domínio

Se apontar um domínio próprio (ex.: `crm.tecnoar.com.br`), altere `SITE_DOMAIN`
em `/opt/tecnoar-crm/.env`, rode `docker compose up -d` e atualize a
**Site URL** no painel do Supabase (Authentication → URL Configuration).

---

## Regra do projeto

Nenhum dado fictício. Onde não existe informação, aparece o estado vazio real:
"Nenhum atendimento no momento", "Nenhum cliente cadastrado", "Sem dados neste
período". Mensagem só é marcada como enviada quando o provedor confirma.

## Mídia no WhatsApp (foto, vídeo, áudio, documento)

Os arquivos ficam no bucket privado `whatsapp-media`, no caminho
`<company_id>/<conversation_id>/<uuid>.<ext>`. O bucket **nunca** é público: o
navegador e os provedores acessam por URL assinada de 1 hora.

- Envio: o navegador sobe o arquivo, a Edge Function `send-message` assina a URL
  e entrega pelo provedor. Meta usa `link`; Evolution usa `/message/sendMedia`
  (e `/message/sendWhatsAppAudio` para áudio, que vai como mensagem de voz).
- Recebimento: `whatsapp-webhook/media.ts` baixa o arquivo do provedor
  (Graph API na Meta, `/chat/getBase64FromMediaMessage` na Evolution) e guarda
  no bucket. Se o download falhar, a mensagem entra **sem** o arquivo — nunca
  com um link inventado.
- As políticas de storage usam `has_permission('atendimentos.enviar')`. Não
  troque por outra chave sem conferir a lista em `src/features/permissions` —
  uma chave inexistente bloqueia todos os uploads silenciosamente.

## Exclusão definitiva (LGPD)

`erase_conversation(uuid, text)` e `erase_customer(uuid, text)` apagam de vez a
conversa/cliente, as mensagens e os arquivos, e registram a prova em
`data_erasures` (quem, quando, quantas mensagens) sem guardar o conteúdo.
Exigem a permissão `clientes.excluir`.

## Modelos de IA

`PROVIDER_MODELS` em `src/features/ai/api.ts` é só um atalho de menu — o campo
aceita qualquer identificador e quem manda é o provedor. Quando um modelo é
aposentado (foi o caso do `gemini-2.0-flash`), o erro real do provedor aparece
na tela de IA; basta escolher outro modelo no menu e testar.

## Ações de mensagem (estilo WhatsApp)

- **Reagir**: `message-action` envia a reação ao provedor e só grava em
  `message_reactions` depois da confirmação. Reação do cliente entra pelo
  webhook (`reactionMessage` na Evolution, `type: reaction` na Meta).
- **Responder**: `messages.reply_to_id` liga as duas mensagens; o provedor
  recebe `quoted` (Evolution) ou `context.message_id` (Meta), então a citação
  aparece também no aparelho do cliente.
- **Arquivar**: `set_conversation_archived` tira da caixa de entrada sem
  apagar. O filtro "Arquivados" mostra o que foi guardado.
- `messages.provider_chat_id` guarda o `remoteJid`/`wa_id`. Sem ele não dá para
  reagir nem citar depois — não remova.

## IA: tempo de resposta

Três coisas seguram a latência baixa em `_shared/ai.ts`:

1. Ajuste de raciocínio, e o nome do parâmetro **muda por família**:
   `thinkingBudget: 0` no Gemini 2.5, `thinkingLevel: 'low'` no Gemini 3,
   `reasoning_effort: 'low'` no GPT-5/o-series. Mandar o errado devolve
   *"Request contains an invalid argument"* e a IA para de responder — foi o
   que aconteceu ao aplicar `thinkingBudget` no `gemini-3.6-flash`. Por isso
   existe a repetição sem o ajuste quando o provedor devolve 400: responder
   devagar é ruim, não responder é pior.
   Medido no `gemini-3.6-flash`: 26,8s antes, 3,5s depois.
2. Teto de saída derivado de `max_reply_chars`.
3. `TIMEOUT_MS` de 20s: passou disso, o atendimento vai para um humano.

Em `ai-reply`, a resposta é entregue **antes** de gravar análise, campos,
alertas e eventos. Não inverta essa ordem: cada escrita adicionava segundos de
espera do lado do cliente.

## IA desliga sozinha quando entra humano

O gatilho `desliga_ia_ao_entrar_humano` em `messages` e a RPC
`assign_conversation` desligam `ai_enabled` naquela conversa. Reativar é sempre
decisão humana, pelo botão "Reativar IA".

## Assinatura do atendente

Mensagem de humano sai no WhatsApp com `*Nome*` na primeira linha
(`assinar()` em `_shared/outbound.ts`). O `body` gravado continua limpo, para a
bolha do CRM não repetir o nome.

## Consulta de mensagens: nada de auto-referência

`useMessages` **não** usa `reply_to:messages!messages_reply_to_id_fkey(...)`.
Esse vínculo de `messages` para `messages` depende do cache de esquema do
PostgREST; quando o cache fica velho a consulta inteira falha com `PGRST200` e
a conversa aparece **vazia** — parece que o sistema parou de registrar
mensagens. A mensagem citada é resolvida na tela, a partir das mensagens já
carregadas. Não reintroduza o embed.
