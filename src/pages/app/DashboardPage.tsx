import { useState, type ComponentType } from 'react'
import { Link } from 'react-router-dom'
import {
  Bot,
  CheckCircle2,
  Clock,
  MailOpen,
  MessagesSquare,
  Timer,
  UserCheck,
  Zap,
} from 'lucide-react'
import { Card, CardHeader, EmptyState, SectionTitle, SkeletonPage } from '@/components/ui'
import { PeriodFilter } from '@/components/PeriodFilter'
import { usePageChrome } from '@/components/layout/AppLayout'
import { useAuth } from '@/contexts/AuthContext'
import {
  buildPeriod,
  formatDuration,
  useDashboardOverview,
  useMetricsSummary,
  useMetricsVolume,
  type PeriodKey,
} from '@/features/metrics/api'
import { useRealtimeInbox } from '@/features/conversations/api'
import { BarChart } from '@/components/charts/BarChart'
import { cn } from '@/lib/utils'

export function DashboardPage() {
  const { company } = useAuth()
  const [periodKey, setPeriodKey] = useState<PeriodKey>('hoje')
  const [custom, setCustom] = useState<{ from: string; to: string } | undefined>()
  const period = buildPeriod(periodKey, custom)

  useRealtimeInbox(company?.id)
  const { data: overview, isLoading } = useDashboardOverview(company?.id, period)
  const { data: summary } = useMetricsSummary(company?.id, period)
  const { data: volume } = useMetricsVolume(company?.id, period)

  usePageChrome(
    {
      subtitle: `Visão geral da operação · ${period.label}`,
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

  if (isLoading) return <SkeletonPage tiles={4} rows={2} />

  const hasAnyData =
    overview !== null &&
    overview !== undefined &&
    (overview.ativos > 0 ||
      overview.clientes_total > 0 ||
      overview.concluidos_periodo > 0 ||
      overview.iniciados_periodo > 0)

  if (!hasAnyData) {
    return (
      <div className="animate-in-fade px-4 py-6 sm:px-6 sm:py-8">
        <Card>
          <EmptyState
            icon={MessagesSquare}
            title="Sem dados neste período"
            description="Os indicadores aparecem automaticamente assim que houver atendimentos registrados."
          />
        </Card>
      </div>
    )
  }

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

  const hasVolume = volumeData.some(
    (point) => point.values.atendimentos > 0 || point.values.mensagens > 0,
  )

  return (
    <div className="animate-in-fade space-y-5 px-4 py-5 sm:px-6 sm:py-6">
      {/* O que precisa de gente agora vem primeiro e maior. Um painel em que
          "Emergências" tem o mesmo peso de "Clientes atendidos" obriga o
          gestor a ler tudo para descobrir se está pegando fogo. */}
      <section>
        <SectionTitle className="mb-2">Precisa de ação agora</SectionTitle>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            icon={Zap}
            label="Emergências"
            value={overview.emergencias}
            tone="danger"
            destaque
            to="/atendimentos"
          />
          <Stat
            icon={Clock}
            label="Aguardando humano"
            value={overview.aguardando_humano}
            tone="orange"
            destaque
            to="/atendimentos"
          />
          <Stat
            icon={MailOpen}
            label="Mensagens não lidas"
            value={overview.nao_lidas}
            tone="cyan"
            destaque
            to="/atendimentos"
          />
          <Stat
            icon={Timer}
            label="Tempo médio de resposta"
            texto={formatDuration(summary?.tempo_resposta_seg)}
            tone="navy"
            destaque
          />
        </div>
      </section>

      <section>
        <SectionTitle className="mb-2">Em andamento</SectionTitle>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            icon={MessagesSquare}
            label="Atendimentos ativos"
            value={overview.ativos}
            tone="navy"
            to="/atendimentos"
          />
          <Stat icon={Bot} label="Com a IA" value={overview.com_ia} tone="cyan" to="/atendimentos" />
          <Stat
            icon={UserCheck}
            label="Com atendentes"
            value={overview.com_humano}
            tone="orange"
            to="/atendimentos"
          />
          <Stat
            icon={CheckCircle2}
            label="Concluídos no período"
            value={overview.concluidos_periodo}
            tone="success"
          />
        </div>
      </section>

      <div className="grid min-w-0 gap-4 lg:grid-cols-3">
        <Card className="min-w-0 overflow-hidden lg:col-span-2">
          <CardHeader title="Volume no período" description="Atendimentos e mensagens por dia." />
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

        <IndicatorPanel
          periodLabel={period.label}
          rows={[
            {
              label: 'Tempo médio de atendimento',
              value: formatDuration(summary?.tempo_atendimento_seg),
              tone: 'navy',
            },
            {
              label: 'Avaliação média',
              value: summary?.avaliacao_media
                ? `${summary.avaliacao_media.toFixed(1)} (${summary.avaliacoes})`
                : '—',
              tone: 'cyan',
            },
            {
              label: 'Atendimentos iniciados',
              value: String(overview.iniciados_periodo),
              tone: 'orange',
            },
            {
              label: 'Clientes atendidos',
              value: String(overview.clientes_atendidos),
              tone: 'navy',
            },
            {
              label: 'Novos clientes',
              value: String(overview.clientes_novos),
              tone: 'orange',
            },
            {
              label: 'Clientes recorrentes',
              value: String(overview.clientes_recorrentes),
              tone: 'success',
            },
          ]}
        />
      </div>
    </div>
  )
}

type IndicatorTone = 'navy' | 'cyan' | 'orange' | 'success'

function IndicatorPanel({
  periodLabel,
  rows,
}: {
  periodLabel: string
  rows: Array<{ label: string; value: string; tone: IndicatorTone }>
}) {
  return (
    <Card className="overflow-hidden">
      <div className="relative overflow-hidden bg-navy-900 px-5 py-4 text-white">
        <span className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,var(--color-cyan-500),var(--color-orange-500))]" />
        <div className="relative">
          <p className="text-2xs font-semibold uppercase tracking-label text-cyan-100">
            Indicadores
          </p>
          <p className="mt-1 text-xs text-white/60">{periodLabel}</p>
        </div>
      </div>
      <dl className="space-y-2 bg-surface p-3">
        {rows.map((row) => (
          <IndicatorRow key={row.label} {...row} />
        ))}
      </dl>
    </Card>
  )
}

function IndicatorRow({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: IndicatorTone
}) {
  const toneClass =
    tone === 'cyan'
      ? 'border-cyan-500 bg-cyan-100/[0.38]'
      : tone === 'orange'
        ? 'border-orange-500 bg-orange-100/[0.45]'
        : tone === 'success'
          ? 'border-emerald-500 bg-emerald-50'
          : 'border-navy-900 bg-ink/[0.035]'

  return (
    <div className={cn('rounded-lg border-l-[3px] px-3 py-2.5', toneClass)}>
      <dt className="text-xs font-medium text-ink/[0.62]">{label}</dt>
      <dd className="nums mt-1 text-base font-semibold text-ink">
        {value}
      </dd>
    </div>
  )
}

function Stat({
  icon: Icon,
  label,
  value,
  texto,
  tone,
  destaque,
  to,
}: {
  icon: ComponentType<{ className?: string }>
  label: string
  /** Contagem. Use `texto` para o que não é número, como duração. */
  value?: number
  texto?: string
  tone?: 'cyan' | 'orange' | 'danger' | 'success' | 'navy'
  /** Indicador de plantão: número maior e, quando há o que resolver, cor. */
  destaque?: boolean
  to?: string
}) {
  const valorNumerico = typeof value === 'number' ? value : 0
  const aceso = destaque && valorNumerico > 0 && (tone === 'danger' || tone === 'orange')
  const accentClass =
    tone === 'cyan'
      ? 'bg-cyan-500'
      : tone === 'orange'
        ? 'bg-orange-500'
        : tone === 'danger'
          ? 'bg-red-500'
          : tone === 'success'
            ? 'bg-emerald-500'
            : 'bg-navy-900'
  const tintClass =
    tone === 'cyan'
      ? 'wash [--wash:var(--color-cyan-500)]'
      : tone === 'orange'
        ? 'wash [--wash:var(--color-orange-500)]'
        : tone === 'danger'
          ? 'wash [--wash:var(--color-red-500)]'
            : tone === 'success'
              ? 'wash [--wash:var(--color-emerald-500)]'
              : 'wash [--wash:var(--color-ink)]'
  const iconClass =
    tone === 'cyan'
      ? 'text-cyan-600'
      : tone === 'orange'
        ? 'text-orange-600'
        : tone === 'danger'
          ? 'text-red-600'
          : tone === 'success'
            ? 'text-emerald-700'
            : 'text-ink'

  const content = (
    <div
      className={cn(
        'group relative min-h-[92px] overflow-hidden rounded-xl border border-surface/80 bg-surface/[0.96] px-4 py-3.5 shadow-[var(--shadow-card)] ring-1 ring-ink/[0.045] transition-all hover:-translate-y-px',
        tintClass,
        // Só ganha contorno colorido o que de fato tem alguém esperando.
        aceso && tone === 'danger'
          ? 'ring-red-500/35 hover:ring-red-500/50'
          : aceso
            ? 'ring-orange-500/35 hover:ring-orange-500/50'
            : 'hover:bg-surface hover:shadow-[var(--shadow-raised)]',
      )}
    >
      <span className={cn('absolute inset-x-0 top-0 h-1', accentClass)} />
      <Icon
        className={cn(
          'absolute right-4 top-4 size-5 opacity-45 transition-opacity group-hover:opacity-80',
          iconClass,
        )}
      />
      <div className="relative min-w-0 pr-8">
        <p
          className={cn(
            'nums font-semibold leading-none text-ink',
            destaque ? 'text-2xl' : 'text-xl',
          )}
        >
          {texto ?? value}
        </p>
        <p className="mt-2 text-xs font-medium leading-snug text-ink/[0.58]">{label}</p>
      </div>
    </div>
  )

  return to ? (
    <Link to={to} className="block">
      {content}
    </Link>
  ) : (
    content
  )
}

