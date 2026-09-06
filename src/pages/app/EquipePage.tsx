import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { KeyRound, Plus, ShieldCheck, Trash2, UserPlus, Users } from 'lucide-react'
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Select,
  SkeletonPage,
  Tabs,
} from '@/components/ui'
import { ConfirmDialog, Modal } from '@/components/ui/Modal'
import { usePageChrome } from '@/components/layout/AppLayout'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { useCompanyMembers } from '@/features/team/api'
import {
  ALL_PERMISSION_KEYS,
  PERMISSION_AREAS,
  defaultPermissions,
  usePermissions,
} from '@/features/permissions'
import { formatFull, relativeFromNow } from '@/lib/datetime'
import { Avatar } from '@/components/ui/Avatar'
import type { ProfileRow, UserRole, UserStatus } from '@/types/database'

const ROLE_LABEL: Record<UserRole, string> = {
  owner: 'Proprietário',
  admin: 'Administrador',
  manager: 'Gestor',
  agent: 'Agente',
}

const ROLE_HINT: Record<UserRole, string> = {
  owner: 'Acesso total e dono do ambiente.',
  admin: 'Acesso total, incluindo integrações.',
  manager: 'Gestão da operação e da equipe.',
  agent: 'Atendimento e clientes.',
}

export function EquipePage() {
  const { company, profile } = useAuth()
  const { can } = usePermissions()
  const qc = useQueryClient()
  const [tab, setTab] = useState<'usuarios' | 'permissoes'>('usuarios')
  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<ProfileRow | null>(null)
  const [permissionTarget, setPermissionTarget] = useState<ProfileRow | null>(null)
  const [passwordTarget, setPasswordTarget] = useState<ProfileRow | null>(null)
  const [toDelete, setToDelete] = useState<ProfileRow | null>(null)
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)

  const canManage = can('equipe.gerenciar')
  const { data: members, isLoading } = useCompanyMembers(company?.id, true)

  const updateMember = useMutation({
    mutationFn: async (input: {
      userId: string
      fullName?: string
      phone?: string
      role?: UserRole
      status?: UserStatus
      permissions?: Record<string, boolean>
    }) => {
      const { error } = await supabase.rpc('update_team_member', {
        p_user_id: input.userId,
        p_full_name: input.fullName ?? null,
        p_phone: input.phone ?? null,
        p_role: input.role ?? null,
        p_status: input.status ?? null,
        p_permissions: input.permissions ?? null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['company-members'] })
      void qc.invalidateQueries({ queryKey: ['my-permissions'] })
    },
  })

  const deleteMember = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.rpc('delete_team_member', { p_user_id: userId })
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['company-members'] }),
  })

  usePageChrome(
    {
      actions: canManage ? (
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <UserPlus className="size-4" />
          <span className="hidden sm:inline">Novo usuário</span>
        </Button>
      ) : undefined,
    },
    [canManage],
  )

  if (isLoading) return <SkeletonPage tiles={0} rows={5} />

  return (
    <div className="animate-in-fade mx-auto max-w-5xl space-y-4 px-4 py-5 sm:px-6 sm:py-6">
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'usuarios', label: 'Usuários', count: members?.length },
          { key: 'permissoes', label: 'Permissões' },
        ]}
      />

      {feedback && <Alert tone={feedback.tone}>{feedback.text}</Alert>}

      {tab === 'usuarios' && (
        <Card>
          <CardHeader
            title="Usuários da empresa"
            description="Contas com acesso ao CRM. Usuários desativados não conseguem entrar."
          />
          {!members || members.length === 0 ? (
            <EmptyState icon={Users} title="Nenhum usuário cadastrado" />
          ) : (
            <ul className="divide-y divide-line">
              {members.map((member) => (
                <li key={member.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5 sm:px-5">
                  <Avatar name={member.full_name || member.email} seed={member.id} />
                  {/* Largura mínima obriga o grupo de botões a descer para a
                      linha de baixo. Sem ela o flex-wrap espremia este bloco
                      até 26px e o nome do usuário aparecia cortado. */}
                  <div className="min-w-[180px] flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
                      {member.full_name || 'Sem nome'}
                      <Badge tone={member.role === 'owner' ? 'navy' : 'neutral'}>
                        {ROLE_LABEL[member.role]}
                      </Badge>
                      <Badge tone={member.status === 'active' ? 'success' : 'danger'}>
                        {member.status === 'active' ? 'Ativo' : 'Desativado'}
                      </Badge>
                      {member.id === profile?.id && <Badge tone="cyan">Você</Badge>}
                    </p>
                    <p className="truncate text-xs text-muted">{member.email}</p>
                    <p className="text-xs text-muted">
                      Criado em {formatFull(member.created_at)}
                      {member.last_seen_at ? ` · Visto ${relativeFromNow(member.last_seen_at)}` : ''}
                    </p>
                  </div>

                  {canManage && (
                    <div className="flex flex-wrap items-center gap-2">
                      <Button size="sm" variant="outline" onClick={() => setEditing(member)}>
                        Editar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setPermissionTarget(member)}
                      >
                        <ShieldCheck className="size-4" />
                        Permissões
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setPasswordTarget(member)}
                        title="Definir nova senha"
                      >
                        <KeyRound className="size-4" />
                      </Button>
                      {member.id !== profile?.id && (
                        <Button
                          size="sm"
                          variant="outline"
                          loading={updateMember.isPending}
                          onClick={async () => {
                            try {
                              await updateMember.mutateAsync({
                                userId: member.id,
                                status: member.status === 'active' ? 'inactive' : 'active',
                              })
                              setFeedback({
                                tone: 'success',
                                text:
                                  member.status === 'active'
                                    ? 'Usuário desativado.'
                                    : 'Usuário reativado.',
                              })
                            } catch (err) {
                              setFeedback({ tone: 'error', text: (err as Error).message })
                            }
                          }}
                        >
                          {member.status === 'active' ? 'Desativar' : 'Reativar'}
                        </Button>
                      )}
                      {member.role !== 'owner' && member.id !== profile?.id && (
                        <Button size="sm" variant="outline" onClick={() => setToDelete(member)}>
                          <Trash2 className="size-4 text-red-600" />
                        </Button>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === 'permissoes' && (
        <Card>
          <CardHeader
            title="Como as permissões funcionam"
            description="Cada usuário parte do padrão do seu papel e pode ser ajustado individualmente."
          />
          <div className="space-y-4 p-5">
            <Alert tone="info">
              O bloqueio é aplicado no banco de dados, não apenas na tela: uma ação sem permissão é
              recusada mesmo que a requisição seja feita por fora do sistema.
            </Alert>
            <div className="grid gap-3 sm:grid-cols-2">
              {(['owner', 'admin', 'manager', 'agent'] as UserRole[]).map((role) => (
                <div key={role} className="rounded-xl border border-line p-4">
                  <p className="text-sm font-medium text-ink">{ROLE_LABEL[role]}</p>
                  <p className="mt-0.5 text-xs text-muted">{ROLE_HINT[role]}</p>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      <CreateUserModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(message) => {
          setCreateOpen(false)
          setFeedback({ tone: 'success', text: message })
          void qc.invalidateQueries({ queryKey: ['company-members'] })
        }}
      />

      <EditUserModal
        member={editing}
        onClose={() => setEditing(null)}
        onSaved={async (input) => {
          try {
            await updateMember.mutateAsync(input)
            setEditing(null)
            setFeedback({ tone: 'success', text: 'Usuário atualizado.' })
          } catch (err) {
            setFeedback({ tone: 'error', text: (err as Error).message })
          }
        }}
        saving={updateMember.isPending}
      />

      <PermissionsModal
        member={permissionTarget}
        onClose={() => setPermissionTarget(null)}
        saving={updateMember.isPending}
        onSave={async (permissions) => {
          if (!permissionTarget) return
          try {
            await updateMember.mutateAsync({ userId: permissionTarget.id, permissions })
            setPermissionTarget(null)
            setFeedback({ tone: 'success', text: 'Permissões atualizadas.' })
          } catch (err) {
            setFeedback({ tone: 'error', text: (err as Error).message })
          }
        }}
      />

      <PasswordModal
        member={passwordTarget}
        onClose={() => setPasswordTarget(null)}
        onDone={(message, tone) => {
          setPasswordTarget(null)
          setFeedback({ tone, text: message })
        }}
      />

      <ConfirmDialog
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        title="Excluir usuário"
        confirmLabel="Excluir"
        loading={deleteMember.isPending}
        message={
          <>
            O acesso de <strong>{toDelete?.full_name || toDelete?.email}</strong> será removido
            permanentemente. Os atendimentos e mensagens já registrados permanecem no histórico.
          </>
        }
        onConfirm={async () => {
          if (!toDelete) return
          try {
            await deleteMember.mutateAsync(toDelete.id)
            setToDelete(null)
            setFeedback({ tone: 'success', text: 'Usuário excluído.' })
          } catch (err) {
            setToDelete(null)
            setFeedback({ tone: 'error', text: (err as Error).message })
          }
        }}
      />
    </div>
  )
}

/* --------------------------------------------------------- Criar usuário */

function CreateUserModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (message: string) => void
}) {
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    password: '',
    role: 'agent' as UserRole,
  })
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open) {
      setForm({ fullName: '', email: '', password: '', role: 'agent' })
      setError(null)
    }
  }, [open])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (form.password.length < 8) return setError('A senha inicial deve ter no mínimo 8 caracteres.')

    setLoading(true)
    try {
      const { data, error: fnError } = await supabase.functions.invoke<{
        ok?: boolean
        error?: string
      }>('team-manage', {
        body: {
          action: 'create',
          email: form.email,
          password: form.password,
          fullName: form.fullName,
          role: form.role,
        },
      })

      if (fnError) {
        const context = (fnError as unknown as { context?: Response }).context
        if (context) {
          const body = await context.json().catch(() => null)
          throw new Error(body?.error ?? fnError.message)
        }
        throw fnError
      }
      if (data?.error) throw new Error(data.error)

      onCreated('Usuário criado. Informe a senha inicial para que ele acesse o sistema.')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Novo usuário"
      description="A conta é criada já ativa, com a senha inicial que você definir."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button type="submit" form="create-user-form" loading={loading}>
            <Plus className="size-4" />
            Criar conta
          </Button>
        </>
      }
    >
      <form id="create-user-form" onSubmit={submit} className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <Field
          label="Nome completo"
          required
          value={form.fullName}
          onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
        />
        <Field
          label="E-mail"
          type="email"
          required
          value={form.email}
          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
        />
        <Field
          label="Senha inicial"
          type="password"
          required
          value={form.password}
          onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
          hint="O usuário pode trocar depois em Minha conta → Alterar senha."
        />
        <Select
          label="Papel"
          value={form.role}
          onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as UserRole }))}
          hint={ROLE_HINT[form.role]}
        >
          <option value="agent">Agente</option>
          <option value="manager">Gestor</option>
          <option value="admin">Administrador</option>
        </Select>
      </form>
    </Modal>
  )
}

/* -------------------------------------------------------- Editar usuário */

function EditUserModal({
  member,
  onClose,
  onSaved,
  saving,
}: {
  member: ProfileRow | null
  onClose: () => void
  onSaved: (input: { userId: string; fullName: string; phone: string; role: UserRole }) => void
  saving: boolean
}) {
  const [form, setForm] = useState({ fullName: '', phone: '', role: 'agent' as UserRole })

  useEffect(() => {
    if (member) {
      setForm({
        fullName: member.full_name,
        phone: member.phone ?? '',
        role: member.role,
      })
    }
  }, [member])

  return (
    <Modal
      open={member !== null}
      onClose={onClose}
      title="Editar usuário"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button
            loading={saving}
            onClick={() => member && onSaved({ userId: member.id, ...form })}
          >
            Salvar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field
          label="Nome completo"
          value={form.fullName}
          onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
        />
        <Field
          label="Telefone"
          value={form.phone}
          onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
        />
        <Select
          label="Papel"
          value={form.role}
          onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as UserRole }))}
          hint={ROLE_HINT[form.role]}
        >
          <option value="agent">Agente</option>
          <option value="manager">Gestor</option>
          <option value="admin">Administrador</option>
          {member?.role === 'owner' && <option value="owner">Proprietário</option>}
        </Select>
        <Field label="E-mail" value={member?.email ?? ''} disabled />
      </div>
    </Modal>
  )
}

/* ------------------------------------------------------------ Permissões */

function PermissionsModal({
  member,
  onClose,
  onSave,
  saving,
}: {
  member: ProfileRow | null
  onClose: () => void
  onSave: (permissions: Record<string, boolean>) => void
  saving: boolean
}) {
  const [values, setValues] = useState<Record<string, boolean>>({})

  const base = useMemo(
    () => (member ? defaultPermissions(member.role) : {}),
    [member?.id, member?.role],
  )

  useEffect(() => {
    if (!member) return
    const custom = (member.permissions ?? {}) as Record<string, boolean>
    setValues({ ...base, ...custom })
  }, [member?.id, base])

  const isFullAccess = member?.role === 'owner' || member?.role === 'admin'

  return (
    <Modal
      open={member !== null}
      onClose={onClose}
      size="lg"
      title={`Permissões de ${member?.full_name || member?.email || ''}`}
      description="Marque o que este usuário pode fazer. O bloqueio vale também para chamadas diretas à API."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button
            variant="outline"
            disabled={saving}
            onClick={() => setValues({ ...defaultPermissions(member!.role) })}
          >
            Restaurar padrão do papel
          </Button>
          <Button loading={saving} onClick={() => onSave(values)}>
            Salvar permissões
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {isFullAccess && (
          <Alert tone="info">
            Proprietário e administrador têm acesso total por definição. Ajustes aqui só passam a
            valer se o papel for alterado para Gestor ou Agente.
          </Alert>
        )}

        {PERMISSION_AREAS.map((area) => (
          <div key={area.key} className="rounded-xl border border-line p-4">
            <p className="text-sm font-medium text-ink">{area.label}</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {area.actions.map((action) => (
                <label
                  key={action.key}
                  className="flex items-center gap-2 text-sm text-ink/80"
                >
                  <input
                    type="checkbox"
                    className="size-4 accent-orange-500"
                    checked={values[action.key] === true}
                    onChange={(e) =>
                      setValues((prev) => ({ ...prev, [action.key]: e.target.checked }))
                    }
                  />
                  {action.label}
                </label>
              ))}
            </div>
          </div>
        ))}

        <p className="text-xs text-muted">
          {ALL_PERMISSION_KEYS.filter((key) => values[key]).length} de {ALL_PERMISSION_KEYS.length}{' '}
          permissões concedidas.
        </p>
      </div>
    </Modal>
  )
}

/* --------------------------------------------------------------- Senha */

function PasswordModal({
  member,
  onClose,
  onDone,
}: {
  member: ProfileRow | null
  onClose: () => void
  onDone: (message: string, tone: 'success' | 'error') => void
}) {
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (member) {
      setPassword('')
      setError(null)
    }
  }, [member])

  async function submit() {
    if (password.length < 8) return setError('A senha deve ter no mínimo 8 caracteres.')
    setLoading(true)
    try {
      const { data, error: fnError } = await supabase.functions.invoke<{ error?: string }>(
        'team-manage',
        { body: { action: 'reset-password', userId: member!.id, password } },
      )
      if (fnError) {
        const context = (fnError as unknown as { context?: Response }).context
        if (context) {
          const body = await context.json().catch(() => null)
          throw new Error(body?.error ?? fnError.message)
        }
        throw fnError
      }
      if (data?.error) throw new Error(data.error)
      onDone('Senha redefinida. Informe a nova senha ao usuário.', 'success')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      open={member !== null}
      onClose={onClose}
      size="sm"
      title="Definir nova senha"
      description={member?.email}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button loading={loading} onClick={submit}>
            Salvar senha
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <Alert tone="error">{error}</Alert>}
        <Field
          label="Nova senha"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
    </Modal>
  )
}
