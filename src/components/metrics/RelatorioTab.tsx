import { useMemo } from 'react'
import { BarChart3, Download, Printer, TrendingDown, TrendingUp } from 'lucide-react'
import { Button, Card, CardHeader, EmptyState, SkeletonPanel } from '@/components/ui'
import { BarChart } from '@/components/charts/BarChart'
import {
  rotular,
  useMetricsBreakdown,
  useMetricsSerie,
  type DimensaoRelatorio,
  type LinhaRelatorio,
  type Period,
} from '@/features/metrics/api'
import { useAuth } from '@/contexts/AuthContext'
import { formatDate } from '@/lib/datetime'
import { cn } from '@/lib/utils'

const BLOCOS: Array<{ dimensao: DimensaoRelatorio; titulo: string; descricao: string }> = [
  {
    dimensao: 'funil',
    titulo: 'Etapa do funil',
    descricao: 'Onde os atendimentos do período pararam.',
  },
  {
    dimensao: 'temperatura',
    titulo: 'Temperatura do lead',
    descricao: 'Quente é emergência, socorro ou orçamento imediato.',
  },
  {
    dimensao: 'intencao',
    titulo: 'Assunto procurado',
    descricao: 'O que o cliente queria, segundo a classificação da IA.',
  },
  {
    dimensao: 'prioridade',
    titulo: 'Prioridade',
    descricao: 'Volume de emergência dentro do total.',
  },
  {
    dimensao: 'sistema',
    titulo: 'Sistema do veículo',
    descricao: 'Onde estava o problema, segundo a triagem da IA.',
  },
  {
    dimensao: 'componente',
    titulo: 'Peças mais citadas',
    descricao: 'O que o cliente falou. É o que orienta a compra de estoque.',
  },
  {
    dimensao: 'risco',
    titulo: 'Risco de segurança',
    descricao: 'Atendimentos em que rodar assim podia causar acidente.',
  },
  {
    dimensao: 'etiqueta',
    titulo: 'Etiquetas',
    descricao: 'Marcações aplicadas por atendentes e pela IA.',
  },
]

/**
 * Quanto o item variou em relação ao mesmo recorte anterior.
 *
 * Devolve null quando não havia base: subir de zero para três não é "+300%",
 * é começar do nada — e uma porcentagem ali mentiria sobre a escala.
 */
function variacao(atual: number, anterior: number): number | null {
  if (anterior === 0) return null
  return Math.round(((atual - anterior) / anterior) * 100)
}

/**
 * Relatório de classificação.
 *
 * Barra proporcional em vez de gráfico: a pergunta aqui é "o que mais aparece
 * e quanto do total representa", e para isso a barra responde mais rápido que
 * um gráfico com eixo. O que ainda não foi classificado aparece como "sem
 * classificação" — omitir daria um total que não fecha com a operação.
 */
export function RelatorioTab({ period }: { period: Period }) {
  const { company } = useAuth()
  const { data, isLoading } = useMetricsBreakdown(company?.id, period)
  const { data: serie } = useMetricsSerie(company?.id, period)

  const porDimensao = useMemo(() => {
    const mapa = new Map<DimensaoRelatorio, LinhaRelatorio[]>()
    for (const linha of data ?? []) {
      const atual = mapa.get(linha.dimensao) ?? []
      atual.push(linha)
      mapa.set(linha.dimensao, atual)
    }
    return mapa
  }, [data])

  if (isLoading) return <SkeletonPanel rows={4} />

  const vazio = !data || data.length === 0

  if (vazio) {
    return (
      <Card>
        <EmptyState
          icon={BarChart3}
          title="Sem atendimentos neste período"
          description="O relatório é montado a partir dos atendimentos reais. Assim que houver conversas no período escolhido, os números aparecem aqui."
        />
      </Card>
    )
  }

  function exportar() {
    // Ponto e vírgula e BOM: é o que o Excel em português abre sem embaralhar
    // as colunas nem estragar os acentos.
    const linhas = [
      ['Dimensao', 'Item', 'Periodo', 'Periodo anterior', 'Variacao %'],
      ...(data ?? []).map((l) => {
        const v = variacao(l.total, l.totalAnterior)
        return [
          dimensaoLegivel(l.dimensao),
          rotular(l.chave),
          String(l.total),
          String(l.totalAnterior),
          v === null ? '' : String(v),
        ]
      }),
    ]
    const csv = '﻿' + linhas.map((l) => l.map(escaparCsv).join(';')).join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `relatorio-tecnoar-${period.from.toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      {/* Só sai no papel: quem lê o relatório impresso precisa saber de qual
          empresa é, de que período e quando foi tirado. Na tela isso já está
          no topo, e repetir seria ruído. */}
      <div className="somente-impressao mb-4 border-b border-line pb-3">
        <h1 className="text-xl font-semibold text-ink">
          {company?.name ?? 'Relatório de atendimento'}
        </h1>
        <p className="text-sm text-muted">
          Relatório de atendimento · {formatDate(period.from)} a {formatDate(period.to)}
          {' · emitido em '}
          {formatDate(new Date())}
        </p>
      </div>

      {/* Empilha no celular: os dois botoes com texto completo lado a lado
          nao cabem em 360px, e encolher a fonte deixaria o rotulo ilegivel. */}
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end" data-sem-impressao>
        <Button size="sm" variant="outline" className="w-full sm:w-auto" onClick={() => window.print()}>
          <Printer className="size-4" />
          Imprimir ou salvar PDF
        </Button>
        <Button size="sm" variant="outline" className="w-full sm:w-auto" onClick={exportar}>
          <Download className="size-4" />
          Baixar CSV
        </Button>
      </div>

      {/* A evolução vem antes dos totais: quem lê um relatório quer primeiro
          saber se está melhorando ou piorando, e só depois no quê. */}
      {serie && serie.length > 1 && (
        <Card data-bloco-impressao>
          <CardHeader
            title="Evolução no período"
            description="Se a emergência está concentrada num dia ruim ou espalhada, a decisão é outra."
          />
          <div className="p-4 sm:p-5">
            <BarChart
              height={200}
              data={serie.map((ponto) => ({
                label: diaCurto(ponto.dia),
                values: {
                  atendimentos: ponto.atendimentos,
                  emergencias: ponto.emergencias,
                  risco: ponto.comRisco,
                },
              }))}
              series={[
                { key: 'atendimentos', label: 'Atendimentos', color: 'var(--color-chart-1)' },
                { key: 'emergencias', label: 'Emergências', color: 'var(--color-chart-2)' },
                { key: 'risco', label: 'Com risco', color: 'var(--color-chart-3)' },
              ]}
            />
          </div>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {BLOCOS.map((bloco) => {
          const linhas = (porDimensao.get(bloco.dimensao) ?? [])
            .slice()
            .sort((a, b) => b.total - a.total)
          if (linhas.length === 0) return null
          const total = linhas.reduce((soma, l) => soma + l.total, 0)
          const maior = Math.max(...linhas.map((l) => l.total))

          return (
            <Card key={bloco.dimensao} className="min-w-0" data-bloco-impressao>
              <CardHeader title={bloco.titulo} description={bloco.descricao} />
              <ul className="divide-y divide-line">
                {linhas.map((linha) => {
                  const pct = total > 0 ? Math.round((linha.total / total) * 100) : 0
                  const critico =
                    linha.chave === 'emergencia' ||
                    linha.chave === 'precisa_socorro' ||
                    linha.chave === 'emergencia_freio'
                  const morno = linha.chave === 'quente' || linha.chave === 'aguardando_humano'

                  return (
                    <li key={linha.chave} className="px-4 py-2.5 sm:px-5">
                      <div className="flex items-baseline justify-between gap-3">
                        <span
                          className={cn(
                            'min-w-0 truncate text-sm',
                            critico ? 'font-medium text-red-600' : 'text-ink',
                          )}
                        >
                          {rotular(linha.chave)}
                        </span>
                        {/* Separador explícito: sem ele "1" e "100%" ficam
                            colados e leem como "1100%". */}
                        <span className="flex shrink-0 items-baseline gap-1.5 text-sm font-medium text-ink">
                          <span className="nums">{linha.total}</span>
                          <span className="text-2xs font-normal text-muted">·</span>
                          <span className="nums w-9 text-right text-2xs font-normal text-muted">
                            {pct}%
                          </span>
                          <Variacao atual={linha.total} anterior={linha.totalAnterior} />
                        </span>
                      </div>
                      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-ink/[0.06]">
                        <div
                          className={cn(
                            'h-full rounded-full',
                            critico ? 'bg-red-500' : morno ? 'bg-orange-500' : 'bg-ink/45',
                          )}
                          // Proporcional ao maior item, não ao total: com uma
                          // categoria dominante as outras sumiriam da tela.
                          style={{ width: `${maior > 0 ? (linha.total / maior) * 100 : 0}%` }}
                        />
                      </div>
                    </li>
                  )
                })}
              </ul>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

/**
 * A variação ao lado do número.
 *
 * Verde e vermelho aqui NÃO querem dizer bom e ruim: subir emergência é
 * péssimo, subir orçamento é ótimo, e o relatório não sabe qual é qual. A cor
 * diz só a direção; quem lê sabe o resto. Por isso o ícone vai junto — para
 * quem não distingue as cores ler a mesma coisa.
 */
function Variacao({ atual, anterior }: { atual: number; anterior: number }) {
  const v = variacao(atual, anterior)

  if (v === null) {
    return (
      <span
        className="w-14 text-right text-2xs font-normal text-muted"
        title={anterior === 0 ? 'Não houve nada no período anterior' : undefined}
      >
        {atual > 0 ? 'novo' : '—'}
      </span>
    )
  }

  if (v === 0) {
    return <span className="w-14 text-right text-2xs font-normal text-muted">igual</span>
  }

  const subiu = v > 0
  const Icone = subiu ? TrendingUp : TrendingDown
  return (
    <span
      className={cn(
        'nums flex w-14 shrink-0 items-center justify-end gap-0.5 text-2xs font-medium',
        subiu ? 'text-emerald-700' : 'text-red-600',
      )}
      title={`${anterior} no período anterior`}
    >
      <Icone className="size-3" aria-hidden="true" />
      {subiu ? '+' : ''}
      {v}%
    </span>
  )
}

/** "2026-09-05" -> "05/09". Rótulo de eixo precisa caber, não ser completo. */
function diaCurto(iso: string): string {
  const [, mes, dia] = iso.split('-')
  return `${dia}/${mes}`
}

function dimensaoLegivel(d: DimensaoRelatorio): string {
  return {
    intencao: 'Assunto',
    funil: 'Etapa do funil',
    temperatura: 'Temperatura',
    etiqueta: 'Etiqueta',
    prioridade: 'Prioridade',
    sistema: 'Sistema do veículo',
    componente: 'Peça citada',
    risco: 'Risco de segurança',
  }[d]
}

/** Campo com ; " ou quebra de linha precisa de aspas dobradas no CSV. */
function escaparCsv(valor: string): string {
  return /[;"\r\n]/.test(valor) ? `"${valor.replace(/"/g, '""')}"` : valor
}
