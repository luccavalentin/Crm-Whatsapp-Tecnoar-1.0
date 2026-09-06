import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { CompanyRow, ProfileRow } from '@/types/database'

interface SignUpInput {
  fullName: string
  companyName: string
  email: string
  password: string
}

interface AuthContextValue {
  session: Session | null
  user: User | null
  profile: ProfileRow | null
  company: CompanyRow | null
  loading: boolean
  /** true enquanto a sessão existe mas o perfil ainda não foi carregado */
  bootstrapping: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (input: SignUpInput) => Promise<{ needsEmailConfirmation: boolean }>
  signOut: () => Promise<void>
  requestPasswordReset: (email: string) => Promise<void>
  updatePassword: (newPassword: string) => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<ProfileRow | null>(null)
  const [company, setCompany] = useState<CompanyRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [bootstrapping, setBootstrapping] = useState(false)
  const mounted = useRef(true)
  /** usuário cujo perfil já foi carregado — evita hidratar duas vezes */
  const hydratedFor = useRef<string | null>(null)

  const loadProfile = useCallback(async (userId: string) => {
    // O perfil é criado por trigger no banco logo após o signup. Em caso de
    // corrida (raro), tentamos novamente por alguns instantes.
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .maybeSingle()

        if (error) {
          console.error('[auth] falha ao carregar perfil', error)
          return null
        }
        if (data) return data as ProfileRow
      } catch (error) {
        console.error('[auth] erro inesperado ao carregar perfil', error)
        return null
      }
      await new Promise((r) => setTimeout(r, 350))
    }
    return null
  }, [])

  const hydrate = useCallback(
    async (nextSession: Session | null) => {
      if (!nextSession?.user) {
        hydratedFor.current = null
        setProfile(null)
        setCompany(null)
        setBootstrapping(false)
        return
      }
      hydratedFor.current = nextSession.user.id
      setBootstrapping(true)
      try {
        const nextProfile = await loadProfile(nextSession.user.id)
        if (!mounted.current) return
        setProfile(nextProfile)

        if (nextProfile?.company_id) {
          try {
            const { data } = await supabase
              .from('companies')
              .select('*')
              .eq('id', nextProfile.company_id)
              .maybeSingle()
            if (mounted.current) setCompany((data as CompanyRow | null) ?? null)
          } catch (error) {
            console.error('[auth] falha ao carregar empresa', error)
            if (mounted.current) setCompany(null)
          }
        } else {
          setCompany(null)
        }
      } finally {
        if (mounted.current) setBootstrapping(false)
      }
    },
    [loadProfile],
  )

  useEffect(() => {
    mounted.current = true

    // O carregamento inicial precisa terminar mesmo se algo falhar,
    // senão a tela fica presa em "Verificando sessão…".
    const bootstrap = async () => {
      try {
        const { data } = await supabase.auth.getSession()
        if (!mounted.current) return
        setSession(data.session)
        await hydrate(data.session)
      } catch (error) {
        console.error('[auth] falha ao iniciar a sessão', error)
      } finally {
        if (mounted.current) setLoading(false)
      }
    }

    const timeout = setTimeout(() => {
      if (!mounted.current) return
      setLoading(false)
      // Nenhuma etapa de carregamento pode prender a tela para sempre.
      setBootstrapping(false)
    }, 12_000)

    void bootstrap()

    const { data: sub } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted.current) return
      setSession(nextSession)
      if (event === 'SIGNED_OUT') {
        hydratedFor.current = null
        setProfile(null)
        setCompany(null)
        return
      }
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED' || event === 'INITIAL_SESSION') {
        // IMPORTANTE: o supabase-js mantém o lock de autenticação enquanto este
        // callback executa. Qualquer consulta feita aqui dentro trava esperando
        // esse mesmo lock (deadlock) e a tela fica presa em "Carregando ambiente…".
        // Por isso saímos do callback antes de tocar no banco.
        const userId = nextSession?.user?.id ?? null
        if (userId && userId === hydratedFor.current) return
        setTimeout(() => {
          if (mounted.current) void hydrate(nextSession)
        }, 0)
      }
    })

    return () => {
      mounted.current = false
      clearTimeout(timeout)
      sub.subscription.unsubscribe()
    }
  }, [hydrate])

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    })
    if (error) throw error
  }, [])

  const signUp = useCallback(async ({ fullName, companyName, email, password }: SignUpInput) => {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        data: { full_name: fullName.trim(), company_name: companyName.trim() },
        emailRedirectTo: `${window.location.origin}/login`,
      },
    })
    if (error) throw error
    return { needsEmailConfirmation: !data.session }
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    hydratedFor.current = null
    setProfile(null)
    setCompany(null)
  }, [])

  const requestPasswordReset = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${window.location.origin}/redefinir-senha`,
    })
    if (error) throw error
  }, [])

  const updatePassword = useCallback(async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) throw error
  }, [])

  const refreshProfile = useCallback(async () => {
    hydratedFor.current = null
    const { data } = await supabase.auth.getSession()
    await hydrate(data.session)
  }, [hydrate])

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      company,
      loading,
      bootstrapping,
      signIn,
      signUp,
      signOut,
      requestPasswordReset,
      updatePassword,
      refreshProfile,
    }),
    [
      session,
      profile,
      company,
      loading,
      bootstrapping,
      signIn,
      signUp,
      signOut,
      requestPasswordReset,
      updatePassword,
      refreshProfile,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve ser usado dentro de <AuthProvider>')
  return ctx
}
