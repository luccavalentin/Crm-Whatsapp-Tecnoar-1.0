import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Mail } from 'lucide-react'
import { AuthShell } from './AuthShell'
import { Alert, Button, Field } from '@/components/ui'
import { useAuth } from '@/contexts/AuthContext'
import { authErrorMessage } from '@/lib/utils'

export function ForgotPasswordPage() {
  const { requestPasswordReset } = useAuth()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await requestPasswordReset(email)
      setSent(true)
    } catch (err) {
      setError(authErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell
      title="Recuperar acesso"
      description="Enviaremos um link de redefinição para o e-mail cadastrado."
      footer={
        <Link
          to="/login"
          className="inline-flex items-center gap-1.5 font-medium text-link hover:text-orange-500"
        >
          <ArrowLeft className="size-4" />
          Voltar para o login
        </Link>
      }
    >
      {sent ? (
        <Alert tone="success">
          Se existir uma conta com <strong>{email}</strong>, o link de redefinição foi enviado.
          Verifique também a caixa de spam.
        </Alert>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
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
          <Button type="submit" size="lg" loading={loading} className="w-full">
            Enviar link de redefinição
          </Button>
        </form>
      )}
    </AuthShell>
  )
}
