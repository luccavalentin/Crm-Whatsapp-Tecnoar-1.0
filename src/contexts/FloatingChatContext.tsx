import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

interface FloatingChatState {
  conversationId: string | null
  minimized: boolean
  openChat: (conversationId: string) => void
  closeChat: () => void
  setMinimized: (minimized: boolean) => void
}

const FloatingChatContext = createContext<FloatingChatState | null>(null)
const FLOATING_CHAT_KEY = 'tecnoar.floating-chat.conversation'

export function FloatingChatProvider({ children }: { children: ReactNode }) {
  const [conversationId, setConversationId] = useState<string | null>(() =>
    localStorage.getItem(FLOATING_CHAT_KEY),
  )
  const [minimized, setMinimized] = useState(false)

  const openChat = useCallback((id: string) => {
    setConversationId(id)
    localStorage.setItem(FLOATING_CHAT_KEY, id)
    setMinimized(false)
  }, [])

  const closeChat = useCallback(() => {
    setConversationId(null)
    localStorage.removeItem(FLOATING_CHAT_KEY)
    setMinimized(false)
  }, [])

  const value = useMemo(
    () => ({ conversationId, minimized, openChat, closeChat, setMinimized }),
    [closeChat, conversationId, minimized, openChat],
  )

  return <FloatingChatContext.Provider value={value}>{children}</FloatingChatContext.Provider>
}

export function useFloatingChat() {
  const context = useContext(FloatingChatContext)
  if (!context) throw new Error('useFloatingChat must be used inside FloatingChatProvider')
  return context
}
