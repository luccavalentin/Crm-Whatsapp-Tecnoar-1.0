import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react'
import { AlertCircle, CheckCircle2, Info, Loader2, TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/utils'

/* ---------------------------------------------------------------- Button */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger' | 'cyan' | 'subtle'
type ButtonSize = 'sm' | 'md' | 'lg' | 'icon' | 'icon-sm'

/**
 * Laranja é ação. Só a ação principal da área usa `primary` — se dois botões
 * laranja disputam a tela, nenhum é primário de verdade.
 */
const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    'bg-orange-500 text-white glow [--glow:var(--color-orange-600)] hover:bg-orange-600 active:bg-orange-600',
  secondary:
    'bg-navy-900 text-white glow [--glow:var(--color-navy-950)] hover:bg-navy-800 active:bg-navy-800',
  cyan: 'bg-cyan-500 text-white glow [--glow:var(--color-cyan-600)] hover:bg-cyan-600 active:bg-cyan-600',
  outline:
    'border border-line-strong bg-surface text-ink shadow-[var(--shadow-card)] hover:border-muted/60 hover:bg-surface-soft',
  subtle: 'bg-ink/[0.05] text-ink hover:bg-ink/[0.08]',
  ghost: 'text-ink/65 hover:bg-ink/[0.05] hover:text-ink',
  danger:
    'bg-red-600 text-white glow [--glow:var(--color-red-600)] hover:bg-red-700 active:bg-red-700',
}

const buttonSizes: Record<ButtonSize, string> = {
  sm: 'h-8 px-2.5 text-sm rounded-lg gap-1.5',
  md: 'h-9 px-3.5 text-sm rounded-xl gap-1.5',
  lg: 'h-10 px-4 text-sm rounded-xl gap-2',
  icon: 'size-9 rounded-xl justify-center',
  'icon-sm': 'size-8 rounded-lg justify-center',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'primary', size = 'md', loading, disabled, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center font-medium',
        'transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out',
        // O botao cede um pixel ao ser pressionado. E o unico retorno tatil
        // que uma tela oferece, e a diferenca entre "cliquei" e "sera que
        // cliquei" quando a rede esta lenta.
        'active:translate-y-px',
        'disabled:pointer-events-none disabled:opacity-50',
        buttonVariants[variant],
        buttonSizes[size],
        className,
      )}
      {...props}
    >
      {loading && <Loader2 className="size-4 shrink-0 animate-spin" />}
      {children}
    </button>
  )
})

/* ------------------------------------------------------- Campos de entrada */

/**
 * Altura, borda e foco iguais em input, textarea e select.
 *
 * O 16px no celular nao e escolha estetica: abaixo disso o Safari do iOS da
 * zoom sozinho quando o campo recebe foco, e o atendente perde o
 * enquadramento da tela a cada toque. No desktop volta para 13.5px.
 */
const controlBase =
  'w-full rounded-xl border bg-surface text-[16px] sm:text-sm text-ink premium-ring transition-[border-color,box-shadow,background-color] duration-150 placeholder:text-muted focus:outline-none'

const controlTone = (error?: string | null) =>
  error
    ? 'border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-500/15'
    : 'border-line-strong hover:border-muted/70 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/15'

function FieldLabel({ htmlFor, children }: { htmlFor?: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="block text-xs font-medium text-ink/75">
      {children}
    </label>
  )
}

function FieldFoot({ error, hint }: { error?: string | null; hint?: string }) {
  if (error) {
    return (
      <p className="flex items-start gap-1.5 text-xs text-red-600">
        <AlertCircle className="mt-px size-3.5 shrink-0" />
        {error}
      </p>
    )
  }
  if (hint) return <p className="text-xs leading-snug text-muted">{hint}</p>
  return null
}

export interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  hint?: string
  error?: string | null
  leading?: ReactNode
  trailing?: ReactNode
}

export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { label, hint, error, leading, trailing, className, id, ...props },
  ref,
) {
  const inputId = id ?? props.name
  return (
    <div className="space-y-1.5">
      {label && <FieldLabel htmlFor={inputId}>{label}</FieldLabel>}
      <div className="relative">
        {leading && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
            {leading}
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            controlBase,
            'h-10 px-3',
            leading && 'pl-9',
            trailing && 'pr-10',
            controlTone(error),
            className,
          )}
          {...props}
        />
        {trailing && <span className="absolute right-2 top-1/2 -translate-y-1/2">{trailing}</span>}
      </div>
      <FieldFoot error={error} hint={hint} />
    </div>
  )
})

export function TextArea({
  label,
  hint,
  error,
  className,
  id,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string
  hint?: string
  error?: string | null
}) {
  const fieldId = id ?? props.name
  return (
    <div className="space-y-1.5">
      {label && <FieldLabel htmlFor={fieldId}>{label}</FieldLabel>}
      <textarea
        id={fieldId}
        className={cn(controlBase, 'min-h-[88px] px-3 py-2.5 leading-relaxed', controlTone(error), className)}
        {...props}
      />
      <FieldFoot error={error} hint={hint} />
    </div>
  )
}

export function Select({
  label,
  hint,
  error,
  className,
  id,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string
  hint?: string
  error?: string | null
}) {
  const fieldId = id ?? props.name
  return (
    <div className="space-y-1.5">
      {label && <FieldLabel htmlFor={fieldId}>{label}</FieldLabel>}
      <div className="relative">
        <select
          id={fieldId}
          className={cn(controlBase, 'h-10 appearance-none px-3 pr-9', controlTone(error), className)}
          {...props}
        >
          {children}
        </select>
        {/* Seta própria: a nativa muda de forma em cada sistema. */}
        <svg
          aria-hidden="true"
          viewBox="0 0 12 12"
          className="pointer-events-none absolute right-3 top-1/2 size-3 -translate-y-1/2 text-muted"
        >
          <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <FieldFoot error={error} hint={hint} />
    </div>
  )
}

/* ------------------------------------------------------- Escolha simples */

export interface OpcaoSimples<T> {
  valor: T
  titulo: string
  /** O que acontece se escolher isto, em uma frase, sem jargão. */
  explicacao: string
}

/**
 * Escolha entre opções nomeadas, no lugar de um número solto.
 *
 * "Confiança mínima: 0.6" é uma pergunta que só alguém que escreveu o sistema
 * consegue responder. "A IA só responde quando tem certeza" é a mesma decisão,
 * feita por quem entende do atendimento e não do código. O número continua
 * existindo por baixo — o que muda é quem consegue mexer nele.
 */
export function EscolhaSimples<T extends string | number>({
  label,
  opcoes,
  valor,
  onChange,
  disabled,
}: {
  label: string
  opcoes: Array<OpcaoSimples<T>>
  valor: T
  onChange: (valor: T) => void
  disabled?: boolean
}) {
  return (
    <fieldset className="min-w-0" disabled={disabled}>
      <legend className="mb-1.5 block text-xs font-medium text-ink/75">{label}</legend>
      <div className="grid gap-2 sm:grid-cols-3">
        {opcoes.map((opcao) => {
          const ativo = opcao.valor === valor
          return (
            <button
              key={String(opcao.valor)}
              type="button"
              onClick={() => onChange(opcao.valor)}
              aria-pressed={ativo}
              className={cn(
                'rounded-xl border px-3 py-2.5 text-left transition-colors',
                'disabled:pointer-events-none disabled:opacity-60',
                ativo
                  ? 'border-orange-500/50 bg-orange-100 ring-1 ring-inset ring-orange-500/20'
                  : 'border-line-strong bg-surface hover:border-muted/60 hover:bg-surface-soft',
              )}
            >
              <span
                className={cn(
                  'block text-sm font-medium',
                  ativo ? 'text-orange-600' : 'text-ink',
                )}
              >
                {opcao.titulo}
              </span>
              <span className="mt-0.5 block text-2xs leading-snug text-muted">
                {opcao.explicacao}
              </span>
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}

/* ------------------------------------------------------------------ Card */

/**
 * A superfície separa do fundo; a borda é uma linha fina, não um contorno.
 * `flush` remove a moldura para quando o card já está dentro de outro bloco —
 * card dentro de card é o que faz a tela parecer um formulário empilhado.
 */
export function Card({
  className,
  children,
  flush,
  ...props
}: {
  className?: string
  children: ReactNode
  flush?: boolean
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={cn(
        'subtle-panel rounded-xl',
        flush ? 'border-0 shadow-none' : 'border border-line shadow-[var(--shadow-card)]',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        // Envolve: numa tela estreita as ações descem para a linha de baixo em
        // vez de esticar o cabeçalho. Com shrink-0 aqui, um grupo de botões
        // com flex-wrap dentro nunca encolhia e arrastava o card inteiro para
        // fora da tela.
        'flex flex-wrap items-start justify-between gap-x-3 gap-y-2.5 border-b border-line/80 px-4 py-3.5 sm:px-5',
        className,
      )}
    >
      <div className="min-w-[min(100%,180px)] flex-1">
        <h2 className="truncate text-base font-semibold text-ink">{title}</h2>
        {description && (
          <p className="mt-0.5 text-xs leading-snug text-muted">{description}</p>
        )}
      </div>
      {action && <div className="flex min-w-0 flex-wrap items-center gap-2">{action}</div>}
    </div>
  )
}

/**
 * Título de seção sem moldura — para agrupar conteúdo dentro de um card
 * ou de uma página sem criar mais uma caixa.
 */
export function SectionTitle({
  children,
  action,
  className,
}: {
  children: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex items-center justify-between gap-3', className)}>
      <h3 className="text-2xs font-semibold uppercase tracking-label text-muted">{children}</h3>
      {action}
    </div>
  )
}

/* ------------------------------------------------------------ Empty state */

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>
  title: string
  description?: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}>
      {Icon && (
        <div className="mb-3 flex size-10 items-center justify-center rounded-xl bg-surface text-ink/35 shadow-[var(--shadow-card)] ring-1 ring-ink/[0.045]">
          <Icon className="size-5" />
        </div>
      )}
      <p className="text-sm font-medium text-ink">{title}</p>
      {description && (
        <p className="mt-1 max-w-[38ch] text-xs leading-relaxed text-muted">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

/* ---------------------------------------------------------------- Alerts */

export type AlertTone = 'info' | 'success' | 'error' | 'warning'

/**
 * Ciano informa, verde confirma, laranja pede ação, vermelho é falha.
 * A cor carrega o significado — o texto não precisa repetir "Atenção:".
 */
const alertTones: Record<AlertTone, { cls: string; Icon: typeof Info }> = {
  info: { cls: 'bg-cyan-100/50 text-ink border-cyan-500/20', Icon: Info },
  success: { cls: 'bg-emerald-50 text-emerald-900 border-emerald-600/20', Icon: CheckCircle2 },
  error: { cls: 'bg-red-50 text-red-900 border-red-500/20', Icon: AlertCircle },
  warning: { cls: 'bg-orange-100/60 text-ink border-orange-500/25', Icon: TriangleAlert },
}

export function Alert({
  tone = 'info',
  children,
  action,
  className,
}: {
  tone?: AlertTone
  children: ReactNode
  action?: ReactNode
  className?: string
}) {
  const { cls, Icon } = alertTones[tone]
  return (
    <div
      className={cn(
        'flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-xs leading-relaxed shadow-[var(--shadow-card)]',
        cls,
        className,
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1">{children}</div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

/* -------------------------------------------------------------- Skeleton */

/**
 * Carregando com a forma do que vem depois.
 *
 * Um spinner no meio da tela diz "espere"; um esqueleto diz "vem uma lista de
 * atendimentos aqui". A tela para de pular quando o dado chega, porque o
 * espaço já estava reservado — e quem está atendendo não perde o lugar onde
 * estava olhando.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse rounded-md bg-ink/[0.07]', className)}
    />
  )
}

/** Esqueleto de lista: n linhas com a densidade das listas do app. */
export function SkeletonList({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('divide-y divide-line', className)} role="status" aria-label="Carregando">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3 sm:px-5">
          <Skeleton className="size-9 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-3 w-[38%]" />
            <Skeleton className="h-2.5 w-[62%]" />
          </div>
          <Skeleton className="h-2.5 w-10 shrink-0" />
        </div>
      ))}
    </div>
  )
}

/** Esqueleto de painel: cabeçalho e linhas, a forma de um Card com conteúdo. */
export function SkeletonPanel({
  rows = 3,
  className,
}: {
  rows?: number
  className?: string
}) {
  return (
    <div
      className={cn('subtle-panel rounded-xl border border-line shadow-[var(--shadow-card)]', className)}
      role="status"
      aria-label="Carregando"
    >
      <div className="border-b border-line px-4 py-3.5 sm:px-5">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="mt-2 h-2.5 w-64 max-w-full" />
      </div>
      <div className="space-y-3 p-4 sm:p-5">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <Skeleton className="h-2.5 w-24" />
            <Skeleton className="h-8 w-full rounded-xl" />
          </div>
        ))}
      </div>
    </div>
  )
}

/** Esqueleto de faixa de indicadores: os números do topo antes de existirem. */
export function SkeletonTiles({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div
      className={cn('grid gap-3 sm:grid-cols-2 lg:grid-cols-4', className)}
      role="status"
      aria-label="Carregando"
    >
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="subtle-panel rounded-xl border border-line p-4 shadow-[var(--shadow-card)]"
        >
          <Skeleton className="h-2.5 w-20" />
          <Skeleton className="mt-2.5 h-6 w-16" />
          <Skeleton className="mt-2 h-2 w-28" />
        </div>
      ))}
    </div>
  )
}

/**
 * A página inteira antes de existir: faixa de números e um painel.
 *
 * É o que substitui o giro no meio da tela nas páginas de leitura. Um spinner
 * diz "espere"; isto diz o que vem — e a tela não pula quando o dado chega,
 * porque o espaço já estava reservado.
 */
export function SkeletonPage({ tiles = 4, rows = 3 }: { tiles?: number; rows?: number }) {
  return (
    <div className="animate-in-fade mx-auto max-w-6xl space-y-4 px-4 py-5 sm:px-6 sm:py-6">
      <SkeletonTiles count={tiles} />
      <SkeletonPanel rows={rows} />
    </div>
  )
}

/* --------------------------------------------------------------- Spinner */

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('size-5 animate-spin text-cyan-500', className)} />
}

export function FullPageLoader({ label = 'Carregando…' }: { label?: string }) {
  return (
    <div className="flex h-full min-h-[50vh] w-full flex-col items-center justify-center gap-2.5">
      <Spinner className="size-5" />
      <p className="text-xs text-muted">{label}</p>
    </div>
  )
}

/* ----------------------------------------------------------------- Badge */

export type BadgeTone = 'neutral' | 'orange' | 'cyan' | 'navy' | 'success' | 'danger' | 'outline'

const badgeTones: Record<BadgeTone, string> = {
  neutral: 'bg-ink/[0.055] text-ink/70 ring-1 ring-inset ring-ink/[0.035]',
  orange: 'bg-orange-100 text-orange-600 ring-1 ring-inset ring-orange-500/10',
  cyan: 'bg-cyan-100 text-cyan-600 ring-1 ring-inset ring-cyan-500/10',
  navy: 'bg-navy-900 text-white',
  success: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/10',
  danger: 'bg-red-50 text-red-600 ring-1 ring-inset ring-red-500/10',
  outline: 'border border-line-strong text-ink/65',
}

const badgeDots: Record<BadgeTone, string> = {
  neutral: 'bg-ink/35',
  orange: 'bg-orange-500',
  cyan: 'bg-cyan-500',
  navy: 'bg-surface/70',
  success: 'bg-emerald-500',
  danger: 'bg-red-500',
  outline: 'bg-ink/35',
}

export function Badge({
  tone = 'neutral',
  dot,
  children,
  className,
}: {
  tone?: BadgeTone
  /** Ponto de cor à esquerda — para status que se lê de relance numa lista. */
  dot?: boolean
  children: ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-md px-1.5 py-0.5 text-2xs font-medium leading-[1.45]',
        badgeTones[tone],
        className,
      )}
    >
      {dot && <span className={cn('size-1.5 shrink-0 rounded-full', badgeDots[tone])} />}
      {children}
    </span>
  )
}

/* ------------------------------------------------------------------ Tabs */

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  variant = 'pill',
  className,
}: {
  tabs: Array<{ key: T; label: string; count?: number }>
  value: T
  onChange: (key: T) => void
  /** `underline` para navegação de página; `pill` para filtros dentro de um bloco. */
  variant?: 'pill' | 'underline'
  className?: string
}) {
  if (variant === 'underline') {
    return (
      <div
        role="tablist"
        className={cn('scrollbar-none flex gap-4 overflow-x-auto border-b border-line', className)}
      >
        {tabs.map((tab) => {
          const active = value === tab.key
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(tab.key)}
              className={cn(
                'relative flex shrink-0 items-center gap-1.5 pb-2.5 pt-1 text-sm font-medium transition-colors',
                active ? 'text-ink' : 'text-muted hover:text-ink/75',
              )}
            >
              {tab.label}
              {typeof tab.count === 'number' && (
                <span className={cn('nums text-2xs', active ? 'text-ink/50' : 'text-muted')}>
                  {tab.count}
                </span>
              )}
              {active && (
                <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-orange-500" />
              )}
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <div
      role="tablist"
      className={cn(
        'scrollbar-none inline-flex max-w-full gap-1 overflow-x-auto rounded-xl border border-surface/80 bg-surface/70 p-1 shadow-[var(--shadow-card)] ring-1 ring-ink/[0.035]',
        className,
      )}
    >
      {tabs.map((tab) => {
        const active = value === tab.key
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.key)}
            className={cn(
              'flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium transition-colors',
              active
                ? 'bg-navy-900 text-white glow [--glow:var(--color-navy-950)]'
                : 'text-muted hover:bg-surface hover:text-ink',
            )}
          >
            {tab.label}
            {typeof tab.count === 'number' && (
              <span
                className={cn(
                  'nums rounded px-1 text-2xs',
                  active ? 'bg-white/15 text-white/85' : 'bg-ink/[0.06] text-muted',
                )}
              >
                {tab.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
