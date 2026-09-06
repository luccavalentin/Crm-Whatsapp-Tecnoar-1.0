import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, KeyRound, LogOut, Menu, Monitor, Moon, Search, Sun, UserCog } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { Avatar } from '@/components/ui/Avatar'
import { useTheme, type Theme } from '@/features/theme'
import { cn } from '@/lib/utils'

interface TopbarProps {
  title: string
  subtitle?: string
  actions?: ReactNode
  onOpenMobileMenu: () => void
  onSearch?: (term: string) => void
  searchPlaceholder?: string
}

/** Claro, escuro e "o que o aparelho estiver usando" — nesta ordem. */
const APARENCIAS: Array<{ key: Theme; label: string; Icon: typeof Sun }> = [
  { key: 'light', label: 'Claro', Icon: Sun },
  { key: 'dark', label: 'Escuro', Icon: Moon },
  { key: 'system', label: 'Auto', Icon: Monitor },
]

const ROLE_LABEL: Record<string, string> = {
  owner: 'Proprietário',
  admin: 'Administrador',
  manager: 'Gestor',
  agent: 'Agente',
}

/**
 * No computador tudo cabe numa faixa. No celular não cabe — então busca e
 * ações descem para uma segunda linha em vez de espremer o título até sobrar
 * um pedaço de palavra. A segunda linha só existe se a página tiver o que pôr
 * nela.
 */
export function Topbar({
  title,
  subtitle,
  actions,
  onOpenMobileMenu,
  onSearch,
  searchPlaceholder = 'Buscar…',
}: TopbarProps) {
  const { profile, user, signOut } = useAuth()
  const { theme, setTheme } = useTheme()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const handler = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  const name = profile?.full_name || user?.email || ''
  const temSegundaLinha = Boolean(onSearch || actions)

  const busca = onSearch && (
    <div className="group relative min-w-0 flex-1 lg:w-[320px] lg:flex-none">
      <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted transition-colors group-focus-within:text-cyan-600" />
      <input
        type="search"
        placeholder={searchPlaceholder}
        onChange={(e) => onSearch(e.target.value)}
        className="h-11 w-full rounded-xl border border-line-strong bg-surface/[0.90] pl-10 pr-3 text-[16px] text-ink premium-ring transition-all sm:text-sm placeholder:text-muted hover:border-muted/[0.55] focus:border-cyan-500 focus:bg-surface focus:outline-none focus:ring-2 focus:ring-cyan-500/15"
      />
    </div>
  )

  return (
    <header className="glass sticky top-0 z-20 border-b border-line pt-safe">
      <div className="flex h-16 min-w-0 items-center gap-2 px-3 sm:h-[68px] sm:gap-3 sm:px-6">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          className="-ml-1 shrink-0 rounded-lg p-2 text-ink/60 transition-colors hover:bg-ink/[0.05] lg:hidden"
          aria-label="Abrir menu"
        >
          <Menu className="size-5" />
        </button>

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold text-ink">
            {title}
          </h1>
          {/* O subtítulo só aparece quando há largura para ele significar algo. */}
          {subtitle && <p className="hidden truncate text-xs text-muted sm:block">{subtitle}</p>}
        </div>

        {/* No computador, busca e ações ficam na mesma faixa. */}
        <div className="hidden min-w-0 items-center gap-2.5 lg:flex">
          {busca}
          {actions}
        </div>

        <div className="mx-0.5 hidden h-6 w-px shrink-0 bg-line-strong lg:block" />

        <div ref={menuRef} className="relative shrink-0">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className={cn(
              'flex items-center gap-2 rounded-xl p-1 transition-colors sm:pr-2',
              menuOpen ? 'bg-ink/[0.06]' : 'hover:bg-ink/[0.05]',
            )}
          >
            <Avatar name={name} seed={profile?.id ?? name} size="sm" tone="navy" />
            <span className="hidden min-w-0 text-left xl:block">
              <span className="block max-w-[132px] truncate text-sm font-medium text-ink">
                {name || '—'}
              </span>
              <span className="block text-2xs text-muted">
                {profile ? ROLE_LABEL[profile.role] : ''}
              </span>
            </span>
            <ChevronDown className="hidden size-4 text-muted xl:block" />
          </button>

          {menuOpen && (
            <div
              role="menu"
            className="animate-in-rise absolute right-0 mt-2 w-60 overflow-hidden rounded-xl border border-surface/80 bg-surface shadow-[var(--shadow-pop)] ring-1 ring-ink/[0.045]"
            >
              <div className="border-b border-line px-4 py-3">
                <p className="truncate text-sm font-medium text-ink">{name || '—'}</p>
                <p className="truncate text-xs text-muted">{user?.email}</p>
              </div>
              <div className="border-b border-line px-3 py-2.5">
                <p className="mb-1.5 text-2xs font-semibold uppercase tracking-label text-muted">
                  Aparência
                </p>
                <div className="flex gap-1 rounded-lg bg-ink/[0.05] p-0.5">
                  {APARENCIAS.map(({ key, label, Icon }) => {
                    const ativo = theme === key
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setTheme(key)}
                        aria-pressed={ativo}
                        title={label}
                        className={cn(
                          'flex h-7 flex-1 items-center justify-center gap-1.5 rounded-[6px] text-xs font-medium transition-colors',
                          ativo
                            ? 'bg-surface text-ink shadow-[var(--shadow-card)]'
                            : 'text-muted hover:text-ink',
                        )}
                      >
                        <Icon className="size-3.5" />
                        {label}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="p-1.5">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false)
                    navigate('/configuracoes')
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-ink/80 transition-colors hover:bg-ink/[0.045]"
                >
                  <UserCog className="size-4 text-muted" />
                  Minha conta
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false)
                    navigate('/alterar-senha')
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-ink/80 transition-colors hover:bg-ink/[0.045]"
                >
                  <KeyRound className="size-4 text-muted" />
                  Alterar senha
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={async () => {
                    setMenuOpen(false)
                    await signOut()
                    navigate('/login', { replace: true })
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-red-600 transition-colors hover:bg-red-50"
                >
                  <LogOut className="size-4" />
                  Sair
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Segunda linha: só no celular e só quando a página tem busca ou ações. */}
      {temSegundaLinha && (
        <div className="flex items-center gap-2 border-t border-line px-3 py-2 lg:hidden">
          {busca}
          {actions && (
            <div className="scrollbar-none flex shrink-0 items-center gap-2 overflow-x-auto">
              {actions}
            </div>
          )}
        </div>
      )}
    </header>
  )
}
