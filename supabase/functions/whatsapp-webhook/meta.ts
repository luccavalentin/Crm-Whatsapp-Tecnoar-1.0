import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders, json } from '../_shared/cors.ts'
import {
  ingestInbound,
  ingestReaction,
  updateMessageStatus,
  type ChannelRow,
} from './ingest.ts'
import type { InboundMediaRef } from './media.ts'
import type { InboundLocation } from './ingest.ts'

/** Verificação do webhook exigida pela Meta (hub.challenge). */
export function handleMetaGet(req: Request, channel: ChannelRow): Response {
  const url = new URL(req.url)
  const mode = url.searchParams.get('hub.mode')
  const verifyToken = url.searchParams.get('hub.verify_token')
  const challenge = url.searchParams.get('hub.challenge')

  const expected = channel.secrets?.verify_token
  if (mode === 'subscribe' && expected && verifyToken === expected) {
    return new Response(challenge ?? '', { status: 200, headers: corsHeaders })
  }
  return new Response('forbidden', { status: 403, headers: corsHeaders })
}

/** Confere a assinatura X-Hub-Signature-256 quando o app secret está configurado. */
async function validSignature(req: Request, body: string, appSecret?: string): Promise<boolean> {
  if (!appSecret) return true
  const header = req.headers.get('x-hub-signature-256')
  if (!header?.startsWith('sha256=')) return false

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(appSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
  const digest = Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')

  const received = header.slice(7)
  if (received.length !== digest.length) return false
  let diff = 0
  for (let i = 0; i < digest.length; i++) diff |= digest.charCodeAt(i) ^ received.charCodeAt(i)
  return diff === 0
}

const STATUS_MAP: Record<string, 'enviada' | 'entregue' | 'lida' | 'falhou'> = {
  sent: 'enviada',
  delivered: 'entregue',
  read: 'lida',
  failed: 'falhou',
}

export async function handleMetaPost(
  req: Request,
  admin: SupabaseClient,
  channel: ChannelRow,
): Promise<Response> {
  const raw = await req.text()

  if (!(await validSignature(req, raw, channel.secrets?.app_secret))) {
    return new Response('invalid signature', { status: 401, headers: corsHeaders })
  }

  let payload: MetaPayload
  try {
    payload = JSON.parse(raw)
  } catch {
    return json({ error: 'payload invalido' }, 400)
  }

  const now = new Date().toISOString()
  let touched = false

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value ?? {}

      // ------------------------------------------------------------ Mensagens
      for (const message of value.messages ?? []) {
        const contact = (value.contacts ?? []).find((c) => c.wa_id === message.from)
        touched = true

        // Reacao: nao vira mensagem, entra como emoji sobre a mensagem alvo.
        if (message.type === 'reaction' && message.reaction?.message_id) {
          await ingestReaction(admin, {
            channel,
            eventId: `${message.id}:reaction`,
            targetProviderId: message.reaction.message_id,
            emoji: (message.reaction.emoji ?? '').trim(),
            payload: message as unknown as Record<string, unknown>,
          })
          continue
        }

        const { text, type, media, location } = extractContent(message)

        await ingestInbound(admin, {
          channel,
          providerMessageId: message.id,
          eventId: message.id,
          eventType: 'message',
          from: message.from,
          profileName: contact?.profile?.name ?? null,
          text,
          type,
          media,
          location,
          chatId: message.from,
          replyToProviderId: message.context?.id ?? null,
          timestamp: message.timestamp ? new Date(Number(message.timestamp) * 1000).toISOString() : now,
          payload: message as unknown as Record<string, unknown>,
        })
      }

      // -------------------------------------------------------------- Status
      for (const status of value.statuses ?? []) {
        const mapped = STATUS_MAP[status.status]
        if (!mapped) continue
        touched = true
        await updateMessageStatus(admin, {
          channel,
          providerMessageId: status.id,
          eventId: `${status.id}:${status.status}`,
          status: mapped,
          timestamp: status.timestamp
            ? new Date(Number(status.timestamp) * 1000).toISOString()
            : now,
          error: status.errors?.[0]?.title ?? status.errors?.[0]?.message ?? null,
          payload: status as unknown as Record<string, unknown>,
        })
      }
    }
  }

  // Só grava quando o evento trouxe conteúdo, evitando escrita a cada ping
  if (touched && channel.status !== 'conectado') {
    await admin
      .from('whatsapp_channels')
      .update({ status: 'conectado', last_checked_at: now, last_error: null })
      .eq('id', channel.id)
  }

  return json({ received: true })
}

function extractContent(message: MetaMessage): {
  text: string | null
  type: string
  media?: InboundMediaRef
  location?: InboundLocation | null
} {
  switch (message.type) {
    case 'text':
      return { text: message.text?.body ?? null, type: 'text' }
    case 'button':
      return { text: message.button?.text ?? null, type: 'text' }
    case 'interactive':
      return {
        text:
          message.interactive?.button_reply?.title ??
          message.interactive?.list_reply?.title ??
          null,
        type: 'text',
      }
    case 'image':
      return {
        text: message.image?.caption ?? null,
        type: 'image',
        media: { mediaId: message.image?.id, mime: message.image?.mime_type, kind: 'image' },
      }
    case 'audio':
      return {
        text: null,
        type: 'audio',
        media: { mediaId: message.audio?.id, mime: message.audio?.mime_type, kind: 'audio' },
      }
    case 'video':
      return {
        text: message.video?.caption ?? null,
        type: 'video',
        media: { mediaId: message.video?.id, mime: message.video?.mime_type, kind: 'video' },
      }
    case 'document':
      return {
        text: message.document?.caption ?? null,
        type: 'document',
        media: {
          mediaId: message.document?.id,
          mime: message.document?.mime_type,
          name: message.document?.filename,
          kind: 'document',
        },
      }
    case 'sticker':
      return {
        text: null,
        type: 'sticker',
        media: { mediaId: message.sticker?.id, mime: message.sticker?.mime_type, kind: 'sticker' },
      }
    case 'location': {
      const loc = message.location
      const lat = Number(loc?.latitude)
      const lng = Number(loc?.longitude)
      const nome = loc?.name?.trim() || null
      const endereco = loc?.address?.trim() || null
      return {
        text: [nome, endereco].filter(Boolean).join(' - ') || null,
        type: 'location',
        location:
          Number.isFinite(lat) && Number.isFinite(lng)
            ? { lat, lng, name: nome, address: endereco }
            : null,
      }
    }
    case 'contacts':
      return { text: 'Contato recebido', type: 'contact' }
    default:
      return { text: null, type: 'text' }
  }
}

/* ------------------------------------------------------------------ Tipos */

interface MetaPayload {
  object?: string
  entry?: Array<{
    id?: string
    changes?: Array<{
      field?: string
      value?: {
        messaging_product?: string
        metadata?: { display_phone_number?: string; phone_number_id?: string }
        contacts?: Array<{ wa_id: string; profile?: { name?: string } }>
        messages?: MetaMessage[]
        statuses?: Array<{
          id: string
          status: string
          timestamp?: string
          recipient_id?: string
          errors?: Array<{ title?: string; message?: string }>
        }>
      }
    }>
  }>
}

interface MetaMessage {
  id: string
  from: string
  timestamp?: string
  type: string
  text?: { body?: string }
  button?: { text?: string }
  interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } }
  image?: { caption?: string; id?: string; mime_type?: string }
  audio?: { id?: string; mime_type?: string }
  video?: { caption?: string; id?: string; mime_type?: string }
  sticker?: { id?: string; mime_type?: string }
  document?: { filename?: string; caption?: string; id?: string; mime_type?: string }
  reaction?: { message_id?: string; emoji?: string }
  context?: { id?: string; from?: string }
  location?: { name?: string; address?: string; latitude?: number; longitude?: number }
}
