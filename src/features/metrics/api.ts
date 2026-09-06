import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export type PeriodKey = 'hoje' | '7d' | '30d' | 'custom'

export interface Period {
  key: PeriodKey
  from: Date
  to: Date
  label: string
}

export function buildPeriod(key: PeriodKey, custom?: { from: string; to: string }): Period {
  const now = new Date()
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)

  switch (key) {
    case 'hoje': {
      const from = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      return { key, from, to: endOfToday, label: 'Hoje' }
    }
    case '7d': {
      const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6)
      return { key, from, to: endOfToday, label: 'Últimos 7 dias' }
    }
    case '30d': {
      const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29)
      return { key, from, to: endOfToday, label: 'Últimos 30 dias' }
    }
    case 'custom': {
      const from = custom?.from ? new Date(`${custom.from}T00:00:00`) : new Date(now.getFullYear(), now.getMonth(), 1)
      const to = custom?.to ? new Date(`${custom.to}T23:59:59`) : endOfToday
      return { key, from, to, label: 'Período personalizado' }
    }
  }
}

export interface DashboardOverview {
  ativos: number
  com_ia: number
  com_humano: number
  aguardando_humano: number
  novos: number
  emergencias: number
  nao_lidas: number
  concluidos_periodo: number
  iniciados_periodo: number
  clientes_atendidos: number
  clientes_novos: number
  clientes_recorrentes: number
  clientes_total: number
}

export function useDashboardOverview(companyId: string | undefined, period: Period) {
  return useQuery({
    queryKey: ['dashboard-overview', companyId, period.from.toISOString(), period.to.toISOString()],
    enabled: Boolean(companyId),
    refetchInterval: 30_000,
    queryFn: async (): Promise<DashboardOverview | null> => {
      const { data, error } = await supabase.rpc('dashboard_overview', {
        p_from: period.from.toISOString(),
        p_to: period.to.toISOString(),
      })
      if (error) throw error
      const result = data as unknown as DashboardOverview
      return result && Object.keys(result).length > 0 ? result : null
    },
  })
}

export interface MetricsSummary {
  atendimentos: number
  concluidos: number
  tempo_resposta_seg: number | null
  tempo_atendimento_seg: number | null
  avaliacao_media: number | null
  avaliacoes: number
}

export function useMetricsSummary(companyId: string | undefined, period: Period) {
  return useQuery({
    queryKey: ['metrics-summary', companyId, period.from.toISOString(), period.to.toISOString()],
    enabled: Boolean(companyId),
    queryFn: async (): Promise<MetricsSummary | null> => {
      const { data, error } = await supabase.rpc('metrics_summary', {
        p_from: period.from.toISOString(),
        p_to: period.to.toISOString(),
      })
      if (error) throw error
      return (data as unknown as MetricsSummary) ?? null
    },
  })
}

export interface VolumePoint {
  dia: string
  atendimentos: number
  mensagens: number
  novos_clientes: number
}

export function useMetricsVolume(companyId: string | undefined, period: Period) {
  return useQuery({
    queryKey: ['metrics-volume', companyId, period.from.toISOString(), period.to.toISOString()],
    enabled: Boolean(companyId),
    queryFn: async (): Promise<VolumePoint[]> => {
      const { data, error } = await supabase.rpc('metrics_volume', {
        p_from: period.from.toISOString(),
        p_to: period.to.toISOString(),
      })
      if (error) throw error
      return (data ?? []) as unknown as VolumePoint[]
    },
  })
}

export interface AiMetrics {
  execucoes: number
  respondidos: number
  encaminhados: number
  falhas: number
  emergencias: number
  tempo_medio_ms: number | null
  confianca_media: number | null
  uso_reserva: number
  atendimentos_com_ia: number
}

export function useMetricsAi(companyId: string | undefined, period: Period) {
  return useQuery({
    queryKey: ['metrics-ai', companyId, period.from.toISOString(), period.to.toISOString()],
    enabled: Boolean(companyId),
    queryFn: async (): Promise<AiMetrics | null> => {
      const { data, error } = await supabase.rpc('metrics_ai', {
        p_from: period.from.toISOString(),
        p_to: period.to.toISOString(),
      })
      if (error) throw error
      return (data as unknown as AiMetrics) ?? null
    },
  })
}

export interface TeamMetric {
  user_id: string
  full_name: string
  ativos: number
  concluidos: number
  aguardando: number
  mensagens: number
  tempo_resposta_seg: number | null
  avaliacao_media: number | null
  avaliacoes: number
}

export function useMetricsTeam(companyId: string | undefined, period: Period) {
  return useQuery({
    queryKey: ['metrics-team', companyId, period.from.toISOString(), period.to.toISOString()],
    enabled: Boolean(companyId),
    queryFn: async (): Promise<TeamMetric[]> => {
      const { data, error } = await supabase.rpc('metrics_team', {
        p_from: period.from.toISOString(),
        p_to: period.to.toISOString(),
      })
      if (error) throw error
      return (data ?? []) as unknown as TeamMetric[]
    },
  })
}

export type DimensaoRelatorio =
  | 'intencao'
  | 'funil'
  | 'temperatura'
  | 'etiqueta'
  | 'prioridade'
  | 'sistema'
  | 'componente'
  | 'risco'

export interface LinhaRelatorio {
  dimensao: DimensaoRelatorio
  chave: string
  total: number
  /**
   * O mesmo item no recorte de igual duração imediatamente anterior.
   *
   * Sem ele o relatório diz "12 orçamentos" e ninguém sabe se 12 é bom. Um
   * item pode vir com total 0 e anterior maior que zero: parar de acontecer
   * também é informação.
   */
  totalAnterior: number
}

/** Rótulos legíveis. O banco guarda a chave; a tela mostra o nome. */
export const ROTULOS: Record<string, string> = {
  // intenção
  endereco: 'Endereço', horario: 'Horário', servicos: 'Serviços',
  especialidades: 'Especialidades', socorro_24h: 'Socorro 24h',
  regiao_atendimento: 'Região atendida', orcamento: 'Orçamento', preco: 'Preço',
  agendamento: 'Agendamento', status_os: 'Status de OS', garantia: 'Garantia',
  reclamacao: 'Reclamação', emergencia_freio: 'Emergência de freio',
  diagnostico_sintoma: 'Diagnóstico', humano: 'Pediu atendente',
  fora_de_contexto: 'Fora de contexto',
  // funil
  novo_contato: 'Novo contato', qualificando: 'Qualificando',
  precisa_socorro: 'Precisa de socorro', quer_orcamento: 'Quer orçamento',
  aguardando_dados: 'Aguardando dados', aguardando_humano: 'Aguardando humano',
  agendamento_pendente: 'Agendamento pendente', os_em_andamento: 'OS em andamento',
  pos_venda: 'Pós-venda', perdido: 'Perdido', fora_do_perfil: 'Fora do perfil',
  // temperatura
  quente: 'Quente', morno: 'Morno', frio: 'Frio',
  fora_do_contexto: 'Fora do contexto',
  // prioridade
  baixa: 'Baixa', normal: 'Normal', alta: 'Alta', emergencia: 'Emergência',
  // comum
  sem_classificacao: 'Sem classificação',
  // Triagem técnica
  freio: 'Freio',
  ar_comprimido: 'Ar comprimido',
  suspensao_pneumatica: 'Suspensão pneumática',
  motor: 'Motor',
  eletrica: 'Elétrica',
  outro: 'Outro',
  nao_identificado: 'Não identificado',
  com_risco: 'Com risco de segurança',
  sem_risco: 'Sem risco',
}

export const rotular = (chave: string) => ROTULOS[chave] ?? chave

export interface PontoSerie {
  dia: string
  atendimentos: number
  emergencias: number
  comRisco: number
  concluidos: number
}

/**
 * Um ponto por dia do período, inclusive os dias sem nada.
 *
 * O relatório era uma foto: "no mês teve 40 atendimentos e 6 emergências". Não
 * dizia se as emergências estão concentradas numa semana ruim ou espalhadas
 * pelo mês — e as duas situações pedem decisões opostas da oficina.
 *
 * Dia vazio vem com zero de propósito: foi feriado? o WhatsApp caiu? Isso
 * sumiria se a série trouxesse só os dias com movimento.
 */
export function useMetricsSerie(companyId: string | undefined, period: Period) {
  return useQuery({
    queryKey: ['metrics-serie', companyId, period.from.toISOString(), period.to.toISOString()],
    enabled: Boolean(companyId),
    queryFn: async (): Promise<PontoSerie[]> => {
      const { data, error } = await supabase.rpc('metrics_serie', {
        p_from: period.from.toISOString(),
        p_to: period.to.toISOString(),
      })
      if (error) throw error
      return (data ?? []).map((linha: Record<string, unknown>) => ({
        dia: String(linha.dia),
        atendimentos: Number(linha.atendimentos),
        emergencias: Number(linha.emergencias),
        comRisco: Number(linha.com_risco),
        concluidos: Number(linha.concluidos),
      }))
    },
  })
}

/**
 * Relatório de classificação: intenção, funil, temperatura, etiqueta e
 * prioridade numa só chamada. As linhas vêm com a dimensão marcada e a tela
 * separa em memória.
 */
export function useMetricsBreakdown(companyId: string | undefined, period: Period) {
  return useQuery({
    queryKey: ['metrics-breakdown', companyId, period.from.toISOString(), period.to.toISOString()],
    enabled: Boolean(companyId),
    queryFn: async (): Promise<LinhaRelatorio[]> => {
      const { data, error } = await supabase.rpc('metrics_breakdown', {
        p_from: period.from.toISOString(),
        p_to: period.to.toISOString(),
      })
      if (error) throw error
      return (data ?? []).map((linha: Record<string, unknown>) => ({
        dimensao: linha.dimensao as DimensaoRelatorio,
        chave: String(linha.chave),
        total: Number(linha.total),
        totalAnterior: Number(linha.total_anterior ?? 0),
      }))
    },
  })
}

/** Formata segundos em "3 min 20 s" — devolve travessão quando não há dado. */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) return '—'
  const total = Math.round(seconds)
  if (total < 60) return `${total} s`
  const minutes = Math.floor(total / 60)
  if (minutes < 60) {
    const rest = total % 60
    return rest ? `${minutes} min ${rest} s` : `${minutes} min`
  }
  const hours = Math.floor(minutes / 60)
  const restMinutes = minutes % 60
  return restMinutes ? `${hours} h ${restMinutes} min` : `${hours} h`
}

export function usePeriodState(key: PeriodKey, custom?: { from: string; to: string }) {
  return useMemo(() => buildPeriod(key, custom), [key, custom?.from, custom?.to])
}
