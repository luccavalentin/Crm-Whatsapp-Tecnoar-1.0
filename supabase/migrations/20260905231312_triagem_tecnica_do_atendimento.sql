-- Triagem técnica do atendimento.
--
-- Intenção, etapa de funil e temperatura dizem em que pé está a NEGOCIAÇÃO.
-- Nenhuma delas diz o que a oficina precisa saber para se preparar: se é freio
-- ou elétrica, qual peça o cliente citou, se o caminhão está parado, se há
-- risco de acidente. Sem isso a equipe abre a conversa inteira para descobrir o
-- que já estava escrito nela.
--
-- Tudo aceita nulo de propósito: conversa que ainda não revelou o sistema fica
-- sem sistema. Preencher com um palpite seria pior que deixar vazio.

create type public.sistema_veiculo as enum (
  'freio', 'ar_comprimido', 'suspensao_pneumatica', 'motor', 'eletrica',
  'outro', 'nao_identificado'
);

alter table public.conversations
  add column if not exists ai_sistema public.sistema_veiculo,
  add column if not exists ai_componentes text[] not null default '{}',
  add column if not exists ai_sintoma text,
  add column if not exists ai_veiculo_parado boolean,
  add column if not exists ai_risco_seguranca boolean not null default false;

comment on column public.conversations.ai_sistema is
  'Sistema do veículo envolvido, conforme a IA identificou.';
comment on column public.conversations.ai_componentes is
  'Peças que o cliente citou, no vocabulário dele.';
comment on column public.conversations.ai_sintoma is
  'O sintoma em uma frase, nas palavras do cliente.';
comment on column public.conversations.ai_veiculo_parado is
  'true parado, false rodando, null quando ninguém disse ainda.';
comment on column public.conversations.ai_risco_seguranca is
  'Rodar assim pode causar acidente.';

-- A fila que a operação mais precisa ver: quem corre risco e ainda não foi
-- encerrado. Índice parcial porque é sempre um punhado de linhas num universo
-- que só cresce.
create index if not exists conversations_risco_idx
  on public.conversations (company_id, started_at desc)
  where ai_risco_seguranca and status <> 'concluido';
