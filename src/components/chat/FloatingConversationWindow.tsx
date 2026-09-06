import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  Bot,
  Check,
  CheckCheck,
  ExternalLink,
  GripHorizontal,
  Maximize2,
  MessageSquare,
  Minus,
  Phone,
  RotateCw,
  Send,
  X,
} from 'lucide-react'
import { Alert, Badge, EmptyState, Spinner } from '@/components/ui'
import { Avatar } from '@/components/ui/Avatar'
import { Composer } from '@/components/chat/Composer'
import { MessageMedia } from '@/components/chat/MessageMedia'
import { MessageLocation, parseLocation } from '@/components/chat/MessageLocation'
import { useAuth } from '@/contexts/AuthContext'
import { useFloatingChat } from '@/contexts/FloatingChatContext'
import {
  useConversation,
  useMarkRead,
  useMessages,
  useRealtimeInbox,
  useRetryMessage,
  useSendMessage,
  type MessageWithSender,
} from '@/features/conversations/api'
import type { UploadedMedia } from '@/features/conversations/media'
import { STATUS_LABEL, STATUS_TONE } from '@/features/conversations/status'
import { formatTime, relativeFromNow } from '@/lib/datetime'
import { formatPhone } from '@/lib/phone'
import { cn, displayName } from '@/lib/utils'

function initialFloatingPosition() {
  if (typeof window === 'undefined') return { x: 28, y: 28 }
  return {
    x: Math.max(16, window.innerWidth - 444),
    y: Math.max(16, window.innerHeight - 674),
  }
}

export function FloatingConversationWindow() {
  const { conversationId, minimized, closeChat, setMinimized } = useFloatingChat()
  const { company } = useAuth()
  const [position, setPosition] = useState(initialFloatingPosition)
  const dragRef = useRef<{ dx: number; dy: number } | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [needsTemplate, setNeedsTemplate] = useState(false)

  useRealtimeInbox(company?.id)
  const { data: conversation, isLoading } = useConversation(conversationId ?? undefined)
  const { data: messages } = useMessages(conversationId ?? undefined)
  const markRead = useMarkRead()
  const sendMessage = useSendMessage()
  const retryMessage = useRetryMessage()

  useEffect(() => {
    if (conversation && conversationId && conversation.unread_count > 0) markRead.mutate(conversationId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, conversation?.unread_count])

  useEffect(() => {
    const element = scrollRef.current
    if (element) element.scrollTop = element.scrollHeight
  }, [messages?.length, minimized])

  useEffect(() => {
    function handleMove(event: globalThis.PointerEvent) {
      const drag = dragRef.current
      if (!drag) return
      const width = 420
      const height = minimized ? 56 : 650
      setPosition({
        x: Math.max(8, Math.min(window.innerWidth - width - 8, event.clientX - drag.dx)),
        y: Math.max(8, Math.min(window.innerHeight - height - 8, event.clientY - drag.dy)),
      })
    }
    function handleUp() {
      dragRef.current = null
    }
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
    }
  }, [minimized])

  if (!conversationId) return null

  const customerName = displayName(
    conversation?.customer?.name || conversation?.customer?.whatsapp_name,
    'Atendimento',
  )
  const isClosed = conversation?.status === 'concluido'

  function startDrag(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.closest('[data-floating-chat]')?.getBoundingClientRect()
    if (!rect) return
    dragRef.current = { dx: event.clientX - rect.left, dy: event.clientY - rect.top }
  }

  async function handleSend(content: string, media?: UploadedMedia): Promise<boolean> {
    if (!conversationId) return false
    setError(null)
    try {
      const result = await sendMessage.mutateAsync({
        conversationId,
        text: content,
        clientToken: crypto.randomUUID(),
        media,
      })
      setNeedsTemplate(Boolean(result.requiresTemplate))
      if (result.error) {
        setError(result.error)
        return false
      }
      return true
    } catch (err) {
      setError((err as Error).message)
      return false
    }
  }

  return (
    <aside
      data-floating-chat
      className={cn(
        'fixed z-50 overflow-hidden rounded-2xl border border-surface/80 bg-surface shadow-[var(--shadow-pop)] ring-1 ring-ink/[0.08]',
        'w-[min(calc(100vw-24px),420px)]',
        minimized ? 'h-14' : 'h-[min(calc(100vh-24px),650px)]',
      )}
      style={{ left: position.x, top: position.y }}
      aria-label="Chat solto"
    >
      <div
        onPointerDown={startDrag}
        className="flex h-14 cursor-move items-center gap-2 border-b border-white/10 bg-navy-900 px-3 text-white"
      >
        <GripHorizontal className="size-4 shrink-0 text-white/40" />
        <Avatar
          name={customerName}
          seed={conversation?.customer?.id ?? conversationId}
          size="sm"
          tone="navy"
          className="ring-white/10"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{customerName}</p>
          <p className="truncate text-2xs text-white/55">
            {conversation?.customer?.phone
              ? formatPhone(conversation.customer.phone)
              : 'Chat de atendimento'}
          </p>
        </div>
        {conversation && !minimized && (
          <Badge tone={STATUS_TONE[conversation.status]}>{STATUS_LABEL[conversation.status]}</Badge>
        )}
        <button
          type="button"
          onClick={() => setMinimized(!minimized)}
          className="rounded-lg p-1.5 text-white/65 transition-colors hover:bg-white/10 hover:text-white"
          aria-label={minimized ? 'Restaurar chat' : 'Minimizar chat'}
          title={minimized ? 'Restaurar chat' : 'Minimizar chat'}
        >
          {minimized ? <Maximize2 className="size-4" /> : <Minus className="size-4" />}
        </button>
        <button
          type="button"
          onClick={closeChat}
          className="rounded-lg p-1.5 text-white/65 transition-colors hover:bg-white/10 hover:text-white"
          aria-label="Fechar chat solto"
          title="Fechar chat solto"
        >
          <X className="size-4" />
        </button>
      </div>

      {!minimized && (
        <div className="flex h-[calc(100%-3.5rem)] min-h-0 flex-col">
          {isLoading || !conversation ? (
            <div className="flex flex-1 items-center justify-center bg-canvas">
              <Spinner />
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 border-b border-line/80 bg-surface px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-ink">
                    Conversando sem sair da tela atual
                  </p>
                  <p className="truncate text-2xs text-muted">
                    Última mensagem {relativeFromNow(conversation.last_message_at)}
                  </p>
                </div>
                <Link
                  to={`/atendimentos?conversa=${conversationId}`}
                  className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 text-xs font-medium text-ink shadow-[var(--shadow-card)] transition-colors hover:bg-ink/[0.04]"
                >
                  <ExternalLink className="size-3.5" />
                  Abrir
                </Link>
              </div>

              <div
                ref={scrollRef}
                className="chat-surface scrollbar-thin min-h-0 flex-1 overflow-y-auto px-4 py-4"
              >
                {!messages || messages.length === 0 ? (
                  <EmptyState
                    icon={MessageSquare}
                    title="Nenhuma mensagem"
                    description="As mensagens aparecem aqui em tempo real."
                  />
                ) : (
                  <FloatingMessageList
                    messages={messages}
                    retrying={retryMessage.isPending}
                    onRetry={(id) => retryMessage.mutate(id)}
                  />
                )}
              </div>

              {needsTemplate && !isClosed && (
                <div className="border-t border-orange-500/25 bg-orange-100/70 px-3 py-2 text-xs leading-snug text-ink">
                  Fora da janela de 24h, envie um modelo aprovado no atendimento completo.
                </div>
              )}

              {error && !needsTemplate && (
                <div className="border-t border-line bg-surface px-3 py-2">
                  <Alert tone="error">{error}</Alert>
                </div>
              )}

              {isClosed ? (
                <div className="border-t border-line bg-surface px-4 py-3 text-center text-xs text-muted">
                  Atendimento concluído. Reabra no atendimento completo para enviar mensagens.
                </div>
              ) : (
                <Composer
                  companyId={company?.id ?? ''}
                  conversationId={conversationId}
                  sending={sendMessage.isPending}
                  replyTo={null}
                  onCancelReply={() => undefined}
                  onSend={handleSend}
                  onError={setError}
                />
              )}
            </>
          )}
        </div>
      )}
    </aside>
  )
}

function FloatingMessageList({
  messages,
  onRetry,
  retrying,
}: {
  messages: MessageWithSender[]
  onRetry: (id: string) => void
  retrying: boolean
}) {
  return (
    <div className="space-y-2.5">
      {messages.map((message) => (
        <FloatingMessage
          key={message.id}
          message={message}
          onRetry={onRetry}
          retrying={retrying}
        />
      ))}
    </div>
  )
}

function FloatingMessage({
  message,
  onRetry,
  retrying,
}: {
  message: MessageWithSender
  onRetry: (id: string) => void
  retrying: boolean
}) {
  const isInbound = message.direction === 'inbound'
  const isAI = message.sender === 'ia'
  const isSystem = message.sender === 'sistema'
  const hasMedia = Boolean(message.media_url)
  const localizacao = parseLocation(message.location)
  const falhou = message.status === 'falhou'
  const enviando = message.status === 'pendente' || message.status === 'enviando'

  if (isSystem) {
    return (
      <div className="flex justify-center">
        <span className="rounded-full bg-ink/[0.04] px-3 py-1 text-2xs text-muted">
          {message.body}
        </span>
      </div>
    )
  }

  return (
    <div className={cn('flex', isInbound ? 'justify-start' : 'justify-end')}>
      <div className={cn('max-w-[84%] min-w-0', isInbound ? 'text-left' : 'text-right')}>
        <div
          className={cn(
            'rounded-2xl px-3 py-2 text-left text-sm leading-relaxed shadow-[var(--shadow-card)]',
            isInbound
              ? 'rounded-tl-md bg-surface text-ink ring-1 ring-ink/[0.045]'
              : isAI
                ? 'rounded-tr-md bg-cyan-500 text-white'
                : 'rounded-tr-md bg-navy-900 text-white',
            falhou && 'ring-2 ring-red-500/[0.45]',
            enviando && 'opacity-70',
          )}
        >
          {!isInbound && (
            <p className="mb-0.5 flex items-center gap-1 text-2xs font-medium text-white/70">
              {isAI ? <Bot className="size-3" /> : <Phone className="size-3" />}
              {isAI ? 'IA' : message.sender_profile?.full_name || 'Atendente'}
            </p>
          )}
          {localizacao && (
            <div className={cn(message.body ? 'mb-2' : '')}>
              <MessageLocation location={localizacao} onDark={!isInbound} />
            </div>
          )}
          {hasMedia && (
            <div className={cn(message.body ? 'mb-2' : '')}>
              <MessageMedia
                path={message.media_url!}
                mime={message.media_mime}
                name={message.media_name}
                type={message.type}
                onDark={!isInbound}
              />
            </div>
          )}
          {message.body ? (
            <p className="whitespace-pre-wrap break-words">{message.body}</p>
          ) : (
            !hasMedia &&
            !localizacao && (
              <p className={cn('italic', isInbound ? 'text-muted' : 'text-white/60')}>
                Mensagem sem texto
              </p>
            )
          )}
        </div>
        <div
          className={cn(
            'mt-1 flex items-center gap-1 px-1 text-2xs text-muted',
            isInbound ? 'justify-start' : 'justify-end',
          )}
        >
          <span>{formatTime(message.sent_at ?? message.created_at)}</span>
          {!isInbound && <FloatingStatusIcon status={message.status} />}
        </div>
        {falhou && (
          <button
            type="button"
            disabled={retrying}
            onClick={() => onRetry(message.id)}
            className="mt-1 inline-flex items-center gap-1 rounded-lg bg-red-600 px-2 py-1 text-2xs font-medium text-white disabled:opacity-50"
          >
            <RotateCw className={cn('size-3', retrying && 'animate-spin')} />
            Reenviar
          </button>
        )}
      </div>
    </div>
  )
}

function FloatingStatusIcon({ status }: { status: MessageWithSender['status'] }) {
  switch (status) {
    case 'pendente':
    case 'enviando':
      return <Send className="size-3" aria-label="Enviando" />
    case 'enviada':
      return <Check className="size-3" aria-label="Enviada" />
    case 'entregue':
      return <CheckCheck className="size-3" aria-label="Entregue" />
    case 'lida':
      return <CheckCheck className="size-3 text-cyan-500" aria-label="Lida" />
    case 'falhou':
      return <X className="size-3 text-red-600" aria-label="Falhou" />
  }
}
