import { useState } from 'react'
import { Download, FileText, Loader2, TriangleAlert, X } from 'lucide-react'
import { useMediaUrl } from '@/features/conversations/media'
import { cn } from '@/lib/utils'
import type { MessageType } from '@/types/database'

interface MessageMediaProps {
  path: string
  mime: string | null
  name: string | null
  type: MessageType
  /** true quando a bolha tem fundo escuro (mensagem enviada) */
  onDark: boolean
}

/**
 * Exibe o anexo real da mensagem. O arquivo vem do bucket privado por URL
 * assinada — enquanto ela não chega, mostramos o estado de carregamento.
 */
export function MessageMedia({ path, mime, name, type, onDark }: MessageMediaProps) {
  const { data: url, isLoading, error } = useMediaUrl(path)
  const [zoom, setZoom] = useState(false)

  if (isLoading) {
    return (
      <div
        className={cn(
          'flex h-32 w-56 items-center justify-center rounded-xl',
          onDark ? 'bg-white/15' : 'bg-ink/[0.05]',
        )}
      >
        <Loader2 className={cn('size-5 animate-spin', onDark ? 'text-white/70' : 'text-muted')} />
      </div>
    )
  }

  if (error || !url) {
    return (
      <div
        className={cn(
          'flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs',
          onDark ? 'bg-white/15 text-white/90' : 'bg-red-50 text-red-600',
        )}
      >
        <TriangleAlert className="size-4 shrink-0" />
        Não foi possível abrir o arquivo.
      </div>
    )
  }

  if (type === 'image' || type === 'sticker') {
    return (
      <>
        <button
          type="button"
          onClick={() => setZoom(true)}
          className="block overflow-hidden rounded-xl"
        >
          <img
            src={url}
            alt={name ?? 'Imagem recebida'}
            loading="lazy"
            className={cn(
              'max-h-[300px] w-auto max-w-full cursor-zoom-in object-contain',
              type === 'sticker' && 'max-h-[140px]',
            )}
          />
        </button>
        {zoom && <Lightbox url={url} name={name} onClose={() => setZoom(false)} />}
      </>
    )
  }

  if (type === 'video') {
    return (
      <video
        src={url}
        controls
        preload="metadata"
        className="max-h-[320px] w-full max-w-[360px] rounded-xl bg-black"
      />
    )
  }

  if (type === 'audio') {
    return <audio src={url} controls preload="metadata" className="h-11 w-[260px] max-w-full" />
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      download={name ?? undefined}
      className={cn(
        'flex max-w-[280px] items-center gap-2.5 rounded-xl px-3 py-2.5 transition-colors',
        onDark ? 'bg-white/15 hover:bg-white/25' : 'bg-ink/[0.04] hover:bg-ink/[0.07]',
      )}
    >
      <FileText className={cn('size-5 shrink-0', onDark ? 'text-white' : 'text-ink/70')} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{name ?? 'Documento'}</span>
        <span className={cn('block text-2xs', onDark ? 'text-white/70' : 'text-muted')}>
          {mime ?? 'arquivo'}
        </span>
      </span>
      <Download className={cn('size-4 shrink-0', onDark ? 'text-white/80' : 'text-muted')} />
    </a>
  )
}

function Lightbox({
  url,
  name,
  onClose,
}: {
  url: string
  name: string | null
  onClose: () => void
}) {
  return (
    <div
      role="presentation"
      onClick={onClose}
      className="animate-in-fade fixed inset-0 z-50 flex items-center justify-center bg-navy-950/85 p-6"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Fechar"
        className="absolute right-5 top-5 flex size-10 items-center justify-center rounded-xl bg-white/10 text-white transition-colors hover:bg-white/20"
      >
        <X className="size-5" />
      </button>
      <img
        src={url}
        alt={name ?? 'Imagem'}
        onClick={(event) => event.stopPropagation()}
        className="max-h-full max-w-full rounded-xl object-contain"
      />
    </div>
  )
}
