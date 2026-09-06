import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Lock, Mail } from 'lucide-react'
import { AuthShell } from './AuthShell'
import { Alert, Button, Field } from '@/components/ui'
import { useAuth } from '@/contexts/AuthContext'
import { authErrorMessage } from '@/lib/utils'

export function LoginPage() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const notice = (location.state as { notice?: string } | null)?.notice

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await signIn(email, password)
      const from = (location.state as { from?: string } | null)?.from
      navigate(from ?? '/dashboard', { replace: true })
    } catch (err) {
      setError(authErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell
      title="Entrar"
      description="Acesse o painel de atendimento da sua empresa."
      footer={
        <>
          Ainda não tem conta?{' '}
          <Link to="/criar-conta" className="font-medium text-orange-500 hover:text-orange-600">
            Criar conta
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {notice && <Alert tone="success">{notice}</Alert>}
        {error && <Alert tone="error">{error}</Alert>}

        <Field
          label="E-mail"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="voce@empresa.com.br"
          leading={<Mail className="size-4" />}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <Field
          label="Senha"
          name="password"
          type={showPassword ? 'text' : 'password'}
          autoComplete="current-password"
          required
          placeholder="••••••••"
          leading={<Lock className="size-4" />}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          trailing={
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="rounded-lg p-2 text-muted transition-colors hover:text-ink"
              aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          }
        />

        <div className="flex justify-end">
          <Link
            to="/recuperar-senha"
            className="text-sm font-medium text-link hover:text-orange-500"
          >
            Esqueci minha senha
          </Link>
        </div>

        <Button type="submit" size="lg" loading={loading} className="w-full">
          Entrar
        </Button>
      </form>
    </AuthShell>
  )
}
