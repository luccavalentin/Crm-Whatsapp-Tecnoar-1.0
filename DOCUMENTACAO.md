# Documentação do sistema — Tecnoar Atendimento

CRM de atendimento por WhatsApp com atendimento automático por inteligência
artificial, feito para a **Tecnoar Freios** (oficina de freios e ar comprimido
de caminhão).

Este documento descreve o sistema inteiro: o que ele faz, como está montado,
como cada parte conversa com as outras, como operar no dia a dia e como
publicar mudanças.

- **Produção:** https://crmwhatstecnoar.tech
- **Banco e funções:** Supabase, projeto `lpexjkjjzwufebgoiqdu` (sa-east-1)
- **Gateway de WhatsApp:** Evolution API v2 (`https://evo.srv1950838.hstgr.cloud`)

---

## Sumário

1. [Visão geral](#1-visão-geral)
2. [Arquitetura](#2-arquitetura)
3. [Fluxo de uma mensagem](#3-fluxo-de-uma-mensagem)
4. [Modelo de dados](#4-modelo-de-dados)
5. [Segurança e permissões](#5-segurança-e-permissões)
6. [O motor de IA](#6-o-motor-de-ia)
7. [Funções de borda](#7-funções-de-borda)
8. [Aplicação web (telas)](#8-aplicação-web-telas)
9. [Design system](#9-design-system)
10. [Integração com o WhatsApp](#10-integração-com-o-whatsapp)
11. [Ambiente e variáveis](#11-ambiente-e-variáveis)
12. [Rodar localmente](#12-rodar-localmente)
13. [Testes e avaliação](#13-testes-e-avaliação)
14. [Publicação (deploy)](#14-publicação-deploy)
15. [Operação: problemas comuns](#15-operação-problemas-comuns)
16. [Limites conhecidos e próximos passos](#16-limites-conhecidos-e-próximos-passos)

---

## 1. Visão geral

O sistema faz três coisas:

1. **Atende** — recebe as mensagens que chegam no WhatsApp da oficina e
   responde automaticamente, com linguagem natural, no papel de atendente da
   Tecnoar. Sabe o que a empresa faz, o que ela cobra por informar, onde fica,
   e entende de freio e ar comprimido de caminhão a ponto de conversar sobre o
   sintoma que o motorista descreve.
2. **Classifica** — a cada resposta, registra intenção, etapa do funil,
   temperatura do lead, sistema do veículo envolvido, urgência e etiquetas. É
   isso que alimenta o Kanban, as métricas e o alerta de emergência.
3. **Entrega para uma pessoa** — quando o assunto sai do que a IA pode
   resolver (preço fechado, negociação, reclamação, socorro na estrada), ela
   marca a conversa como `aguardando_humano` e a equipe assume pelo painel,
   que é um WhatsApp Web completo dentro do CRM.

Princípio que atravessa o sistema inteiro: **nada é fictício**. Não existe
tela de demonstração, dado semeado ou número inventado. Onde ainda não há
informação, a interface mostra o estado vazio verdadeiro.

---

## 2. Arquitetura

```
  Cliente no WhatsApp
          │
          ▼
   Evolution API  ──(webhook)──►  whatsapp-webhook  ─────┐
   (Baileys, VPS)                 (função de borda)      │
          ▲                                              ▼
          │                                        Postgres (Supabase)
          │                                     conversations / messages
          │                                              │
          │                                              │ dispara
          │                                              ▼
          └──────(envio)──────  ai-reply  ◄─── motor de IA (_shared/ai.ts)
                                   │              Anthropic / OpenAI / Gemini
                                   │
                                   ▼
                              Realtime  ──►  React (SPA) no navegador
                                                Traefik + Caddy, VPS
```

| Camada | Tecnologia |
| --- | --- |
| Frontend | React 19 · Vite 7 · TypeScript · Tailwind CSS 4 · React Router 7 · TanStack Query |
| Backend | Supabase — PostgreSQL, Auth, Realtime, Row Level Security, Edge Functions (Deno) |
| Gateway WhatsApp | Evolution API v2.3.7 (Baileys) — alternativa: API oficial da Meta |
| IA | Anthropic, OpenAI ou Google Gemini — intercambiáveis |
| Hospedagem | VPS Hostinger, Docker + Traefik (rede `borda`), TLS Let's Encrypt |

A mesma VPS hospeda outro sistema em produção (**checklist-tecnoar**) e a
stack da Evolution. Nomes de container, imagem e roteador do Traefik são
únicos por projeto **de propósito** — nome repetido faz o Docker adotar o
container alheio ou o Traefik sobrescrever a rota de outro sistema.

---

## 3. Fluxo de uma mensagem

1. **Chegada.** A Evolution entrega o evento em
   `POST /whatsapp-webhook/evolution/<webhook_token>`. O token identifica o
   canal e é secreto. Se o canal tiver segredo de webhook configurado, o
   cabeçalho `apikey` é conferido com comparação de tempo constante.
2. **Persistência.** A função encontra ou cria o `customer` pelo telefone
   normalizado, encontra ou abre a `conversation`, grava a `message` como
   `inbound`, e registra o evento bruto em `webhook_events` para auditoria.
3. **Disparo da IA.** Se a conversa está com a IA ligada, `ai-reply` é
   chamada.
4. **Trava.** `ai-reply` pega uma trava por conversa (`try_lock_ai`, TTL de
   2 minutos) **antes** de carregar o contexto. Duas mensagens simultâneas não
   geram duas respostas.
5. **Janela de rajada.** Espera até 6 s (`JANELA_RAJADA_MS`), com até 2
   extensões, para o caso de o cliente estar mandando a frase em pedaços.
   Responde ao conjunto, não a cada linha.
6. **Leitura de mídia.** Áudio, imagem e documento pendentes são lidos e
   transcritos (`_shared/transcribe.ts`) antes de entrar no prompt.
7. **Teto de gasto.** `_shared/limites.ts` verifica `max_replies_per_hour` e
   `daily_token_budget`. Estourado, a conversa vai para `aguardando_humano` em
   vez de continuar gastando.
8. **Chamada ao modelo.** Até 3 passos (`MAX_PASSOS`), prazo total de 30 s
   (`PRAZO_TOTAL_MS`, abaixo do TTL da trava). Falha passageira é repetida com
   recuo; falha do provedor principal cai para o de reserva.
9. **Resposta.** A saída vem em JSON estruturado e validado. O texto é
   quebrado em partes naturais; entre elas o sistema sinaliza "digitando"
   (`sinalizarDigitando`) e espera um tempo proporcional ao tamanho
   (`tempoDeDigitar`, teto de 7 s) — é o que faz o atendimento parecer humano.
10. **Classificação.** Intenção, etapa, temperatura, sistema do veículo,
    urgência e etiquetas são gravados na conversa; a execução vai para
    `ai_runs` (tokens, custo, latência, provedor, modelo).
11. **Emergência.** Se a triagem indicar risco (freio sem funcionar, caminhão
    parado na estrada), o alerta é disparado para os `emergency_contacts`.
12. **Tela.** O Realtime do Supabase empurra a mensagem para o painel; ninguém
    precisa recarregar nada.

---

## 4. Modelo de dados

O schema vive no projeto Supabase. Os tipos de todas as tabelas estão em
[`src/types/database.ts`](src/types/database.ts) — essa é a referência
canônica no repositório.

### Núcleo

| Tabela | Papel |
| --- | --- |
| `companies` | A empresa (multiempresa desde a origem; hoje só a Tecnoar). |
| `profiles` | Usuários do CRM: papel, status, permissões. |
| `customers` | Clientes, chaveados por telefone normalizado. |
| `customer_fields` | Campos livres do cliente (placa, frota, CNPJ…), cada um com a origem: `ia`, `whatsapp`, `manual` ou `sistema`. |
| `customer_notes` / `customer_events` | Anotações da equipe e histórico. |

### Conversa

| Tabela | Papel |
| --- | --- |
| `conversations` | Status, prioridade, etapa do funil, temperatura, responsável, IA ligada/desligada. |
| `messages` | Direção, remetente (`cliente`/`ia`/`atendente`/`sistema`), tipo, status de entrega, mídia, resposta citada. |
| `message_reactions` | Reações emoji — gravadas só depois que o provedor confirma. |
| `conversation_events` | Linha do tempo: transferências, IA desligada, escalonamento. |
| `tags` / `conversation_tags` | Etiquetas criadas e editadas pelo gestor. |

**Status da conversa:** `novo` → `ia` → `aguardando_humano` →
`em_atendimento` → `concluido`.
**Prioridade:** `baixa`, `normal`, `alta`, `emergencia`.

### Inteligência artificial

| Tabela | Papel |
| --- | --- |
| `ai_providers` | Chaves de API, papel (`principal`/`reserva`/`inativo`), modelo. Chave nunca sai do servidor; a tela lê a view `ai_providers_public`. |
| `ai_settings` | Tom, limites de gasto, comportamento, horário. |
| `ai_runs` | Uma linha por execução: tokens, custo, latência, provedor, modelo, resultado. Base das métricas de IA. |
| `ai_simulations` | Conversas do simulador — isoladas, não tocam em cliente, conversa, métrica nem Kanban. |
| `ai_learning_queue` | Perguntas que a IA não soube responder, para o gestor transformar em conhecimento. |
| `company_knowledge` / `knowledge_faq` | Base oficial da empresa: os fatos que a IA pode afirmar. |

### Canal e emergência

| Tabela | Papel |
| --- | --- |
| `whatsapp_channels` | Provedor (`meta`/`evolution`), credenciais, status, token e segredo de webhook. A tela lê `whatsapp_channels_public` — segredos não trafegam. |
| `webhook_events` | Todo evento recebido, cru, para auditoria. |
| `emergency_contacts` / `emergency_dispatches` | Quem é avisado em emergência e o que já foi disparado. |
| `workspace_labels` | Rótulos que o gestor renomeia (etapas do funil, por exemplo). |

### Funções no banco

- `my_permissions()` — permissões efetivas do usuário logado.
- `default_permissions(role)` — padrão por papel (espelhado no frontend).
- `try_lock_ai(conversation_id)` — trava de resposta, TTL 2 min.
- `ai_tokens_hoje()` — consumo do dia, para o teto de gasto.
- `metrics_serie(...)` / `metrics_breakdown(...)` — séries e recortes dos
  relatórios, com comparação entre períodos.

---

## 5. Segurança e permissões

**Row Level Security em todas as tabelas.** Toda leitura e escrita é filtrada
por `company_id`; nenhum dado atravessa empresas.

**Papéis** (`UserRole`): `owner`, `admin`, `manager`, `agent`.

**Permissões granulares** — a lista completa está em
[`src/features/permissions/index.ts`](src/features/permissions/index.ts) e é
espelhada por `public.default_permissions` no banco. São 10 áreas
(Dashboard, Atendimentos, Kanban, Clientes, Métricas, IA, Simulador, Equipe,
WhatsApp, Configurações) com ações individuais — por exemplo
`atendimentos.desligar_ia`, `clientes.excluir`, `whatsapp.gerenciar`.

Padrão por papel:

| Papel | Recebe |
| --- | --- |
| `owner` / `admin` | Tudo. |
| `manager` | Tudo, exceto `whatsapp.gerenciar` e `configuracoes.gerenciar`. |
| `agent` | Atendimento, Kanban e cadastro/edição de clientes. Não exclui, não configura. |

O gestor pode ajustar permissão por usuário na tela **Equipe**; o padrão do
papel é só o ponto de partida.

**Segredos.** Chaves de IA e credenciais do WhatsApp ficam em tabelas que o
cliente não lê — o frontend consome as views `ai_providers_public` e
`whatsapp_channels_public`, que expõem tudo menos o segredo. As chamadas que
precisam da chave rodam em função de borda, com a `service_role`.

**Funções `SECURITY DEFINER`** têm `EXECUTE` revogado de `anon` e conferem o
chamador internamente.

**Webhook.** A URL já carrega um token secreto por canal. Com o segredo de
webhook configurado, a Evolution precisa mandá-lo no cabeçalho `apikey` — sem
isso, quem descobrir o endereço consegue se passar por cliente e disparar
resposta da IA e alerta de emergência.

---

## 6. O motor de IA

Todo o motor está em
[`supabase/functions/_shared/ai.ts`](supabase/functions/_shared/ai.ts).

### Independência de provedor

O mesmo comportamento sai de qualquer um dos três provedores, porque a saída
estruturada é imposta no formato nativo de cada um:

| Provedor | Como a estrutura é forçada |
| --- | --- |
| Anthropic | `tools` + `tool_choice` |
| OpenAI | `response_format: json_schema`, modo estrito |
| Gemini | `responseSchema` (esquema convertido por `paraGemini()`) |

Trocar de chave não muda a qualidade do atendimento — muda só o custo e a
latência. Há provedor **principal** e **reserva**: falha do primeiro cai
automaticamente para o segundo.

### O que a IA devolve

```
reply              texto da resposta
reply_partes       o mesmo texto quebrado em mensagens naturais
intent             uma de 16 intenções
funnel_stage       uma de 11 etapas
temperature        quente | morno | frio | fora_do_contexto
sistema            freio | ar_comprimido | suspensao_pneumatica |
                   motor | eletrica | outro | nao_identificado
urgencia           triagem técnica
tags               etiquetas sugeridas (deduplicadas)
campos             dados do cliente descobertos na conversa
escalar            se precisa de gente
```

**Intenções:** `endereco`, `horario`, `servicos`, `especialidades`,
`socorro_24h`, `regiao_atendimento`, `orcamento`, `preco`, `agendamento`,
`status_os`, `garantia`, `reclamacao`, `emergencia_freio`,
`diagnostico_sintoma`, `humano`, `fora_de_contexto`.

**Etapas do funil:** `novo_contato`, `qualificando`, `precisa_socorro`,
`quer_orcamento`, `aguardando_dados`, `aguardando_humano`,
`agendamento_pendente`, `os_em_andamento`, `pos_venda`, `perdido`,
`fora_do_perfil`.

### A regra que sustenta a confiabilidade

O prompt separa duas fontes, e a separação é explícita:

- **(A) Fatos desta empresa** — endereço, horário, serviços, preços, garantia.
  Só o que está na base oficial (`company_knowledge`, `knowledge_faq`). A IA
  **não pode inventar nem deduzir** nada aqui. Não sabendo, ela diz que vai
  confirmar e escala.
- **(B) Conhecimento técnico do ramo** — freio a ar, pneumática, sintoma e
  causa provável. Isso a IA sabe e **deve** usar, sempre em linguagem de
  probabilidade ("normalmente é…", "costuma ser…"), nunca como laudo.

É essa separação que permite a IA ser especialista sem mentir sobre a
empresa.

### Como ela escreve

- Frases curtas, português de oficina, sem jargão corporativo. Há uma lista de
  expressões proibidas ("prezado cliente", "estamos à disposição", "conforme
  solicitado").
- Mensagem longa é quebrada em partes, com "digitando" entre elas.
- Pergunta, de forma cordial, como a pessoa prefere ser chamada. Se ela não
  responder, usa o nome do WhatsApp (`whatsapp_name`). Nunca insiste.
- Oito exemplos guiados (few-shot) fixam o tom.

**Sobre ser automática:** perguntada diretamente se é um robô, ela assume que
é atendimento automático e oferece uma pessoa. Negar seria mentir para o
cliente e viola a política do WhatsApp Business — conta negando isso corre
risco de banimento. O que o sistema busca é atendimento *natural*, não
disfarce.

### Ajuste sem programador

Tudo o que muda o comportamento da IA está na interface: base de conhecimento,
FAQ, tom, limites de gasto, provedor, modelo, fila de aprendizado. O
**Simulador** roda o motor real contra uma conversa de teste sem tocar em
nenhum dado de produção.

---

## 7. Funções de borda

Em `supabase/functions/`. Código comum em `_shared/`.

| Função | O que faz | JWT |
| --- | --- | --- |
| `whatsapp-webhook` | Recebe eventos reais dos provedores. Rota `/<provedor>/<webhook_token>`. | não (token próprio) |
| `ai-reply` | Orquestra a resposta: trava, rajada, mídia, limites, modelo, envio, classificação. | não (token próprio) |
| `ai-simulate` | Mesmo motor, gravando só em `ai_simulations`. | sim |
| `ai-test` | Testa de verdade a chave de um provedor. | sim |
| `send-message` | Envia mensagem da equipe pelo canal ativo. | sim |
| `message-action` | Reação emoji; grava só após confirmação do provedor. | sim |
| `evolution-control` | Instância, status, QR Code, reconectar, desconectar, registrar webhook. Nada simulado. | sim |
| `team-manage` | Criação de contas da equipe. Exige `equipe.gerenciar`. | sim |

Compartilhado: `ai.ts` (motor), `providers.ts` (envio e "digitando"),
`knowledge.ts` (seleção de FAQ), `transcribe.ts` (mídia), `limites.ts` (teto
de gasto), `emergency.ts`, `outbound.ts`, `supabase.ts`, `cors.ts`.

---

## 8. Aplicação web (telas)

Rotas em [`src/App.tsx`](src/App.tsx). Toda rota do app exige sessão
(`RequireAuth`) e a permissão da área.

| Rota | Tela | Para que serve |
| --- | --- | --- |
| `/dashboard` | Dashboard | Panorama do dia: fila, emergências, movimento. |
| `/atendimentos` | Atendimentos | O painel de conversa — WhatsApp Web completo: lista, busca, balões, mídia, áudio, resposta citada, reações, emojis, indicador de digitação, assumir/transferir, desligar a IA. |
| `/kanban` | Kanban | Conversas por etapa do funil; cada coluna explica ao usuário o que aquela etapa significa. |
| `/clientes` · `/clientes/:id` | Clientes | Cadastro, campos livres com origem, anotações, histórico, exclusão (restrita). |
| `/metricas` | Métricas e Relatórios | Séries, comparação entre períodos, recortes por intenção/etapa/triagem, evolução no tempo, impressão com logo e cores oficiais. |
| `/ia` | Inteligência artificial | Provedores e chaves, modelo, tom, limites, base de conhecimento, FAQ, fila de aprendizado. |
| `/simulador` | Simulador | Conversar com a IA sem afetar produção. |
| `/equipe` | Equipe | Usuários, papéis e permissões — criar, editar e desativar. |
| `/whatsapp` | WhatsApp | Canal, credenciais, QR Code, status, webhook. |
| `/configuracoes` | Configurações | Empresa, etiquetas, emergência, aparência. Abre direto na aba via `?aba=`. |

Autenticação: `/login`, `/criar-conta`, `/recuperar-senha`,
`/redefinir-senha`, `/alterar-senha`.

Cada `feature` em `src/features/` concentra as queries e mutações da sua área
(TanStack Query); os componentes em `src/components/` são de apresentação.

---

## 9. Design system

Tudo em [`src/index.css`](src/index.css), com tokens do Tailwind 4 (`@theme`).

- **Marca:** azul-marinho `#0D1C33` (estrutura), azul profundo `#002061`,
  laranja `#FF6600` (ação), ciano e aço como apoio.
- **Tokens semânticos:** `--color-ink`, `--color-ink-soft`, `--color-muted`,
  `--color-surface`, `--color-canvas`, `--color-line`, `--color-link` — a
  interface nunca usa cor crua, sempre o token.
- **Tema escuro:** os mesmos tokens são redefinidos em
  `:root[data-theme='dark']` e em `@media (prefers-color-scheme: dark)`. A
  escolha explícita do usuário vence a do sistema.
- **Balões do chat:** `--color-bubble-in` / `--color-bubble-out`.
- **Gráficos:** paleta de 3 cores validada para daltonismo e contraste.
- **Tipografia:** escala de 8 passos, cada uma com altura de linha e
  entreletras pareadas.
- **Empilhamento:** existe uma escala de `z-index` documentada no arquivo.
  Atenção: `backdrop-filter` cria contexto de empilhamento próprio — foi a
  causa do bug de menus aparecerem atrás das conversas.
- **Impressão:** folha própria (`@media print`, `.somente-impressao`,
  `[data-bloco-impressao]`) com cores forçadas, para os relatórios saírem no
  papel com a identidade da empresa.

---

## 10. Integração com o WhatsApp

Dois provedores possíveis. Hoje em uso: **Evolution**.

### Evolution API (em uso)

1. Em **WhatsApp**, cadastrar: URL `https://evo.srv1950838.hstgr.cloud`,
   nome da instância (`tecnoar`) e a API Key.
2. Salvar. O sistema cria a instância e registra o webhook sozinho.
3. Ler o QR Code pelo celular da oficina.
4. Opcional, recomendado: definir o segredo de webhook e cadastrar o mesmo
   valor na Evolution como cabeçalho `apikey`.

Trocar o canal (excluir e recriar) gera **token de webhook novo** — o webhook
precisa ser reapontado. A tela faz isso ao salvar.

### API oficial da Meta

Suportada pelo mesmo código (`ChannelProvider = 'meta'`). Diferença relevante:
a Meta não tem endpoint de "digitando", então esse sinal só existe na
Evolution.

---

## 11. Ambiente e variáveis

Frontend (`.env.local` em desenvolvimento, `.env.production` no deploy —
modelo em `.env.example`):

```
VITE_SUPABASE_URL=https://lpexjkjjzwufebgoiqdu.supabase.co
VITE_SUPABASE_ANON_KEY=<chave publicável>
SITE_DOMAIN=crmwhatstecnoar.tech
```

Nenhum segredo entra no pacote do frontend: a chave publicável só funciona
sob RLS. Chaves de IA e credenciais do WhatsApp ficam no banco, lidas
exclusivamente pelas funções de borda.

Para publicar funções, o token pessoal do Supabase vai no ambiente do shell
(`SUPABASE_ACCESS_TOKEN`) — nunca em arquivo versionado.

---

## 12. Rodar localmente

```bash
npm install
npm run dev
```

| Comando | Faz |
| --- | --- |
| `npm run dev` | Servidor de desenvolvimento. |
| `npm run build` | Checagem de tipos + build de produção. |
| `npm run preview` | Serve o build. |
| `npm run typecheck` | Só os tipos. |
| `npm run teste` | Testes unitários. |
| `npm run teste:watch` | Testes em observação. |
| `npm run avaliar` | Avaliação da IA — **consome chave real e gasta crédito**. |

---

## 13. Testes e avaliação

**Unitários** (`testes/`, Vitest): 42 testes cobrindo o motor de IA
(`ia.test.ts` — validação e normalização da saída, deduplicação de etiquetas,
corte no limite) e a normalização de telefone (`telefone.test.ts`).

**Avaliação de qualidade** (`avaliacao/`): 16 conversas de referência em
`conversas.json` e o executor `rodar.mjs`, que roda o motor real e verifica,
entre outras coisas, um detector de linguagem corporativa — resposta com
jargão é reprovada. Precisa de chave real; não roda em CI.

**Integração contínua:** `.github/workflows/verificacao.yml` roda tipos e
testes unitários.

---

## 14. Publicação (deploy)

### Aplicação web

```bash
./deploy.sh
```

O script:

- toca **um único diretório**, `/opt/crm-whats-tecnoar`;
- **aborta** se a rede `borda` não existir (Traefik fora do ar — subir assim
  deixaria o site inacessível sem ninguém perceber);
- **aborta** se o nome do container pertencer a outro projeto Docker;
- envia o código, constrói a imagem, sobe o container e confere o HTTP 200
  público (o certificado pode levar ~30 s na primeira vez).

Ele **não encosta** na Evolution nem no checklist. Um `docker compose up` na
Evolution recriaria os containers e derrubaria a sessão do WhatsApp no meio de
um atendimento.

### Funções de borda

```bash
export SUPABASE_ACCESS_TOKEN="seu-token"   # supabase.com/dashboard/account/tokens
bash deploy-funcoes.sh                     # todas
bash deploy-funcoes.sh ai-reply            # só uma
```

`whatsapp-webhook` e `ai-reply` sobem com `--no-verify-jwt`: são chamadas por
serviço externo, sem JWT de usuário, e autenticam por token próprio dentro da
função.

### Banco

Migrações em `supabase/migrations/`, aplicadas pelo painel ou pela CLI do
Supabase.

---

## 15. Operação: problemas comuns

| Sintoma | Causa provável | O que fazer |
| --- | --- | --- |
| IA parou de responder | Teto de gasto estourado, ou chave inválida | Ver **IA → provedores** (testar a chave) e os limites em Configurações. |
| "Unauthorized" na tela do WhatsApp | API Key da Evolution errada ou rotacionada | Reeditar a integração com a chave correta. |
| Mensagens chegam mas a IA não responde | Webhook desapontado após recriar o canal | Salvar de novo a integração — isso reregistra o webhook. |
| Conversa travada sem resposta | Trava de IA presa | Ela expira sozinha em 2 minutos. |
| Site fora do ar após deploy | Traefik/rede `borda` | `ssh <vps> 'docker logs crm-whats-tecnoar --tail 50'`. |
| Schema "sumiu" no Supabase | Projeto em `COMING_UP` após restauração | Esperar `ACTIVE_HEALTHY` e consultar de novo. |

---

## 16. Limites conhecidos e próximos passos

**Pendências operacionais**

- **O canal do WhatsApp está `desconectado` e o webhook aponta para um token
  velho.** A Evolution está entregando eventos em um `webhook_token` de um
  canal que foi excluído, e recebe 404 — nenhuma mensagem de cliente chega ao
  CRM (`last_inbound_at` está nulo). Para resolver: abrir **WhatsApp**,
  **Editar → Salvar** (isso reregistra o webhook com o token atual) e então ler
  o QR Code com o celular da oficina.

**Concluído**

- **Funções de borda publicadas.** As 8 funções subiram e os 10 arquivos do
  pacote da `ai-reply` foram conferidos byte a byte contra o repositório:
  idênticos. Agora estão em produção o prompt especialista, a triagem técnica,
  a quebra de mensagem, o indicador de digitação, o teto de gasto, a seleção de
  FAQ por relevância e a busca da foto de perfil.
- Divisão de código por rota: o pacote inicial caiu de 825 KB para 612 KB
  (180 KB comprimido), com 18 arquivos carregados sob demanda.
- As 6 políticas de RLS que reavaliavam `auth.uid()` linha a linha agora usam
  `(select auth.uid())`. O aviso `auth_rls_initplan` sumiu do analisador.
- Foto de perfil do cliente: colunas, busca na Evolution e exibição no
  `Avatar` das 6 telas onde o cliente aparece.

**Melhorias ainda mapeadas**

- O laço de `customer_fields` faz um upsert por campo; poderia ser em lote.
- 33 chaves estrangeiras sem índice de cobertura. Só passa a doer com volume —
  hoje o banco tem pouco tráfego, e todo índice tem custo de escrita.
- Proteção contra senha vazada (HaveIBeenPwned) está desligada no Auth.

**Segurança**

- A API Key da Evolution já apareceu fora do sistema em captura de tela, e o
  token pessoal do Supabase foi trafegado em conversa. Convém rotacionar os
  dois.
