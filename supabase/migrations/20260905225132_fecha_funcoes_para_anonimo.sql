-- Fecha para visitante não autenticado duas funções SECURITY DEFINER.
--
-- O Supabase concede EXECUTE ao papel `anon` por padrão em toda função nova
-- criada em `public`. Como `anon` é o papel de quem apenas abriu a tela de
-- login com a chave pública, e uma função SECURITY DEFINER roda por cima do
-- RLS, o par é perigoso por construção. Vale para qualquer função nova daqui
-- em diante: criar não basta, tem de revogar.
--
--   ai_tokens_hoje    recebe a empresa por parâmetro e NÃO conferia o
--                     chamador: qualquer um que acertasse um UUID lia o
--                     consumo de IA daquela empresa. Corrigido nos dois
--                     níveis — a permissão sai, e a função passa a conferir.
--   metrics_breakdown já se protege por dentro (sem empresa no contexto, não
--                     devolve linha), mas o EXECUTE sobrando destoa das
--                     irmãs metrics_summary e metrics_volume, que não o têm.
--                     Uniformizar evita que a próxima pessoa conclua que
--                     expor era intencional.

revoke execute on function public.ai_tokens_hoje(uuid) from anon;
revoke execute on function public.metrics_breakdown(timestamptz, timestamptz) from anon;

-- Defesa em profundidade: mesmo que alguém volte a conceder EXECUTE por
-- engano, a função só responde sobre a empresa de quem está perguntando.
-- As funções de borda usam a chave de serviço e seguem podendo consultar
-- qualquer empresa — é como o freio de gasto é verificado.
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
  if coalesce(auth.role(), '') <> 'service_role'
     and p_company_id is distinct from public.current_company_id() then
    raise exception 'Sem permissao para consultar o consumo desta empresa.'
      using errcode = '42501';
  end if;

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

revoke all on function public.ai_tokens_hoje(uuid) from public, anon;
grant execute on function public.ai_tokens_hoje(uuid) to authenticated, service_role;
