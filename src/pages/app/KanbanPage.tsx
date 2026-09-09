import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeftRight,
  Bot,
  CheckCircle2,
  Clock,
  Columns3,
  Inbox,
  User,
  Zap,
} from 'lucide-react'
import { Alert, Badge, Button, Card, EmptyState, SkeletonPage, Tabs } from '@/components/ui'
import { Modal } from '@/components/ui/Modal'
import { usePageChrome } from '@/components/layout/AppLayout'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import {
  useConversations,
  useRealtimeInbox,
  type ConversationWithRelations,
} from '@/features/conversations/api'
import { relativeFromNow } from '@/lib/datetime'
import { formatPhone } from '@/lib/phone'
import { Avatar } from '@/components/ui/Avatar'
import { cn, displayName } from '@/lib/utils'
import type { ConversationPriority, ConversationStatus } from '@/types/database'

type ColumnKey = ConversationStatus | 'emergencia'

/**
 * As etapas do fluxo.
 *
 * `vazio` não é decoração: coluna vazia é a única chance de explicar para que
 * ela serve. Antes as seis repetiam "Sem cards nesta etapa — o fluxo permanece
 * limpo", que não ensina nada e ainda deixa a tela parecendo quebrada. Agora
 * cada uma diz o que cai ali e o que fazer com o que cair.
 */
const COLUMNS: Array<{
  key: ColumnKey
  label: string
  hint: string
  vazio: { titulo: string; texto: string }
}> = [
  {
    key: 'novo',
    label: 'Novos',
    hint: 'Chegaram e ainda não foram tratados',
    vazio: {
      titulo: 'Nenhum contato novo',
      texto: 'Quem manda mensagem pela primeira vez entra aqui, antes de a IA ou alguém da equipe assumir.',
    },
  },
  {
    key: 'ia',
    label: 'IA',
    hint: 'Sendo atendidos pela inteligência artificial',
    vazio: {
      titulo: 'A IA não está conduzindo nenhum',
      texto: 'Aqui ficam os atendimentos que a IA está tocando sozinha. Ela sai daqui quando resolve ou quando chama alguém.',
    },
  },
  {
    key: 'aguardando_humano',
    label: 'Aguardando humano',
    hint: 'Precisam de um atendente',
    vazio: {
      titulo: 'Ninguém esperando',
      texto: 'A IA move para cá o que não soube resolver. É a fila que a equipe precisa olhar primeiro.',
    },
  },
  {
    key: 'em_atendimento',
    label: 'Em atendimento',
    hint: 'Com atendente responsável',
    vazio: {
      titulo: 'Nenhum atendimento assumido',
      texto: 'Quando alguém clica em "Assumir", o atendimento vem para cá com o nome do responsável.',
    },
  },
  {
    key: 'emergencia',
    label: 'Emergência',
    hint: 'Prioridade máxima',
    vazio: {
      titulo: 'Nenhuma emergência agora',
      texto: 'Caminhão parado, freio falhando, pedido de socorro. Aparecendo aqui, larga o resto.',
    },
  },
  {
    key: 'concluido',
    label: 'Concluídos',
    hint: 'Encerrados',
    vazio: {
      titulo: 'Nada encerrado no período',
      texto: 'Atendimentos finalizados ficam aqui como histórico. O cliente pode reabrir mandando mensagem.',
    },
  },
]

const COLUMN_THEME = {
  novo: {
    icon: Inbox,
    accent: 'from-orange-500 to-orange-400',
    header: 'bg-orange-100/70 text-orange-600 ring-orange-500/15',
    count: 'bg-orange-500 text-white glow [--glow:var(--color-orange-500)]',
    empty: 'border-orange-500/15 bg-orange-100/30 text-orange-600',
    card: 'before:bg-orange-500',
  },
  ia: {
    icon: Bot,
    accent: 'from-cyan-500 to-cyan-400',
    header: 'bg-cyan-100/80 text-cyan-600 ring-cyan-500/15',
    count: 'bg-cyan-500 text-white glow [--glow:var(--color-cyan-500)]',
    empty: 'border-cyan-500/15 bg-cyan-100/35 text-cyan-600',
    card: 'before:bg-cyan-500',
  },
  aguardando_humano: {
    icon: Clock,
    accent: 'from-amber-400 to-orange-500',
    header: 'bg-amber-50 text-amber-700 ring-amber-400/20',
    count: 'bg-amber-500 text-white glow [--glow:var(--color-amber-500)]',
    empty: 'border-amber-400/20 bg-amber-50/70 text-amber-700',
    card: 'before:bg-amber-500',
  },
  em_atendimento: {
    icon: User,
    accent: 'from-navy-700 to-cyan-500',
    header: 'bg-ink/[0.06] text-ink-soft ring-ink/[0.08]',
    count: 'bg-navy-900 text-white glow [--glow:var(--color-navy-900)]',
    empty: 'border-ink/[0.08] bg-ink/[0.025] text-ink-soft',
    card: 'before:bg-navy-900',
  },
  emergencia: {
    icon: Zap,
    accent: 'from-red-500 to-orange-500',
    header: 'bg-red-50 text-red-600 ring-red-500/15',
    count: 'bg-red-500 text-white glow [--glow:var(--color-red-500)]',
    empty: 'border-red-500/15 bg-red-50/70 text-red-600',
    card: 'before:bg-red-500',
  },
  concluido: {
    icon: CheckCircle2,
    accent: 'from-emerald-500 to-cyan-500',
    header: 'bg-emerald-50 text-emerald-700 ring-emerald-500/15',
    count: 'bg-emerald-500 text-white glow [--glow:var(--color-emerald-500)]',
    empty: 'border-emerald-500/15 bg-emerald-50/75 text-emerald-700',
    card: 'before:bg-emerald-500',
  },
} satisfies Record<
  ColumnKey,
  {
    icon: typeof Inbox
    accent: string
    header: string
    count: string
    empty: string
    card: string
  }
>

export function KanbanPage() {
  const { company, user } = useAuth()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [dragging, setDragging] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** Coluna visível no celular — lá o quadro vira uma coluna por vez. */
  const [coluna, setColuna] = useState<ColumnKey>('aguardando_humano')
  /** Conversa cuja etapa está sendo trocada pelo toque. */
  const [movendo, setMovendo] = useState<ConversationWithRelations | null>(null)

  useRealtimeInbox(company?.id)
  const { data: conversations, isLoading } = useConversations(company?.id, 'todos', user?.id, '')

  const move = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: ConversationStatus }) => {
      const { error: rpcError } = await supabase.rpc('move_conversation_stage', {
        p_conversation_id: id,
        p_status: status,
      })
      if (rpcError) throw rpcError
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['conversations'] })
      void qc.invalidateQueries({ queryKey: ['inbox-counters'] })
    },
    onError: (err) => setError((err as Error).message),
  })

  const setPriority = useMutation({
    mutationFn: async ({ id, priority }: { id: string; priority: ConversationPriority }) => {
      const { error: rpcError } = await supabase.rpc('set_conversation_priority', {
        p_conversation_id: id,
        p_priority: priority,
      })
      if (rpcError) throw rpcError
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['conversations'] })
      void qc.invalidateQueries({ queryKey: ['inbox-counters'] })
    },
    onError: (err) => setError((err as Error).message),
  })

  usePageChrome(
    { subtitle: 'Pipeline operacional em tempo real · arraste no desktop, mova por ação no mobile' },
    [],
  )

  const grouped = useMemo(() => {
    const map = new Map<ColumnKey, ConversationWithRelations[]>()
    for (const column of COLUMNS) map.set(column.key, [])
    for (const conversation of conversations ?? []) {
      if (conversation.priority === 'emergencia' && conversation.status !== 'concluido') {
        map.get('emergencia')!.push(conversation)
      } else {
        map.get(conversation.status)?.push(conversation)
      }
    }
    return map
  }, [conversations])

  if (isLoading) return <SkeletonPage tiles={4} rows={3} />

  const total = conversations?.length ?? 0

  if (total === 0) {
    return (
      <div className="animate-in-fade px-4 py-6 sm:px-6 sm:py-8">
        <Card>
          <EmptyState
            icon={Columns3}
            title="Nenhum atendimento no fluxo"
            description="Os cartões são criados a partir dos atendimentos reais da operação."
          />
        </Card>
      </div>
    )
  }

  /** Um só caminho de mudança de etapa, usado pelo arrasto e pelo toque. */
  function aplicarEtapa(conversation: ConversationWithRelations, destino: ColumnKey) {
    if (destino === 'emergencia') {
      if (conversation.priority !== 'emergencia') {
        setPriority.mutate({ id: conversation.id, priority: 'emergencia' })
      }
      return
    }
    // Um atendimento marcado como emergência continua na coluna de emergência
    // mesmo mudando de etapa. Tirar a marcação é decisão de quem opera, então
    // fica como ação explícita — nunca como efeito colateral do arrasto.
    if (conversation.status === destino && conversation.priority !== 'emergencia') return
    move.mutate({ id: conversation.id, status: destino })
  }

  function handleDrop(destino: ColumnKey) {
    if (!dragging) return
    const conversation = conversations?.find((item) => item.id === dragging)
    setDragging(null)
    if (conversation) aplicarEtapa(conversation, destino)
  }

  const abas = COLUMNS.map((column) => ({
    key: column.key,
    label: column.label,
    count: (grouped.get(column.key) ?? []).length,
  }))

  const colunaAtual = COLUMNS.find((c) => c.key === coluna) ?? COLUMNS[0]
  const itensDaColuna = grouped.get(coluna) ?? []
  const ativosNoFluxo = COLUMNS.filter((column) => column.key !== 'concluido').reduce(
    (sum, column) => sum + (grouped.get(column.key)?.length ?? 0),
    0,
  )
  const aguardandoHumano = grouped.get('aguardando_humano')?.length ?? 0
  const emergencias = grouped.get('emergencia')?.length ?? 0

  return (
    <div className="animate-in-fade flex h-full flex-col">
      {error && (
        <div className="px-4 pt-4 sm:px-6">
          <Alert tone="error">{error}</Alert>
        </div>
      )}

      {/* ------------------------------------------------------ Celular
          Sem arrasto: seletor de coluna e uma lista por vez. */}
      <div className="flex min-h-0 flex-1 flex-col lg:hidden">
        <div className="border-b border-line bg-surface/95 px-3 pt-2.5 shadow-[var(--shadow-edge-bottom)]">
          <Tabs tabs={abas} value={coluna} onChange={setColuna} variant="underline" />
        </div>
        <div className="px-4 pt-3">
          <div
            className={cn(
              'premium-ring flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium',
              COLUMN_THEME[colunaAtual.key].header,
            )}
          >
            {(() => {
              const Icon = COLUMN_THEME[colunaAtual.key].icon
              return <Icon className="size-3.5 shrink-0" />
            })()}
            <span className="min-w-0 truncate">{colunaAtual.hint}</span>
          </div>
        </div>
        <div className="scrollbar-thin min-h-0 flex-1 space-y-2 overflow-y-auto p-3 pb-safe-3">
          {itensDaColuna.length === 0 ? (
            <div
              className={cn(
                'rounded-xl border border-dashed px-4 py-10 text-center text-sm font-medium',
                COLUMN_THEME[colunaAtual.key].empty,
              )}
            >
              Nenhum atendimento nesta etapa
            </div>
          ) : (
            itensDaColuna.map((conversation) => (
              <CardConversa
                key={conversation.id}
                conversation={conversation}
                onOpen={() => navigate(`/atendimentos?conversa=${conversation.id}`)}
                onMove={() => setMovendo(conversation)}
              />
            ))
          )}
        </div>
      </div>

      {/* ------------------------------------------------------ Computador
          Grade com quebra de linha: sem barra horizontal quando não couber. */}
      <div className="hidden min-h-0 flex-1 flex-col lg:flex">
        <div className="px-4 pt-4 sm:px-6">
          <div className="premium-ring overflow-hidden rounded-2xl bg-navy-900 shadow-[var(--shadow-raised)]">
            <div className="h-1 bg-gradient-to-r from-orange-500 via-cyan-500 to-emerald-500" />
            <div className="flex items-center justify-between gap-5 px-4 py-3.5">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-2xs font-bold uppercase tracking-label text-cyan-100">
                  <Columns3 className="size-3.5" />
                  Pipeline de atendimento
                </p>
                <h2 className="mt-1 truncate text-xl font-semibold text-white">
                  {emergencias > 0
                    ? `${emergencias} atendimento${emergencias > 1 ? 's' : ''} em prioridade máxima`
                    : 'Operação fluindo sem prioridade crítica'}
                </h2>
              </div>
              <div className="grid shrink-0 grid-cols-3 overflow-hidden rounded-xl ring-1 ring-white/10">
                <div className="min-w-[118px] bg-cyan-500/[0.16] px-4 py-2.5">
                  <p className="nums text-xl font-semibold leading-none text-white">
                    {ativosNoFluxo}
                  </p>
                  <p className="mt-1 text-2xs font-bold uppercase tracking-label text-cyan-100">
                    Ativos
                  </p>
                </div>
                <div className="min-w-[118px] bg-orange-500/[0.18] px-4 py-2.5">
                  <p className="nums text-xl font-semibold leading-none text-white">
                    {aguardandoHumano}
                  </p>
                  <p className="mt-1 text-2xs font-bold uppercase tracking-label text-orange-100">
                    Aguardando
                  </p>
                </div>
                <div className="min-w-[118px] bg-red-500/[0.18] px-4 py-2.5">
                  <p className="nums text-xl font-semibold leading-none text-white">
                    {emergencias}
                  </p>
                  <p className="mt-1 text-2xs font-bold uppercase tracking-label text-red-100">
                    Críticos
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 sm:px-6">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-3">
          {COLUMNS.map((column) => {
            const items = grouped.get(column.key) ?? []
            const theme = COLUMN_THEME[column.key]
            const Icon = theme.icon
            const activeDrop = dragging !== null
            return (
              <div
                key={column.key}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => handleDrop(column.key)}
                className={cn(
                  'premium-ring group/column flex min-h-[360px] min-w-0 flex-col overflow-hidden rounded-2xl bg-surface shadow-[var(--shadow-card)] ring-1 ring-ink/[0.065] transition-all duration-200',
                  activeDrop && 'ring-cyan-500/20',
                )}
              >
                <div className={cn('h-1 bg-gradient-to-r', theme.accent)} />
                <div className="flex items-start justify-between gap-3 border-b border-line/80 bg-surface px-3.5 py-3">
                  <div className="flex min-w-0 gap-2.5">
                    <span
                      className={cn(
                        'premium-ring flex size-8 shrink-0 items-center justify-center rounded-xl ring-1',
                        theme.header,
                      )}
                    >
                      <Icon className="size-4" />
                    </span>
                    <div className="min-w-0 pt-0.5">
                      <p className="truncate text-sm font-semibold text-ink">
                        {column.label}
                      </p>
                      <p className="mt-0.5 line-clamp-2 text-2xs leading-snug text-muted">
                        {column.hint}
                      </p>
                    </div>
                  </div>
                  <span
                    className={cn(
                      'nums flex h-7 min-w-7 shrink-0 items-center justify-center rounded-lg px-2 text-xs font-bold',
                      items.length > 0
                        ? theme.count
                        : 'bg-ink/[0.055] text-ink/[0.52]',
                    )}
                  >
                    {items.length}
                  </span>
                </div>

                <div className="scrollbar-thin min-h-0 flex-1 space-y-2.5 overflow-y-auto bg-gradient-to-b from-surface-soft to-white p-2.5">
                  {items.length === 0 ? (
                    <div
                      className={cn(
                        'flex min-h-[116px] flex-col items-center justify-center rounded-xl border border-dashed px-5 text-center',
                        theme.empty,
                      )}
                    >
                      <Icon className="mb-2 size-5 opacity-70" />
                      <p className="text-xs font-semibold">{column.vazio.titulo}</p>
                      <p className="mt-1 max-w-[30ch] text-2xs leading-snug opacity-75">
                        {column.vazio.texto}
                      </p>
                    </div>
                  ) : (
                    items.map((conversation) => (
                      <CardConversa
                        key={conversation.id}
                        conversation={conversation}
                        stage={column.key}
                        arrastavel
                        arrastando={dragging === conversation.id}
                        onDragStart={() => setDragging(conversation.id)}
                        onDragEnd={() => setDragging(null)}
                        onOpen={() => navigate(`/atendimentos?conversa=${conversation.id}`)}
                        onMove={() => setMovendo(conversation)}
                      />
                    ))
                  )}
                </div>
              </div>
            )
          })}
          </div>
        </div>
      </div>

      <MoverEtapa
        conversation={movendo}
        onClose={() => setMovendo(null)}
        onEscolher={(destino) => {
          if (movendo) aplicarEtapa(movendo, destino)
          setMovendo(null)
        }}
        onTirarEmergencia={() => {
          if (movendo) setPriority.mutate({ id: movendo.id, priority: 'alta' })
          setMovendo(null)
        }}
      />
    </div>
  )
}

/* ---------------------------------------------------------------- Cartão */

function CardConversa({
  conversation,
  stage,
  arrastavel,
  arrastando,
  onDragStart,
  onDragEnd,
  onOpen,
  onMove,
}: {
  conversation: ConversationWithRelations
  stage?: ColumnKey
  arrastavel?: boolean
  arrastando?: boolean
  onDragStart?: () => void
  onDragEnd?: () => void
  onOpen: () => void
  onMove: () => void
}) {
  const emergencia = conversation.priority === 'emergencia'
  const nomeRaw = conversation.customer?.name || conversation.customer?.whatsapp_name || ''
  const nomeLimpo = nomeRaw.trim()
  const telefone = conversation.customer?.phone ? formatPhone(conversation.customer.phone) : null
  const nome =
    nomeLimpo && nomeLimpo !== '.' && nomeLimpo !== '?'
      ? displayName(nomeLimpo)
      : 'Cliente sem nome'
  const visualStage: ColumnKey =
    stage ?? (emergencia && conversation.status !== 'concluido' ? 'emergencia' : conversation.status)
  const theme = COLUMN_THEME[visualStage]
  const teaser = conversation.ai_summary || conversation.last_message_text || 'Sem mensagens recentes'

  return (
    <article
      draggable={arrastavel}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      className={cn(
        'group relative cursor-pointer overflow-hidden rounded-2xl bg-surface p-3 shadow-[var(--shadow-card)] ring-1 ring-ink/[0.06] transition-all duration-200',
        'before:absolute before:inset-y-0 before:left-0 before:w-1 before:transition-opacity',
        'hover:-translate-y-0.5 hover:shadow-[var(--shadow-pop)] hover:ring-ink/[0.13]',
        theme.card,
        emergencia ? 'ring-red-500/22' : '',
        arrastando && 'opacity-40',
      )}
    >
      <div className="flex items-start gap-2.5 pl-1">
        <div className="relative shrink-0">
          <Avatar
            name={nome}
            seed={conversation.customer?.id ?? conversation.id}
            photoUrl={conversation.customer?.photo_url}
            size="sm"
            tone={emergencia ? 'danger' : undefined}
          />
          <span
            className={cn(
              'absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-surface',
              emergencia
                ? 'bg-red-500'
                : conversation.ai_enabled
                  ? 'bg-cyan-500'
                  : 'bg-orange-500',
            )}
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink">{nome}</p>
          <p className="mt-0.5 truncate text-2xs text-muted">
            {telefone ?? 'Contato sem telefone'}
          </p>
        </div>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onMove()
          }}
          aria-label="Mover de etapa"
          title="Mover de etapa"
          className="-mr-1 -mt-1 shrink-0 rounded-lg p-1.5 text-muted ring-1 ring-transparent transition-all hover:bg-ink/[0.045] hover:text-ink hover:ring-ink/[0.08]"
        >
          <ArrowLeftRight className="size-3.5" />
        </button>
      </div>

      <p
        className={cn(
          'mt-2.5 line-clamp-3 rounded-xl bg-ink/[0.025] px-2.5 py-2 text-xs leading-snug',
          conversation.ai_summary ? 'text-ink/70' : 'text-muted',
        )}
      >
        {teaser}
      </p>

      {(emergencia || conversation.ai_category || conversation.ai_enabled) && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {emergencia && (
            <Badge tone="danger">
              <Zap className="size-3" />
              Emergência
            </Badge>
          )}
          {conversation.ai_enabled && conversation.status !== 'concluido' && (
            <Badge tone="cyan">
              <Bot className="size-3" />
              IA
            </Badge>
          )}
          {conversation.ai_category && <Badge tone="neutral">{conversation.ai_category}</Badge>}
        </div>
      )}

      <div className="mt-2.5 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-t border-line/70 pt-2.5 text-2xs text-muted">
        <span className="flex min-w-0 items-center gap-1.5 truncate">
          <User className="size-3 shrink-0" />
          {conversation.assignee?.full_name ?? 'Sem responsável'}
        </span>
        <span className="nums flex shrink-0 items-center gap-1 rounded-md bg-ink/[0.04] px-1.5 py-1 text-ink/60">
          <Clock className="size-3" />
          {relativeFromNow(conversation.last_message_at ?? conversation.started_at)}
        </span>
      </div>
    </article>
  )
}

/* ------------------------------------------------------- Trocar de etapa */

/**
 * Alternativa ao arrasto. Existe porque arrastar com HTML5 simplesmente não
 * dispara em tela de toque — no celular, sem isto, o quadro é só leitura.
 */
function MoverEtapa({
  conversation,
  onClose,
  onEscolher,
  onTirarEmergencia,
}: {
  conversation: ConversationWithRelations | null
  onClose: () => void
  onEscolher: (destino: ColumnKey) => void
  onTirarEmergencia: () => void
}) {
  if (!conversation) return null

  const emergencia = conversation.priority === 'emergencia'
  const atual: ColumnKey = emergencia && conversation.status !== 'concluido'
    ? 'emergencia'
    : conversation.status

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="Mover de etapa"
      description={displayName(
        conversation.customer?.name || conversation.customer?.whatsapp_name,
      )}
    >
      <ul className="space-y-1">
        {COLUMNS.map((column) => {
          const atualAqui = column.key === atual
          const theme = COLUMN_THEME[column.key]
          const Icon = theme.icon
          return (
            <li key={column.key}>
              <button
                type="button"
                disabled={atualAqui}
                onClick={() => onEscolher(column.key)}
                className={cn(
                  'premium-ring flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all',
                  atualAqui
                    ? 'cursor-default bg-ink/[0.055] ring-1 ring-ink/[0.08]'
                    : 'hover:bg-ink/[0.035] hover:ring-1 hover:ring-ink/[0.08] active:bg-ink/[0.07]',
                )}
              >
                <span
                  className={cn(
                    'flex size-8 shrink-0 items-center justify-center rounded-xl ring-1',
                    theme.header,
                  )}
                >
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-ink">
                    {column.label}
                  </span>
                  <span className="block text-xs leading-snug text-muted">
                    {column.hint}
                  </span>
                </span>
                {atualAqui && <Badge tone="neutral">Etapa atual</Badge>}
              </button>
            </li>
          )
        })}
      </ul>

      {emergencia && (
        <div className="mt-3 border-t border-line pt-3">
          <p className="text-xs leading-snug text-muted">
            Enquanto estiver marcado como emergência, este atendimento continua na coluna de
            emergência mesmo mudando de etapa.
          </p>
          <Button variant="outline" size="sm" className="mt-2 w-full" onClick={onTirarEmergencia}>
            Tirar a marcação de emergência
          </Button>
        </div>
      )}
    </Modal>
  )
}
