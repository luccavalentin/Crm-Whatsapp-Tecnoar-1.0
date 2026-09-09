import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { storeInboundMedia, type InboundMediaRef } from './media.ts'
import { buscarFotoPerfil } from '../_shared/providers.ts'

/** Quanto tempo uma foto ja conferida vale antes de perguntarmos de novo. */
const VALIDADE_DA_FOTO_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Mantem a foto do cliente atualizada, sem pesar no caminho da mensagem.
 *
 * A Evolution limita as chamadas de perfil e a foto muda raramente, entao so
 * perguntamos quando nunca perguntamos ou quando a ultima conferencia passou
 * de uma semana. `photo_checked_at` e gravado mesmo quando nao ha foto — e o
 * que impede o sistema de perguntar de novo a cada mensagem de quem nao tem
 * foto nenhuma.
 */
async function atualizarFotoDoCliente(
  admin: SupabaseClient,
  channel: ChannelRow,
  customerId: string,
  telefone: string,
): Promise<void> {
  const { data: atual } = await admin
    .from('customers')
    .select('photo_checked_at')
    .eq('id', customerId)
    .maybeSingle()

  const conferidoEm = atual?.photo_checked_at ? Date.parse(atual.photo_checked_at as string) : 0
  if (conferidoEm && Date.now() - conferidoEm < VALIDADE_DA_FOTO_MS) return

  const url = await buscarFotoPerfil(channel, telefone)
  // undefined = nao deu para perguntar. Nao gravamos nada, para tentar de novo
  // na proxima mensagem em vez de fingir que ja conferimos.
  if (url === undefined) return

  await admin
    .from('customers')
    .update({ photo_url: url, photo_checked_at: new Date().toISOString() })
    .eq('id', customerId)
}

/** Localizacao normalizada, igual para Meta e Evolution. */
export interface InboundLocation {
  lat: number
  lng: number
  name: string | null
  address: string | null
}

export interface ChannelRow {
  id: string
  company_id: string
  provider: 'meta' | 'evolution'
  is_active: boolean
  status: string
  external_id: string | null
  settings: Record<string, unknown>
  secrets: Record<string, string>
}

interface InboundInput {
  channel: ChannelRow
  providerMessageId: string
  eventId: string
  eventType: string
  from: string
  profileName: string | null
  text: string | null
  type: string
  /** Identificador da conversa no provedor (remoteJid / wa_id) */
  chatId?: string | null
  /** Id, no provedor, da mensagem que esta sendo citada */
  replyToProviderId?: string | null
  timestamp: string
  payload: Record<string, unknown>
  /** Anexo informado pelo provedor, quando a mensagem tem arquivo */
  media?: InboundMediaRef
  /** Coordenadas, quando o cliente compartilha a localizacao */
  location?: InboundLocation | null
}

/** Marca o evento como processado. Retorna false quando já havia sido tratado. */
async function claimEvent(
  admin: SupabaseClient,
  channel: ChannelRow,
  eventId: string,
  eventType: string,
  payload: Record<string, unknown>,
): Promise<boolean> {
  const { error } = await admin.from('webhook_events').insert({
    company_id: channel.company_id,
    provider: channel.provider,
    event_id: eventId,
    event_type: eventType,
    payload,
  })
  if (error) {
    // 23505 = evento repetido (reentrega do provedor)
    if (error.code === '23505') return false
    throw new Error(error.message)
  }
  return true
}

/**
 * Mensagem recebida do cliente:
 * identifica o cliente pelo telefone, abre/reaproveita a conversa,
 * grava a mensagem e aciona a IA quando permitido.
 */
export async function ingestInbound(admin: SupabaseClient, input: InboundInput): Promise<void> {
  const { channel } = input

  const claimed = await claimEvent(admin, channel, input.eventId, input.eventType, input.payload)
  if (!claimed) return

  // ------------------------------------------------------------- Cliente
  const { data: customer, error: customerError } = await admin.rpc('resolve_customer_by_phone', {
    p_company_id: channel.company_id,
    p_phone: input.from,
    p_name: input.profileName,
    p_source: 'whatsapp',
  })
  if (customerError || !customer) throw new Error(customerError?.message ?? 'Cliente nao resolvido')

  const customerId = (customer as { id: string }).id

  // A foto vai por fora do fluxo: se a Evolution demorar ou recusar, a
  // mensagem do cliente nao pode ficar esperando por causa de um avatar.
  atualizarFotoDoCliente(admin, channel, customerId, input.from).catch((erro) => {
    console.warn('[whatsapp] foto de perfil ignorada', erro)
  })

  // ------------------------------------------------------------ Conversa
  const { data: open } = await admin
    .from('conversations')
    .select('*')
    .eq('customer_id', customerId)
    .neq('status', 'concluido')
    .maybeSingle()

  let conversation = open
  if (!conversation) {
    const { data: settings } = await admin
      .from('ai_settings')
      .select('enabled')
      .eq('company_id', channel.company_id)
      .maybeSingle()

    const { data: created, error } = await admin
      .from('conversations')
      .insert({
        company_id: channel.company_id,
        customer_id: customerId,
        status: 'novo',
        channel: channel.provider,
        channel_account_id: channel.id,
        ai_enabled: settings?.enabled ?? true,
      })
      .select('*')
      .single()
    if (error) throw new Error(error.message)
    conversation = created
  } else if (!conversation.channel) {
    await admin
      .from('conversations')
      .update({ channel: channel.provider, channel_account_id: channel.id })
      .eq('id', conversation.id)
  }

  // -------------------------------------------------------------- Anexo
  // O arquivo é baixado do provedor e guardado no bucket da empresa.
  // Se falhar, a mensagem entra sem o arquivo — nunca com um link inventado.
  const stored = input.media
    ? await storeInboundMedia(
        admin,
        channel,
        conversation.id,
        input.providerMessageId,
        input.media,
      )
    : null

  // ------------------------------------------------------ Mensagem citada
  // Se o cliente respondeu a uma mensagem nossa, ligamos as duas.
  let replyToId: string | null = null
  if (input.replyToProviderId) {
    const { data: original } = await admin
      .from('messages')
      .select('id')
      .eq('company_id', channel.company_id)
      .eq('provider_message_id', input.replyToProviderId)
      .maybeSingle()
    replyToId = (original?.id as string | undefined) ?? null
  }

  // ------------------------------------------------------------ Mensagem
  const { error: messageError } = await admin.from('messages').insert({
    company_id: channel.company_id,
    conversation_id: conversation.id,
    customer_id: customerId,
    direction: 'inbound',
    sender: 'cliente',
    type: input.type,
    body: input.text,
    provider_chat_id: input.chatId ?? null,
    reply_to_id: replyToId,
    location: input.location ?? null,
    media_url: stored?.path ?? null,
    media_mime: stored?.mime ?? null,
    media_name: stored?.name ?? null,
    status: 'entregue',
    channel: channel.provider,
    provider_message_id: input.providerMessageId,
    sent_at: input.timestamp,
    delivered_at: input.timestamp,
    metadata: input.payload,
  })

  // Mensagem repetida com o mesmo id do provedor: ignora em silêncio
  if (messageError && messageError.code !== '23505') throw new Error(messageError.message)

  await admin
    .from('whatsapp_channels')
    .update({ last_inbound_at: input.timestamp, status: 'conectado' })
    .eq('id', channel.id)

  // ------------------------------------------------------------------ IA
  if (conversation.ai_enabled && conversation.status !== 'concluido') {
    const task = fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/ai-reply`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ conversationId: conversation.id }),
    }).catch((error) => {
      console.error('[webhook] falha ao acionar a IA', error)
    })

    const runtime = (globalThis as { EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void } })
      .EdgeRuntime
    if (runtime?.waitUntil) runtime.waitUntil(task)
    else await task
  }
}

interface ReactionInput {
  channel: ChannelRow
  eventId: string
  /** Id, no provedor, da mensagem que recebeu a reacao */
  targetProviderId: string
  /** Emoji; vazio significa que o cliente removeu a reacao */
  emoji: string
  payload: Record<string, unknown>
}

/**
 * Reacao enviada pelo cliente no WhatsApp.
 * Cada cliente tem no maximo uma reacao por mensagem, igual ao aplicativo.
 */
export async function ingestReaction(
  admin: SupabaseClient,
  input: ReactionInput,
): Promise<void> {
  const claimed = await claimEvent(admin, input.channel, input.eventId, 'reaction', input.payload)
  if (!claimed) return

  const { data: message } = await admin
    .from('messages')
    .select('id')
    .eq('company_id', input.channel.company_id)
    .eq('provider_message_id', input.targetProviderId)
    .maybeSingle()

  if (!message) return

  if (!input.emoji) {
    await admin
      .from('message_reactions')
      .delete()
      .eq('message_id', message.id)
      .eq('by_customer', true)
    return
  }

  await admin.from('message_reactions').upsert(
    {
      company_id: input.channel.company_id,
      message_id: message.id,
      emoji: input.emoji,
      by_customer: true,
      profile_id: null,
    },
    { onConflict: 'message_id', ignoreDuplicates: false },
  )
}

interface StatusInput {
  channel: ChannelRow
  providerMessageId: string
  eventId: string
  status: 'enviada' | 'entregue' | 'lida' | 'falhou'
  timestamp: string
  error: string | null
  payload: Record<string, unknown>
}

const RANK: Record<string, number> = {
  pendente: 0,
  enviando: 1,
  enviada: 2,
  entregue: 3,
  lida: 4,
  falhou: 5,
}

/** Atualiza o status real de entrega, sem retroceder o que já avançou. */
export async function updateMessageStatus(
  admin: SupabaseClient,
  input: StatusInput,
): Promise<void> {
  const claimed = await claimEvent(admin, input.channel, input.eventId, 'status', input.payload)
  if (!claimed) return

  const { data: message } = await admin
    .from('messages')
    .select('id, status')
    .eq('company_id', input.channel.company_id)
    .eq('provider_message_id', input.providerMessageId)
    .maybeSingle()

  if (!message) return
  if (input.status !== 'falhou' && RANK[input.status] <= RANK[message.status]) return

  const patch: Record<string, unknown> = { status: input.status }
  if (input.status === 'enviada') patch.sent_at = input.timestamp
  if (input.status === 'entregue') patch.delivered_at = input.timestamp
  if (input.status === 'lida') patch.read_at = input.timestamp
  if (input.status === 'falhou') {
    patch.failed_at = input.timestamp
    patch.error_message = input.error ?? 'O provedor recusou a mensagem.'
  }

  await admin.from('messages').update(patch).eq('id', message.id)

  if (input.status === 'falhou') {
    await admin.rpc('raise_alert', {
      p_company_id: input.channel.company_id,
      p_source: 'whatsapp',
      p_code: `falha_entrega_${input.channel.provider}`,
      p_title: 'Mensagem recusada pelo WhatsApp',
      p_description: input.error ?? 'O provedor recusou a mensagem.',
      p_severity: 'aviso',
      p_metadata: { message_id: message.id },
    })
  }
}
