import { useId, useState } from 'react'
import { Table2, BarChart3 } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface BarSeries {
  key: string
  label: string
  color: string
}

export interface BarPoint {
  label: string
  values: Record<string, number>
}

/**
 * Gráfico de barras em SVG, sem biblioteca externa.
 * Renderiza apenas os dados recebidos — quem chama decide o estado vazio.
 */
export function BarChart({
  data,
  series,
  height = 220,
  className,
}: {
  data: BarPoint[]
  series: BarSeries[]
  height?: number
  className?: string
}) {
  const id = useId()
  const [comoTabela, setComoTabela] = useState(false)
  const max = Math.max(1, ...data.flatMap((point) => series.map((s) => point.values[s.key] ?? 0)))
  const ticks = niceTicks(max)
  const top = ticks[ticks.length - 1]

  const paddingLeft = 38
  const paddingBottom = 26
  const paddingTop = 10
  const width = Math.max(320, data.length * (series.length * 14 + 22) + paddingLeft)
  const plotHeight = height - paddingBottom - paddingTop
  const slot = (width - paddingLeft - 8) / Math.max(1, data.length)
  const barWidth = Math.min(18, (slot - 10) / series.length)

  return (
    <div className={cn('w-full min-w-0 max-w-full', className)}>
      {comoTabela ? (
        <Tabela data={data} series={series} />
      ) : (
      <div className="scrollbar-thin w-full max-w-full overflow-x-auto">
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`Barras por período: ${series.map((s) => s.label).join(', ')}`}
        >
          {/* Grade quase invisível: ela orienta, não compete com o dado.
              Só a linha de base fica visível, porque é a referência do zero. */}
          {ticks.map((tick) => {
            const y = paddingTop + plotHeight - (tick / top) * plotHeight
            const base = tick === 0
            return (
              <g key={tick}>
                <line
                  x1={paddingLeft}
                  x2={width - 6}
                  y1={y}
                  y2={y}
                  stroke={base ? 'var(--color-line-strong)' : 'var(--color-line)'}
                  strokeWidth={base ? 1 : 1}
                />
                <text
                  x={paddingLeft - 8}
                  y={y + 3.5}
                  fontSize="10"
                  textAnchor="end"
                  fill="var(--color-steel-400)"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {tick}
                </text>
              </g>
            )
          })}

          {data.map((point, index) => {
            const groupX = paddingLeft + index * slot + 6
            const larguraGrupo = series.length * (barWidth + 3)
            return (
              <g key={`${id}-${point.label}-${index}`} className="group/col">
                {/* Faixa de leitura: passar o mouse na coluna inteira, e não
                    em cada barrinha de 18px, para ver os valores. */}
                <rect
                  x={groupX - 5}
                  y={paddingTop}
                  width={larguraGrupo + 8}
                  height={plotHeight}
                  fill="var(--color-ink)"
                  opacity={0}
                  className="transition-opacity group-hover/col:opacity-[0.035]"
                />
                {series.map((serie, serieIndex) => {
                  const value = point.values[serie.key] ?? 0
                  const barHeight = (value / top) * plotHeight
                  const x = groupX + serieIndex * (barWidth + 3)
                  const y = paddingTop + plotHeight - barHeight
                  return (
                    <rect
                      key={serie.key}
                      x={x}
                      y={value === 0 ? paddingTop + plotHeight - 1 : y}
                      width={barWidth}
                      height={value === 0 ? 1 : Math.max(1, barHeight)}
                      rx={2}
                      fill={serie.color}
                    >
                      <title>{`${point.label} · ${serie.label}: ${value}`}</title>
                    </rect>
                  )
                })}
                <text
                  x={groupX + larguraGrupo / 2 - 2}
                  y={height - 8}
                  fontSize="10"
                  fill="var(--color-steel-400)"
                  textAnchor="middle"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {point.label}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {series.map((serie) => (
            <span key={serie.key} className="flex items-center gap-1.5 text-xs text-muted">
              <span className="size-2.5 rounded-sm" style={{ background: serie.color }} />
              {serie.label}
            </span>
          ))}
        </div>

        {/* A tabela nao e enfeite de acessibilidade: e o caminho de quem
            precisa copiar o numero para uma planilha ou para o WhatsApp do
            dono — e a saida de quem nao distingue as cores das series. */}
        <button
          type="button"
          onClick={() => setComoTabela((v) => !v)}
          aria-pressed={comoTabela}
          className="flex shrink-0 items-center gap-1.5 rounded-lg px-1.5 py-1 text-xs font-medium text-muted transition-colors hover:bg-ink/[0.05] hover:text-ink"
        >
          {comoTabela ? <BarChart3 className="size-3.5" /> : <Table2 className="size-3.5" />}
          {comoTabela ? 'Ver como gráfico' : 'Ver como tabela'}
        </button>
      </div>
    </div>
  )
}

/** Os mesmos números do gráfico, em texto: para copiar e para ler sem cor. */
function Tabela({ data, series }: { data: BarPoint[]; series: BarSeries[] }) {
  return (
    <div className="scrollbar-thin w-full max-w-full overflow-x-auto">
      <table className="w-full min-w-[320px] border-collapse text-xs">
        <thead>
          <tr className="border-b border-line-strong text-left">
            <th className="py-1.5 pr-3 font-medium text-muted">Período</th>
            {series.map((serie) => (
              <th key={serie.key} className="py-1.5 pl-3 text-right font-medium text-muted">
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2 rounded-sm" style={{ background: serie.color }} />
                  {serie.label}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((point, index) => (
            <tr key={`${point.label}-${index}`} className="border-b border-line last:border-0">
              <td className="py-1.5 pr-3 text-ink-soft">{point.label}</td>
              {series.map((serie) => (
                <td key={serie.key} className="nums py-1.5 pl-3 text-right font-medium text-ink">
                  {point.values[serie.key] ?? 0}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function niceTicks(max: number): number[] {
  const step = Math.max(1, Math.ceil(max / 4))
  const rounded = step <= 2 ? step : Math.ceil(step / 5) * 5
  const ticks: number[] = []
  for (let value = 0; value <= rounded * 4; value += rounded) ticks.push(value)
  return ticks
}
