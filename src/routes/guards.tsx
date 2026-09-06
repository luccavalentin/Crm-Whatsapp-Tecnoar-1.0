import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { Alert, Button, FullPageLoader } from '@/components/ui'
import { useAuth } from '@/contexts/AuthContext'

export function RequireAuth() {
  const { session, loading, bootstrapping, profile, signOut } = useAuth()
  const location = useLocation()

  if (loading) return <FullPageLoader label="Verificando sessão…" />

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  if (bootstrapping) return <FullPageLoader label="Carregando ambiente…" />

  if (!profile) {
    return (
      <div className="flex min-h-screen items-center justify-center px-5">
        <div className="w-full max-w-md space-y-4">
          <Alert tone="error">
            Não foi possível carregar seu perfil. Entre novamente; se o problema continuar, contate o
            administrador do sistema.
          </Alert>
          <Button variant="outline" onClick={() => void signOut()} className="w-full">
            Sair
          </Button>
        </div>
      </div>
    )
  }

  if (profile.status === 'inactive') {
    return (
      <div className="flex min-h-screen items-center justify-center px-5">
        <div className="w-full max-w-md space-y-4">
          <Alert tone="warning">
            Seu acesso está desativado. Solicite a reativação ao gestor da empresa.
          </Alert>
          <Button variant="outline" onClick={() => void signOut()} className="w-full">
            Sair
          </Button>
        </div>
      </div>
    )
  }

  return <Outlet />
}

export function RedirectIfAuthenticated() {
  const { session, loading } = useAuth()
  if (loading) return <FullPageLoader label="Carregando…" />
  if (session) return <Navigate to="/dashboard" replace />
  return <Outlet />
}
