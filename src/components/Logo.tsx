import { cn } from '@/lib/utils'

/**
 * Marca oficial Tecnoar Freios.
 * `dark`  → arte para superfícies escuras (fundo azul-marinho da identidade).
 * `light` → arte com fundo transparente para superfícies claras.
 */
export function Logo({
  variant = 'light',
  className,
}: {
  variant?: 'light' | 'dark'
  className?: string
}) {
  const src = variant === 'dark' ? '/brand/tecnoar-logo-dark.png' : '/brand/tecnoar-logo.png'
  return (
    <img
      src={src}
      alt="Tecnoar Freios"
      draggable={false}
      className={cn('select-none object-contain', className)}
    />
  )
}
