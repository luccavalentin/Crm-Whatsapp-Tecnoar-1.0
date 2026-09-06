import { cn } from '@/lib/utils'
import { initials } from '@/lib/utils'

/**
 * Paleta derivada da identidade Tecnoar: fundo suave + traço forte.
 * A cor é escolhida de forma determinística pelo identificador, então o mesmo
 * cliente sempre aparece com a mesma cor em todas as telas.
 */
const TONES = [
  'bg-[#E3E9F3] text-navy-600',
  'bg-[#CDEEFB] text-[#0079a8]',
  'bg-[#FFE0CC] text-[#c24f00]',
  'bg-[#DFE4F7] text-[#3a4b9b]',
  'bg-[#D6EFE7] text-[#0b6f5c]',
  'bg-[#F3E6D3] text-[#8a5a2b]',
] as const

const SIZES = {
  sm: 'size-8 text-2xs rounded-lg',
  md: 'size-10 text-xs rounded-xl',
  lg: 'size-14 text-lg rounded-xl',
} as const

function toneFor(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  return TONES[hash % TONES.length]
}

export function Avatar({
  name,
  seed,
  size = 'md',
  tone,
  className,
}: {
  name: string
  /** Identificador estável (id do cliente) para manter a mesma cor. */
  seed?: string
  size?: keyof typeof SIZES
  /** Sobrescreve a cor — usado em emergências, por exemplo. */
  tone?: 'danger' | 'navy'
  className?: string
}) {
  const toneClass =
    tone === 'danger'
      ? 'bg-red-50 text-red-600'
      : tone === 'navy'
        ? 'bg-navy-900 text-white'
        : toneFor(seed ?? name)

  return (
    <span
      aria-hidden
      className={cn(
        'flex shrink-0 select-none items-center justify-center font-semibold tracking-tight',
        'shadow-[var(--shadow-card)] ring-1 ring-inset ring-ink/[0.06]',
        SIZES[size],
        toneClass,
        className,
      )}
    >
      {initials(name)}
    </span>
  )
}
