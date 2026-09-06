-- Relatório com base de comparação e com a triagem técnica.
--
-- O relatório dizia "12 orçamentos". Doze é bom ou ruim? Sem o período
-- anterior ao lado, nenhum número decide nada — e um relatório que não ajuda a
-- decidir não é relatório, é listagem.
--
-- Entram também os eixos que a IA passou a apurar: sistema do veículo, peças
-- que o cliente citou e casos com risco de segurança. Para uma oficina de
-- freios, "quais peças mais aparecem" é o relatório que decide a compra de
-- estoque, e ele não existia.
--
-- O período anterior é a MESMA duração imediatamente antes: sete dias comparam
-- com os sete anteriores, um mês com o mês anterior. Comparar com um intervalo
-- de tamanho diferente daria uma variação que não quer dizer nada.

drop function if exists public.metrics_breakdown(timestamptz, timestamptz);

create function public.metrics_breakdown(p_from timestamptz, p_to timestamptz)
returns table(dimensao text, chave text, total bigint, total_anterior bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_company uuid;
  v_anterior_de timestamptz;
begin
  v_company := public.current_company_id();
  if v_company is null then return; end if;

  v_anterior_de := p_from - (p_to - p_from);

  return query
  with base as (
    select c.id, c.started_at, c.ai_intent, c.funnel_stage, c.lead_temperature,
           c.priority, c.ai_sistema, c.ai_componentes, c.ai_risco_seguranca,
           (c.started_at >= p_from) as atual
      from public.conversations c
     where c.company_id = v_company
       and c.started_at >= v_anterior_de
       and c.started_at < p_to
  ),
  linhas as (
    select 'intencao'::text as dim, coalesce(b.ai_intent, 'sem_classificacao') as chave, b.atual
      from base b
    union all
    select 'funil', coalesce(b.funnel_stage::text, 'sem_classificacao'), b.atual from base b
    union all
    select 'temperatura', coalesce(b.lead_temperature::text, 'sem_classificacao'), b.atual from base b
    union all
    select 'prioridade', b.priority::text, b.atual from base b
    union all
    select 'sistema', coalesce(b.ai_sistema::text, 'nao_identificado'), b.atual from base b
    union all
    select 'risco',
           case when b.ai_risco_seguranca then 'com_risco' else 'sem_risco' end,
           b.atual
      from base b
    union all
    -- Uma linha por peça citada: a conversa que fala de cuíca e de válvula
    -- conta nas duas, que é como a oficina lê.
    select 'componente', lower(btrim(peca)), b.atual
      from base b, unnest(coalesce(b.ai_componentes, '{}'::text[])) as peca
     where btrim(peca) <> ''
    union all
    select 'etiqueta', t.name, (c.started_at >= p_from)
      from public.conversation_tags ct
      join public.tags t on t.id = ct.tag_id
      join public.conversations c on c.id = ct.conversation_id
     where ct.company_id = v_company
       and c.started_at >= v_anterior_de
       and c.started_at < p_to
  )
  select l.dim,
         l.chave,
         count(*) filter (where l.atual)::bigint,
         count(*) filter (where not l.atual)::bigint
    from linhas l
   group by 1, 2
   -- Item que zerou continua aparecendo, com o número anterior ao lado: parar
   -- de acontecer é informação, e some se filtrarmos só pelo período atual.
   order by 1, 3 desc, 2;
end;
$$;

comment on function public.metrics_breakdown(timestamptz, timestamptz) is
  'Relatório de classificação do período, com o mesmo recorte imediatamente anterior para comparação.';

revoke all on function public.metrics_breakdown(timestamptz, timestamptz) from public, anon;
grant execute on function public.metrics_breakdown(timestamptz, timestamptz) to authenticated, service_role;
