import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import type { ChannelRow } from './ingest.ts'

/** O que o provedor informou sobre o anexo, antes de baixarmos o arquivo. */
export interface InboundMediaRef {
  /** Meta: id da mídia na Graph API. Evolution: não usado. */
  mediaId?: string
  mime?: string | null
  name?: string | null
  kind: 'image' | 'video' | 'audio' | 'document' | 'sticker'
}

export interface StoredMedia {
  path: string
  mime: string
  name: string
}

const BUCKET = 'whatsapp-media'
/** Limite de segurança: arquivos maiores não são baixados. */
const MAX_BYTES = 64 * 1024 * 1024

const EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/3gpp': '3gp',
  'video/quicktime': 'mov',
  'audio/ogg': 'ogg',
  'audio/ogg; codecs=opus': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'audio/amr': 'amr',
  'audio/wav': 'wav',
  'application/pdf': 'pdf',
}

function extensionFor(mime: string, fallbackName?: string | null): string {
  const clean = mime.split(';')[0].trim().toLowerCase()
  if (EXTENSION[clean]) return EXTENSION[clean]
  const fromName = fallbackName?.includes('.') ? fallbackName.split('.').pop() : null
  if (fromName && /^[a-z0-9]{1,8}$/i.test(fromName)) return fromName.toLowerCase()
  return 'bin'
}

/**
 * Baixa o anexo do provedor e guarda no bucket privado da empresa.
 * Devolve null quando não foi possível — a mensagem é gravada mesmo assim,
 * apenas sem o arquivo, nunca com um link inventado.
 */
export async function storeInboundMedia(
  admin: SupabaseClient,
  channel: ChannelRow,
  conversationId: string,
  providerMessageId: string,
  ref: InboundMediaRef,
): Promise<StoredMedia | null> {
  try {
    const file =
      channel.provider === 'meta'
        ? await downloadFromMeta(channel, ref)
        : await downloadFromEvolution(channel, providerMessageId)

    if (!file) return null
    if (file.bytes.byteLength === 0 || file.bytes.byteLength > MAX_BYTES) return null

    const mime = file.mime || ref.mime || 'application/octet-stream'
    const name = ref.name || file.name || `${ref.kind}.${extensionFor(mime, ref.name)}`
    const path =
      `${channel.company_id}/${conversationId}/` +
      `${crypto.randomUUID()}.${extensionFor(mime, name)}`

    const { error } = await admin.storage.from(BUCKET).upload(path, file.bytes, {
      contentType: mime,
      upsert: false,
    })
    if (error) {
      console.error('[webhook] falha ao guardar anexo', error.message)
      return null
    }

    return { path, mime, name }
  } catch (error) {
    console.error('[webhook] erro inesperado ao baixar anexo', error)
    return null
  }
}

interface DownloadedFile {
  bytes: Uint8Array
  mime: string
  name: string | null
}

/** Meta Cloud API: primeiro pega a URL temporária, depois o arquivo. */
async function downloadFromMeta(
  channel: ChannelRow,
  ref: InboundMediaRef,
): Promise<DownloadedFile | null> {
  const token = channel.secrets?.access_token
  if (!token || !ref.mediaId) return null

  const version = (channel.settings?.api_version as string) || 'v21.0'
  const metaResponse = await fetch(`https://graph.facebook.com/${version}/${ref.mediaId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!metaResponse.ok) {
    console.error('[webhook] Meta recusou os dados do anexo', metaResponse.status)
    return null
  }

  const info = (await metaResponse.json()) as { url?: string; mime_type?: string }
  if (!info.url) return null

  const fileResponse = await fetch(info.url, { headers: { Authorization: `Bearer ${token}` } })
  if (!fileResponse.ok) {
    console.error('[webhook] Meta recusou o download do anexo', fileResponse.status)
    return null
  }

  return {
    bytes: new Uint8Array(await fileResponse.arrayBuffer()),
    mime: info.mime_type ?? fileResponse.headers.get('content-type') ?? '',
    name: null,
  }
}

/** Evolution API: devolve o arquivo em base64 a partir do id da mensagem. */
async function downloadFromEvolution(
  channel: ChannelRow,
  providerMessageId: string,
): Promise<DownloadedFile | null> {
  const baseUrl = (channel.settings?.base_url as string)?.replace(/\/+$/, '')
  const instance = channel.settings?.instance as string
  const apiKey = channel.secrets?.api_key
  if (!baseUrl || !instance || !apiKey) return null

  const response = await fetch(`${baseUrl}/chat/getBase64FromMediaMessage/${instance}`, {
    method: 'POST',
    headers: { apikey: apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: { key: { id: providerMessageId } }, convertToMp4: false }),
  })

  if (!response.ok) {
    console.error('[webhook] Evolution recusou o anexo', response.status)
    return null
  }

  const body = (await response.json()) as {
    base64?: string
    mimetype?: string
    fileName?: string
  }
  if (!body.base64) return null

  const binary = atob(body.base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)

  return { bytes, mime: body.mimetype ?? '', name: body.fileName ?? null }
}
