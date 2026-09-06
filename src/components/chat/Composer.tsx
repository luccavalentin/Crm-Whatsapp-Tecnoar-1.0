import { useEffect, useRef, useState, type FormEvent } from 'react'
import { FileText, Mic, Paperclip, Reply, Send, Square, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui'
import { EmojiPicker } from './EmojiPicker'
import {
  discardMedia,
  formatBytes,
  uploadMedia,
  validateFile,
  type UploadedMedia,
} from '@/features/conversations/media'
import { cn } from '@/lib/utils'

/** Mensagem que está sendo respondida, mostrada acima do campo. */
export interface ReplyTarget {
  id: string
  preview: string
  author: string
}

interface ComposerProps {
  companyId: string
  conversationId: string
  sending: boolean
  replyTo: ReplyTarget | null
  onCancelReply: () => void
  onSend: (text: string, media?: UploadedMedia) => Promise<boolean>
  onError: (message: string | null) => void
}

/** Formatos que o navegador grava, em ordem de preferência para o WhatsApp. */
const AUDIO_TYPES = ['audio/ogg;codecs=opus', 'audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']

export function Composer({
  companyId,
  conversationId,
  sending,
  replyTo,
  onCancelReply,
  onSend,
  onError,
}: ComposerProps) {
  const [text, setText] = useState('')
  const [attachment, setAttachment] = useState<UploadedMedia | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [recording, setRecording] = useState(false)
  const [seconds, setSeconds] = useState(0)

  const fileInput = useRef<HTMLInputElement>(null)
  const textArea = useRef<HTMLTextAreaElement>(null)
  const recorder = useRef<MediaRecorder | null>(null)
  const chunks = useRef<BlobPart[]>([])
  const timer = useRef<number | null>(null)

  // A caixa cresce com o texto até um limite, como no WhatsApp.
  useEffect(() => {
    const node = textArea.current
    if (!node) return
    node.style.height = 'auto'
    node.style.height = `${Math.min(node.scrollHeight, 160)}px`
  }, [text])

  // Ao escolher "responder", o cursor vai direto para o campo.
  useEffect(() => {
    if (replyTo) textArea.current?.focus()
  }, [replyTo])

  // Trocar de conversa limpa o que estava sendo escrito.
  useEffect(() => {
    setText('')
    setAttachment(null)
    setPreview(null)
  }, [conversationId])

  useEffect(() => {
    return () => {
      if (timer.current) window.clearInterval(timer.current)
      recorder.current?.stream.getTracks().forEach((track) => track.stop())
      if (preview) URL.revokeObjectURL(preview)
    }
  }, [preview])

  function insertEmoji(emoji: string) {
    const node = textArea.current
    if (!node) {
      setText((value) => value + emoji)
      return
    }
    const start = node.selectionStart ?? text.length
    const end = node.selectionEnd ?? text.length
    const next = text.slice(0, start) + emoji + text.slice(end)
    setText(next)
    requestAnimationFrame(() => {
      node.focus()
      node.setSelectionRange(start + emoji.length, start + emoji.length)
    })
  }

  async function attachFile(file: File) {
    onError(null)
    const problem = validateFile(file)
    if (problem) {
      onError(problem)
      return
    }
    setUploading(true)
    try {
      const uploaded = await uploadMedia(file, companyId, conversationId)
      setAttachment(uploaded)
      setPreview(uploaded.kind === 'image' ? URL.createObjectURL(file) : null)
    } catch (error) {
      onError((error as Error).message)
    } finally {
      setUploading(false)
    }
  }

  async function removeAttachment() {
    if (!attachment) return
    const path = attachment.path
    setAttachment(null)
    if (preview) URL.revokeObjectURL(preview)
    setPreview(null)
    await discardMedia(path).catch(() => undefined)
  }

  /* ----------------------------------------------------------- Gravação */

  async function startRecording() {
    onError(null)
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      onError('Este navegador não permite gravar áudio.')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = AUDIO_TYPES.find((type) => MediaRecorder.isTypeSupported(type))
      const instance = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      chunks.current = []
      instance.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.current.push(event.data)
      }
      instance.start()
      recorder.current = instance
      setRecording(true)
      setSeconds(0)
      timer.current = window.setInterval(() => setSeconds((value) => value + 1), 1000)
    } catch {
      onError('Não foi possível acessar o microfone. Verifique a permissão do navegador.')
    }
  }

  function stopTimer() {
    if (timer.current) window.clearInterval(timer.current)
    timer.current = null
  }

  async function finishRecording(keep: boolean) {
    const instance = recorder.current
    if (!instance) return
    stopTimer()
    setRecording(false)

    await new Promise<void>((resolve) => {
      instance.onstop = () => resolve()
      instance.stop()
    })
    instance.stream.getTracks().forEach((track) => track.stop())
    recorder.current = null

    if (!keep || chunks.current.length === 0) {
      chunks.current = []
      return
    }

    const type = instance.mimeType || 'audio/webm'
    const extension = type.includes('ogg') ? 'ogg' : type.includes('mp4') ? 'm4a' : 'webm'
    const blob = new Blob(chunks.current, { type })
    chunks.current = []
    await attachFile(new File([blob], `audio-${Date.now()}.${extension}`, { type }))
  }

  /* --------------------------------------------------------------- Envio */

  async function submit(event?: FormEvent) {
    event?.preventDefault()
    if (sending || uploading) return
    const body = text.trim()
    const anexo = attachment
    if (!body && !anexo) return

    // Limpa na hora. A entrega leva um instante e a mensagem ja aparece na
    // conversa com o status real de envio - deixar o texto parado no campo
    // durante esse tempo passa a impressao de travado.
    const previewAntigo = preview
    setText('')
    setAttachment(null)
    setPreview(null)

    const sent = await onSend(body, anexo ?? undefined)

    if (sent) {
      if (previewAntigo) URL.revokeObjectURL(previewAntigo)
      return
    }

    // Nao saiu: devolve exatamente o que a pessoa tinha escrito.
    setText((atual) => (atual ? atual : body))
    setAttachment(anexo)
    setPreview(previewAntigo)
  }

  const busy = sending || uploading
  const canSend = Boolean(text.trim() || attachment) && !busy

  if (recording) {
    return (
      <div className="flex items-center gap-3 border-t border-line/80 bg-surface/[0.92] px-4 py-3 pb-safe-3 backdrop-blur sm:pb-3">
        <span className="flex size-9 items-center justify-center rounded-xl bg-red-50">
          <span className="size-2.5 animate-pulse rounded-full bg-red-600" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink">Gravando áudio…</p>
          <p className="text-xs text-muted tabular-nums">{formatSeconds(seconds)}</p>
        </div>
        <button
          type="button"
          onClick={() => void finishRecording(false)}
          title="Descartar gravação"
          className="flex size-9 items-center justify-center rounded-xl text-muted transition-colors hover:bg-ink/[0.05] hover:text-red-600"
        >
          <Trash2 className="size-[18px]" />
        </button>
        <Button size="lg" onClick={() => void finishRecording(true)}>
          <Square className="size-4 fill-current" />
          <span className="hidden sm:inline">Parar</span>
        </Button>
      </div>
    )
  }

  return (
    <form
      onSubmit={submit}
      className="border-t border-line/80 bg-surface/[0.94] px-4 py-3 pb-safe-3 shadow-[var(--shadow-edge-top)] backdrop-blur sm:px-5 sm:pb-3"
    >
      {replyTo && (
        <div className="mb-2 flex items-stretch gap-2.5 rounded-xl bg-cyan-100/[0.35] p-2.5 ring-1 ring-cyan-500/15">
          <span className="w-[3px] shrink-0 rounded-full bg-cyan-500" />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1 text-xs font-medium text-cyan-600">
              <Reply className="size-3" />
              Respondendo {replyTo.author}
            </p>
            <p className="mt-0.5 truncate text-xs text-ink/60">{replyTo.preview}</p>
          </div>
          <button
            type="button"
            onClick={onCancelReply}
            title="Cancelar resposta"
            className="flex size-7 shrink-0 items-center justify-center self-center rounded-lg text-muted transition-colors hover:bg-ink/[0.06] hover:text-ink"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {attachment && (
        <div className="mb-2.5 flex items-center gap-3 rounded-xl bg-surface p-2.5 shadow-[var(--shadow-card)] ring-1 ring-ink/[0.045]">
          {preview ? (
            <img
              src={preview}
              alt=""
              className="size-12 shrink-0 rounded-lg object-cover"
            />
          ) : (
            <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-ink/[0.06]">
              {attachment.kind === 'audio' ? (
                <Mic className="size-5 text-ink/70" />
              ) : (
                <FileText className="size-5 text-ink/70" />
              )}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink">{attachment.name}</p>
            <p className="text-2xs text-muted">
              {KIND_LABEL[attachment.kind]} · pronto para enviar
            </p>
          </div>
          <button
            type="button"
            onClick={() => void removeAttachment()}
            title="Remover anexo"
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-ink/[0.06] hover:text-ink"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      <div
        className={cn(
          'flex w-full items-end gap-1.5 rounded-xl bg-surface px-2 py-2 shadow-[var(--shadow-card)] ring-1 ring-ink/[0.07] transition-all',
          'focus-within:shadow-[var(--shadow-raised)] focus-within:ring-cyan-500/[0.35]',
        )}
      >
        <EmojiPicker onPick={insertEmoji} disabled={busy} />

        <button
          type="button"
          disabled={busy}
          onClick={() => fileInput.current?.click()}
          title="Anexar foto, vídeo ou documento"
          aria-label="Anexar arquivo"
          className="flex size-9 shrink-0 items-center justify-center rounded-lg text-ink/[0.48] transition-colors hover:bg-cyan-100/60 hover:text-cyan-700 disabled:opacity-40"
        >
          <Paperclip className="size-[18px]" />
        </button>

        <input
          ref={fileInput}
          type="file"
          hidden
          accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip"
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file) void attachFile(file)
          }}
        />

        <textarea
          ref={textArea}
          rows={1}
          value={text}
          disabled={busy}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              void submit()
            }
          }}
          placeholder={
            uploading ? 'Enviando arquivo…' : 'Escreva uma mensagem…  (Shift+Enter quebra linha)'
          }
          className="scrollbar-thin min-h-[38px] w-full flex-1 resize-none self-center bg-transparent px-2 py-2 text-[16px] leading-snug text-ink sm:text-base placeholder:text-muted focus:outline-none disabled:opacity-60"
        />

        {canSend || attachment || sending ? (
          <Button type="submit" size="lg" loading={sending} disabled={!canSend}>
            <Send className="size-4" />
            <span className="hidden sm:inline">Enviar</span>
          </Button>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => void startRecording()}
            title="Gravar áudio"
            aria-label="Gravar áudio"
            className="flex size-9 shrink-0 items-center justify-center rounded-lg text-ink/[0.48] transition-colors hover:bg-orange-100/70 hover:text-orange-600 disabled:opacity-40"
          >
            <Mic className="size-[18px]" />
          </button>
        )}
      </div>

      <p className="mt-2 px-1 text-2xs text-muted">
        Enter envia · Shift+Enter quebra linha · limite de {formatBytes(5 * 1024 * 1024)} por imagem
      </p>
    </form>
  )
}

const KIND_LABEL: Record<UploadedMedia['kind'], string> = {
  image: 'Imagem',
  video: 'Vídeo',
  audio: 'Áudio',
  document: 'Documento',
}

function formatSeconds(total: number): string {
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}
