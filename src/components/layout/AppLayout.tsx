import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { AppStatus } from './AppStatus'
import { FloatingConversationWindow } from '@/components/chat/FloatingConversationWindow'
import { findNavItem } from '@/lib/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { FloatingChatProvider } from '@/contexts/FloatingChatContext'

interface PageChrome {
  title?: string
  subtitle?: string
  actions?: ReactNode
  onSearch?: (term: string) => void
  searchPlaceholder?: string
}

const PageChromeContext = createContext<{
  set: (chrome: PageChrome) => void
} | null>(null)

/**
 * Permite que cada página defina ações contextuais e busca na topbar.
 * Uso: usePageChrome({ actions: <Button/>, onSearch: setTerm })
 */
export function usePageChrome(chrome: PageChrome, deps: unknown[] = []) {
  const ctx = useContext(PageChromeContext)
  const { set } = ctx ?? {}
  useEffect(() => {
    set?.(chrome)
    return () => set?.({})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}

const COLLAPSE_KEY = 'tecnoar.sidebar.collapsed'

export function AppLayout() {
  const location = useLocation()
  const { company } = useAuth()
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === '1')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [chrome, setChrome] = useState<PageChrome>({})

  const navItem = findNavItem(location.pathname)

  useEffect(() => {
    localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0')
  }, [collapsed])

  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  const set = useCallback((next: PageChrome) => setChrome(next), [])
  const ctxValue = useMemo(() => ({ set }), [set])

  return (
    <PageChromeContext.Provider value={ctxValue}>
      <FloatingChatProvider>
        <div className="app-surface flex h-screen-app">
          <Sidebar
            collapsed={collapsed}
            onToggleCollapsed={() => setCollapsed((v) => !v)}
            mobileOpen={mobileOpen}
            onCloseMobile={() => setMobileOpen(false)}
            companyName={company?.name}
          />
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <Topbar
              title={chrome.title ?? navItem?.label ?? 'Tecnoar Atendimento'}
              subtitle={chrome.subtitle ?? navItem?.subtitle}
              actions={chrome.actions}
              onSearch={chrome.onSearch}
              searchPlaceholder={chrome.searchPlaceholder}
              onOpenMobileMenu={() => setMobileOpen(true)}
            />
            <AppStatus />
            {/* Rola aqui. As paginas de altura fixa preenchem com h-full e
                cuidam da propria rolagem interna. */}
            <main className="scrollbar-thin min-h-0 min-w-0 flex-1 overflow-y-auto">
              <Outlet />
            </main>
          </div>
          <FloatingConversationWindow />
        </div>
      </FloatingChatProvider>
    </PageChromeContext.Provider>
  )
}
