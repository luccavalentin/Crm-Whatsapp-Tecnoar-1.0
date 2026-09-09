import { Suspense, lazy } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/contexts/AuthContext'
import { AppLayout } from '@/components/layout/AppLayout'
import { RedirectIfAuthenticated, RequireAuth } from '@/routes/guards'
import { RequirePermission } from '@/routes/RequirePermission'
import { SkeletonPage } from '@/components/ui'

// Carregadas de imediato: são as duas primeiras telas de qualquer sessão, e
// adiar o download delas só adiciona espera onde ela é mais visível.
import { LoginPage } from '@/pages/auth/LoginPage'
import { DashboardPage } from '@/pages/app/DashboardPage'

// As demais chegam sob demanda. Cada uma vira um arquivo separado, então quem
// abre o CRM baixa a tela que vai usar, e não o sistema inteiro.
const SignUpPage = lazy(() => import('@/pages/auth/SignUpPage').then((m) => ({ default: m.SignUpPage })))
const ForgotPasswordPage = lazy(() => import('@/pages/auth/ForgotPasswordPage').then((m) => ({ default: m.ForgotPasswordPage })))
const ResetPasswordPage = lazy(() => import('@/pages/auth/ResetPasswordPage').then((m) => ({ default: m.ResetPasswordPage })))
const ChangePasswordPage = lazy(() => import('@/pages/auth/ChangePasswordPage').then((m) => ({ default: m.ChangePasswordPage })))
const AtendimentosPage = lazy(() => import('@/pages/app/AtendimentosPage').then((m) => ({ default: m.AtendimentosPage })))
const KanbanPage = lazy(() => import('@/pages/app/KanbanPage').then((m) => ({ default: m.KanbanPage })))
const ClientesPage = lazy(() => import('@/pages/app/ClientesPage').then((m) => ({ default: m.ClientesPage })))
const ClienteDetalhePage = lazy(() => import('@/pages/app/ClienteDetalhePage').then((m) => ({ default: m.ClienteDetalhePage })))
const MetricasPage = lazy(() => import('@/pages/app/MetricasPage').then((m) => ({ default: m.MetricasPage })))
const IAPage = lazy(() => import('@/pages/app/IAPage').then((m) => ({ default: m.IAPage })))
const SimuladorPage = lazy(() => import('@/pages/app/SimuladorPage').then((m) => ({ default: m.SimuladorPage })))
const EquipePage = lazy(() => import('@/pages/app/EquipePage').then((m) => ({ default: m.EquipePage })))
const WhatsAppPage = lazy(() => import('@/pages/app/WhatsAppPage').then((m) => ({ default: m.WhatsAppPage })))
const ConfiguracoesPage = lazy(() => import('@/pages/app/ConfiguracoesPage').then((m) => ({ default: m.ConfiguracoesPage })))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 15_000, refetchOnWindowFocus: false, retry: 1 },
  },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Suspense fallback={<SkeletonPage />}>
            <Routes>
              {/* Público */}
              <Route element={<RedirectIfAuthenticated />}>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/criar-conta" element={<SignUpPage />} />
                <Route path="/recuperar-senha" element={<ForgotPasswordPage />} />
              </Route>
              {/* Acessível com sessão de recuperação */}
              <Route path="/redefinir-senha" element={<ResetPasswordPage />} />

              {/* Autenticado */}
              <Route element={<RequireAuth />}>
                <Route element={<AppLayout />}>
                  <Route
                    path="/dashboard"
                    element={
                      <RequirePermission permission="dashboard.visualizar">
                        <DashboardPage />
                      </RequirePermission>
                    }
                  />
                  <Route
                    path="/atendimentos"
                    element={
                      <RequirePermission permission="atendimentos.visualizar">
                        <AtendimentosPage />
                      </RequirePermission>
                    }
                  />
                  <Route
                    path="/kanban"
                    element={
                      <RequirePermission permission="kanban.visualizar">
                        <KanbanPage />
                      </RequirePermission>
                    }
                  />
                  <Route
                    path="/clientes"
                    element={
                      <RequirePermission permission="clientes.visualizar">
                        <ClientesPage />
                      </RequirePermission>
                    }
                  />
                  <Route
                    path="/clientes/:id"
                    element={
                      <RequirePermission permission="clientes.visualizar">
                        <ClienteDetalhePage />
                      </RequirePermission>
                    }
                  />
                  <Route
                    path="/metricas"
                    element={
                      <RequirePermission permission="metricas.visualizar">
                        <MetricasPage />
                      </RequirePermission>
                    }
                  />
                  <Route
                    path="/ia"
                    element={
                      <RequirePermission permission="ia.visualizar">
                        <IAPage />
                      </RequirePermission>
                    }
                  />
                  <Route
                    path="/simulador"
                    element={
                      <RequirePermission permission="simulador.visualizar">
                        <SimuladorPage />
                      </RequirePermission>
                    }
                  />
                  <Route
                    path="/equipe"
                    element={
                      <RequirePermission permission="equipe.visualizar">
                        <EquipePage />
                      </RequirePermission>
                    }
                  />
                  <Route
                    path="/whatsapp"
                    element={
                      <RequirePermission permission="whatsapp.visualizar">
                        <WhatsAppPage />
                      </RequirePermission>
                    }
                  />
                  <Route
                    path="/configuracoes"
                    element={
                      <RequirePermission permission="configuracoes.visualizar">
                        <ConfiguracoesPage />
                      </RequirePermission>
                    }
                  />
                  <Route path="/alterar-senha" element={<ChangePasswordPage />} />
                </Route>
              </Route>

              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
