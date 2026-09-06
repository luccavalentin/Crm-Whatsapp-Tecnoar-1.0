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
      className="animate-in-fade fixed inset-0 z-50 flex items-center justify-center bg-navy-950/45 p-4 backdrop-blur-[2px]"
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        className="animate-in-rise w-full max-w-[380px] rounded-2xl bg-surface p-5 shadow-[var(--shadow-pop)]"
      >
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

        <div className="mt-5 flex justify-end gap-2">
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
