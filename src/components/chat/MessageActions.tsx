import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Copy, Plus, Reply, SmilePlus, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { MessageReaction } from '@/features/conversations/api'

/** As mesmas reações rápidas que o WhatsApp oferece. */
const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'] as const

interface MessageActionsProps {
  /** Lado da bolha, para o menu abrir do lado de dentro. */
  side: 'left' | 'right'
  canReact: boolean
  hasText: boolean
  reacting: boolean
  /** Emoji com que o usuário atual já reagiu, se houver. */
  mine: string | null
  onReact: (emoji: string | null) => void
  onReply: () => void
  onCopy: () => void
  /** Abre o teclado completo de emojis, para além das seis rápidas. */
  onAbrirPicker?: () => void
}

export function MessageActions({
  side,
  canReact,
  hasText,
  reacting,
  mine,
  onReact,
  onReply,
  onCopy,
  onAbrirPicker,
}: MessageActionsProps) {
  const [aberto, setAberto] = useState<'nada' | 'menu' | 'reacoes'>('nada')
  const [copied, setCopied] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (aberto === 'nada') return
    function onDown(event: MouseEvent) {
      if (!box.current?.contains(event.target as Node)) setAberto('nada')
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setAberto('nada')
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [aberto])

  useEffect(() => {
    if (!copied) return
    const id = setTimeout(() => setCopied(false), 1400)
    return () => clearTimeout(id)
  }, [copied])

  const fechar = () => setAberto('nada')

  return (
    <div ref={box} className="absolute right-1 top-1 z-20">
      {/* A seta fica DENTRO da bolha, no canto, como no WhatsApp. Antes eram
          três ícones flutuando ao lado — quem não conhecia o sistema não
          descobria que dava para responder ou reagir. */}
      <button
        type="button"
        onClick={() => setAberto((v) => (v === 'nada' ? 'menu' : 'nada'))}
        aria-label="Ações da mensagem"
        aria-haspopup="menu"
        aria-expanded={aberto === 'menu'}
        className={cn(
          'flex size-[22px] items-center justify-center rounded-md text-ink/45 transition-opacity',
          'hover:bg-ink/[0.07] hover:text-ink/80',
          // No toque não existe hover: no celular a seta fica sempre visível.
          'opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100',
          aberto !== 'nada' && 'sm:opacity-100',
        )}
      >
        <ChevronDown className="size-4" />
      </button>

      {aberto === 'menu' && (
        <div
          role="menu"
          className={cn(
            'animate-in-rise absolute top-7 z-30 w-44 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-[var(--shadow-pop)]',
            side === 'right' ? 'right-0' : 'left-0',
          )}
        >
          <ItemDoMenu
            icone={Reply}
            rotulo="Responder"
            onClick={() => {
              onReply()
              fechar()
            }}
          />
          {canReact && (
            <ItemDoMenu
              icone={SmilePlus}
              rotulo="Reagir"
              onClick={() => setAberto('reacoes')}
            />
          )}
          {hasText && (
            <ItemDoMenu
              icone={copied ? Check : Copy}
              rotulo={copied ? 'Copiado' : 'Copiar texto'}
              onClick={() => {
                onCopy()
                setCopied(true)
                fechar()
              }}
            />
          )}
        </div>
      )}

      {aberto === 'reacoes' && (
        <div
          className={cn(
            'animate-in-rise absolute top-7 z-30 flex items-center gap-0.5 rounded-full border border-line bg-surface px-1.5 py-1 shadow-[var(--shadow-pop)]',
            side === 'right' ? 'right-0' : 'left-0',
          )}
        >
          {QUICK_REACTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              disabled={reacting}
              onClick={() => {
                onReact(mine === emoji ? null : emoji)
                fechar()
              }}
              title={`Reagir com ${emoji}`}
              className={cn(
                'flex size-8 items-center justify-center rounded-full text-lg transition-transform',
                'hover:scale-125 disabled:opacity-40',
                mine === emoji && 'bg-cyan-100',
              )}
            >
              {emoji}
            </button>
          ))}
          {/* O "+" abre o teclado inteiro, igual ao WhatsApp: as seis rápidas
              resolvem quase tudo, mas nunca tudo. */}
          {onAbrirPicker && (
            <button
              type="button"
              onClick={() => {
                onAbrirPicker()
                fechar()
              }}
              title="Mais emojis"
              aria-label="Mais emojis"
              className="ml-0.5 flex size-8 items-center justify-center rounded-full border border-line text-muted transition-colors hover:bg-ink/[0.05] hover:text-ink"
            >
              <Plus className="size-4" />
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function ItemDoMenu({
  icone: Icone,
  rotulo,
  onClick,
}: {
  icone: LucideIcon
  rotulo: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 px-3 py-1.5 text-sm text-ink/85 transition-colors hover:bg-ink/[0.05]"
    >
      <Icone className="size-4 text-muted" />
      {rotulo}
    </button>
  )
}

export function ReactionChips({
  reactions,
  myProfileId,
  onToggle,
}: {
  reactions: MessageReaction[]
  myProfileId: string | null
  onToggle: (emoji: string | null) => void
}) {
  if (reactions.length === 0) return null

  const grouped = new Map<string, { count: number; mine: boolean }>()
  for (const reaction of reactions) {
    const entry = grouped.get(reaction.emoji) ?? { count: 0, mine: false }
    entry.count += 1
    if (!reaction.by_customer && reaction.profile_id === myProfileId) entry.mine = true
    grouped.set(reaction.emoji, entry)
  }

  // Coladas na borda de baixo da bolha, transbordando um pouco — é assim que
  // o WhatsApp mostra reação, e é o que a faz parecer parte da mensagem em vez
  // de um controle solto embaixo dela.
  return (
    <div className="-mt-2 flex flex-wrap gap-1 pl-2">
      {[...grouped.entries()].map(([emoji, { count, mine }]) => (
        <button
          key={emoji}
          type="button"
          onClick={() => onToggle(mine ? null : emoji)}
          title={mine ? 'Remover sua reação' : `Reagir com ${emoji}`}
          className={cn(
            'flex items-center gap-1 rounded-full border px-1.5 py-[3px] text-xs leading-none shadow-[var(--shadow-card)] transition-colors',
            mine
              ? 'border-cyan-500/40 bg-cyan-100 text-cyan-600'
              : 'border-line bg-surface text-ink/70 hover:bg-ink/[0.04]',
          )}
        >
          <span className="text-sm">{emoji}</span>
          {count > 1 && <span className="font-medium tabular-nums">{count}</span>}
        </button>
      ))}
    </div>
  )
}
