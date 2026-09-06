/**
 * Normalização e formatação de telefone.
 * A normalização espelha a função `public.normalize_phone` do banco — as duas
 * precisam produzir exatamente o mesmo resultado para a deduplicação funcionar.
 */

export function normalizePhone(value: string | null | undefined): string | null {
  if (!value) return null
  let digits = value.replace(/\D/g, '')
  if (!digits) return null

  if (digits.length === 10 || digits.length === 11) digits = '55' + digits

  // 55 + DDD + 8 dígitos (celular sem o nono dígito)
  if (digits.length === 12 && digits.startsWith('55') && '6789'.includes(digits[4])) {
    digits = digits.slice(0, 4) + '9' + digits.slice(4)
  }

  return digits
}

export function isValidPhone(value: string | null | undefined): boolean {
  const normalized = normalizePhone(value)
  return normalized !== null && normalized.length >= 10 && normalized.length <= 15
}

/** Formata para leitura: +55 (11) 98888-7777 */
export function formatPhone(value: string | null | undefined): string {
  const digits = normalizePhone(value)
  if (!digits) return '—'

  if (digits.startsWith('55') && (digits.length === 13 || digits.length === 12)) {
    const ddd = digits.slice(2, 4)
    const rest = digits.slice(4)
    const middle = rest.length === 9 ? rest.slice(0, 5) : rest.slice(0, 4)
    const end = rest.length === 9 ? rest.slice(5) : rest.slice(4)
    return `+55 (${ddd}) ${middle}-${end}`
  }
  return `+${digits}`
}

/** Máscara aplicada enquanto o usuário digita. */
export function maskPhoneInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 13)
  if (digits.length <= 2) return digits
  const local = digits.startsWith('55') ? digits.slice(2) : digits
  const prefix = digits.startsWith('55') ? '+55 ' : ''
  if (local.length <= 2) return prefix + local
  if (local.length <= 6) return `${prefix}(${local.slice(0, 2)}) ${local.slice(2)}`
  if (local.length <= 10) return `${prefix}(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`
  return `${prefix}(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7, 11)}`
}
