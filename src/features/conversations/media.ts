import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export const MEDIA_BUCKET = 'whatsapp-media'

/** Limite do bucket. O WhatsApp recusa arquivos bem menores que isso. */
export const MAX_UPLOAD_BYTES = 64 * 1024 * 1024

export type MediaKind = 'image' | 'video' | 'audio' | 'document'

/**
 * Limites reais do WhatsApp por tipo de arquivo. Bloquear aqui evita
 * gastar o upload para receber a recusa do provedor depois.
 */
const KIND_LIMIT: Record<MediaKind, number> = {
  image: 5 * 1024 * 1024,
  video: 16 * 1024 * 1024,
  audio: 16 * 1024 * 1024,
  document: 100 * 1024 * 1024,
}

const KIND_LABEL: Record<MediaKind, string> = {
  image: 'imagem',
  video: 'vídeo',
  audio: 'áudio',
  document: 'documento',
}

export function mediaKindFromMime(mime: string): MediaKind {
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('audio/')) return 'audio'
  return 'document'
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Devolve a mensagem de erro, ou null quando o arquivo pode ser enviado. */
export function validateFile(file: File): string | null {
  if (file.size === 0) return 'O arquivo está vazio.'
  const kind = mediaKindFromMime(file.type || '')
  const limit = KIND_LIMIT[kind]
  if (file.size > limit) {
    return `O WhatsApp aceita no máximo ${formatBytes(limit)} para ${KIND_LABEL[kind]}. Este arquivo tem ${formatBytes(file.size)}.`
  }
  return null
}

export interface UploadedMedia {
  path: string
  mime: string
  name: string
  kind: MediaKind
}

/**
 * Sobe o arquivo para a pasta da empresa no bucket privado.
 * O caminho é <company_id>/<conversation_id>/<uuid>.<ext> — a política de
 * acesso do banco só libera a pasta da própria empresa.
 */
export async function uploadMedia(
  file: File,
  companyId: string,
  conversationId: string,
): Promise<UploadedMedia> {
  const mime = file.type || 'application/octet-stream'
  const extension = file.name.includes('.') ? file.name.split('.').pop()! : 'bin'
  const path = `${companyId}/${conversationId}/${crypto.randomUUID()}.${extension.toLowerCase()}`

  const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, file, {
    contentType: mime,
    upsert: false,
  })
  if (error) throw new Error(`Não foi possível enviar o arquivo: ${error.message}`)

  return { path, mime, name: file.name, kind: mediaKindFromMime(mime) }
}

/** Remove um anexo que foi enviado ao bucket mas não chegou a virar mensagem. */
export async function discardMedia(path: string): Promise<void> {
  await supabase.storage.from(MEDIA_BUCKET).remove([path])
}

/**
 * URL temporária para exibir o anexo. O bucket é privado, então a URL é
 * assinada e precisa ser renovada de tempos em tempos.
 */
export function useMediaUrl(path: string | null | undefined) {
  return useQuery({
    queryKey: ['media-url', path],
    enabled: Boolean(path),
    staleTime: 45 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    refetchInterval: 45 * 60 * 1000,
    queryFn: async (): Promise<string> => {
      const { data, error } = await supabase.storage
        .from(MEDIA_BUCKET)
        .createSignedUrl(path!, 60 * 60)
      if (error || !data?.signedUrl) {
        throw new Error(error?.message ?? 'Não foi possível abrir o arquivo.')
      }
      return data.signedUrl
    },
  })
}
