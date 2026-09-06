import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { TriangleAlert, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui'
import { cn } from '@/lib/utils'

interface ConfirmDialogProps {
  open: boolean
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'danger' | 'default'
  icon?: LucideIcon
  loading?: boolean
  onConfirm: () => void
  onClose: () => void
}

/**
 * Confirmação curta: pergunta e dois botões. Nada de formulário.
 * Para o que é irreversível, use tone="danger".
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  tone = 'default',
  icon: Icon = TriangleAlert,
  loading = false,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && !loading) onClose()
      if (event.key === 'Enter' && !loading) onConfirm()
    }
    document.addEventListener('keydown', onKey)
    const focus = requestAnimationFrame(() => confirmRef.current?.focus())
    return () => {
      document.removeEventListener('keydown', onKey)
      cancelAnimationFrame(focus)
    }
  }, [open, loading, onClose, onConfirm])

  if (!open) return null

  const danger = tone === 'danger'

  return createPortal(
    <div
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !loading) onClose()
      }}
      // No celular vira folha ancorada embaixo (mais fácil de alcançar com o
      // polegar); no desktop volta a ser um cartão centralizado.
      className="animate-in-fade fixed inset-0 z-50 flex items-end justify-center bg-navy-950/45 backdrop-blur-[2px] sm:items-center sm:p-4"
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        className="animate-in-rise flex max-h-[90vh] max-h-[90dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-surface shadow-[var(--shadow-pop)] sm:max-w-[380px] sm:rounded-2xl"
      >
        {/* Pega-mao: sinaliza que e uma folha arrastavel, so no celular. */}
        <div className="flex justify-center pt-2 sm:hidden">
          <span className="h-1 w-9 rounded-full bg-ink/15" />
        </div>

        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-5">
          <div className="flex gap-3.5">
            <span
              className={cn(
                'flex size-10 shrink-0 items-center justify-center rounded-xl',
                danger ? 'bg-red-50 text-red-600' : 'bg-ink/[0.06] text-ink',
              )}
            >
              <Icon className="size-5" />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="text-base font-semibold leading-tight text-ink">{title}</p>
              {description && (
                <p className="mt-1.5 text-sm leading-snug text-ink/60">{description}</p>
              )}
            </div>
          </div>
        </div>

        {/* Sticky: os botões ficam sempre visíveis, mesmo com o teclado
            virtual aberto ou a descrição precisando rolar. */}
        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-line/80 bg-surface-soft px-5 py-3 pb-safe-3 sm:border-t-0 sm:bg-transparent sm:px-5 sm:pb-5 sm:pt-0 [&>button]:flex-1 sm:[&>button]:flex-none">
          <Button variant="outline" size="sm" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            ref={confirmRef}
            size="sm"
            variant={danger ? 'danger' : 'primary'}
            loading={loading}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
