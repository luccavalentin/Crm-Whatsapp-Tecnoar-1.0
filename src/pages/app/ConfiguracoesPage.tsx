import { useEffect, useState, type FormEvent } from 'react'
import { Bot, Building2, KeyRound, LayoutGrid, MessageSquare, ShieldAlert, ShieldCheck, Tags, User, Users } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { Alert, Button, Card, CardHeader, Field } from '@/components/ui'
import { useAuth } from '@/contexts/AuthContext'
import { usePermissions } from '@/features/permissions'
import { supabase } from '@/lib/supabase'
import { authErrorMessage } from '@/lib/utils'
import { EmergencyContacts } from '@/components/settings/EmergencyContacts'
import { TagsSettings } from '@/components/settings/TagsSettings'
import { NotificationSettings } from '@/components/settings/NotificationSettings'

const TABS = [
  { key: 'geral', label: 'Geral', icon: Building2 },
  { key: 'emergencia', label: 'Emergência', icon: ShieldAlert },
  { key: 'etiquetas', label: 'Etiquetas', icon: Tags },
  { key: 'conta', label: 'Minha conta', icon: User },
  { key: 'sistema', label: 'Áreas do sistema', icon: LayoutGrid },
] as const

/** Cada área tem sua própria tela; aqui ficam os atalhos com controle de acesso. */
const SYSTEM_AREAS = [
  {
    to: '/equipe',
    permission: 'equipe.visualizar',
    icon: Users,
    title: 'Usuários',
    description: 'Cadastro, ativação, desativação e exclusão de contas da equipe.',
  },
  {
    to: '/equipe',
    permission: 'equipe.gerenciar',
    icon: ShieldCheck,
    title: 'Permissões',
    description: 'Defina por usuário o que pode visualizar, criar, editar e excluir.',
  },
  {
    to: '/ia',
    permission: 'ia.visualizar',
    icon: Bot,
    title: 'Inteligência artificial',
    description: 'Provedores, chaves de API e comportamento da assistente.',
  },
  {
    to: '/whatsapp',
    permission: 'whatsapp.visualizar',
    icon: MessageSquare,
    title: 'Configuração do WhatsApp',
    description: 'Meta Cloud API e Evolution API: credenciais, status e webhooks.',
  },
] as const

type TabKey = (typeof TABS)[number]['key']

export function ConfiguracoesPage() {
  const { profile, company, refreshProfile } = useAuth()
  const { can } = usePermissions()
  // A aba pode vir pela URL: é o que faz o atalho "criar etiqueta", lá da
  // conversa, cair direto no lugar certo em vez de na aba geral.
  const [parametros, setParametros] = useSearchParams()
  const abaDaUrl = parametros.get('aba') as TabKey | null
  const [tab, definirTab] = useState<TabKey>(abaDaUrl ?? 'geral')

  const setTab = (nova: TabKey) => {
    definirTab(nova)
    setParametros(nova === 'geral' ? {} : { aba: nova }, { replace: true })
  }

  const isAdmin = can('configuracoes.gerenciar')

  const [companyForm, setCompanyForm] = useState({ name: '', phone: '', document: '', email: '' })
  const [profileForm, setProfileForm] = useState({ full_name: '', phone: '' })
  const [status, setStatus] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (company) {
      setCompanyForm({
        name: company.name ?? '',
        phone: company.phone ?? '',
        document: company.document ?? '',
        email: company.email ?? '',
      })
    }
  }, [company])

  useEffect(() => {
    if (profile) {
      setProfileForm({ full_name: profile.full_name ?? '', phone: profile.phone ?? '' })
    }
  }, [profile])

  async function saveCompany(event: FormEvent) {
    event.preventDefault()
    if (!company) return
    setSaving(true)
    setStatus(null)
    const { error } = await supabase
      .from('companies')
      .update({
        name: companyForm.name.trim(),
        phone: companyForm.phone.trim() || null,
        document: companyForm.document.trim() || null,
        email: companyForm.email.trim() || null,
      })
      .eq('id', company.id)
    setSaving(false)
    if (error) {
      setStatus({ tone: 'error', text: authErrorMessage(error) })
      return
    }
    await refreshProfile()
    setStatus({ tone: 'success', text: 'Dados da empresa atualizados.' })
  }

  async function saveProfile(event: FormEvent) {
    event.preventDefault()
    if (!profile) return
    setSaving(true)
    setStatus(null)
    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: profileForm.full_name.trim(),
        phone: profileForm.phone.trim() || null,
      })
      .eq('id', profile.id)
    setSaving(false)
    if (error) {
      setStatus({ tone: 'error', text: authErrorMessage(error) })
      return
    }
    await refreshProfile()
    setStatus({ tone: 'success', text: 'Perfil atualizado.' })
  }

  return (
    <div className="animate-in-fade mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      {/* Quatro abas com ícone e rótulo não cabem em 390px. Rola de lado em
          vez de espremer o texto até cortar. */}
      <div className="scrollbar-none mb-5 flex gap-1 overflow-x-auto rounded-xl border border-line bg-surface p-1">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => {
              setTab(item.key)
              setStatus(null)
            }}
            className={
              'flex shrink-0 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors sm:shrink ' +
              (tab === item.key
                ? 'bg-ink/[0.06] text-ink'
                : 'text-muted hover:bg-ink/[0.03] hover:text-ink')
            }
          >
            <item.icon className="size-4" />
            {item.label}
          </button>
        ))}
      </div>

      {status && (
        <div className="mb-4">
          <Alert tone={status.tone}>{status.text}</Alert>
        </div>
      )}

      {tab === 'geral' && (
        <Card>
          <CardHeader
            title="Empresa"
            description="Dados do ambiente de trabalho compartilhado pela equipe."
          />
          <form onSubmit={saveCompany} className="space-y-4 p-5">
            {!isAdmin && (
              <Alert tone="info">
                Você não tem permissão para alterar os dados da empresa.
              </Alert>
            )}
            <Field
              label="Nome da empresa"
              name="name"
              required
              disabled={!isAdmin}
              value={companyForm.name}
              onChange={(e) => setCompanyForm((f) => ({ ...f, name: e.target.value }))}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="CNPJ"
                name="document"
                disabled={!isAdmin}
                placeholder="00.000.000/0000-00"
                value={companyForm.document}
                onChange={(e) => setCompanyForm((f) => ({ ...f, document: e.target.value }))}
              />
              <Field
                label="Telefone"
                name="phone"
                disabled={!isAdmin}
                placeholder="(00) 0000-0000"
                value={companyForm.phone}
                onChange={(e) => setCompanyForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </div>
            <Field
              label="E-mail de contato"
              name="email"
              type="email"
              disabled={!isAdmin}
              value={companyForm.email}
              onChange={(e) => setCompanyForm((f) => ({ ...f, email: e.target.value }))}
            />
            {isAdmin && (
              <Button type="submit" loading={saving}>
                Salvar alterações
              </Button>
            )}
          </form>
        </Card>
      )}

      {tab === 'emergencia' && (
        <EmergencyContacts companyId={company?.id} canManage={isAdmin} />
      )}

      {tab === 'etiquetas' && <TagsSettings canManage={isAdmin} />}

      {tab === 'sistema' && (
        <div className="grid gap-3 sm:grid-cols-2">
          {SYSTEM_AREAS.filter((area) => can(area.permission)).map((area) => (
            <Link
              key={area.title}
              to={area.to}
              className="flex items-start gap-3 rounded-2xl border border-line bg-surface p-4 shadow-[var(--shadow-card)] transition-colors hover:border-muted/60"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-ink/[0.05] text-ink/60">
                <area.icon className="size-[18px]" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-ink">{area.title}</span>
                <span className="mt-0.5 block text-xs leading-snug text-muted">
                  {area.description}
                </span>
              </span>
            </Link>
          ))}
          {SYSTEM_AREAS.filter((area) => can(area.permission)).length === 0 && (
            <Alert tone="info">
              Você não tem acesso a nenhuma área administrativa. Fale com o gestor da empresa.
            </Alert>
          )}
        </div>
      )}

      {tab === 'conta' && (
        <div className="space-y-4">
          <NotificationSettings />
        <Card>
          <CardHeader title="Minha conta" description="Informações do seu usuário." />
          <form onSubmit={saveProfile} className="space-y-4 p-5">
            <Field
              label="Nome completo"
              name="full_name"
              required
              value={profileForm.full_name}
              onChange={(e) => setProfileForm((f) => ({ ...f, full_name: e.target.value }))}
            />
            <Field
              label="Telefone"
              name="phone"
              value={profileForm.phone}
              onChange={(e) => setProfileForm((f) => ({ ...f, phone: e.target.value }))}
            />
            <Field
              label="E-mail"
              name="email"
              value={profile?.email ?? ''}
              disabled
              hint="O e-mail é o identificador de login e não pode ser alterado aqui."
            />
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" loading={saving}>
                Salvar alterações
              </Button>
              <Link
                to="/alterar-senha"
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-line bg-surface px-4 text-sm font-medium text-ink transition-colors hover:bg-ink/[0.04]"
              >
                <KeyRound className="size-4 text-muted" />
                Alterar senha
              </Link>
            </div>
          </form>
        </Card>
        </div>
      )}
    </div>
  )
}
