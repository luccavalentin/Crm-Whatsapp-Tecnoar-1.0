import { useState } from 'react'
import { CalendarRange } from 'lucide-react'
import { Field } from '@/components/ui'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui'
import { cn } from '@/lib/utils'
import type { PeriodKey } from '@/features/metrics/api'

const OPTIONS: Array<{ key: PeriodKey; label: string }> = [
  { key: 'hoje', label: 'Hoje' },
  { key: '7d', label: '7 dias' },
  { key: '30d', label: '30 dias' },
]

export function PeriodFilter({
  value,
  custom,
  onChange,
}: {
  value: PeriodKey
  custom?: { from: string; to: string }
  onChange: (key: PeriodKey, custom?: { from: string; to: string }) => void
}) {
  const [open, setOpen] = useState(false)
  const [range, setRange] = useState({ from: custom?.from ?? '', to: custom?.to ?? '' })

  return (
    <>
      {/* flex-wrap evita que a barra de presets estoure a largura da tela em
          telas muito estreitas — vira duas linhas em vez de forcar scroll
          horizontal na Topbar. */}
      <div className="flex flex-wrap shrink-0 gap-1 rounded-xl border border-surface/80 bg-surface/75 p-1 shadow-[var(--shadow-card)] ring-1 ring-ink/[0.035]">
        {OPTIONS.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => onChange(option.key)}
            className={cn(
              'rounded-lg px-3 py-1.5 text-xs font-medium transition-all',
              value === option.key
                ? 'bg-navy-900 text-white glow [--glow:var(--color-navy-900)]'
                : 'text-muted hover:bg-surface hover:text-ink',
            )}
          >
            {option.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cn(
            'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all',
            value === 'custom'
              ? 'bg-navy-900 text-white glow [--glow:var(--color-navy-900)]'
              : 'text-muted hover:bg-surface hover:text-ink',
          )}
        >
          <CalendarRange className="size-3.5" />
          <span className="hidden sm:inline">Personalizado</span>
        </button>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Período personalizado"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (!range.from || !range.to) return
                onChange('custom', range)
                setOpen(false)
              }}
            >
              Aplicar
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="De"
            type="date"
            value={range.from}
            onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
          />
          <Field
            label="Até"
            type="date"
            value={range.to}
            onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
          />
        </div>
      </Modal>
    </>
  )
}
