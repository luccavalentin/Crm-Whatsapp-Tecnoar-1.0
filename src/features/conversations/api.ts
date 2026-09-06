import { useEffect, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { avisar } from '@/features/notifications/aviso'
import type { MediaKind } from './media'
import type {
  ConversationEventRow,
  ConversationRow,
  ConversationStatus,
  CustomerRow,
  MessageRow,
  ProfileRow,
} from '@/types/database'

export type InboxFilter =
  | 'novos'
  | 'meus'
  | 'ia'
  | 'aguardando_humano'
  | 'emergencia'
  | 'todos'
  | 'concluidos'
  | 'arquivados'

export interface ConversationWithRelations extends ConversationRow {
  customer: Pick<CustomerRow, 'id' | 'name' | 'phone' | 'whatsapp_name' | 'company_name'> | null
  assignee: Pick<ProfileRow, 'id' | 'full_name'> | null
}

const SELECT_CONVERSATION =
  '*, customer:customers!conversations_customer_id_fkey(id, name, phone, whatsapp_name, company_name),' +
  ' assignee:profiles!conversations_assigned_to_fkey(id, full_name)'

/* ------------------------------------------------------------------ Lista */

export function useConversations(
  companyId: string | undefined,
  filter: InboxFilter,
  userId: string | undefined,
  search: string,
) {
  return useQuery({
    queryKey: ['conversations', companyId, filter, userId, search],
    enabled: Boolean(companyId),
    queryFn: async (): Promise<ConversationWithRelations[]> => {
      let query = supabase
        .from('conversations')
        .select(SELECT_CONVERSATION)
        .eq('company_id', companyId!)
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(200)

      // Arquivados só aparecem quando pedidos: a caixa de entrada fica limpa.
      if (filter === 'arquivados') {
        query = query.not('archived_at', 'is', null)
      } else {
        query = query.is('archived_at', null)
      }

      switch (filter) {
        case 'novos':
          query = query.eq('status', 'novo')
          break
        case 'meus':
          query = query.eq('assigned_to', userId ?? '').neq('status', 'concluido')
          break
        case 'ia':
          query = query.eq('status', 'ia')
          break
        case 'aguardando_humano':
          query = query.eq('status', 'aguardando_humano')
          break
        case 'emergencia':
          query = query.eq('priority', 'emergencia').neq('status', 'concluido')
          break
        case 'concluidos':
          query = query.eq('status', 'concluido')
          break
        case 'arquivados':
        case 'todos':
          break
      }

      const { data, error } = await query
      if (error) throw error

      const list = (data ?? []) as unknown as ConversationWithRelations[]
      const term = search.trim().toLowerCase()
      if (!term) return list

      const digits = term.replace(/\D/g, '')
      return list.filter((conversation) => {
        const name = (conversation.customer?.name ?? conversation.customer?.whatsapp_name ?? '').toLowerCase()
        const phone = conversation.customer?.phone ?? ''
        return name.includes(term) || (digits.length > 0 && phone.includes(digits))
      })
    },
  })
}

export function useConversation(conversationId: string | undefined) {
  return useQuery({
    queryKey: ['conversation', conversationId],
    enabled: Boolean(conversationId),
    queryFn: async (): Promise<ConversationWithRelations | null> => {
      const { data, error } = await supabase
        .from('conversations')
        .select(SELECT_CONVERSATION)
        .eq('id', conversationId!)
        .maybeSingle()
      if (error) throw error
      return (data as unknown as ConversationWithRelations) ?? null
    },
  })
}

export interface MessageReaction {
  id: string
  message_id: string
  emoji: string
  by_customer: boolean
  profile_id: string | null
}

/** Trecho da mensagem citada, mostrado dentro da bolha. */
export interface QuotedPreview {
  id: string
  body: string | null
  type: MessageRow['type']
  direction: MessageRow['direction']
  sender: MessageRow['sender']
}

export interface MessageWithSender extends MessageRow {
  sender_profile: Pick<ProfileRow, 'id' | 'full_name'> | null
  reactions: MessageReaction[]
}

/** Quantas mensagens a conversa carrega de uma vez. */
export const MESSAGE_PAGE = 200

export function useMessages(conversationId: string | undefined) {
  return useQuery({
    queryKey: ['messages', conversationId],
    enabled: Boolean(conversationId),
    queryFn: async (): Promise<MessageWithSender[]> => {
      // Traz as mensagens mais recentes. Ordenar crescente com limite mostraria
      // o começo da conversa e esconderia justamente o que acabou de chegar.
      const { data, error } = await supabase
        .from('messages')
        // Sem auto-referencia (messages -> messages): esse vinculo depende do
        // cache de esquema do PostgREST e, quando ele fica velho, a consulta
        // inteira falha e a conversa aparece vazia. A mensagem citada e
        // resolvida na tela, a partir das proprias mensagens carregadas.
        .select(
          '*, sender_profile:profiles!messages_sender_user_id_fkey(id, full_name), ' +
            'reactions:message_reactions(id, message_id, emoji, by_customer, profile_id)',
        )
        .eq('conversation_id', conversationId!)
        .order('sequence', { ascending: false })
        .limit(MESSAGE_PAGE)
      if (error) throw error
      return ((data ?? []) as unknown as MessageWithSender[]).reverse()
    },
  })
}

export function useConversationEvents(conversationId: string | undefined) {
  return useQuery({
    queryKey: ['conversation-events', conversationId],
    enabled: Boolean(conversationId),
    queryFn: async (): Promise<ConversationEventRow[]> => {
      const { data, error } = await supabase
        .from('conversation_events')
        .select('*')
        .eq('conversation_id', conversationId!)
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) throw error
      return (data ?? []) as ConversationEventRow[]
    },
  })
}

/* ------------------------------------------------------------- Tempo real */

/**
 * Assina as mudanças de conversas e mensagens da empresa.
 * Tudo que chega do banco atualiza as telas sem recarregar a página.
 */
/**
 * Atualização ao vivo da caixa de entrada.
 *
 * São dois canais separados de propósito: uma inscrição que falha derruba o
 * canal inteiro, e já aconteceu de as reações levarem mensagens e conversas
 * junto. Separados, o pior caso é uma parte parar — não tudo.
 *
 * Enquanto um canal estiver fora do ar, uma verificação periódica segura a
 * tela atualizada. Ela para assim que o tempo real volta: nada de ficar
 * consultando o banco à toa.
 */
export function useRealtimeInbox(companyId: string | undefined) {
  const qc = useQueryClient()

  useEffect(() => {
    if (!companyId) return

    let vivo = true
    const timers: number[] = []

    const ressincronizar = () => {
      void qc.invalidateQueries({ queryKey: ['conversations'] })
      void qc.invalidateQueries({ queryKey: ['inbox-counters'] })
      void qc.invalidateQueries({ queryKey: ['messages'] })
      void qc.invalidateQueries({ queryKey: ['conversation-events'] })
    }

    /** Estado de cada canal, para saber se precisamos da verificação reserva. */
    const saude: Record<string, boolean> = { principal: false, reacoes: false }

    const abrir = (
      nome: string,
      montar: (channel: RealtimeChannel) => RealtimeChannel,
    ): (() => void) => {
      let channel: RealtimeChannel | null = null
      let tentativas = 0
      let fechado = false

      const conectar = () => {
        if (!vivo || fechado) return
        channel = montar(supabase.channel(`${nome}:${companyId}:${crypto.randomUUID()}`))
        channel.subscribe((status) => {
          if (!vivo) return
          if (status === 'SUBSCRIBED') {
            saude[nome] = true
            tentativas = 0
            ressincronizar()
            return
          }
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            saude[nome] = false
            if (fechado) return
            // Espera crescente até 30s, para não martelar o servidor.
            const espera = Math.min(1000 * 2 ** tentativas, 30_000)
            tentativas += 1
            console.warn(`[tempo real] canal ${nome}: ${status}. Reabrindo em ${espera}ms`)
            const anterior = channel
            channel = null
            if (anterior) void supabase.removeChannel(anterior)
            timers.push(window.setTimeout(conectar, espera))
          }
        })
      }

      conectar()

      return () => {
        fechado = true
        if (channel) void supabase.removeChannel(channel)
      }
    }

    const fecharPrincipal = abrir('principal', (channel) =>
      channel
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'conversations', filter: `company_id=eq.${companyId}` },
          (payload) => {
            const row = (payload.new ?? payload.old) as ConversationRow | undefined
            void qc.invalidateQueries({ queryKey: ['conversations'] })
            void qc.invalidateQueries({ queryKey: ['inbox-counters'] })
            if (row?.id) {
              void qc.invalidateQueries({ queryKey: ['conversation', row.id] })
              void qc.invalidateQueries({ queryKey: ['conversation-events', row.id] })
            }
          },
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'messages', filter: `company_id=eq.${companyId}` },
          (payload) => {
            const row = (payload.new ?? payload.old) as MessageRow | undefined
            if (row?.conversation_id) {
              void qc.invalidateQueries({ queryKey: ['messages', row.conversation_id] })
            }
            void qc.invalidateQueries({ queryKey: ['conversations'] })
            void qc.invalidateQueries({ queryKey: ['inbox-counters'] })

            // Mensagem do cliente chegando: avisa quem está atendendo. Só
            // inbound — o eco da nossa própria resposta não deve tocar.
            if (payload.eventType === 'INSERT' && row?.direction === 'inbound') {
              avisar({
                titulo: 'Nova mensagem no WhatsApp',
                corpo: row.body?.trim() || 'Mensagem sem texto',
                conversationId: row.conversation_id,
              })
            }
          },
        )
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'conversation_events', filter: `company_id=eq.${companyId}` },
          (payload) => {
            const row = payload.new as ConversationEventRow
            void qc.invalidateQueries({ queryKey: ['conversation-events', row.conversation_id] })
          },
        ),
    )

    const fecharReacoes = abrir('reacoes', (channel) =>
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'message_reactions', filter: `company_id=eq.${companyId}` },
        () => {
          // A reação não diz a qual conversa pertence: recarrega a aberta.
          void qc.invalidateQueries({ queryKey: ['messages'] })
        },
      ),
    )

    // Rede de segurança: só consulta enquanto o tempo real estiver fora.
    const reserva = window.setInterval(() => {
      if (!saude.principal) ressincronizar()
    }, 15_000)

    // Voltar para a aba ou reconectar a internet também ressincroniza.
    const aoVoltar = () => {
      if (document.visibilityState === 'visible') ressincronizar()
    }
    document.addEventListener('visibilitychange', aoVoltar)
    window.addEventListener('online', aoVoltar)

    return () => {
      vivo = false
      window.clearInterval(reserva)
      timers.forEach((id) => window.clearTimeout(id))
      document.removeEventListener('visibilitychange', aoVoltar)
      window.removeEventListener('online', aoVoltar)
      fecharPrincipal()
      fecharReacoes()
    }
  }, [companyId, qc])
}

/** Contadores reais por caixa de entrada. */
export function useInboxCounters(companyId: string | undefined, userId: string | undefined) {
  const query = useQuery({
    queryKey: ['inbox-counters', companyId, userId],
    enabled: Boolean(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('conversations')
        .select('id, status, priority, assigned_to, unread_count')
        .eq('company_id', companyId!)
        .limit(1000)
      if (error) throw error
      return (data ?? []) as Array<{
        id: string
        status: ConversationStatus
        priority: string
        assigned_to: string | null
        unread_count: number
      }>
    },
  })

  return useMemo(() => {
    const rows = query.data ?? []
    const open = rows.filter((r) => r.status !== 'concluido')
    return {
      novos: rows.filter((r) => r.status === 'novo').length,
      meus: open.filter((r) => r.assigned_to === userId).length,
      ia: rows.filter((r) => r.status === 'ia').length,
      aguardando_humano: rows.filter((r) => r.status === 'aguardando_humano').length,
      emergencia: open.filter((r) => r.priority === 'emergencia').length,
      todos: rows.length,
      concluidos: rows.filter((r) => r.status === 'concluido').length,
      // O contador de arquivados fica sempre em zero: o selo do filtro serve
      // para chamar atencao do que precisa de acao, e arquivado nao precisa.
      arquivados: 0,
    }
  }, [query.data, userId])
}

/* --------------------------------------------------------------- Mutações */

function invalidateConversation(qc: ReturnType<typeof useQueryClient>, conversationId: string) {
  void qc.invalidateQueries({ queryKey: ['conversation', conversationId] })
  void qc.invalidateQueries({ queryKey: ['conversations'] })
  void qc.invalidateQueries({ queryKey: ['inbox-counters'] })
  void qc.invalidateQueries({ queryKey: ['conversation-events', conversationId] })
}

export function useAssignConversation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ conversationId, userId }: { conversationId: string; userId?: string }) => {
      const { error } = await supabase.rpc('assign_conversation', {
        p_conversation_id: conversationId,
        p_user_id: userId,
      })
      if (error) throw error
    },
    onSuccess: (_data, variables) => invalidateConversation(qc, variables.conversationId),
  })
}

export function useTransferConversation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      conversationId,
      toUserId,
      note,
    }: {
      conversationId: string
      toUserId: string
      note?: string
    }) => {
      const { error } = await supabase.rpc('transfer_conversation', {
        p_conversation_id: conversationId,
        p_to_user_id: toUserId,
        p_note: note,
      })
      if (error) throw error
    },
    onSuccess: (_data, variables) => invalidateConversation(qc, variables.conversationId),
  })
}

export function useSetConversationAI() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ conversationId, enabled }: { conversationId: string; enabled: boolean }) => {
      const { error } = await supabase.rpc('set_conversation_ai', {
        p_conversation_id: conversationId,
        p_enabled: enabled,
      })
      if (error) throw error
    },
    onSuccess: (_data, variables) => invalidateConversation(qc, variables.conversationId),
  })
}

export function useCloseConversation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (conversationId: string) => {
      const { error } = await supabase.rpc('close_conversation', {
        p_conversation_id: conversationId,
      })
      if (error) throw error
    },
    onSuccess: (_data, conversationId) => invalidateConversation(qc, conversationId),
  })
}

export function useReopenConversation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (conversationId: string) => {
      const { error } = await supabase.rpc('reopen_conversation', {
        p_conversation_id: conversationId,
      })
      if (error) throw error
    },
    onSuccess: (_data, conversationId) => invalidateConversation(qc, conversationId),
  })
}

export function useMarkRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (conversationId: string) => {
      const { error } = await supabase.rpc('mark_conversation_read', {
        p_conversation_id: conversationId,
      })
      if (error) throw error
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['conversations'] })
      void qc.invalidateQueries({ queryKey: ['inbox-counters'] })
    },
  })
}

export function useOpenConversation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (customerId: string): Promise<ConversationRow> => {
      const { data, error } = await supabase.rpc('open_conversation', { p_customer_id: customerId })
      if (error) throw error
      return data as unknown as ConversationRow
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['conversations'] })
      void qc.invalidateQueries({ queryKey: ['inbox-counters'] })
    },
  })
}

/* ----------------------------------------------------------------- Envio */

export interface SendMessageResult {
  message: MessageRow
  error?: string
  duplicated?: boolean
  /** Meta exige modelo aprovado: a janela de 24 horas foi encerrada. */
  requiresTemplate?: boolean
}

export interface TemplateInput {
  name: string
  language: string
  params: string[]
}

/**
 * O envio passa pela Edge Function, que grava a mensagem e entrega pelo canal
 * real de WhatsApp. Nada é marcado como enviado sem confirmação do provedor.
 */
/** Reenvia uma mensagem que falhou, criando um novo envio real. */
export function useRetryMessage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (messageId: string): Promise<SendMessageResult> => {
      const { data, error } = await supabase.functions.invoke<SendMessageResult>('send-message', {
        body: { retryMessageId: messageId, clientToken: crypto.randomUUID() },
      })
      if (error) {
        const context = (error as unknown as { context?: Response }).context
        if (context) {
          const body = await context.json().catch(() => null)
          if (body?.error) throw new Error(body.error)
        }
        throw error
      }
      if (!data) throw new Error('Resposta vazia do serviço de envio.')
      return data
    },
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey: ['messages', result.message.conversation_id] })
      void qc.invalidateQueries({ queryKey: ['conversations'] })
    },
  })
}

export function useSendMessage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      conversationId?: string
      customerId?: string
      text: string
      clientToken: string
      template?: TemplateInput
      media?: { path: string; mime: string; name: string; kind: MediaKind }
      replyToId?: string | null
    }): Promise<SendMessageResult> => {
      const { data, error } = await supabase.functions.invoke<SendMessageResult>('send-message', {
        body: input,
      })
      if (error) {
        // Erros HTTP da função trazem o corpo em context
        const context = (error as unknown as { context?: Response }).context
        if (context) {
          const body = await context.json().catch(() => null)
          if (body?.error) throw new Error(body.error)
        }
        throw error
      }
      if (!data) throw new Error('Resposta vazia do serviço de envio.')
      return data
    },
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey: ['messages', result.message.conversation_id] })
      void qc.invalidateQueries({ queryKey: ['conversations'] })
      void qc.invalidateQueries({ queryKey: ['inbox-counters'] })
    },
  })
}

/** Atendimentos de um cliente — usado no perfil do CRM. */
export function useCustomerConversations(customerId: string | undefined) {
  return useQuery({
    queryKey: ['customer-conversations', customerId],
    enabled: Boolean(customerId),
    queryFn: async (): Promise<ConversationWithRelations[]> => {
      const { data, error } = await supabase
        .from('conversations')
        .select(SELECT_CONVERSATION)
        .eq('customer_id', customerId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as ConversationWithRelations[]
    },
  })
}

/** Todas as mensagens trocadas com um cliente, em ordem cronológica. */
export function useCustomerMessages(customerId: string | undefined) {
  return useQuery({
    queryKey: ['customer-messages', customerId],
    enabled: Boolean(customerId),
    queryFn: async (): Promise<MessageWithSender[]> => {
      const { data, error } = await supabase
        .from('messages')
        .select('*, sender_profile:profiles!messages_sender_user_id_fkey(id, full_name)')
        .eq('customer_id', customerId!)
        .order('sequence', { ascending: true })
        .limit(500)
      if (error) throw error
      return (data ?? []) as unknown as MessageWithSender[]
    },
  })
}


/* ------------------------------------------------- Exclusão definitiva */

/**
 * Apaga a conversa, as mensagens e os arquivos dela. É irreversível e fica
 * registrada em data_erasures — o registro guarda a prova, não o conteúdo.
 */
export function useEraseConversation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ conversationId, reason }: { conversationId: string; reason?: string }) => {
      const { data, error } = await supabase.rpc('erase_conversation', {
        p_conversation_id: conversationId,
        p_reason: reason ?? null,
      })
      if (error) throw error
      await removeStoredMedia(data)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['conversations'] })
      void qc.invalidateQueries({ queryKey: ['inbox-counters'] })
      void qc.invalidateQueries({ queryKey: ['customers'] })
    },
  })
}

/** Apaga o cliente e todo o histórico dele. */
export function useEraseCustomer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ customerId, reason }: { customerId: string; reason?: string }) => {
      const { data, error } = await supabase.rpc('erase_customer', {
        p_customer_id: customerId,
        p_reason: reason ?? null,
      })
      if (error) throw error
      await removeStoredMedia(data)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['customers'] })
      void qc.invalidateQueries({ queryKey: ['conversations'] })
      void qc.invalidateQueries({ queryKey: ['inbox-counters'] })
    },
  })
}

/** Remove do armazenamento os arquivos que pertenciam ao que foi apagado. */
async function removeStoredMedia(result: unknown): Promise<void> {
  const rows = (Array.isArray(result) ? result : [result]) as Array<{
    media_paths?: string[] | null
  } | null>
  const paths = rows.flatMap((row) => row?.media_paths ?? []).filter(Boolean)
  if (paths.length === 0) return
  await supabase.storage.from('whatsapp-media').remove(paths)
}


/* -------------------------------------------------- Reações e arquivo */

/**
 * Reage a uma mensagem. A reação só entra no CRM depois que o WhatsApp
 * confirma — passar emoji vazio remove a reação, igual ao aplicativo.
 */
export function useReactToMessage(conversationId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ messageId, emoji }: { messageId: string; emoji: string | null }) => {
      const { data, error } = await supabase.functions.invoke<{ ok?: boolean; error?: string }>(
        'message-action',
        { body: { action: 'react', messageId, emoji } },
      )
      if (error) {
        const context = (error as unknown as { context?: Response }).context
        if (context) {
          const body = await context.json().catch(() => null)
          if (body?.error) throw new Error(body.error)
        }
        throw error
      }
      if (data?.error) throw new Error(data.error)
    },
    onSuccess: () => {
      if (conversationId) void qc.invalidateQueries({ queryKey: ['messages', conversationId] })
    },
  })
}

/** Arquiva ou desarquiva o atendimento. Arquivar não apaga nada. */
export function useArchiveConversation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ conversationId, archived }: { conversationId: string; archived: boolean }) => {
      const { error } = await supabase.rpc('set_conversation_archived', {
        p_conversation_id: conversationId,
        p_archived: archived,
      })
      if (error) throw error
    },
    onSuccess: (_data, variables) => {
      void qc.invalidateQueries({ queryKey: ['conversations'] })
      void qc.invalidateQueries({ queryKey: ['inbox-counters'] })
      void qc.invalidateQueries({ queryKey: ['conversation', variables.conversationId] })
      void qc.invalidateQueries({ queryKey: ['conversation-events', variables.conversationId] })
    },
  })
}
