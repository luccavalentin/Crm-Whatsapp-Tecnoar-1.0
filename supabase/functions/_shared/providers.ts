import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'

export interface Channel {
  id: string
  company_id: string
  provider: 'meta' | 'evolution'
  is_active: boolean
  status: string
  phone_number: string | null
  external_id: string | null
  settings: Record<string, unknown>
  secrets: Record<string, string>
}

export interface TemplatePayload {
  name: string
  language: string
  params: string[]
}

export type MediaKind = 'image' | 'video' | 'audio' | 'document'

export interface MediaPayload {
  /** URL assinada que o provedor busca no momento do envio */
  url: string
  mime: string
  name: string
  kind: MediaKind
}

/** Mensagem que esta sendo citada (o "responder" do WhatsApp). */
export interface QuotedMessage {
  providerMessageId: string
  chatId: string | null
  fromMe: boolean
  text: string | null
}

export interface OutboundPayload {
  to: string
  type: 'text' | 'template' | MediaKind
  text: string
  template?: TemplatePayload
  media?: MediaPayload
  quoted?: QuotedMessage
}

/** Reacao de emoji sobre uma mensagem ja entregue. */
export interface ReactionPayload {
  chatId: string | null
  to: string
  providerMessageId: string
  fromMe: boolean
  /** String vazia remove a reacao, igual ao WhatsApp. */
  emoji: string
}

export interface SendResult {
  ok: boolean
  providerMessageId?: string
  error?: string
  /** true quando a Meta exige modelo aprovado (janela de 24h encerrada) */
  requiresTemplate?: boolean
}

export class ChannelNotConfigured extends Error {
  constructor(message = 'Nenhum canal de WhatsApp ativo configurado.') {
    super(message)
    this.name = 'ChannelNotConfigured'
  }
}

/** Canal ativo da empresa (Meta ou Evolution). */
export async function activeChannel(
  admin: SupabaseClient,
  companyId: string,
): Promise<Channel | null> {
  const { data } = await admin
    .from('whatsapp_channels')
    .select('*')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .maybeSingle()
  return (data as Channel) ?? null
}

/**
 * Entrega a mensagem pelo provedor do canal.
 * As implementações reais de Meta Cloud API e Evolution API são adicionadas
 * nas etapas 5 e 6; até lá o envio falha de forma explícita — nunca simulado.
 */
export async function sendViaChannel(
  channel: Channel,
  payload: OutboundPayload,
): Promise<SendResult> {
  switch (channel.provider) {
    case 'meta':
      return await sendViaMeta(channel, payload)
    case 'evolution':
      return await sendViaEvolution(channel, payload)
    default:
      return { ok: false, error: 'Provedor de canal desconhecido.' }
  }
}

async function sendViaMeta(channel: Channel, payload: OutboundPayload): Promise<SendResult> {
  const token = channel.secrets?.access_token
  const phoneNumberId = channel.external_id
  if (!token || !phoneNumberId) {
    return { ok: false, error: 'Credenciais da Meta Cloud API incompletas.' }
  }

  const version = (channel.settings?.api_version as string) || 'v21.0'

  const content = payload.media
    ? metaMediaContent(payload)
    : payload.type === 'template' && payload.template
      ? {
          type: 'template',
          template: {
            name: payload.template.name,
            language: { code: payload.template.language || 'pt_BR' },
            components:
              payload.template.params.length > 0
                ? [
                    {
                      type: 'body',
                      parameters: payload.template.params.map((text) => ({ type: 'text', text })),
                    },
                  ]
                : undefined,
          },
        }
      : { type: 'text', text: { preview_url: false, body: payload.text } }

  const response = await fetch(
    `https://graph.facebook.com/${version}/${phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: payload.to,
        ...(payload.quoted
          ? { context: { message_id: payload.quoted.providerMessageId } }
          : {}),
        ...content,
      }),
    },
  )

  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    const code = body?.error?.code
    // 131047 / 470: janela de 24 horas encerrada — só modelo aprovado é aceito
    if (code === 131047 || code === 470) {
      return {
        ok: false,
        requiresTemplate: true,
        error:
          'Passaram-se mais de 24 horas desde a última mensagem do cliente. ' +
          'A Meta só aceita modelo (template) aprovado nesse caso.',
      }
    }
    const message = body?.error?.message ?? `Falha HTTP ${response.status} na Meta Cloud API.`
    return { ok: false, error: message }
  }
  return { ok: true, providerMessageId: body?.messages?.[0]?.id }
}

/** Monta o corpo de mídia aceito pela Meta Cloud API. */
function metaMediaContent(payload: OutboundPayload): Record<string, unknown> {
  const media = payload.media!
  const caption = payload.text?.trim() ? payload.text.trim() : undefined
  switch (media.kind) {
    case 'image':
      return { type: 'image', image: { link: media.url, caption } }
    case 'video':
      return { type: 'video', video: { link: media.url, caption } }
    case 'audio':
      // A Meta nao aceita legenda em audio.
      return { type: 'audio', audio: { link: media.url } }
    default:
      return { type: 'document', document: { link: media.url, filename: media.name, caption } }
  }
}

async function sendViaEvolution(channel: Channel, payload: OutboundPayload): Promise<SendResult> {
  const baseUrl = (channel.settings?.base_url as string)?.replace(/\/+$/, '')
  const instance = channel.settings?.instance as string
  const apiKey = channel.secrets?.api_key
  if (!baseUrl || !instance || !apiKey) {
    return { ok: false, error: 'Credenciais da Evolution API incompletas.' }
  }

  const { path, body: requestBody } = evolutionRequest(instance, payload)

  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { apikey: apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  })

  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = body?.message ?? body?.error ?? `Falha HTTP ${response.status} na Evolution API.`
    return { ok: false, error: typeof message === 'string' ? message : JSON.stringify(message) }
  }
  return { ok: true, providerMessageId: body?.key?.id ?? body?.messageId }
}

/** Rota e corpo da Evolution API conforme o tipo da mensagem. */
function evolutionRequest(
  instance: string,
  payload: OutboundPayload,
): { path: string; body: Record<string, unknown> } {
  const quoted = payload.quoted
    ? {
        quoted: {
          key: {
            id: payload.quoted.providerMessageId,
            remoteJid: payload.quoted.chatId ?? undefined,
            fromMe: payload.quoted.fromMe,
          },
        },
      }
    : {}

  const media = payload.media
  if (!media) {
    return {
      path: `/message/sendText/${instance}`,
      body: { number: payload.to, text: payload.text, ...quoted },
    }
  }

  if (media.kind === 'audio') {
    // Audio vai como mensagem de voz (ptt), igual ao WhatsApp nativo.
    return {
      path: `/message/sendWhatsAppAudio/${instance}`,
      body: { number: payload.to, audio: media.url, ...quoted },
    }
  }

  return {
    path: `/message/sendMedia/${instance}`,
    body: {
      number: payload.to,
      mediatype: media.kind,
      mimetype: media.mime,
      media: media.url,
      fileName: media.name,
      caption: payload.text?.trim() ? payload.text.trim() : undefined,
      ...quoted,
    },
  }
}

/* --------------------------------------------------------------- Reacoes */

/** Entrega a reacao de emoji pelo provedor do canal. */
export async function sendReaction(
  channel: Channel,
  payload: ReactionPayload,
): Promise<SendResult> {
  if (channel.provider === 'meta') return await reactViaMeta(channel, payload)
  if (channel.provider === 'evolution') return await reactViaEvolution(channel, payload)
  return { ok: false, error: 'Provedor de canal desconhecido.' }
}

async function reactViaMeta(channel: Channel, payload: ReactionPayload): Promise<SendResult> {
  const token = channel.secrets?.access_token
  const phoneNumberId = channel.external_id
  if (!token || !phoneNumberId) {
    return { ok: false, error: 'Credenciais da Meta Cloud API incompletas.' }
  }
  const version = (channel.settings?.api_version as string) || 'v21.0'

  const response = await fetch(
    `https://graph.facebook.com/${version}/${phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: payload.to,
        type: 'reaction',
        reaction: { message_id: payload.providerMessageId, emoji: payload.emoji },
      }),
    },
  )

  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    return {
      ok: false,
      error: body?.error?.message ?? `Falha HTTP ${response.status} na Meta Cloud API.`,
    }
  }
  return { ok: true, providerMessageId: body?.messages?.[0]?.id }
}

async function reactViaEvolution(
  channel: Channel,
  payload: ReactionPayload,
): Promise<SendResult> {
  const baseUrl = (channel.settings?.base_url as string)?.replace(/\/+$/, '')
  const instance = channel.settings?.instance as string
  const apiKey = channel.secrets?.api_key
  if (!baseUrl || !instance || !apiKey) {
    return { ok: false, error: 'Credenciais da Evolution API incompletas.' }
  }

  const response = await fetch(`${baseUrl}/message/sendReaction/${instance}`, {
    method: 'POST',
    headers: { apikey: apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      key: {
        id: payload.providerMessageId,
        remoteJid: payload.chatId ?? `${payload.to}@s.whatsapp.net`,
        fromMe: payload.fromMe,
      },
      reaction: payload.emoji,
    }),
  })

  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = body?.message ?? body?.error ?? `Falha HTTP ${response.status} na Evolution API.`
    return { ok: false, error: typeof message === 'string' ? message : JSON.stringify(message) }
  }
  return { ok: true, providerMessageId: body?.key?.id }
}

/* --------------------------------------------------------------- Presenca */

/**
 * Mostra "digitando..." no WhatsApp do cliente.
 *
 * Faz par com as pausas entre as mensagens: a pausa sozinha e so silencio, e
 * silencio nao parece ninguem digitando — parece sistema lento. Com a presenca,
 * o cliente ve exatamente o que veria de uma pessoa do outro lado.
 *
 * So a Evolution suporta isso hoje. Na API Cloud da Meta nao existe endpoint
 * de presenca para quem envia; ali a pausa vai sozinha, e nao ha o que fazer
 * a respeito. Nunca falha o atendimento por causa disto: e enfeite, e enfeite
 * que nao sai nao pode derrubar a mensagem que importa.
 */
export async function sinalizarDigitando(
  channel: Channel,
  to: string,
  chatId: string | null,
  ligado: boolean,
): Promise<void> {
  if (channel.provider !== 'evolution') return

  const baseUrl = (channel.settings?.base_url as string)?.replace(/\/+$/, '')
  const instance = channel.settings?.instance as string
  const apiKey = channel.secrets?.api_key
  if (!baseUrl || !instance || !apiKey) return

  try {
    await fetch(`${baseUrl}/chat/sendPresence/${instance}`, {
      method: 'POST',
      headers: { apikey: apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        number: chatId ?? to,
        presence: ligado ? 'composing' : 'paused',
        delay: 0,
      }),
    })
  } catch (erro) {
    console.warn('[whatsapp] nao foi possivel sinalizar digitacao', erro)
  }
}
