const RTF = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' })

const dateOnly = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
const timeOnly = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' })
const full = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null
  const date = typeof value === 'string' ? new Date(value) : value
  return Number.isNaN(date.getTime()) ? null : date
}

/** "há 18 dias", "agora", "em 2 horas" — vazio vira travessão. */
export function relativeFromNow(value: string | Date | null | undefined): string {
  const date = toDate(value)
  if (!date) return '—'

  const diffSeconds = (date.getTime() - Date.now()) / 1000
  const abs = Math.abs(diffSeconds)

  if (abs < 45) return 'agora'
  if (abs < 3600) return RTF.format(Math.round(diffSeconds / 60), 'minute')
  if (abs < 86400) return RTF.format(Math.round(diffSeconds / 3600), 'hour')
  if (abs < 2592000) return RTF.format(Math.round(diffSeconds / 86400), 'day')
  if (abs < 31536000) return RTF.format(Math.round(diffSeconds / 2592000), 'month')
  return RTF.format(Math.round(diffSeconds / 31536000), 'year')
}

export function formatDate(value: string | Date | null | undefined): string {
  const date = toDate(value)
  return date ? dateOnly.format(date) : '—'
}

export function formatTime(value: string | Date | null | undefined): string {
  const date = toDate(value)
  return date ? timeOnly.format(date) : '—'
}

export function formatFull(value: string | Date | null | undefined): string {
  const date = toDate(value)
  return date ? full.format(date) : '—'
}

/** Rótulo de separador de dia: Hoje / Ontem / 12/03/2026 */
export function dayLabel(value: string | Date | null | undefined): string {
  const date = toDate(value)
  if (!date) return '—'
  const today = new Date()
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const diffDays = Math.round((startOf(today) - startOf(date)) / 86400000)
  if (diffDays === 0) return 'Hoje'
  if (diffDays === 1) return 'Ontem'
  return dateOnly.format(date)
}
