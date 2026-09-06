-- Evolução do relatório no tempo.
--
-- O relatório era uma foto: "no mês teve 40 atendimentos e 6 emergências".
-- Não dizia se as emergências estão concentradas numa semana ruim ou espalhadas
-- pelo mês — e essas duas situações pedem decisões opostas da oficina.
--
-- Uma linha por dia do período, inclusive os dias sem nada: dia vazio é
-- informação (foi feriado? o WhatsApp caiu?) e sumiria se a série só trouxesse
-- os dias com movimento.
--
-- O dia é o dia no fuso da empresa, igual ao metrics_volume — senão o
-- atendimento das 22h de sexta cairia no sábado do relatório.

create or replace function public.metrics_serie(p_from timestamptz, p_to timestamptz)
returns table(
  dia date,
  atendimentos bigint,
  emergencias bigint,
  com_risco bigint,
  concluidos bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_company uuid;
  v_tz text;
begin
  v_company := public.current_company_id();
  if v_company is null then return; end if;

  select coalesce(timezone, 'America/Sao_Paulo') into v_tz
    from public.companies where id = v_company;
  v_tz := coalesce(v_tz, 'America/Sao_Paulo');

  return query
  with dias as (
    select generate_series(
             ((p_from at time zone v_tz)::date)::timestamp,
             (((p_to - interval '1 second') at time zone v_tz)::date)::timestamp,
             interval '1 day')::date as dia
  ),
  conversas as (
    select (c.started_at at time zone v_tz)::date as dia,
           c.priority,
           c.ai_risco_seguranca,
           c.status
      from public.conversations c
     where c.company_id = v_company
       and c.started_at >= p_from
       and c.started_at < p_to
  )
  select d.dia,
         count(c.*)::bigint,
         count(*) filter (where c.priority = 'emergencia')::bigint,
         count(*) filter (where c.ai_risco_seguranca)::bigint,
         count(*) filter (where c.status = 'concluido')::bigint
    from dias d
    left join conversas c on c.dia = d.dia
   group by d.dia
   order by d.dia;
end;
$$;

comment on function public.metrics_serie(timestamptz, timestamptz) is
  'Um ponto por dia do período: volume, emergências, casos com risco e concluídos.';

revoke all on function public.metrics_serie(timestamptz, timestamptz) from public, anon;
grant execute on function public.metrics_serie(timestamptz, timestamptz) to authenticated, service_role;
