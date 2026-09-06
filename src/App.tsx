import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/contexts/AuthContext'
import { AppLayout } from '@/components/layout/AppLayout'
import { RedirectIfAuthenticated, RequireAuth } from '@/routes/guards'
import { RequirePermission } from '@/routes/RequirePermission'
import { LoginPage } from '@/pages/auth/LoginPage'
import { SignUpPage } from '@/pages/auth/SignUpPage'
import { ForgotPasswordPage } from '@/pages/auth/ForgotPasswordPage'
import { ResetPasswordPage } from '@/pages/auth/ResetPasswordPage'
import { ChangePasswordPage } from '@/pages/auth/ChangePasswordPage'
import { ConfiguracoesPage } from '@/pages/app/ConfiguracoesPage'
import { EquipePage } from '@/pages/app/EquipePage'
import { ClientesPage } from '@/pages/app/ClientesPage'
import { AtendimentosPage } from '@/pages/app/AtendimentosPage'
import { IAPage } from '@/pages/app/IAPage'
import { DashboardPage } from '@/pages/app/DashboardPage'
import { KanbanPage } from '@/pages/app/KanbanPage'
import { MetricasPage } from '@/pages/app/MetricasPage'
import { SimuladorPage } from '@/pages/app/SimuladorPage'
import { WhatsAppPage } from '@/pages/app/WhatsAppPage'
import { ClienteDetalhePage } from '@/pages/app/ClienteDetalhePage'

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
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
