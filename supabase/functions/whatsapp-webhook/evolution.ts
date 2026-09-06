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

/**
 * Webhook da Evolution API.
 * Os eventos chegam no formato { event, instance, data } — a Evolution envia
 * tanto mensagens (messages.upsert) quanto atualizações de status
 * (messages.update) e de conexão (connection.update / qrcode.updated).
 */

const STATUS_MAP: Record<string, 'enviada' | 'entregue' | 'lida' | 'falhou'> = {
  PENDING: 'enviada',
  SERVER_ACK: 'enviada',
  DELIVERY_ACK: 'entregue',
  READ: 'lida',
  PLAYED: 'lida',
  ERROR: 'falhou',
}

const CONNECTION_MAP: Record<string, 'conectado' | 'conectando' | 'desconectado'> = {
  open: 'conectado',
  connecting: 'conectando',
  close: 'desconectado',
}

/**
 * Compara dois segredos sem entregar, pelo tempo de resposta, quantos
 * caracteres do inicio bateram.
 */
function iguais(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diferenca = 0
  for (let i = 0; i < a.length; i++) diferenca |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diferenca === 0
}

/**
 * Confere o segredo compartilhado, quando a empresa configurou um.
 *
 * A Meta assina cada entrega; a Evolution nao assina nada. Ate aqui a unica
 * protecao era o token secreto dentro da URL — e URL vaza em log de proxy, em
 * historico de navegador e em print de tela. Quem descobrisse a URL conseguia
 * injetar mensagem falsa de cliente e, com isso, disparar resposta da IA e
 * aviso de emergencia para o plantonista.
 *
 * Fica opcional de proposito: ligar isso sem aviso derrubaria a integracao de
 * quem ja esta em producao. Enquanto `webhook_secret` estiver vazio, a tela de
 * WhatsApp mostra o aviso de que o canal esta desprotegido.
 *
 * Na Evolution, o segredo e configurado como cabecalho do webhook. Onde a
 * versao instalada nao aceitar cabecalho proprio, o mesmo valor pode ir na
 * URL como `?segredo=`.
 */
function segredoConfere(req: Request, channel: ChannelRow): boolean {
  const esperado = channel.secrets?.webhook_secret
  if (!esperado) return true

  const recebido =
    req.headers.get('apikey') ??
    req.headers.get('x-tecnoar-token') ??
    new URL(req.url).searchParams.get('segredo') ??
    ''

  return iguais(esperado, recebido)
}

export async function handleEvolutionPost(
  req: Request,
  admin: SupabaseClient,
  channel: ChannelRow,
): Promise<Response> {
  if (!segredoConfere(req, channel)) {
    console.warn('[webhook] Evolution recusada: segredo invalido')
    return new Response('invalid secret', { status: 401, headers: corsHeaders })
  }

  let payload: EvolutionPayload
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'payload invalido' }, 400)
  }

  const event = (payload.event ?? '').toLowerCase().replace('_', '.')
  const now = new Date().toISOString()

  switch (event) {
    case 'messages.upsert': {
      // O tipo de `data` e amplo porque o mesmo campo carrega estado de
      // conexao em outros eventos. Aqui o proprio evento ja disse que veio
      // mensagem, entao o estreitamento e seguro.
      const items = (
        Array.isArray(payload.data) ? payload.data : [payload.data]
      ) as Array<EvolutionMessage | undefined>
      for (const item of items) {
        if (!item?.key?.id) continue
        // fromMe = mensagem enviada pelo próprio número (eco do envio)
        if (item.key.fromMe) continue

        const remote = item.key.remoteJid ?? ''
        // Ignora grupos e status
        if (remote.endsWith('@g.us') || remote.startsWith('status@')) continue

        const phone = remote.split('@')[0]

        // Reacao: nao vira mensagem, entra como emoji sobre a mensagem alvo.
        const reaction = item.message?.reactionMessage
        if (reaction?.key?.id) {
          await ingestReaction(admin, {
            channel,
            eventId: `${item.key.id}:reaction`,
            targetProviderId: reaction.key.id,
            emoji: (reaction.text ?? '').trim(),
            payload: item as unknown as Record<string, unknown>,
          })
          continue
        }

        const { text, type, media, location } = extractContent(item)

        await ingestInbound(admin, {
          channel,
          providerMessageId: item.key.id,
          eventId: item.key.id,
          eventType: 'message',
          from: phone,
          profileName: item.pushName ?? null,
          text,
          type,
          media,
          location,
          chatId: remote,
          replyToProviderId:
            item.message?.extendedTextMessage?.contextInfo?.stanzaId ??
            item.message?.imageMessage?.contextInfo?.stanzaId ??
            item.message?.videoMessage?.contextInfo?.stanzaId ??
            item.message?.documentMessage?.contextInfo?.stanzaId ??
            item.message?.audioMessage?.contextInfo?.stanzaId ??
            null,
          timestamp: item.messageTimestamp
            ? new Date(Number(item.messageTimestamp) * 1000).toISOString()
            : now,
          payload: item as unknown as Record<string, unknown>,
        })
      }
      break
    }

    case 'messages.update': {
      // O tipo de `data` e amplo porque o mesmo campo carrega estado de
      // conexao em outros eventos. Aqui o proprio evento ja disse que veio
      // mensagem, entao o estreitamento e seguro.
      const items = (
        Array.isArray(payload.data) ? payload.data : [payload.data]
      ) as Array<EvolutionMessage | undefined>
      for (const item of items) {
        const id = item?.key?.id ?? item?.keyId
        const rawStatus = String(item?.status ?? item?.update?.status ?? '').toUpperCase()
        const mapped = STATUS_MAP[rawStatus]
        if (!id || !mapped) continue

        await updateMessageStatus(admin, {
          channel,
          providerMessageId: id,
          eventId: `${id}:${rawStatus}`,
          status: mapped,
          timestamp: now,
          error: mapped === 'falhou' ? 'A Evolution API recusou a mensagem.' : null,
          payload: item as unknown as Record<string, unknown>,
        })
      }
      break
    }

    case 'connection.update': {
      const state = String(
        (payload.data as EvolutionData)?.state ?? (payload.data as EvolutionData)?.connection ?? '',
      ).toLowerCase()
      const status = CONNECTION_MAP[state]

      // A Evolution repete este evento muitas vezes por segundo enquanto a
      // instância tenta conectar. Só gravamos quando o estado muda de verdade,
      // senão o banco recebe centenas de escritas por minuto à toa.
      if (status && status === channel.status) break

      if (status) {
        await admin
          .from('whatsapp_channels')
          .update({
            status,
            last_checked_at: now,
            last_error: status === 'desconectado' ? 'Instância desconectada.' : null,
            last_error_at: status === 'desconectado' ? now : null,
          })
          .eq('id', channel.id)

        if (status === 'desconectado') {
          await admin.rpc('raise_alert', {
            p_company_id: channel.company_id,
            p_source: 'whatsapp',
            p_code: 'evolution_desconectada',
            p_title: 'Evolution API desconectada',
            p_description:
              'A instância do WhatsApp perdeu a conexão. Reconecte para voltar a enviar e receber mensagens.',
            p_severity: 'critico',
            p_metadata: { channel_id: channel.id },
          })
        }
      }
      break
    }

    case 'qrcode.updated': {
      const qr =
        (payload.data as EvolutionData)?.qrcode?.base64 ??
        (payload.data as EvolutionData)?.base64 ??
        null

      // O QR é regerado a cada poucos segundos: só grava quando muda de fato.
      if (!qr || qr === (channel.settings as Record<string, unknown>)?.qrcode) break

      await admin
        .from('whatsapp_channels')
        .update({
          status: 'conectando',
          last_checked_at: now,
          settings: { ...(channel.settings ?? {}), qrcode: qr },
        })
        .eq('id', channel.id)
      break
    }

    default:
      break
  }

  return json({ received: true })
}

function extractContent(item: EvolutionMessage): {
  text: string | null
  type: string
  media?: InboundMediaRef
  location?: InboundLocation | null
} {
  const message = item.message ?? {}
  if (message.conversation) return { text: message.conversation, type: 'text' }
  if (message.extendedTextMessage?.text) {
    return { text: message.extendedTextMessage.text, type: 'text' }
  }
  if (message.imageMessage) {
    return {
      text: message.imageMessage.caption ?? null,
      type: 'image',
      media: { mime: message.imageMessage.mimetype, kind: 'image' },
    }
  }
  if (message.videoMessage) {
    return {
      text: message.videoMessage.caption ?? null,
      type: 'video',
      media: { mime: message.videoMessage.mimetype, kind: 'video' },
    }
  }
  if (message.audioMessage) {
    return {
      text: null,
      type: 'audio',
      media: { mime: message.audioMessage.mimetype, kind: 'audio' },
    }
  }
  if (message.documentMessage) {
    return {
      text: message.documentMessage.caption ?? null,
      type: 'document',
      media: {
        mime: message.documentMessage.mimetype,
        name: message.documentMessage.fileName,
        kind: 'document',
      },
    }
  }
  if (message.stickerMessage) {
    return {
      text: null,
      type: 'sticker',
      media: { mime: message.stickerMessage.mimetype, kind: 'sticker' },
    }
  }
  if (message.locationMessage) {
    const loc = message.locationMessage
    const lat = Number(loc.degreesLatitude)
    const lng = Number(loc.degreesLongitude)
    const nome = loc.name?.trim() || null
    const endereco = loc.address?.trim() || null
    return {
      text: [nome, endereco].filter(Boolean).join(' - ') || null,
      type: 'location',
      location:
        Number.isFinite(lat) && Number.isFinite(lng)
          ? { lat, lng, name: nome, address: endereco }
          : null,
    }
  }
  // Localizacao ao vivo: o WhatsApp manda atualizacoes seguidas do mesmo ponto.
  if (message.liveLocationMessage) {
    const loc = message.liveLocationMessage
    const lat = Number(loc.degreesLatitude)
    const lng = Number(loc.degreesLongitude)
    return {
      text: loc.caption?.trim() || 'Localizacao em tempo real',
      type: 'location',
      location:
        Number.isFinite(lat) && Number.isFinite(lng)
          ? { lat, lng, name: null, address: loc.caption?.trim() || null }
          : null,
    }
  }
  if (message.contactMessage) return { text: 'Contato recebido', type: 'contact' }
  if (message.buttonsResponseMessage?.selectedDisplayText) {
    return { text: message.buttonsResponseMessage.selectedDisplayText, type: 'text' }
  }
  if (message.listResponseMessage?.title) {
    return { text: message.listResponseMessage.title, type: 'text' }
  }
  return { text: null, type: 'text' }
}

/* ------------------------------------------------------------------ Tipos */

interface EvolutionContext {
  stanzaId?: string
  participant?: string
}

interface EvolutionPayload {
  event?: string
  instance?: string
  data?: EvolutionData | EvolutionMessage | EvolutionMessage[]
}

interface EvolutionData {
  state?: string
  connection?: string
  qrcode?: { base64?: string }
  base64?: string
}

interface EvolutionMessage {
  key?: { id?: string; remoteJid?: string; fromMe?: boolean }
  keyId?: string
  pushName?: string
  status?: string
  update?: { status?: string }
  messageTimestamp?: number | string
  message?: {
    conversation?: string
    reactionMessage?: { text?: string; key?: { id?: string } }
    extendedTextMessage?: { text?: string; contextInfo?: EvolutionContext }
    imageMessage?: { caption?: string; mimetype?: string; contextInfo?: EvolutionContext }
    videoMessage?: { caption?: string; mimetype?: string; contextInfo?: EvolutionContext }
    audioMessage?: { mimetype?: string; contextInfo?: EvolutionContext }
    documentMessage?: {
      fileName?: string
      caption?: string
      mimetype?: string
      contextInfo?: EvolutionContext
    }
    stickerMessage?: { mimetype?: string }
    locationMessage?: {
      degreesLatitude?: number
      degreesLongitude?: number
      name?: string
      address?: string
    }
    liveLocationMessage?: {
      degreesLatitude?: number
      degreesLongitude?: number
      caption?: string
    }
    contactMessage?: Record<string, unknown>
    buttonsResponseMessage?: { selectedDisplayText?: string }
    listResponseMessage?: { title?: string }
  }
}
