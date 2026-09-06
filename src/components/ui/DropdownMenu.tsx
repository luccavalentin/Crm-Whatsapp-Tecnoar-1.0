import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { MoreHorizontal, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface MenuItem {
  key: string
  label: string
  icon?: LucideIcon
  onClick: () => void
  /** Ação destrutiva: vem separada e em vermelho. */
  danger?: boolean
  disabled?: boolean
  hint?: string
}

/**
 * Menu de ações secundárias.
 *
 * Existe para tirar da barra o que não é a ação principal. Numa faixa com
 * seis botões, nenhum deles é primário — e no celular viram seis ícones
 * iguais que ninguém distingue sob pressão.
 */
export function DropdownMenu({
  items,
  label = 'Mais ações',
  align = 'right',
  trigger,
}: {
  items: MenuItem[]
  label?: string
  align?: 'left' | 'right'
  trigger?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const raiz = useRef<HTMLDivElement>(null)
  const id = useId()

  useEffect(() => {
    if (!open) return
    const foraDaArea = (event: MouseEvent) => {
      if (raiz.current && !raiz.current.contains(event.target as Node)) setOpen(false)
    }
    const tecla = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', foraDaArea)
    document.addEventListener('keydown', tecla)
    return () => {
      document.removeEventListener('mousedown', foraDaArea)
      document.removeEventListener('keydown', tecla)
    }
  }, [open])

  const visiveis = items.filter(Boolean)
  if (visiveis.length === 0) return null

  const normais = visiveis.filter((item) => !item.danger)
  const perigosas = visiveis.filter((item) => item.danger)

  const linha = (item: MenuItem) => (
    <button
      key={item.key}
      type="button"
      role="menuitem"
      disabled={item.disabled}
      onClick={() => {
        setOpen(false)
        item.onClick()
      }}
      className={cn(
        'flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors',
        'disabled:pointer-events-none disabled:opacity-45',
        item.danger
          ? 'text-red-600 hover:bg-red-50'
          : 'text-ink/80 hover:bg-ink/[0.05]',
      )}
    >
      {item.icon && (
        <item.icon className={cn('mt-px size-4 shrink-0', item.danger ? '' : 'text-muted')} />
      )}
      <span className="min-w-0">
        <span className="block truncate">{item.label}</span>
        {item.hint && (
          <span className="block text-2xs leading-snug text-muted">{item.hint}</span>
        )}
      </span>
    </button>
  )

  return (
    <div ref={raiz} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={id}
        aria-label={label}
        title={label}
        className={cn(
          'inline-flex size-8 items-center justify-center rounded-lg transition-colors',
          open
            ? 'bg-surface text-ink shadow-[var(--shadow-card)]'
            : 'text-ink/55 hover:bg-surface hover:text-ink hover:shadow-[var(--shadow-card)]',
        )}
      >
        {trigger ?? <MoreHorizontal className="size-[18px]" />}
      </button>

      {open && (
        <div
          id={id}
          role="menu"
          className={cn(
            'animate-in-rise absolute z-30 mt-1.5 w-56 overflow-hidden rounded-xl border border-surface/80 bg-surface p-1.5 shadow-[var(--shadow-pop)] ring-1 ring-ink/[0.045]',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          {normais.map(linha)}
          {perigosas.length > 0 && normais.length > 0 && (
            <div className="my-1 border-t border-line" />
          )}
          {perigosas.map(linha)}
        </div>
      )}
    </div>
  )
}
