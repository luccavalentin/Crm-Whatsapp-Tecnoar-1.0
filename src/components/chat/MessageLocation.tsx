import { ExternalLink, MapPin } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface MessageLocationValue {
  lat: number
  lng: number
  name: string | null
  address: string | null
}

/** Aceita apenas o formato gravado pelo webhook; qualquer outra coisa vira null. */
export function parseLocation(value: unknown): MessageLocationValue | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  const lat = Number(raw.lat)
  const lng = Number(raw.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return {
    lat,
    lng,
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : null,
    address: typeof raw.address === 'string' && raw.address.trim() ? raw.address.trim() : null,
  }
}

/**
 * Localização que o cliente compartilhou. O mapa é uma imagem estática do
 * OpenStreetMap — sem chave de API e sem rastrear o atendente.
 */
export function MessageLocation({
  location,
  onDark,
}: {
  location: MessageLocationValue
  onDark: boolean
}) {
  const { lat, lng, name, address } = location
  const delta = 0.004
  const bbox = [lng - delta, lat - delta / 2, lng + delta, lat + delta / 2].join('%2C')
  const mapa =
    `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}` +
    `&layer=mapnik&marker=${lat}%2C${lng}`
  const abrir = `https://www.google.com/maps/search/?api=1&query=${lat}%2C${lng}`

  return (
    <a
      href={abrir}
      target="_blank"
      rel="noreferrer"
      className={cn(
        'block w-[325px] max-w-full overflow-hidden rounded-xl transition-all hover:-translate-y-px hover:shadow-[var(--shadow-raised)]',
        onDark
          ? 'bg-white/15 ring-1 ring-white/20'
          : 'bg-surface shadow-[var(--shadow-card)] ring-1 ring-ink/[0.055]',
      )}
    >
      <span className={cn('block h-1', onDark ? 'bg-surface/60' : 'bg-orange-500')} />
      <iframe
        title={name ?? 'Localização recebida'}
        src={mapa}
        loading="lazy"
        className={cn(
          'pointer-events-none block h-[156px] w-full border-0',
          !onDark && 'saturate-[0.92] contrast-[1.02]',
        )}
      />
      <span className="flex items-start gap-2.5 px-3 py-3">
        <MapPin
          className={cn('mt-0.5 size-4 shrink-0', onDark ? 'text-white' : 'text-orange-500')}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">
            {name ?? 'Localização recebida'}
          </span>
          <span
            className={cn(
              'block truncate text-2xs',
              onDark ? 'text-white/70' : 'text-muted',
            )}
          >
            {address ?? `${lat.toFixed(5)}, ${lng.toFixed(5)}`}
          </span>
        </span>
        <ExternalLink
          className={cn('mt-0.5 size-3.5 shrink-0', onDark ? 'text-white/80' : 'text-orange-500')}
        />
      </span>
    </a>
  )
}
