import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Archive,
  ArchiveRestore,
  AlertTriangle,
  ArrowLeft,
  ArrowRightLeft,
  Bot,
  Building2,
  CalendarClock,
  Check,
  CheckCheck,
  ChevronDown,
  CircleAlert,
  Clock,
  ExternalLink,
  FileText,
  Hand,
  Info,
  MessageSquarePlus,
  MessagesSquare,
  Phone,
  RotateCw,
  Send,
  SquareCheckBig,
  User,
  UserCheck,
  Zap,
  Trash2,
} from 'lucide-react'
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  Field,
  SectionTitle,
  Select,
  Spinner,
  TextArea,
} from '@/components/ui'
import { Modal } from '@/components/ui/Modal'
import { DropdownMenu } from '@/components/ui/DropdownMenu'
import { ConversationTags } from '@/components/chat/ConversationTags'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { usePageChrome } from '@/components/layout/AppLayout'
import { useAuth } from '@/contexts/AuthContext'
import { useFloatingChat } from '@/contexts/FloatingChatContext'
import { useCompanyMembers } from '@/features/team/api'
import { useCustomers } from '@/features/customers/api'
import {
  useAssignConversation,
  useCloseConversation,
  useConversation,
  useConversationEvents,
  useConversations,
  useInboxCounters,
  useMarkRead,
  useMessages,
  useOpenConversation,
  useRealtimeInbox,
  useReopenConversation,
  useRetryMessage,
  useEraseConversation,
  useArchiveConversation,
  useReactToMessage,
  useSendMessage,
  useSetConversationAI,
  useTransferConversation,
  type ConversationWithRelations,
  type InboxFilter,
  type MessageWithSender,
} from '@/features/conversations/api'
import { formatPhone, isValidPhone, maskPhoneInput } from '@/lib/phone'
import { dayLabel, formatFull, formatTime, relativeFromNow } from '@/lib/datetime'
import { Avatar } from '@/components/ui/Avatar'
import { Composer, type ReplyTarget } from '@/components/chat/Composer'
import { MessageActions, ReactionChips } from '@/components/chat/MessageActions'
import { usePermissions } from '@/features/permissions'
import { MessageMedia } from '@/components/chat/MessageMedia'
import { MessageLocation, parseLocation } from '@/components/chat/MessageLocation'
import type { UploadedMedia } from '@/features/conversations/media'
import { cn, displayName } from '@/lib/utils'
import {
  PRIORITY_LABEL,
  STATUS_LABEL,
  STATUS_TONE,
} from '@/features/conversations/status'

const FILTERS: Array<{ key: InboxFilter; label: string }> = [
  { key: 'todos', label: 'Todos' },
  { key: 'novos', label: 'Novos' },
  { key: 'meus', label: 'Meus' },
  { key: 'ia', label: 'IA' },
  { key: 'aguardando_humano', label: 'Aguardando humano' },
  { key: 'emergencia', label: 'Emergência' },
  { key: 'concluidos', label: 'Concluídos' },
  { key: 'arquivados', label: 'Arquivados' },
]

function filterAccent(filter: InboxFilter) {
  if (filter === 'emergencia') return 'bg-red-500'
  if (filter === 'ia') return 'bg-cyan-500'
  if (filter === 'aguardando_humano') return 'bg-orange-500'
  if (filter === 'concluidos') return 'bg-emerald-500'
  if (filter === 'arquivados') return 'bg-muted'
  return 'bg-navy-900'
}

export function AtendimentosPage() {
  const { company, user, profile } = useAuth()
  const [params, setParams] = useSearchParams()
  const [filter, setFilter] = useState<InboxFilter>('todos')
  const [filterOpen, setFilterOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [newOpen, setNewOpen] = useState(false)
  const filterMenuRef = useRef<HTMLDivElement>(null)
  const canSeeAllQueues = profile ? ['owner', 'admin', 'manager'].includes(profile.role) : true
  const visibleFilters = useMemo(
    () => (canSeeAllQueues ? FILTERS : FILTERS.filter((item) => item.key !== 'todos')),
    [canSeeAllQueues],
  )
  const effectiveFilter = canSeeAllQueues || filter !== 'todos' ? filter : 'meus'
  const selectedFilter = visibleFilters.find((item) => item.key === effectiveFilter) ?? visibleFilters[0]

  const selectedId = params.get('conversa')
  const setSelectedId = (id: string | null) => {
    const next = new URLSearchParams(params)
    if (id) next.set('conversa', id)
    else next.delete('conversa')
    setParams(next, { replace: true })
  }

  useRealtimeInbox(company?.id)
  const counters = useInboxCounters(company?.id, user?.id)
  const { data: conversations, isLoading } = useConversations(
    company?.id,
    effectiveFilter,
    user?.id,
    search,
  )

  useEffect(() => {
    if (!canSeeAllQueues && filter === 'todos') setFilter('meus')
  }, [canSeeAllQueues, filter])

  useEffect(() => {
    if (!filterOpen) return

    function handlePointerDown(event: MouseEvent) {
      if (!filterMenuRef.current?.contains(event.target as Node)) setFilterOpen(false)
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setFilterOpen(false)
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [filterOpen])

  usePageChrome(
    {
      onSearch: setSearch,
      searchPlaceholder: 'Buscar conversa…',
      actions: (
        <Button size="sm" onClick={() => setNewOpen(true)}>
          <MessageSquarePlus className="size-4" />
          <span className="hidden sm:inline">Nova conversa</span>
        </Button>
      ),
    },
    [],
  )

  return (
    <div className="flex h-full min-h-0">
      {/* Coluna 1 — lista */}
      <aside
        className={cn(
          'subtle-panel flex w-full min-w-0 flex-col border-r border-line/80 bg-surface lg:w-[340px] lg:shrink-0',
          selectedId && 'hidden lg:flex',
        )}
      >
        <div className="border-b border-line/80 bg-surface/[0.9] px-3 py-3">
          <div
            ref={filterMenuRef}
            className="subtle-panel premium-ring relative rounded-xl border border-line p-2 shadow-[var(--shadow-card)]"
          >
            <div className="mb-1.5 flex items-center justify-between gap-2 px-1">
              <span className="text-2xs font-semibold uppercase tracking-label text-muted">
                Fila
              </span>
              <span
                className={cn(
                  'nums rounded-md px-1.5 py-0.5 text-2xs font-semibold',
                  effectiveFilter === 'emergencia'
                    ? 'bg-red-50 text-red-600'
                    : counters[effectiveFilter] > 0
                      ? 'bg-navy-900 text-white'
                      : 'bg-ink/[0.06] text-ink/55',
                )}
              >
                {counters[effectiveFilter]}
              </span>
            </div>
            <button
              type="button"
              aria-haspopup="listbox"
              aria-expanded={filterOpen}
              onClick={() => setFilterOpen((open) => !open)}
              className={cn(
                'flex h-10 w-full items-center gap-2 rounded-xl border bg-surface px-3 text-left text-sm font-semibold text-ink shadow-[var(--shadow-card)] transition-all',
                filterOpen
                  ? 'border-cyan-500 ring-2 ring-cyan-500/15'
                  : 'border-line-strong hover:border-muted/70',
              )}
            >
              <span className={cn('size-2.5 shrink-0 rounded-full', filterAccent(effectiveFilter))} />
              <span className="min-w-0 flex-1 truncate">
                {selectedFilter?.label ?? 'Fila'}
                {counters[effectiveFilter] > 0 ? ` (${counters[effectiveFilter]})` : ''}
              </span>
              <ChevronDown
                className={cn(
                  'size-4 shrink-0 text-muted transition-transform',
                  filterOpen && 'rotate-180 text-cyan-600',
                )}
              />
            </button>

            {filterOpen && (
              <div className="animate-in-rise absolute left-2 right-2 top-[calc(100%-0.25rem)] z-30 overflow-hidden rounded-xl border border-surface/80 bg-surface shadow-[var(--shadow-pop)] ring-1 ring-ink/[0.06]">
                <div className="max-h-[320px] overflow-y-auto p-1.5" role="listbox">
                  {visibleFilters.map((item) => {
                    const count = counters[item.key]
                    const active = item.key === effectiveFilter
                    return (
                      <button
                        key={item.key}
                        type="button"
                        role="option"
                        aria-selected={active}
                        onClick={() => {
                          setFilter(item.key)
                          setFilterOpen(false)
                        }}
                        className={cn(
                          'group flex h-10 w-full items-center gap-2 rounded-lg px-2.5 text-left text-sm font-medium transition-all',
                          active
                            ? 'bg-navy-900 text-white glow [--glow:var(--color-navy-900)]'
                            : 'text-ink/72 hover:bg-ink/[0.045] hover:text-ink',
                        )}
                      >
                        <span
                          className={cn(
                            'size-2.5 shrink-0 rounded-full ring-2 ring-surface',
                            filterAccent(item.key),
                          )}
                        />
                        <span className="min-w-0 flex-1 truncate">{item.label}</span>
                        {count > 0 && (
                          <span
                            className={cn(
                              'nums rounded-md px-1.5 py-0.5 text-2xs font-semibold',
                              active
                                ? 'bg-white/15 text-white'
                                : item.key === 'emergencia'
                                  ? 'bg-red-50 text-red-600'
                                  : 'bg-ink/[0.06] text-ink/55',
                            )}
                          >
                            {count}
                          </span>
                        )}
                        {active && <Check className="size-3.5 shrink-0 text-cyan-300" />}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex justify-center py-10">
              <Spinner />
            </div>
          ) : !conversations || conversations.length === 0 ? (
            <EmptyState
              icon={MessagesSquare}
              title="Nenhum atendimento no momento"
              description="As conversas recebidas pelo WhatsApp aparecem aqui em tempo real."
            />
          ) : (
            <ul className="space-y-2 p-2.5">
              {conversations.map((conversation) => (
                <ConversationListItem
                  key={conversation.id}
                  conversation={conversation}
                  active={conversation.id === selectedId}
                  onSelect={() => setSelectedId(conversation.id)}
                />
              ))}
            </ul>
          )}
        </div>
      </aside>

      {/* Colunas 2 e 3 */}
      {selectedId ? (
        <ConversationView
          key={selectedId}
          conversationId={selectedId}
          onBack={() => setSelectedId(null)}
          currentUserId={user?.id ?? ''}
          companyId={company?.id ?? ''}
          canManage={profile?.role !== 'agent'}
        />
      ) : (
        <div className="hidden min-w-0 flex-1 items-center justify-center bg-canvas lg:flex">
          <EmptyState
            icon={MessagesSquare}
            title="Selecione um atendimento"
            description="Escolha uma conversa na lista para visualizar as mensagens."
          />
        </div>
      )}

      <NewConversationModal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        onStarted={(conversationId) => {
          setNewOpen(false)
          setSelectedId(conversationId)
        }}
      />
    </div>
  )
}

/* ------------------------------------------------------------ Item da lista */

function ConversationListItem({
  conversation,
  active,
  onSelect,
}: {
  conversation: ConversationWithRelations
  active: boolean
  onSelect: () => void
}) {
  const customer = conversation.customer
  const name = displayName(customer?.name || customer?.whatsapp_name)
  const isEmergency = conversation.priority === 'emergencia'
  const unread = conversation.unread_count > 0
  const closed = conversation.status === 'concluido'

  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          'group relative w-full overflow-hidden rounded-xl px-3 py-3 text-left transition-all duration-200',
          active
            ? 'bg-surface glow [--glow:var(--color-orange-500)] ring-1 ring-orange-500/25'
            : 'bg-surface/60 ring-1 ring-transparent hover:bg-surface hover:shadow-[var(--shadow-card)] hover:ring-ink/[0.055]',
        )}
      >
        {active && (
          <span className="pointer-events-none absolute inset-0 bg-gradient-to-r from-orange-500/[0.12] to-transparent" />
        )}
        {/* A faixa vermelha da emergência não depende de estar selecionado:
            quem varre a lista precisa achar o urgente sem clicar. */}
        <span
          className={cn(
            'absolute inset-y-2 left-0 w-[3px] rounded-r-full',
            isEmergency && !closed
              ? 'bg-red-500'
              : active
                ? 'bg-orange-500'
                : 'bg-transparent',
          )}
        />

        <div className="relative flex items-start gap-3">
          <div className="relative">
            <Avatar
              name={name}
              seed={customer?.id ?? conversation.id}
              tone={isEmergency && !closed ? 'danger' : undefined}
              className={cn(active && 'ring-orange-500/20')}
            />
            <span
              className={cn(
                'absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-surface',
                closed ? 'bg-muted' : conversation.ai_enabled ? 'bg-cyan-500' : 'bg-orange-500',
              )}
            />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-start justify-between gap-2">
              <p
                className={cn(
                  'truncate text-sm leading-tight',
                  unread ? 'font-semibold text-ink' : 'font-semibold text-ink/90',
                )}
              >
                {name}
              </p>
              <span
                className={cn(
                  'nums shrink-0 text-2xs leading-none',
                  unread ? 'font-semibold text-orange-600' : 'text-muted',
                )}
              >
                {conversation.last_message_at ? formatTime(conversation.last_message_at) : ''}
              </span>
            </div>

            {name === 'Cliente sem nome' && customer && (
              <p className="mt-0.5 truncate text-2xs text-muted">
                {formatPhone(customer.phone)}
              </p>
            )}

            <p
              className={cn(
                'mt-1.5 flex items-center gap-1.5 text-xs leading-snug',
                unread ? 'font-medium text-ink/[0.85]' : 'text-ink/60',
              )}
            >
              {conversation.last_message_sender === 'ia' && (
                <Bot className="size-3.5 shrink-0 text-cyan-500" />
              )}
              {conversation.last_message_sender === 'atendente' && (
                <User className={cn('size-3.5 shrink-0', active ? 'text-orange-500' : 'text-muted')} />
              )}
              <span className="min-w-0 truncate">
                {conversation.last_message_text ?? 'Sem mensagens'}
              </span>
            </p>

            {/* Uma linha só de situação, que corta em vez de empilhar. */}
            <div className="mt-1.5 flex items-center gap-1.5 overflow-hidden">
              <Badge tone={STATUS_TONE[conversation.status]} dot className="shrink-0">
                {STATUS_LABEL[conversation.status]}
              </Badge>

              {isEmergency && !closed && (
                <Badge tone="danger" className="shrink-0">
                  <Zap className="size-3" />
                  Emergência
                </Badge>
              )}

              {conversation.ai_enabled && !closed && conversation.status !== 'ia' && (
                <Badge tone="cyan" className="shrink-0">
                  <Bot className="size-3" />
                  IA
                </Badge>
              )}

              {conversation.assignee && (
                <span className="min-w-0 truncate rounded-md bg-orange-100 px-1.5 py-0.5 text-2xs font-medium text-orange-600 ring-1 ring-inset ring-orange-500/10">
                  {displayName(conversation.assignee.full_name, '')}
                </span>
              )}
            </div>
          </div>

          <div className="flex shrink-0 flex-col items-end gap-1.5 pt-5">
            {unread && (
              <span className="nums flex h-[19px] min-w-[19px] items-center justify-center rounded-full bg-orange-500 px-1 text-2xs font-semibold leading-none text-white glow [--glow:var(--color-orange-500)]">
                {conversation.unread_count > 99 ? '99+' : conversation.unread_count}
              </span>
            )}
          </div>
        </div>
      </button>
    </li>
  )
}

/* ------------------------------------------------------------- Conversa */

function ConversationView({
  conversationId,
  onBack,
  currentUserId,
  companyId,
  canManage,
}: {
  conversationId: string
  onBack: () => void
  currentUserId: string
  companyId: string
  canManage: boolean
}) {
  const { data: conversation, isLoading } = useConversation(conversationId)
  const { data: messages } = useMessages(conversationId)
  const { data: events } = useConversationEvents(conversationId)
  const assign = useAssignConversation()
  const transfer = useTransferConversation()
  const setAI = useSetConversationAI()
  const close = useCloseConversation()
  const reopen = useReopenConversation()
  const markRead = useMarkRead()
  const sendMessage = useSendMessage()
  const retryMessage = useRetryMessage()
  const eraseConversation = useEraseConversation()
  const archiveConversation = useArchiveConversation()
  const reactToMessage = useReactToMessage(conversationId)
  const { openChat } = useFloatingChat()
  const { can } = usePermissions()
  const [eraseOpen, setEraseOpen] = useState(false)
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null)
  // Abaixo de xl a coluna do cliente some da tela — sem isto ela ficaria
  // inacessível para quem atende em tablet ou celular.
  const [infoOpen, setInfoOpen] = useState(false)

  const [error, setError] = useState<string | null>(null)
  const [transferOpen, setTransferOpen] = useState(false)
  const [templateOpen, setTemplateOpen] = useState(false)
  const [needsTemplate, setNeedsTemplate] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (conversation && conversation.unread_count > 0) markRead.mutate(conversationId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, conversation?.unread_count])

  useEffect(() => {
    const element = scrollRef.current
    if (element) element.scrollTop = element.scrollHeight
  }, [messages?.length])

  if (isLoading || !conversation) {
    return (
      <div className="flex min-w-0 flex-1 items-center justify-center bg-canvas">
        <Spinner />
      </div>
    )
  }

  const customerName = displayName(
    conversation.customer?.name || conversation.customer?.whatsapp_name,
  )
  const isMine = conversation.assigned_to === currentUserId
  const isClosed = conversation.status === 'concluido'

  /** Devolve true quando a mensagem saiu — só aí o compositor se limpa. */
  async function handleSend(content: string, media?: UploadedMedia): Promise<boolean> {
    setError(null)
    try {
      const result = await sendMessage.mutateAsync({
        conversationId,
        text: content,
        clientToken: crypto.randomUUID(),
        media,
        replyToId: replyTo?.id ?? null,
      })
      setNeedsTemplate(Boolean(result.requiresTemplate))
      if (result.error) {
        setError(result.error)
        return false
      }
      setReplyTo(null)
      return true
    } catch (err) {
      setError((err as Error).message)
      return false
    }
  }

  return (
    <>
      {/* Coluna 2 — chat */}
      <section className="chat-surface flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-[72px] items-center gap-3 border-b border-line/80 bg-surface/[0.92] px-4 py-3 shadow-[var(--shadow-edge-bottom)] backdrop-blur-xl">
          <button
            type="button"
            onClick={onBack}
            className="rounded-lg p-1.5 text-muted transition-colors hover:bg-ink/[0.05] hover:text-ink lg:hidden"
            aria-label="Voltar"
          >
            <ArrowLeft className="size-[18px]" />
          </button>
          <div className="relative">
            <Avatar
              name={customerName}
              seed={conversation.customer?.id ?? conversation.id}
              className="size-10 rounded-xl"
            />
            <span
              className={cn(
                'absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-surface',
                isClosed ? 'bg-muted' : conversation.ai_enabled ? 'bg-cyan-500' : 'bg-orange-500',
              )}
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-semibold text-ink">{customerName}</p>
            <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
              {conversation.customer && (
                <span className="inline-flex items-center gap-1 rounded-md bg-ink/[0.045] px-1.5 py-0.5 text-2xs font-medium text-ink/65">
                  <Phone className="size-3" />
                  {formatPhone(conversation.customer.phone)}
                </span>
              )}
              <Badge tone={STATUS_TONE[conversation.status]} dot>
                {STATUS_LABEL[conversation.status]}
              </Badge>
              {conversation.assignee && (
                <span className="inline-flex max-w-[180px] items-center gap-1 truncate rounded-md bg-orange-100 px-1.5 py-0.5 text-2xs font-medium text-orange-600 ring-1 ring-inset ring-orange-500/10">
                  <UserCheck className="size-3" />
                  <span className="truncate">{conversation.assignee.full_name}</span>
                </span>
              )}
            </div>
          </div>

          {/* Só o que se usa a toda hora fica na barra. O resto vai para o
              menu — seis botões lado a lado não têm hierarquia nenhuma. */}
          <div className="flex shrink-0 items-center gap-1.5">
            {!isClosed && !isMine && (
              <Button
                size="sm"
                onClick={() => assign.mutate({ conversationId })}
                loading={assign.isPending}
              >
                <Hand className="size-4" />
                <span className="hidden sm:inline">Assumir</span>
              </Button>
            )}
            {!isClosed && (
              <Button
                size="sm"
                variant={conversation.ai_enabled ? 'outline' : 'cyan'}
                onClick={() =>
                  setAI.mutate({ conversationId, enabled: !conversation.ai_enabled })
                }
                loading={setAI.isPending}
                title={
                  conversation.ai_enabled
                    ? 'Desativar a IA nesta conversa'
                    : 'Reativar a IA nesta conversa'
                }
              >
                <Bot className="size-4" />
                <span className="hidden md:inline">
                  {conversation.ai_enabled ? 'Desativar IA' : 'Reativar IA'}
                </span>
              </Button>
            )}

            <Button
              size="icon-sm"
              variant="outline"
              onClick={() => openChat(conversationId)}
              title="Soltar chat em uma janela flutuante"
              aria-label="Soltar chat em uma janela flutuante"
              className="hidden sm:inline-flex"
            >
              <ExternalLink className="size-4" />
            </Button>

            {/* Abaixo de xl a coluna do cliente/IA some — este botão é o único
                jeito de chegar nela em tablet e celular. */}
            <Button
              size="icon-sm"
              variant="outline"
              onClick={() => setInfoOpen(true)}
              title="Ver dados do cliente e da IA"
              aria-label="Ver dados do cliente e da IA"
              className="xl:hidden"
            >
              <Info className="size-4" />
            </Button>

            <DropdownMenu
              items={[
                ...(!isClosed
                  ? [
                      {
                        key: 'transferir',
                        label: 'Transferir atendimento',
                        icon: ArrowRightLeft,
                        onClick: () => setTransferOpen(true),
                      },
                      {
                        key: 'concluir',
                        label: 'Concluir atendimento',
                        icon: SquareCheckBig,
                        onClick: () => close.mutate(conversationId),
                      },
                    ]
                  : [
                      {
                        key: 'reabrir',
                        label: 'Reabrir atendimento',
                        icon: RotateCw,
                        onClick: () => reopen.mutate(conversationId),
                      },
                    ]),
                {
                  key: 'arquivar',
                  label: conversation.archived_at ? 'Desarquivar' : 'Arquivar',
                  hint: conversation.archived_at
                    ? 'Volta para a caixa de entrada'
                    : 'Sai da caixa de entrada sem apagar nada',
                  icon: conversation.archived_at ? ArchiveRestore : Archive,
                  onClick: () =>
                    archiveConversation.mutate(
                      { conversationId, archived: !conversation.archived_at },
                      { onError: (err) => setError((err as Error).message) },
                    ),
                },
                ...(can('clientes.excluir')
                  ? [
                      {
                        key: 'excluir',
                        label: 'Excluir conversa',
                        hint: 'Apaga em definitivo, sem volta',
                        icon: Trash2,
                        danger: true,
                        onClick: () => setEraseOpen(true),
                      },
                    ]
                  : []),
              ]}
            />
          </div>
        </header>

        {!conversation.ai_enabled && !isClosed && (
          <div className="border-b border-orange-500/[0.18] bg-gradient-to-r from-orange-500/15 to-orange-100 px-4 py-2.5 text-xs font-medium text-ink">
            IA desativada nesta conversa — atendimento sob responsabilidade humana.
          </div>
        )}

        <div ref={scrollRef} className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {!messages || messages.length === 0 ? (
            <EmptyState
              icon={MessagesSquare}
              title="Nenhuma mensagem nesta conversa"
              description="As mensagens trocadas com o cliente aparecem aqui."
            />
          ) : (
            <MessageList
              messages={messages}
              onRetry={(id) => retryMessage.mutate(id)}
              retrying={retryMessage.isPending}
              myProfileId={currentUserId}
              onReply={setReplyTo}
              onReact={(messageId, emoji) => {
                setError(null)
                reactToMessage.mutate(
                  { messageId, emoji },
                  { onError: (err) => setError((err as Error).message) },
                )
              }}
              reacting={reactToMessage.isPending}
            />
          )}
        </div>

        {/* Fora da janela de 24 h a recusa vem da Meta, não do CRM. Em vez de
            mostrar o erro cru e deixar a pessoa tentando de novo, explicamos a
            regra e apontamos o único caminho que funciona. */}
        {needsTemplate && !isClosed && (
          <div className="border-t border-orange-500/25 bg-orange-100/60 px-4 py-2.5">
            <div className="flex items-start gap-2.5">
              <Clock className="mt-0.5 size-4 shrink-0 text-orange-600" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-ink">
                  Passaram-se mais de 24 horas desde a última mensagem do cliente
                </p>
                <p className="mt-0.5 text-xs leading-snug text-ink/65">
                  A Meta bloqueia texto livre nessa situação. Só um modelo já aprovado na conta
                  chega ao cliente — assim que ele responder, a conversa normal volta a funcionar.
                </p>
                <Button size="sm" className="mt-2" onClick={() => setTemplateOpen(true)}>
                  <FileText className="size-4" />
                  Escolher modelo aprovado
                </Button>
              </div>
            </div>
          </div>
        )}

        {error && !needsTemplate && (
          <div className="px-4 pb-2">
            <Alert tone="error">{error}</Alert>
          </div>
        )}

        {isClosed ? (
          <div className="border-t border-line bg-surface/[0.9] px-4 py-4 pb-safe-3 backdrop-blur">
            <p className="text-center text-sm text-muted">
              Atendimento concluído. Reabra para voltar a enviar mensagens.
            </p>
          </div>
        ) : (
          <Composer
            companyId={companyId}
            conversationId={conversationId}
            sending={sendMessage.isPending}
            replyTo={replyTo}
            onCancelReply={() => setReplyTo(null)}
            onSend={handleSend}
            onError={setError}
          />
        )}
      </section>

      {/* Coluna 3 — cliente e IA (só cabe de sobra a partir de xl; abaixo
          disso vira o modal aberto pelo botão "Info" no cabeçalho) */}
      <aside className="scrollbar-thin hidden w-[336px] shrink-0 flex-col overflow-y-auto border-l border-line/80 bg-surface xl:flex">
        <ConversationSidePanels conversation={conversation} conversationId={conversationId} events={events} />
      </aside>

      <Modal
        open={infoOpen}
        onClose={() => setInfoOpen(false)}
        title="Cliente e IA"
        description="Dados do cadastro, tags e análise deste atendimento."
      >
        <div className="-mx-4 -my-4 sm:-mx-5 sm:-my-5">
          <ConversationSidePanels conversation={conversation} conversationId={conversationId} events={events} />
        </div>
      </Modal>

      <TemplateModal
        open={templateOpen}
        onClose={() => setTemplateOpen(false)}
        loading={sendMessage.isPending}
        onSend={async (template) => {
          setError(null)
          const result = await sendMessage.mutateAsync({
            conversationId,
            text: `[modelo: ${template.name}] ${template.params.join(' · ')}`.trim(),
            clientToken: crypto.randomUUID(),
            template,
          })
          if (result.error) {
            setError(result.error)
          } else {
            setNeedsTemplate(false)
          }
          setTemplateOpen(false)
        }}
      />

      <ConfirmDialog
        open={eraseOpen}
        tone="danger"
        icon={Trash2}
        title="Excluir esta conversa?"
        description={`Todo o histórico de ${customerName} — mensagens e arquivos — será apagado. Não há como desfazer.`}
        confirmLabel="Excluir"
        loading={eraseConversation.isPending}
        onClose={() => setEraseOpen(false)}
        onConfirm={async () => {
          try {
            await eraseConversation.mutateAsync({ conversationId })
            setEraseOpen(false)
            onBack()
          } catch (err) {
            setError((err as Error).message)
            setEraseOpen(false)
          }
        }}
      />

      <TransferModal
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        companyId={companyId}
        currentAssignee={conversation.assigned_to}
        loading={transfer.isPending}
        canManage={canManage}
        onConfirm={async (toUserId, note) => {
          await transfer.mutateAsync({ conversationId, toUserId, note })
          setTransferOpen(false)
        }}
      />
    </>
  )
}

/* -------------------------------------------------------------- Mensagens */

interface MessageListProps {
  messages: MessageWithSender[]
  onRetry: (id: string) => void
  retrying: boolean
  myProfileId: string
  onReply: (target: ReplyTarget) => void
  onReact: (messageId: string, emoji: string | null) => void
  reacting: boolean
}

function MessageList({
  messages,
  onRetry,
  retrying,
  myProfileId,
  onReply,
  onReact,
  reacting,
}: MessageListProps) {
  // Mensagem citada resolvida aqui, sem depender de vinculo do PostgREST.
  const byId = useMemo(() => {
    const index = new Map<string, MessageWithSender>()
    for (const message of messages) index.set(message.id, message)
    return index
  }, [messages])

  const groups = useMemo(() => {
    const map = new Map<string, MessageWithSender[]>()
    for (const message of messages) {
      const key = dayLabel(message.created_at)
      const list = map.get(key) ?? []
      list.push(message)
      map.set(key, list)
    }
    return [...map.entries()]
  }, [messages])

  return (
    <div className="space-y-5">
      {groups.map(([day, items]) => (
        <div key={day} className="space-y-0.5">
          <div className="sticky top-1 z-10 flex justify-center py-1">
            <span className="rounded-md bg-bubble-in px-2.5 py-1 text-2xs font-medium uppercase tracking-label text-muted shadow-[var(--shadow-card)]">
              {day}
            </span>
          </div>
          {items.map((message, indice) => (
            <MessageBubble
              key={message.id}
              message={message}
              // Mensagem seguida da mesma pessoa nao repete rabinho nem
              // assinatura, e cola na anterior. E o que faz uma rajada de tres
              // mensagens parecer uma fala, e nao tres cartoes empilhados.
              agrupada={mesmaFala(items[indice - 1], message)}
              onRetry={onRetry}
              retrying={retrying}
              quoted={message.reply_to_id ? (byId.get(message.reply_to_id) ?? null) : null}
              myProfileId={myProfileId}
              onReply={onReply}
              onReact={onReact}
              reacting={reacting}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

/**
 * Hora e tiques de entrega, no canto da bolha.
 *
 * Flutuando a direita, o texto corre em volta: mensagem curta termina com a
 * hora na mesma linha, mensagem longa empurra a hora para baixo. E o
 * comportamento do WhatsApp, e a razao de ele nunca parecer um formulario.
 */
function MetaDaMensagem({
  message,
  semFlutuar,
}: {
  message: MessageWithSender
  semFlutuar?: boolean
}) {
  const saida = message.direction === 'outbound'
  return (
    <span
      className={cn(
        'ml-2 inline-flex select-none items-center gap-0.5 align-bottom text-[10.5px] leading-none text-muted',
        semFlutuar ? '' : 'float-right translate-y-[5px]',
      )}
    >
      <span className="nums">{formatTime(message.sent_at ?? message.created_at)}</span>
      {saida && <MessageStatusIcon status={message.status} />}
    </span>
  )
}

/** Quanto tempo duas mensagens seguidas ainda contam como a mesma fala. */
const JANELA_DE_FALA_MS = 3 * 60 * 1000

/**
 * A mensagem continua a fala da anterior?
 *
 * Mesma origem (cliente, IA ou o mesmo atendente) e pouco tempo entre elas.
 * Trocar de atendente quebra o grupo mesmo que os dois sejam "saida" — quem
 * le precisa ver que mudou a pessoa.
 */
function mesmaFala(anterior: MessageWithSender | undefined, atual: MessageWithSender): boolean {
  if (!anterior) return false
  if (anterior.direction !== atual.direction) return false
  if (anterior.sender !== atual.sender) return false
  if (anterior.sender_user_id !== atual.sender_user_id) return false

  const antes = new Date(anterior.sent_at ?? anterior.created_at).getTime()
  const agora = new Date(atual.sent_at ?? atual.created_at).getTime()
  return Number.isFinite(antes) && Number.isFinite(agora) && agora - antes < JANELA_DE_FALA_MS
}

function MessageBubble({
  message,
  agrupada,
  quoted,
  onRetry,
  retrying,
  myProfileId,
  onReply,
  onReact,
  reacting,
}: {
  message: MessageWithSender
  /** Continua a fala da mensagem anterior: sem rabinho, sem assinatura. */
  agrupada: boolean
  /** Mensagem citada, quando esta carregada na conversa */
  quoted: MessageWithSender | null
  onRetry?: (id: string) => void
  retrying?: boolean
  myProfileId: string
  onReply: (target: ReplyTarget) => void
  onReact: (messageId: string, emoji: string | null) => void
  reacting: boolean
}) {
  const isInbound = message.direction === 'inbound'
  const isAI = message.sender === 'ia'
  const isSystem = message.sender === 'sistema'

  if (isSystem) {
    return (
      <div className="flex justify-center">
        <span className="rounded-full bg-ink/[0.04] px-3 py-1 text-2xs text-muted">
          {message.body}
        </span>
      </div>
    )
  }

  const hasMedia = Boolean(message.media_url)
  const localizacao = parseLocation(message.location)
  const author = isInbound
    ? 'ao cliente'
    : isAI
      ? 'à IA'
      : message.sender_profile?.full_name
        ? `a ${message.sender_profile.full_name}`
        : 'ao atendente'
  const minhaReacao =
    message.reactions?.find((r) => !r.by_customer && r.profile_id === myProfileId)?.emoji ?? null
  const falhou = message.status === 'falhou'
  const enviando = message.status === 'pendente' || message.status === 'enviando'

  const responder = () =>
    onReply({
      id: message.id,
      author,
      preview: message.body || QUOTED_FALLBACK[message.type] || 'Mensagem',
    })

  return (
    <div
      className={cn(
        'group flex items-end gap-1.5',
        isInbound ? 'justify-start' : 'flex-row-reverse justify-start',
      )}
    >
      <div className={cn('max-w-[68%] min-w-0', isInbound ? 'items-start' : 'items-end')}>
        <div
          className={cn(
            // Raio e respiro do WhatsApp. O texto e sempre tinta escura sobre
            // superficie clara — nunca branco sobre cor cheia: numa tela aberta
            // o dia inteiro, bolha saturada cansa e achata a hierarquia.
            'group/bolha relative rounded-[10px] px-2.5 py-[7px] pr-7 text-sm leading-[1.42] shadow-[var(--shadow-card)]',
            'text-ink',
            isInbound ? 'bg-bubble-in' : 'bg-bubble-out',
            // O rabinho so aparece na primeira mensagem da fala, no canto de
            // quem falou. Repetir em todas e o que faz parecer lista de cartoes.
            !agrupada && (isInbound ? 'rounded-tl-[3px]' : 'rounded-tr-[3px]'),
            // Uma mensagem que não saiu não pode parecer igual a uma enviada.
            // O cliente não recebeu nada, e quem digitou precisa perceber.
            falhou && 'opacity-90 ring-2 ring-red-500/[0.45]',
            enviando && 'opacity-70',
          )}
          // Duplo clique responde, como no WhatsApp do computador. E o atalho
          // que quem atende o dia inteiro acaba usando sem pensar.
          onDoubleClick={responder}
        >
          <MessageActions
            side={isInbound ? 'left' : 'right'}
            canReact={Boolean(message.provider_message_id)}
            hasText={Boolean(message.body)}
            reacting={reacting}
            mine={minhaReacao}
            onReact={(emoji) => onReact(message.id, emoji)}
            onReply={responder}
            onCopy={() => void navigator.clipboard?.writeText(message.body ?? '')}
          />
          {quoted && (
            <div
              className={cn('mb-1.5 flex gap-2 rounded-md bg-ink/[0.06] px-2 py-1.5')}
            >
              <span className="w-[3px] shrink-0 rounded-full bg-cyan-500" />
              <span className="min-w-0">
                <span className="block text-2xs font-medium text-cyan-600">
                  {quoted.direction === 'inbound'
                    ? 'Cliente'
                    : quoted.sender === 'ia'
                      ? 'IA'
                      : quoted.sender_profile?.full_name || 'Atendente'}
                </span>
                <span className="mt-0.5 line-clamp-2 block text-xs text-ink/60">
                  {quoted.body || QUOTED_FALLBACK[quoted.type] || 'Mensagem'}
                </span>
              </span>
            </div>
          )}
          {/* Quem falou aparece uma vez por fala. O WhatsApp so mostra isso em
              grupo; aqui e obrigatorio, porque do lado de fora respondem tres
              entidades diferentes — a IA, o atendente e o sistema. */}
          {!isInbound && !agrupada && (
            <p
              className={cn(
                'mb-0.5 flex items-center gap-1 text-2xs font-medium',
                isAI ? 'text-cyan-600' : 'text-ink/55',
              )}
            >
              {isAI ? <Bot className="size-3" /> : <User className="size-3" />}
              {isAI ? 'IA' : message.sender_profile?.full_name || 'Atendente'}
            </p>
          )}
          {localizacao && (
            <div className={cn(message.body ? 'mb-2' : '')}>
              <MessageLocation location={localizacao} onDark={false} />
            </div>
          )}

          {hasMedia && (
            <div className={cn(message.body ? 'mb-2' : '')}>
              <MessageMedia
                path={message.media_url!}
                mime={message.media_mime}
                name={message.media_name}
                type={message.type}
                onDark={false}
              />
            </div>
          )}
          {/* Hora e tiques flutuam a direita do ultimo trecho de texto, como no
              WhatsApp: se couber, terminam a linha; se nao, descem sozinhos.
              Fica dentro da bolha porque e informacao da mensagem, nao um
              rodape dela — e e o que mais faz a conversa parecer conversa. */}
          {message.body ? (
            <p className="whitespace-pre-wrap break-words">
              {message.body}
              <MetaDaMensagem message={message} />
            </p>
          ) : (
            <>
              {!hasMedia && !localizacao && (
                <p className="italic text-muted">
                  {UNSUPPORTED_LABEL[message.type] ?? 'Mensagem sem texto'}
                </p>
              )}
              <div className="flex justify-end">
                <MetaDaMensagem message={message} semFlutuar />
              </div>
            </>
          )}
        </div>
        <div className={cn('flex', isInbound ? 'justify-start' : 'justify-end')}>
          <ReactionChips
            reactions={message.reactions ?? []}
            myProfileId={myProfileId}
            onToggle={(emoji) => onReact(message.id, emoji)}
          />
        </div>

        {falhou && (
          <div className="mt-1 rounded-xl border border-red-500/25 bg-red-50 px-2.5 py-2">
            <p className="flex items-start gap-1.5 text-2xs leading-snug text-red-700">
              <CircleAlert className="mt-px size-3.5 shrink-0" />
              <span className="min-w-0">
                <strong className="font-semibold">O cliente não recebeu.</strong>
                {message.error_message ? ` ${message.error_message}` : ''}
              </span>
            </p>
            {onRetry && (
              <button
                type="button"
                disabled={retrying}
                onClick={() => onRetry(message.id)}
                className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-2.5 py-1 text-2xs font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
              >
                <RotateCw className={cn('size-3', retrying && 'animate-spin')} />
                {retrying ? 'Reenviando…' : 'Reenviar'}
              </button>
            )}
          </div>
        )}
      </div>

    </div>
  )
}

/** Como uma mensagem sem texto aparece quando citada. */
const QUOTED_FALLBACK: Partial<Record<MessageWithSender['type'], string>> = {
  image: 'Foto',
  video: 'Vídeo',
  audio: 'Áudio',
  document: 'Documento',
  sticker: 'Figurinha',
  location: 'Localização',
  contact: 'Contato',
}

/**
 * Conteúdo que o WhatsApp entrega sem texto e que o CRM ainda não exibe
 * em detalhe — a mensagem aparece assim mesmo, nunca é escondida.
 */
const UNSUPPORTED_LABEL: Partial<Record<MessageWithSender['type'], string>> = {
  location: 'Localização recebida',
  contact: 'Contato recebido',
  image: 'Imagem não disponível',
  video: 'Vídeo não disponível',
  audio: 'Áudio não disponível',
  document: 'Documento não disponível',
  sticker: 'Figurinha não disponível',
}

function MessageStatusIcon({ status }: { status: MessageWithSender['status'] }) {
  switch (status) {
    case 'pendente':
    case 'enviando':
      return <Clock className="size-3" aria-label="Enviando" />
    case 'enviada':
      return <Check className="size-[15px]" aria-label="Enviada" />
    case 'entregue':
      return <CheckCheck className="size-[15px]" aria-label="Entregue" />
    case 'lida':
      return <CheckCheck className="size-[15px] text-cyan-500" aria-label="Lida" />
    case 'falhou':
      return <AlertTriangle className="size-3 text-red-600" aria-label="Falhou" />
  }
}

/* ---------------------------------------------------------------- Painéis */

/**
 * Painéis laterais.
 *
 * Antes cada um era um card branco com borda dentro de uma coluna branca —
 * três molduras sem função nenhuma, só somando ruído. Agora são seções
 * separadas por uma linha. A da IA continua com fundo próprio, porque é
 * informação interna e não pode ser confundida com dado do cadastro.
 */
/** Conteúdo da coluna 3, reaproveitado na coluna fixa (xl) e no modal (abaixo de xl). */
function ConversationSidePanels({
  conversation,
  conversationId,
  events,
}: {
  conversation: ConversationWithRelations
  conversationId: string
  events: Array<{ id: string; title: string; description: string | null; created_at: string }> | undefined
}) {
  return (
    <>
      <CustomerPanel conversation={conversation} />
      <ConversationTags conversationId={conversationId} />
      <AIPanel conversation={conversation} />
      <EventsPanel events={events ?? []} />
    </>
  )
}

function CustomerPanel({ conversation }: { conversation: ConversationWithRelations }) {
  const customer = conversation.customer
  return (
    <section className="px-4 py-4">
      <SectionTitle>Cliente</SectionTitle>
      <dl className="mt-3 space-y-2">
        <PanelRow
          icon={User}
          label="Nome"
          value={displayName(customer?.name || customer?.whatsapp_name, '—')}
        />
        <PanelRow icon={Phone} label="Telefone" value={customer ? formatPhone(customer.phone) : '—'} />
        <PanelRow icon={Building2} label="Empresa" value={customer?.company_name || '—'} />
        <PanelRow icon={CalendarClock} label="Início" value={formatFull(conversation.started_at)} />
        <PanelRow icon={Clock} label="Última mensagem" value={relativeFromNow(conversation.last_message_at)} />
      </dl>
      {customer && (
        <Link
          to={`/clientes/${customer.id}`}
          className="mt-3 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-navy-900 text-xs font-semibold text-white glow [--glow:var(--color-navy-900)] transition-colors hover:bg-navy-800"
        >
          <UserCheck className="size-4" />
          Abrir cadastro completo
        </Link>
      )}
    </section>
  )
}

function AIPanel({ conversation }: { conversation: ConversationWithRelations }) {
  const hasData = conversation.ai_summary || conversation.ai_intent || conversation.ai_category

  return (
    <section className="border-t border-cyan-500/15 bg-gradient-to-b from-cyan-500/12 to-cyan-100 px-4 py-4">
      <SectionTitle action={<span className="rounded-md bg-surface/[0.70] px-1.5 py-0.5 text-2xs font-medium text-cyan-600 ring-1 ring-cyan-500/10">interno</span>}>
        <span className="inline-flex items-center gap-1.5">
          <Bot className="size-3.5 text-cyan-600" />
          Análise da IA
        </span>
      </SectionTitle>

      {!hasData ? (
        <p className="mt-2 text-xs leading-snug text-muted">
          Nenhuma análise gerada para este atendimento.
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          {conversation.ai_summary && (
            <p className="rounded-lg bg-surface/[0.72] p-3 text-xs leading-relaxed text-ink shadow-[var(--shadow-card)] ring-1 ring-cyan-500/10">
              {conversation.ai_summary}
            </p>
          )}
          <dl className="space-y-2">
            <PanelRow label="Intenção" value={conversation.ai_intent || '—'} tone="cyan" />
            <PanelRow label="Categoria" value={conversation.ai_category || '—'} tone="cyan" />
            <PanelRow label="Prioridade" value={PRIORITY_LABEL[conversation.priority]} tone="orange" />
            <PanelRow
              label="Confiança"
              value={
                conversation.ai_confidence === null
                  ? '—'
                  : `${Math.round(conversation.ai_confidence * 100)}%`
              }
              tone="cyan"
            />
          </dl>
        </div>
      )}
    </section>
  )
}

function EventsPanel({
  events,
}: {
  events: Array<{ id: string; title: string; description: string | null; created_at: string }>
}) {
  if (events.length === 0) return null
  return (
    <section className="border-t border-line/80 px-4 py-4">
      <SectionTitle>Andamento</SectionTitle>
      <ul className="mt-3 space-y-3">
        {events.slice(0, 8).map((event) => (
          <li key={event.id} className="relative rounded-lg border border-line/80 bg-surface-soft px-3 py-2.5 pl-4">
            <span className="absolute left-0 top-3 h-5 w-[3px] rounded-r-full bg-orange-500" />
            <p className="text-xs font-medium leading-snug text-ink">{event.title}</p>
            {event.description && (
              <p className="mt-0.5 text-xs leading-snug text-ink/60">
                {event.description}
              </p>
            )}
            <p className="mt-0.5 text-2xs text-muted">{formatFull(event.created_at)}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}

function PanelRow({
  icon: Icon,
  label,
  value,
  tone = 'neutral',
}: {
  icon?: ComponentType<{ className?: string }>
  label: string
  value: string
  tone?: 'neutral' | 'cyan' | 'orange'
}) {
  const toneClass =
    tone === 'cyan'
      ? 'bg-cyan-100/[0.55] text-cyan-600 ring-cyan-500/10'
      : tone === 'orange'
        ? 'bg-orange-100/[0.68] text-orange-700 ring-orange-500/10'
        : 'bg-ink/[0.035] text-ink/65 ring-ink/[0.045]'

  return (
    <div className={cn('flex items-start gap-2.5 rounded-lg px-2.5 py-2 ring-1', toneClass)}>
      {Icon && <Icon className="mt-0.5 size-3.5 shrink-0" />}
      <div className="min-w-0 flex-1">
        <dt className="text-2xs font-semibold uppercase tracking-label text-current opacity-70">
          {label}
        </dt>
        <dd className="mt-0.5 min-w-0 break-words text-xs font-semibold text-ink">
          {value}
        </dd>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------- Transferência */

function TransferModal({
  open,
  onClose,
  companyId,
  currentAssignee,
  onConfirm,
  loading,
}: {
  open: boolean
  onClose: () => void
  companyId: string
  currentAssignee: string | null
  canManage: boolean
  onConfirm: (toUserId: string, note?: string) => Promise<void>
  loading?: boolean
}) {
  const { data: members } = useCompanyMembers(companyId)
  const [toUserId, setToUserId] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  const options = (members ?? []).filter((member) => member.id !== currentAssignee)

  useEffect(() => {
    if (open) {
      setToUserId('')
      setNote('')
      setError(null)
    }
  }, [open])

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Transferir atendimento"
      description="O cliente, o histórico e a análise da IA são preservados."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button
            loading={loading}
            onClick={async () => {
              if (!toUserId) return setError('Selecione o atendente de destino.')
              try {
                await onConfirm(toUserId, note)
              } catch (err) {
                setError((err as Error).message)
              }
            }}
          >
            Transferir
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        {options.length === 0 ? (
          <Alert tone="info">
            Não há outro usuário ativo na empresa para receber a transferência.
          </Alert>
        ) : (
          <Select
            label="Transferir para"
            value={toUserId}
            onChange={(e) => setToUserId(e.target.value)}
          >
            <option value="">Selecione um atendente</option>
            {options.map((member) => (
              <option key={member.id} value={member.id}>
                {member.full_name || member.email}
              </option>
            ))}
          </Select>
        )}
        <TextArea
          label="Observação (opcional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Contexto para quem vai continuar o atendimento…"
        />
      </div>
    </Modal>
  )
}

/* ------------------------------------------------------- Modelo aprovado */

function TemplateModal({
  open,
  onClose,
  onSend,
  loading,
}: {
  open: boolean
  onClose: () => void
  onSend: (template: { name: string; language: string; params: string[] }) => Promise<void>
  loading?: boolean
}) {
  const [name, setName] = useState('')
  const [language, setLanguage] = useState('pt_BR')
  const [params, setParams] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setName('')
      setLanguage('pt_BR')
      setParams('')
      setError(null)
    }
  }, [open])

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Enviar modelo aprovado"
      description="Fora da janela de 24 horas, a Meta só entrega mensagens usando um modelo já aprovado na sua conta."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button
            loading={loading}
            onClick={async () => {
              if (!name.trim()) return setError('Informe o nome do modelo aprovado.')
              try {
                await onSend({
                  name: name.trim(),
                  language: language.trim() || 'pt_BR',
                  params: params
                    .split('|')
                    .map((value) => value.trim())
                    .filter(Boolean),
                })
              } catch (err) {
                setError((err as Error).message)
              }
            }}
          >
            <Send className="size-4" />
            Enviar modelo
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <Field
          label="Nome do modelo"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="ex.: retorno_atendimento"
          hint="Exatamente como aparece no Gerenciador de modelos da Meta."
        />
        <Field
          label="Idioma"
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          placeholder="pt_BR"
        />
        <Field
          label="Parâmetros do corpo"
          value={params}
          onChange={(e) => setParams(e.target.value)}
          placeholder="valor 1 | valor 2"
          hint="Separe os parâmetros por barra vertical, na ordem em que aparecem no modelo."
        />
      </div>
    </Modal>
  )
}

/* ------------------------------------------------------------ Nova conversa */

function NewConversationModal({
  open,
  onClose,
  onStarted,
}: {
  open: boolean
  onClose: () => void
  onStarted: (conversationId: string) => void
}) {
  const { company, user } = useAuth()
  const [mode, setMode] = useState<'existente' | 'novo'>('existente')
  const [search, setSearch] = useState('')
  const [customerId, setCustomerId] = useState<string | null>(null)
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)

  const { data: customers } = useCustomers(company?.id, { search, status: 'active' })
  const openConversation = useOpenConversation()
  const sendMessage = useSendMessage()

  useEffect(() => {
    if (open) {
      setMode('existente')
      setSearch('')
      setCustomerId(null)
      setPhone('')
      setName('')
      setText('')
      setError(null)
    }
  }, [open])

  async function start() {
    setError(null)
    const content = text.trim()
    if (!content) return setError('Escreva a mensagem que será enviada ao cliente.')

    try {
      setChecking(true)
      let targetCustomer = customerId

      if (mode === 'novo') {
        if (!isValidPhone(phone)) {
          setChecking(false)
          return setError('Informe um telefone válido com DDD.')
        }
        // Verifica se o número já existe antes de criar outro cadastro
        const normalized = phone.replace(/\D/g, '')
        const { data: existing } = await supabaseFindByPhone(company!.id, normalized)
        if (existing) {
          targetCustomer = existing.id
        } else {
          const { data: created, error: createError } = await supabaseCreateCustomer(
            company!.id,
            phone,
            name,
            user?.id,
          )
          if (createError || !created) {
            setChecking(false)
            return setError(createError?.message ?? 'Não foi possível cadastrar o cliente.')
          }
          targetCustomer = created.id
        }
      }

      if (!targetCustomer) {
        setChecking(false)
        return setError('Selecione um cliente.')
      }

      const conversation = await openConversation.mutateAsync(targetCustomer)
      const result = await sendMessage.mutateAsync({
        conversationId: conversation.id,
        text: content,
        clientToken: crypto.randomUUID(),
      })
      setChecking(false)
      onStarted(conversation.id)
      if (result.error) {
        // A conversa existe; o erro de envio aparece no chat
        console.warn('[nova conversa]', result.error)
      }
    } catch (err) {
      setChecking(false)
      setError((err as Error).message)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nova conversa"
      description="Inicie um atendimento com um cliente já cadastrado ou com um novo número."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={checking}>
            Cancelar
          </Button>
          <Button onClick={start} loading={checking}>
            <Send className="size-4" />
            Iniciar e enviar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}

        <div className="flex gap-1 rounded-xl border border-line bg-canvas p-1">
          {(
            [
              { key: 'existente', label: 'Cliente existente' },
              { key: 'novo', label: 'Novo número' },
            ] as const
          ).map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setMode(item.key)}
              className={cn(
                'flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                mode === item.key
                  ? 'bg-surface text-ink shadow-[var(--shadow-card)]'
                  : 'text-muted hover:text-ink',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        {mode === 'existente' ? (
          <div className="space-y-2">
            <Field
              label="Buscar cliente"
              placeholder="Nome ou telefone"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="scrollbar-thin max-h-52 overflow-y-auto rounded-xl border border-line">
              {!customers || customers.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-muted">
                  Nenhum cliente encontrado.
                </p>
              ) : (
                <ul className="divide-y divide-line">
                  {customers.slice(0, 30).map((customer) => (
                    <li key={customer.id}>
                      <button
                        type="button"
                        onClick={() => setCustomerId(customer.id)}
                        className={cn(
                          'flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors',
                          customerId === customer.id
                            ? 'bg-ink/[0.05]'
                            : 'hover:bg-ink/[0.025]',
                        )}
                      >
                        <Avatar
                          name={displayName(customer.name || customer.whatsapp_name)}
                          seed={customer.id}
                          size="sm"
                        />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-ink">
                            {displayName(customer.name || customer.whatsapp_name)}
                          </span>
                          <span className="block truncate text-xs text-muted">
                            {formatPhone(customer.phone)}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <Field
              label="Telefone / WhatsApp"
              value={phone}
              onChange={(e) => setPhone(maskPhoneInput(e.target.value))}
              placeholder="(11) 98888-7777"
              hint="Se o número já existir, o atendimento usa o cadastro atual."
            />
            <Field
              label="Nome (opcional)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome do cliente"
            />
          </div>
        )}

        <TextArea
          label="Primeira mensagem"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Mensagem que será enviada pelo WhatsApp…"
        />
      </div>
    </Modal>
  )
}

/* Helpers isolados para manter o modal legível */
import { supabase } from '@/lib/supabase'
import { normalizePhone } from '@/lib/phone'

async function supabaseFindByPhone(companyId: string, phone: string) {
  const normalized = normalizePhone(phone)
  return supabase
    .from('customers')
    .select('id')
    .eq('company_id', companyId)
    .eq('phone', normalized ?? '')
    .maybeSingle()
}

async function supabaseCreateCustomer(
  companyId: string,
  phone: string,
  name: string,
  userId?: string,
) {
  return supabase
    .from('customers')
    .insert({
      company_id: companyId,
      phone: normalizePhone(phone) ?? phone,
      phone_raw: phone,
      name: name.trim() || null,
      created_by: userId ?? null,
      created_source: 'manual',
    })
    .select('id')
    .single()
}


