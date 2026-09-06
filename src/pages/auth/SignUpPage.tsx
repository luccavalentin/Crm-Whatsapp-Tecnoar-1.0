import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Building2, Eye, EyeOff, Lock, Mail, User } from 'lucide-react'
import { AuthShell } from './AuthShell'
import { Alert, Button, Field } from '@/components/ui'
import { useAuth } from '@/contexts/AuthContext'
import { authErrorMessage } from '@/lib/utils'

export function SignUpPage() {
  const { signUp } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({
    fullName: '',
    companyName: '',
    email: '',
    password: '',
    confirm: '',
  })
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)

  function update(key: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }))
    setFieldErrors((prev) => ({ ...prev, [key]: '' }))
  }

  function validate() {
    const errors: Record<string, string> = {}
    if (form.fullName.trim().length < 3) errors.fullName = 'Informe seu nome completo.'
    if (form.companyName.trim().length < 2) errors.companyName = 'Informe o nome da empresa.'
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) errors.email = 'Informe um e-mail válido.'
    if (form.password.length < 8) errors.password = 'A senha deve ter no mínimo 8 caracteres.'
    if (form.password !== form.confirm) errors.confirm = 'As senhas não conferem.'
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (!validate()) return
    setLoading(true)
    try {
      const { needsEmailConfirmation } = await signUp({
        fullName: form.fullName,
        companyName: form.companyName,
        email: form.email,
        password: form.password,
      })
      if (needsEmailConfirmation) {
        navigate('/login', {
          replace: true,
          state: {
            notice:
              'Conta criada. Confirme seu e-mail pelo link enviado e depois faça login.',
          },
        })
      } else {
        navigate('/dashboard', { replace: true })
      }
    } catch (err) {
      setError(authErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell
      title="Criar conta"
      description="A primeira conta criada torna-se proprietária do ambiente de trabalho da empresa."
      footer={
        <>
          Já possui conta?{' '}
          <Link to="/login" className="font-medium text-orange-500 hover:text-orange-600">
            Entrar
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}

        <Field
          label="Nome completo"
          name="fullName"
          autoComplete="name"
          required
          placeholder="Seu nome"
          leading={<User className="size-4" />}
          value={form.fullName}
          error={fieldErrors.fullName}
          onChange={(e) => update('fullName', e.target.value)}
        />

        <Field
          label="Empresa"
          name="companyName"
          autoComplete="organization"
          required
          placeholder="Tecnoar Freios"
          leading={<Building2 className="size-4" />}
          value={form.companyName}
          error={fieldErrors.companyName}
          onChange={(e) => update('companyName', e.target.value)}
        />

        <Field
          label="E-mail"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="voce@empresa.com.br"
          leading={<Mail className="size-4" />}
          value={form.email}
          error={fieldErrors.email}
          onChange={(e) => update('email', e.target.value)}
        />

        <Field
          label="Senha"
          name="password"
          type={showPassword ? 'text' : 'password'}
          autoComplete="new-password"
          required
          placeholder="Mínimo de 8 caracteres"
          leading={<Lock className="size-4" />}
          value={form.password}
          error={fieldErrors.password}
          onChange={(e) => update('password', e.target.value)}
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

        <Field
          label="Confirmar senha"
          name="confirm"
          type={showPassword ? 'text' : 'password'}
          autoComplete="new-password"
          required
          placeholder="Repita a senha"
          leading={<Lock className="size-4" />}
          value={form.confirm}
          error={fieldErrors.confirm}
          onChange={(e) => update('confirm', e.target.value)}
        />

        <Button type="submit" size="lg" loading={loading} className="w-full">
          Criar conta
        </Button>
      </form>
    </AuthShell>
  )
}
