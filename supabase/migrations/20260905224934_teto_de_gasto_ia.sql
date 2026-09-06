-- Teto de gasto da inteligência artificial.
--
-- Por quê: os tokens de cada execução já eram gravados em `ai_runs`, mas nada
-- lia esse número para frear. Um cliente irritado mandando cinquenta mensagens,
-- um número em laço ou um webhook reentregando em rajada viravam custo direto
-- no cartão — sem alerta, sem teto e sem ninguém perceber até a fatura.
--
-- São dois freios com propósitos diferentes:
--   respostas por hora, por conversa  -> corta laço e enxurrada de uma pessoa só
--   tokens por dia, por empresa       -> corta o gasto do mês
--
-- Ao estourar qualquer um deles a IA não responde: o atendimento vai para uma
-- pessoa e um alerta é aberto. Parar de responder é ruim; parar de responder
-- sem ninguém saber é o que não pode acontecer.

alter table public.ai_settings
  add column if not exists max_replies_per_hour integer not null default 12,
  add column if not exists daily_token_budget bigint not null default 2000000;

comment on column public.ai_settings.max_replies_per_hour is
  'Máximo de respostas da IA na mesma conversa por hora. 0 desliga o freio.';

comment on column public.ai_settings.daily_token_budget is
  'Máximo de tokens (entrada + saída) que a empresa pode gastar por dia. 0 desliga o freio.';

-- Consulta do freio: as duas contas rodam antes de CADA resposta, então
-- precisam ser baratas.
--
-- Os índices de que elas precisam JÁ EXISTIAM: ai_runs_company_idx e
-- ai_runs_conversation_idx, ambos (coluna, created_at desc). A primeira versão
-- desta migration criou uma cópia idêntica de cada um, por não ter conferido
-- antes — e índice duplicado faz toda inserção manter duas árvores iguais numa
-- tabela que ganha uma linha por resposta da IA. Removidos em
-- 20260906004500_remove_indices_duplicados_de_ai_runs.

-- Quanto a empresa já gastou desde a meia-noite (fuso da empresa).
--
-- Fica no banco, e não na função de borda, porque somar milhares de linhas é
-- trabalho de banco: trazer as linhas até o Deno para somar lá seria mais
-- lento e mais caro a cada mensagem recebida.
create or replace function public.ai_tokens_hoje(p_company_id uuid)
returns bigint
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_fuso text;
  v_inicio timestamptz;
  v_total bigint;
begin
  select coalesce(timezone, 'America/Sao_Paulo')
    into v_fuso
    from public.companies
   where id = p_company_id;

  v_fuso := coalesce(v_fuso, 'America/Sao_Paulo');

  -- Meia-noite no fuso da empresa, não em UTC: o dia do gasto tem de bater
  -- com o dia de quem olha o relatório.
  v_inicio := date_trunc('day', now() at time zone v_fuso) at time zone v_fuso;

  select coalesce(sum(coalesce(input_tokens, 0) + coalesce(output_tokens, 0)), 0)
    into v_total
    from public.ai_runs
   where company_id = p_company_id
     and created_at >= v_inicio;

  return v_total;
end;
$$;

comment on function public.ai_tokens_hoje(uuid) is
  'Tokens de IA consumidos pela empresa desde a meia-noite, no fuso dela.';

-- Só quem já enxerga a empresa consegue perguntar pelo consumo dela.
revoke all on function public.ai_tokens_hoje(uuid) from public;
grant execute on function public.ai_tokens_hoje(uuid) to authenticated, service_role;
