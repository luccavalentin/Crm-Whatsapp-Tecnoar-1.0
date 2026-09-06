export function cn(...values: unknown[]): string {
  return values.filter((v): v is string => typeof v === 'string' && v.length > 0).join(' ')
}

/**
 * Iniciais para o avatar.
 * Precisa ser seguro com emoji e acentos: cortar a string por índice quebra
 * pares substitutos e produz o caractere de erro (o losango com interrogação).
 */
export function initials(name: string, fallback = '?'): string {
  const words = (name ?? '')
    .normalize('NFC')
    .split(/\s+/)
    .map((word) => Array.from(word).filter(isLetterOrDigit))
    .filter((letters) => letters.length > 0)

  if (words.length === 0) return fallback
  if (words.length === 1) return words[0].slice(0, 2).join('').toUpperCase()
  return (words[0][0] + words[words.length - 1][0]).toUpperCase()
}

/** Mantém apenas letras e números — descarta emoji, símbolos e pontuação. */
function isLetterOrDigit(char: string): boolean {
  return /\p{L}|\p{N}/u.test(char)
}

/**
 * Nome pronto para exibição: sem espaços duplicados e sem emoji solto,
 * que costuma vir do perfil do WhatsApp e polui listas e títulos.
 */
export function displayName(
  name: string | null | undefined,
  fallback = 'Cliente sem nome',
): string {
  const clean = (name ?? '')
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return clean || fallback
}

/** Mensagens de erro do Supabase Auth traduzidas para o usuário final. */
export function authErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? '')
  const map: Array<[RegExp, string]> = [
    [/invalid login credentials/i, 'E-mail ou senha incorretos.'],
    [/email not confirmed/i, 'Confirme seu e-mail antes de entrar.'],
    [/user already registered|already been registered/i, 'Já existe uma conta com este e-mail.'],
    [/password should be at least (\d+)/i, 'A senha deve ter no mínimo 8 caracteres.'],
    [/unable to validate email address|email address .* is invalid|invalid email/i, 'E-mail inválido ou de domínio não aceito.'],
    [/signups not allowed|signup is disabled/i, 'A criação de contas está desativada no momento.'],
    [/for security purposes|rate limit|too many requests/i, 'Muitas tentativas. Aguarde alguns instantes e tente novamente.'],
    [/new password should be different/i, 'A nova senha deve ser diferente da atual.'],
    [/failed to fetch|network/i, 'Falha de conexão. Verifique sua internet e tente novamente.'],
  ]
  for (const [pattern, message] of map) {
    if (pattern.test(raw)) return message
  }
  return raw || 'Ocorreu um erro inesperado.'
}

const dateTime = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—'
  const date = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(date.getTime())) return '—'
  return dateTime.format(date)
}
