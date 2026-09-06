import { useState, type ComponentType } from 'react'
import {
  BarChart3,
  Bot,
  CheckCircle2,
  Clock,
  Gauge,
  MessageCircle,
  Timer,
  TrendingUp,
  UserCheck,
  Users,
  Zap,
} from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { Badge, Card, CardHeader, EmptyState, SkeletonPage, Tabs } from '@/components/ui'
import { BarChart } from '@/components/charts/BarChart'
import { PeriodFilter } from '@/components/PeriodFilter'
import { cn } from '@/lib/utils'
import { usePageChrome } from '@/components/layout/AppLayout'
import { useAuth } from '@/contexts/AuthContext'
import { RelatorioTab } from '@/components/metrics/RelatorioTab'
import {
  buildPeriod,
  formatDuration,
  useMetricsAi,
  useMetricsSummary,
  useMetricsTeam,
  useMetricsVolume,
  type PeriodKey,
} from '@/features/metrics/api'

type TabKey = 'geral' | 'relatorio' | 'ia' | 'equipe'

export function MetricasPage() {
  const { company } = useAuth()
  const [tab, setTab] = useState<TabKey>('geral')
  const [periodKey, setPeriodKey] = useState<PeriodKey>('30d')
  const [custom, setCustom] = useState<{ from: string; to: string } | undefined>()
  const period = buildPeriod(periodKey, custom)

  const { data: summary, isLoading } = useMetricsSummary(company?.id, period)
  const { data: volume } = useMetricsVolume(company?.id, period)
  const { data: ai } = useMetricsAi(company?.id, period)
  const { data: team } = useMetricsTeam(company?.id, period)

  usePageChrome(
    {
      subtitle: `Indicadores da operação · ${period.label}`,
      actions: (
        <PeriodFilter
          value={periodKey}
          custom={custom}
          onChange={(key, range) => {
            setPeriodKey(key)
            setCustom(range)
          }}
        />
      ),
    },
    [periodKey, custom?.from, custom?.to],
  )

  if (isLoading) return <SkeletonPage tiles={4} rows={3} />

  const volumeData = (volume ?? []).map((point) => ({
    label: new Date(`${point.dia}T00:00:00`).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
    }),
    values: {
      atendimentos: Number(point.atendimentos),
      mensagens: Number(point.mensagens),
      novos: Number(point.novos_clientes),
    },
  }))
  const hasVolume = volumeData.some((p) => p.values.atendimentos > 0 || p.values.mensagens > 0)
  const hasSummary = (summary?.atendimentos ?? 0) > 0

  return (
    <div className="animate-in-fade min-w-0 space-y-4 px-4 py-5 sm:px-6 sm:py-6">
      <div className="premium-ring flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-surface/80 bg-surface/[0.92] p-2.5 shadow-[var(--shadow-card)]">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { key: 'geral', label: 'Operação' },
            { key: 'relatorio', label: 'Relatório' },
            { key: 'ia', label: 'Desempenho da IA' },
            { key: 'equipe', label: 'Equipe' },
          ]}
        />
        <Badge tone="neutral">
          <Clock className="size-3" />
          {period.label}
        </Badge>
      </div>

      {tab === 'geral' &&
        (!hasSummary ? (
          <Card className="overflow-hidden">
            <EmptyState
              icon={BarChart3}
              title="Sem dados neste período"
              description="As métricas são calculadas a partir dos atendimentos reais."
            />
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Metric
                icon={MessageCircle}
                label="Atendimentos"
                value={String(summary!.atendimentos)}
                tone="navy"
              />
              <Metric
                icon={CheckCircle2}
                label="Concluídos"
                value={String(summary!.concluidos)}
                tone="success"
              />
              <Metric
                icon={Timer}
                label="Tempo médio de resposta"
                value={formatDuration(summary!.tempo_resposta_seg)}
                tone="cyan"
              />
              <Metric
                icon={Clock}
                label="Tempo médio de atendimento"
                value={formatDuration(summary!.tempo_atendimento_seg)}
                tone="orange"
              />
            </div>

            <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(280px,0.82fr)]">
              <Card className="min-w-0 overflow-hidden">
                <CardHeader
                  title="Volume por período"
                  description="Atendimentos, mensagens e novos clientes por dia."
                  className="bg-surface"
                />
                <div className="bg-gradient-to-b from-cyan-500/[0.05] to-transparent p-4 sm:p-5">
                  {hasVolume ? (
                    <BarChart
                      data={volumeData}
                      series={[
                        { key: 'atendimentos', label: 'Atendimentos', color: 'var(--color-chart-1)' },
                        { key: 'mensagens', label: 'Mensagens', color: 'var(--color-chart-2)' },
                        { key: 'novos', label: 'Novos clientes', color: 'var(--color-chart-3)' },
                      ]}
                    />
                  ) : (
                    <EmptyState title="Sem dados neste período" />
                  )}
                </div>
              </Card>

              <InsightPanel
                eyebrow="Qualidade"
                title="Avaliação"
                icon={TrendingUp}
                rows={[
                  {
                    label: 'Avaliação média',
                    value: summary!.avaliacao_media
                      ? summary!.avaliacao_media.toFixed(1)
                      : 'Sem avaliações',
                    tone: 'cyan',
                  },
                  {
                    label: 'Atendimentos avaliados',
                    value: String(summary!.avaliacoes),
                    tone: 'orange',
                  },
                ]}
              />
            </div>
          </>
        ))}

      {tab === 'relatorio' && <RelatorioTab period={period} />}

      {tab === 'ia' &&
        (!ai || ai.execucoes === 0 ? (
          <Card className="overflow-hidden">
            <EmptyState
              icon={Bot}
              title="Sem execuções da IA neste período"
              description="Os números aparecem assim que a IA atender conversas reais."
            />
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Metric
                icon={Bot}
                label="Atendimentos com IA"
                value={String(ai.atendimentos_com_ia)}
                tone="cyan"
              />
              <Metric
                icon={CheckCircle2}
                label="Resolvidos pela IA"
                value={String(ai.respondidos)}
                tone="success"
              />
              <Metric
                icon={UserCheck}
                label="Encaminhados para humano"
                value={String(ai.encaminhados)}
                tone="orange"
              />
              <Metric
                icon={Zap}
                label="Emergências identificadas"
                value={String(ai.emergencias)}
                tone="danger"
              />
            </div>
            <InsightPanel
              eyebrow="Motor de IA"
              title="Qualidade e desempenho"
              icon={Gauge}
              rows={[
                { label: 'Execuções', value: String(ai.execucoes), tone: 'navy' },
                { label: 'Falhas', value: String(ai.falhas), tone: ai.falhas > 0 ? 'danger' : 'success' },
                {
                  label: 'Tempo médio de resposta',
                  value: ai.tempo_medio_ms ? `${Math.round(ai.tempo_medio_ms)} ms` : '—',
                  tone: 'cyan',
                },
                {
                  label: 'Confiança média',
                  value: ai.confianca_media ? `${Math.round(ai.confianca_media * 100)}%` : '—',
                  tone: 'orange',
                },
                {
                  label: 'Uso do provedor reserva',
                  value: String(ai.uso_reserva),
                  tone: ai.uso_reserva > 0 ? 'orange' : 'navy',
                },
              ]}
            />
          </>
        ))}

      {tab === 'equipe' &&
        (!team || team.length === 0 ? (
          <Card className="overflow-hidden">
            <EmptyState icon={Users} title="Nenhum usuário ativo" />
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <CardHeader
              title="Desempenho por atendente"
              description="Quantidade sozinha não define desempenho: veja tempo de resposta, pendências e avaliação."
              className="bg-surface"
            />
            {/* Celular: uma tabela de sete colunas nao cabe em 360px, e rolar
                de lado esconde justamente a coluna do nome. Vira cartao. */}
            <ul className="divide-y divide-line/75 bg-surface lg:hidden">
              {team.map((member) => (
                <li key={member.user_id} className="px-4 py-4">
                  <div className="flex items-center gap-3">
                    <Avatar name={member.full_name || 'Usuário'} seed={member.user_id} size="sm" />
                    <p className="text-sm font-semibold text-ink">
                      {member.full_name || '—'}
                    </p>
                  </div>
                  <dl className="mt-2 grid grid-cols-3 gap-x-3 gap-y-2.5">
                    <CelulaMetrica rotulo="Ativos" valor={String(member.ativos)} />
                    <CelulaMetrica rotulo="Concluídos" valor={String(member.concluidos)} />
                    <CelulaMetrica
                      rotulo="Pendências"
                      valor={String(member.aguardando)}
                      alerta={member.aguardando > 0}
                    />
                    <CelulaMetrica rotulo="Mensagens" valor={String(member.mensagens)} />
                    <CelulaMetrica
                      rotulo="Resposta"
                      valor={formatDuration(member.tempo_resposta_seg)}
                    />
                    <CelulaMetrica
                      rotulo="Avaliação"
                      valor={
                        member.avaliacao_media
                          ? `${member.avaliacao_media.toFixed(1)} (${member.avaliacoes})`
                          : '—'
                      }
                    />
                  </dl>
                </li>
              ))}
            </ul>

            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full text-left">
                <thead className="bg-surface-soft">
                  <tr className="border-b border-line text-2xs uppercase tracking-label text-muted">
                    <th className="px-5 py-2.5 font-semibold">Atendente</th>
                    <th className="px-3 py-2.5 font-semibold">Ativos</th>
                    <th className="px-3 py-2.5 font-semibold">Concluídos</th>
                    <th className="px-3 py-2.5 font-semibold">Pendências</th>
                    <th className="px-3 py-2.5 font-semibold">Mensagens</th>
                    <th className="px-3 py-2.5 font-semibold">Tempo de resposta</th>
                    <th className="px-5 py-2.5 font-semibold">Avaliação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/75 bg-surface">
                  {team.map((member) => (
                    <tr
                      key={member.user_id}
                      className="text-sm text-ink transition-colors hover:bg-cyan-100/[0.22]"
                    >
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar name={member.full_name || 'Usuário'} seed={member.user_id} size="sm" />
                          <span className="font-semibold">{member.full_name || '—'}</span>
                        </div>
                      </td>
                      <td className="nums px-3 py-3">{member.ativos}</td>
                      <td className="nums px-3 py-3">{member.concluidos}</td>
                      <td
                        className={cn(
                          'nums px-3 py-3',
                          member.aguardando > 0 && 'font-semibold text-orange-600',
                        )}
                      >
                        {member.aguardando}
                      </td>
                      <td className="nums px-3 py-3">{member.mensagens}</td>
                      <td className="nums px-3 py-3">{formatDuration(member.tempo_resposta_seg)}</td>
                      <td className="nums px-5 py-3">
                        {member.avaliacao_media
                          ? `${member.avaliacao_media.toFixed(1)} (${member.avaliacoes})`
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ))}
    </div>
  )
}

/** Rótulo em cima, número embaixo — legível em coluna estreita. */
function CelulaMetrica({
  rotulo,
  valor,
  alerta,
}: {
  rotulo: string
  valor: string
  alerta?: boolean
}) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-2xs text-muted">{rotulo}</dt>
      <dd
        className={cn(
          'nums mt-0.5 truncate text-sm font-medium',
          alerta ? 'text-orange-600' : 'text-ink',
        )}
      >
        {valor}
      </dd>
    </div>
  )
}

type MetricTone = 'navy' | 'cyan' | 'orange' | 'success' | 'danger'

function toneClasses(tone: MetricTone) {
  return {
    accent:
      tone === 'cyan'
        ? 'bg-cyan-500'
        : tone === 'orange'
          ? 'bg-orange-500'
          : tone === 'success'
            ? 'bg-emerald-500'
            : tone === 'danger'
              ? 'bg-red-500'
              : 'bg-navy-900',
    tint:
      tone === 'cyan'
        ? 'wash [--wash:var(--color-cyan-500)]'
        : tone === 'orange'
          ? 'wash [--wash:var(--color-orange-500)]'
          : tone === 'success'
            ? 'wash [--wash:var(--color-emerald-500)]'
            : tone === 'danger'
              ? 'wash [--wash:var(--color-red-500)]'
              : 'wash [--wash:var(--color-ink)]',
    icon:
      tone === 'cyan'
        ? 'text-cyan-600'
        : tone === 'orange'
          ? 'text-orange-600'
          : tone === 'success'
            ? 'text-emerald-700'
            : tone === 'danger'
              ? 'text-red-600'
              : 'text-ink',
    border:
      tone === 'cyan'
        ? 'border-cyan-500'
        : tone === 'orange'
          ? 'border-orange-500'
          : tone === 'success'
            ? 'border-emerald-500'
            : tone === 'danger'
              ? 'border-red-500'
              : 'border-navy-900',
  }
}

function Metric({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: ComponentType<{ className?: string }>
  label: string
  value: string
  tone: MetricTone
}) {
  const classes = toneClasses(tone)
  return (
    <div
      className={cn(
        'group relative min-h-[98px] overflow-hidden rounded-2xl border border-surface/80 bg-surface/[0.96] px-4 py-3.5 shadow-[var(--shadow-card)] ring-1 ring-ink/[0.045] transition-all hover:-translate-y-px hover:shadow-[var(--shadow-raised)]',
        classes.tint,
      )}
    >
      <span className={cn('absolute inset-x-0 top-0 h-1', classes.accent)} />
      <Icon
        className={cn(
          'absolute right-4 top-4 size-5 opacity-45 transition-opacity group-hover:opacity-80',
          classes.icon,
        )}
      />
      <div className="relative min-w-0 pr-8">
        <p className="nums text-2xl font-semibold leading-none text-ink">
          {value}
        </p>
        <p className="mt-2 text-xs font-medium leading-snug text-ink/[0.58]">
          {label}
        </p>
      </div>
    </div>
  )
}

function InsightPanel({
  eyebrow,
  title,
  icon: Icon,
  rows,
}: {
  eyebrow: string
  title: string
  icon: ComponentType<{ className?: string }>
  rows: Array<{ label: string; value: string; tone: MetricTone }>
}) {
  return (
    <Card className="overflow-hidden">
      <div className="relative overflow-hidden bg-navy-900 px-5 py-4 text-white">
        <span className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,var(--color-cyan-500),var(--color-orange-500))]" />
        <div className="relative flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-xl bg-white/[0.08] text-cyan-100 ring-1 ring-white/10">
            <Icon className="size-4" />
          </span>
          <div>
            <p className="text-2xs font-semibold uppercase tracking-label text-cyan-100">
              {eyebrow}
            </p>
            <h2 className="mt-0.5 text-base font-semibold text-white">
              {title}
            </h2>
          </div>
        </div>
      </div>
      <dl className="space-y-2 bg-surface p-3">
        {rows.map((row) => {
          const classes = toneClasses(row.tone)
          return (
            <div
              key={row.label}
              className={cn(
                'rounded-lg border-l-[3px] bg-ink/[0.025] px-3 py-2.5',
                row.tone === 'danger' && 'bg-red-50',
                row.tone === 'success' && 'bg-emerald-50',
                row.tone === 'cyan' && 'bg-cyan-100/[0.38]',
                row.tone === 'orange' && 'bg-orange-100/[0.45]',
                classes.border,
              )}
            >
              <dt className="text-xs font-medium text-ink/[0.62]">{row.label}</dt>
              <dd className="nums mt-1 text-base font-semibold text-ink">
                {row.value}
              </dd>
            </div>
          )
        })}
      </dl>
    </Card>
  )
}
