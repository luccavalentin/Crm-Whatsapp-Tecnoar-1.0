import { NavLink } from 'react-router-dom'
import { PanelLeftClose, PanelLeftOpen, X } from 'lucide-react'
import { Logo } from '@/components/Logo'
import { NAV_GROUPS, NAV_ITEMS } from '@/lib/navigation'
import { usePermissions } from '@/features/permissions'
import { cn } from '@/lib/utils'

interface SidebarProps {
  collapsed: boolean
  onToggleCollapsed: () => void
  mobileOpen: boolean
  onCloseMobile: () => void
  companyName?: string | null
}

function SidebarBrand({ collapsed }: { collapsed: boolean }) {
  return (
    <div className={cn('flex items-center overflow-hidden', collapsed && 'justify-center')}>
      <Logo variant="dark" className={cn('w-auto', collapsed ? 'h-9' : 'h-11')} />
    </div>
  )
}

function SidebarContent({
  collapsed,
  onToggleCollapsed,
  onNavigate,
  companyName,
  showCollapseButton,
}: {
  collapsed: boolean
  onToggleCollapsed: () => void
  onNavigate?: () => void
  companyName?: string | null
  showCollapseButton: boolean
}) {
  const { can } = usePermissions()

  return (
    <div className="flex h-full flex-col bg-[linear-gradient(180deg,var(--color-navy-900)_0%,var(--color-navy-950)_100%)] pt-safe pb-safe">
      <div
        className={cn(
          'flex h-16 items-center border-b border-white/[0.08] px-4',
          collapsed ? 'justify-center' : 'justify-between',
        )}
      >
        <SidebarBrand collapsed={collapsed} />
        {showCollapseButton && !collapsed && (
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="rounded-lg p-1.5 text-white/45 transition-colors hover:bg-white/[0.08] hover:text-white"
            aria-label="Recolher menu"
          >
            <PanelLeftClose className="size-[18px]" />
          </button>
        )}
      </div>

      <nav className="scrollbar-thin flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {NAV_GROUPS.map((group) => {
          const items = NAV_ITEMS.filter(
            (item) => item.group === group.key && can(item.permission),
          )
          if (items.length === 0) return null
          return (
            <div key={group.key}>
              {!collapsed && (
                <p className="mb-1.5 px-2.5 text-2xs font-semibold uppercase tracking-label text-white/30">
                  {group.label}
                </p>
              )}
              <ul className="space-y-0.5">
                {items.map((item) => (
                  <li key={item.key}>
                    <NavLink
                      to={item.path}
                      onClick={onNavigate}
                      title={collapsed ? item.label : undefined}
                      className={({ isActive }) =>
                        cn(
                          'group relative flex items-center rounded-xl text-sm font-medium transition-all duration-150',
                          collapsed ? 'h-10 justify-center' : 'h-10 gap-3 px-2.5',
                          isActive
                            ? 'bg-white/[0.12] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_8px_20px_-18px_rgba(0,0,0,0.7)]'
                            : 'text-white/[0.58] hover:bg-white/[0.065] hover:text-white/[0.92]',
                        )
                      }
                    >
                      {({ isActive }) => (
                        <>
                          {isActive && (
                            <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-orange-500" />
                          )}
                          <item.icon
                            className={cn('size-[18px] shrink-0', isActive ? 'text-orange-400' : 'text-current')}
                          />
                          {!collapsed && <span className="truncate">{item.label}</span>}
                        </>
                      )}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </nav>

      <div className="border-t border-white/[0.07] p-3">
        {collapsed ? (
          showCollapseButton && (
            <button
              type="button"
              onClick={onToggleCollapsed}
              className="flex h-10 w-full items-center justify-center rounded-xl text-white/45 transition-colors hover:bg-white/[0.08] hover:text-white"
              aria-label="Expandir menu"
            >
              <PanelLeftOpen className="size-[18px]" />
            </button>
          )
        ) : (
          <div className="rounded-xl bg-white/[0.06] px-3 py-2.5 ring-1 ring-white/[0.06]">
            <p className="text-2xs uppercase tracking-label text-white/35">Empresa</p>
            <p className="truncate text-sm font-medium text-white/85">{companyName || '—'}</p>
          </div>
        )}
      </div>
    </div>
  )
}

export function Sidebar({
  collapsed,
  onToggleCollapsed,
  mobileOpen,
  onCloseMobile,
  companyName,
}: SidebarProps) {
  return (
    <>
      {/* Desktop */}
      <aside
        className={cn(
          'hidden shrink-0 transition-[width] duration-200 ease-out lg:block',
          collapsed ? 'w-[72px]' : 'w-[248px]',
        )}
      >
        <div className={cn('fixed inset-y-0 left-0 z-30', collapsed ? 'w-[72px]' : 'w-[248px]')}>
          <SidebarContent
            collapsed={collapsed}
            onToggleCollapsed={onToggleCollapsed}
            companyName={companyName}
            showCollapseButton
          />
        </div>
      </aside>

      {/* Mobile / tablet */}
      <div
        className={cn(
          'fixed inset-0 z-40 lg:hidden',
          mobileOpen ? 'pointer-events-auto' : 'pointer-events-none',
        )}
      >
        <div
          onClick={onCloseMobile}
          className={cn(
            'absolute inset-0 bg-navy-950/50 transition-opacity duration-200',
            mobileOpen ? 'opacity-100' : 'opacity-0',
          )}
        />
        <div
          className={cn(
            'absolute inset-y-0 left-0 w-[264px] shadow-[var(--shadow-pop)] transition-transform duration-200 ease-out',
            mobileOpen ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          <button
            type="button"
            onClick={onCloseMobile}
            className="absolute -right-11 top-4 rounded-lg bg-white/10 p-2 text-white"
            aria-label="Fechar menu"
          >
            <X className="size-[18px]" />
          </button>
          <SidebarContent
            collapsed={false}
            onToggleCollapsed={onToggleCollapsed}
            onNavigate={onCloseMobile}
            companyName={companyName}
            showCollapseButton={false}
          />
        </div>
      </div>
    </>
  )
}
