import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Lock } from 'lucide-react'
import { Alert, Button, Card, Field } from '@/components/ui'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { authErrorMessage } from '@/lib/utils'

export function ChangePasswordPage() {
  const { user, updatePassword } = useAuth()
  const navigate = useNavigate()
  const [current, setCurrent] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (password.length < 8) return setError('A nova senha deve ter no mínimo 8 caracteres.')
    if (password !== confirm) return setError('As senhas não conferem.')
    setLoading(true)
    try {
      // Reautenticação: confirma a senha atual antes de trocar.
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user?.email ?? '',
        password: current,
      })
      if (signInError) {
        setError('Senha atual incorreta.')
        return
      }
      await updatePassword(password)
      setDone(true)
      setCurrent('')
      setPassword('')
      setConfirm('')
    } catch (err) {
      setError(authErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-6 sm:px-6 sm:py-8">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-ink"
      >
        <ArrowLeft className="size-4" />
        Voltar
      </button>

      <Card className="p-5 sm:p-6">
        <h1 className="text-lg font-semibold tracking-tight text-ink">Alterar senha</h1>
        <p className="mt-1 text-sm text-muted">
          Por segurança, confirme a senha atual antes de definir a nova.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {error && <Alert tone="error">{error}</Alert>}
          {done && <Alert tone="success">Senha alterada com sucesso.</Alert>}

          <Field
            label="Senha atual"
            name="current"
            type="password"
            autoComplete="current-password"
            required
            leading={<Lock className="size-4" />}
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
          <Field
            label="Nova senha"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            leading={<Lock className="size-4" />}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Field
            label="Confirmar nova senha"
            name="confirm"
            type="password"
            autoComplete="new-password"
            required
            leading={<Lock className="size-4" />}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          <Button type="submit" loading={loading}>
            Salvar nova senha
          </Button>
        </form>
      </Card>
    </div>
  )
}
