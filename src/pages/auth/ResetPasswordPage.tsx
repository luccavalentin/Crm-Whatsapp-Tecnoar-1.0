import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Lock } from 'lucide-react'
import { AuthShell } from './AuthShell'
import { Alert, Button, Field } from '@/components/ui'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { authErrorMessage } from '@/lib/utils'

/**
 * Destino do link enviado por e-mail. O Supabase troca o token da URL por uma
 * sessão de recuperação (detectSessionInUrl), permitindo definir a nova senha.
 */
export function ResetPasswordPage() {
  const { updatePassword, signOut } = useAuth()
  const navigate = useNavigate()
  const [ready, setReady] = useState(false)
  const [hasSession, setHasSession] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let active = true
    const check = async () => {
      const { data } = await supabase.auth.getSession()
      if (!active) return
      setHasSession(Boolean(data.session))
      setReady(true)
    }
    void check()
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return
      setHasSession(Boolean(session))
      setReady(true)
    })
    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (password.length < 8) return setError('A senha deve ter no mínimo 8 caracteres.')
    if (password !== confirm) return setError('As senhas não conferem.')
    setLoading(true)
    try {
      await updatePassword(password)
      await signOut()
      navigate('/login', {
        replace: true,
        state: { notice: 'Senha redefinida. Entre com a nova senha.' },
      })
    } catch (err) {
      setError(authErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell title="Definir nova senha" description="Escolha uma senha com no mínimo 8 caracteres.">
      {!ready ? null : !hasSession ? (
        <Alert tone="error">
          Link inválido ou expirado. Solicite uma nova recuperação de acesso na tela de login.
        </Alert>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <Alert tone="error">{error}</Alert>}
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
          <Button type="submit" size="lg" loading={loading} className="w-full">
            Salvar nova senha
          </Button>
        </form>
      )}
    </AuthShell>
  )
}
