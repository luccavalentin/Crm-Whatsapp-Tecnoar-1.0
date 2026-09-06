import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Archive,
  ArrowRight,
  Building2,
  CalendarClock,
  Clock,
  MessageCircle,
  Phone,
  Plus,
  UserCheck,
  Users,
  UserSquare2,
} from 'lucide-react'
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  SkeletonList,
  Select,
  Tabs,
} from '@/components/ui'
import { Modal } from '@/components/ui/Modal'
import { usePageChrome } from '@/components/layout/AppLayout'
import { useAuth } from '@/contexts/AuthContext'
import { useCompanyMembers } from '@/features/team/api'
import { useCreateCustomer, useCustomers, type CustomerListFilters } from '@/features/customers/api'
import { formatPhone, isValidPhone, maskPhoneInput } from '@/lib/phone'
import { Avatar } from '@/components/ui/Avatar'
import { cn, displayName } from '@/lib/utils'
import { relativeFromNow } from '@/lib/datetime'
import type { CustomerStatus } from '@/types/database'

export function ClientesPage() {
  const navigate = useNavigate()
  const { company, user, profile } = useAuth()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<CustomerStatus | 'all'>('active')
  const [newOpen, setNewOpen] = useState(false)

  const filters = useMemo<CustomerListFilters>(() => ({ search, status }), [search, status])
  const { data: customers, isLoading, error } = useCustomers(company?.id, filters)
  const canCreate = profile?.status === 'active'
  const clientes = customers ?? []
  const totalAtendimentos = clientes.reduce((sum, customer) => sum + customer.service_count, 0)
  const comResponsavel = clientes.filter((customer) => customer.owner?.full_name).length
  const recentes = clientes.filter((customer) => {
    if (!customer.last_interaction_at) return false
    const last = new Date(customer.last_interaction_at).getTime()
    return Number.isFinite(last) && Date.now() - last <= 7 * 24 * 60 * 60 * 1000
  }).length

  usePageChrome(
    {
      onSearch: setSearch,
      searchPlaceholder: 'Buscar por nome ou telefone…',
      actions: canCreate ? (
        <Button size="sm" onClick={() => setNewOpen(true)}>
          <Plus className="size-4" />
          <span className="hidden sm:inline">Novo cliente</span>
        </Button>
      ) : undefined,
    },
    [canCreate],
  )

  return (
    <div className="animate-in-fade space-y-4 px-4 py-5 sm:px-6 sm:py-6">
      <section className="premium-ring overflow-hidden rounded-2xl bg-navy-900 shadow-[var(--shadow-raised)]">
        <div className="h-1 bg-gradient-to-r from-orange-500 via-cyan-500 to-emerald-500" />
        <div className="grid gap-4 px-4 py-4 sm:px-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-2xs font-bold uppercase tracking-label text-cyan-100">
              <Users className="size-3.5" />
              Carteira de clientes
            </p>
            <h2 className="mt-1 truncate text-xl font-semibold text-white">
              Relacionamentos, recorrência e histórico em uma visão de CRM
            </h2>
            <p className="mt-1 max-w-2xl text-xs leading-snug text-white/62">
              Lista operacional para acompanhar contatos, responsáveis e movimentação recente.
            </p>
          </div>
          <div className="grid grid-cols-3 overflow-hidden rounded-xl ring-1 ring-white/10">
            <PortfolioMetric label="Clientes" value={clientes.length} tone="cyan" />
            <PortfolioMetric label="Atendimentos" value={totalAtendimentos} tone="orange" />
            <PortfolioMetric label="Recentes" value={recentes} tone="success" />
          </div>
        </div>
      </section>

      <div className="premium-ring flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-surface/80 bg-surface/[0.92] p-2.5 shadow-[var(--shadow-card)]">
        <Tabs
          tabs={[
            { key: 'active', label: 'Ativos' },
            { key: 'archived', label: 'Arquivados' },
            { key: 'all', label: 'Todos' },
          ]}
          value={status}
          onChange={setStatus}
        />
        <div className="flex items-center gap-2 rounded-xl bg-ink/[0.035] px-3 py-2 text-xs font-medium text-ink/65">
          <UserCheck className="size-4 text-cyan-600" />
          <span className="nums font-semibold text-ink">{comResponsavel}</span>
          com responsável
        </div>
        <div className="w-full md:hidden">
          <Field
            name="search-mobile"
            placeholder="Buscar por nome ou telefone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10"
          />
        </div>
      </div>

      {error && (
        <div>
          <Alert tone="error">Não foi possível carregar os clientes: {error.message}</Alert>
        </div>
      )}

      <Card className="overflow-hidden">
        {isLoading ? (
          <SkeletonList rows={7} />
        ) : clientes.length === 0 ? (
          <EmptyState
            icon={UserSquare2}
            title={search ? 'Nenhum cliente encontrado' : 'Nenhum cliente cadastrado'}
            description={
              search
                ? 'Ajuste a busca ou cadastre um novo cliente.'
                : 'Os clientes são criados automaticamente no primeiro contato pelo WhatsApp ou manualmente pela equipe.'
            }
            action={
              canCreate ? (
                <Button onClick={() => setNewOpen(true)}>
                  <Plus className="size-4" />
                  Cadastrar cliente
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <div className="border-b border-line/80 bg-surface px-4 py-3.5 sm:px-5">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-base font-semibold text-ink">
                    Clientes cadastrados
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    {status === 'active'
                      ? 'Contatos ativos para relacionamento e atendimento.'
                      : status === 'archived'
                        ? 'Contatos arquivados preservados no histórico.'
                        : 'Todos os contatos da carteira.'}
                  </p>
                </div>
                <Badge tone="cyan">
                  <Users className="size-3" />
                  {clientes.length} {clientes.length === 1 ? 'registro' : 'registros'}
                </Badge>
              </div>
            </div>
            <div className="hidden grid-cols-[2fr_1.15fr_1fr_1fr_0.8fr_1.15fr_2.25rem] gap-4 border-b border-line bg-surface-soft px-5 py-3 text-2xs font-bold uppercase tracking-label text-muted lg:grid">
              <span>Cliente</span>
              <span>Telefone</span>
              <span>Último contato</span>
              <span>Entrada</span>
              <span>Histórico</span>
              <span>Responsável</span>
              <span />
            </div>
            <ul className="divide-y divide-line/75 bg-surface">
              {clientes.map((customer) => {
                const nome = customerName(customer.name || customer.whatsapp_name)
                return (
                  <li key={customer.id}>
                    <button
                      type="button"
                      onClick={() => navigate(`/clientes/${customer.id}`)}
                      className="group grid w-full grid-cols-1 gap-2 px-4 py-4 text-left transition-all hover:bg-gradient-to-r hover:from-cyan-500/[0.055] hover:to-transparent sm:px-5 lg:grid-cols-[2fr_1.15fr_1fr_1fr_0.8fr_1.15fr_2.25rem] lg:items-center lg:gap-4"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar name={nome} seed={customer.id} className="ring-cyan-500/10" />
                        <div className="min-w-0">
                          <p className="flex items-center gap-2 truncate text-sm font-semibold text-ink">
                            {nome}
                            {customer.status === 'archived' && (
                              <Badge tone="neutral">
                                <Archive className="size-3" />
                                Arquivado
                              </Badge>
                            )}
                          </p>
                          {customer.company_name && (
                            <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted">
                              <Building2 className="size-3.5 shrink-0 text-orange-500" />
                              {customer.company_name}
                            </p>
                          )}
                          {/* No celular as colunas da direita nao cabem. Em vez de
                              sumir com o dado, ele desce condensado para ca. */}
                          <p className="mt-1 flex items-center gap-1.5 truncate text-xs text-muted lg:hidden">
                            <Phone className="size-3.5 shrink-0 text-cyan-600" />
                            {formatPhone(customer.phone)}
                          </p>
                          <p className="mt-0.5 truncate text-2xs font-medium text-muted lg:hidden">
                            {relativeFromNow(customer.last_interaction_at)}
                            {' · '}
                            <span className="nums">{customer.service_count}</span>
                            {customer.service_count === 1 ? ' atendimento' : ' atendimentos'}
                            {customer.owner?.full_name ? ` · ${customer.owner.full_name}` : ''}
                          </p>
                        </div>
                      </div>
                      <span className="hidden items-center gap-1.5 text-sm font-medium text-ink/75 lg:flex">
                        <Phone className="size-3.5 shrink-0 text-cyan-600" />
                        {formatPhone(customer.phone)}
                      </span>
                      <span className="hidden items-center gap-1.5 text-sm text-muted lg:flex">
                        <Clock className="size-3.5 shrink-0" />
                        {relativeFromNow(customer.last_interaction_at)}
                      </span>
                      <span className="hidden items-center gap-1.5 text-sm text-muted lg:flex">
                        <CalendarClock className="size-3.5 shrink-0" />
                        {relativeFromNow(customer.first_contact_at ?? customer.created_at)}
                      </span>
                      <span className="hidden items-center gap-1.5 lg:flex">
                        <span className="nums rounded-lg bg-ink/[0.055] px-2 py-1 text-xs font-semibold text-ink">
                          {customer.service_count}
                        </span>
                      </span>
                      <span className="hidden items-center gap-1.5 truncate text-sm text-muted lg:flex">
                        <UserCheck className="size-3.5 shrink-0" />
                        {customer.owner?.full_name || '—'}
                      </span>
                      <span className="hidden size-8 items-center justify-center rounded-lg text-muted transition-all group-hover:bg-navy-900 group-hover:text-white lg:flex">
                        <ArrowRight className="size-4" />
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-surface-soft px-5 py-3 text-xs text-muted">
              <span>
                {clientes.length} {clientes.length === 1 ? 'cliente exibido' : 'clientes exibidos'}
              </span>
              <span className="flex items-center gap-1.5">
                <MessageCircle className="size-3.5" />
                <span className="nums">{totalAtendimentos}</span> atendimentos no histórico exibido
              </span>
            </div>
          </>
        )}
      </Card>

      <NewCustomerModal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        companyId={company?.id}
        userId={user?.id}
      />
    </div>
  )
}

function PortfolioMetric({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: 'cyan' | 'orange' | 'success'
}) {
  const toneClass =
    tone === 'cyan'
      ? 'bg-cyan-500/[0.16] text-cyan-100'
      : tone === 'orange'
        ? 'bg-orange-500/[0.18] text-orange-100'
        : 'bg-emerald-500/[0.18] text-emerald-100'

  return (
    <div className={cn('min-w-[108px] px-4 py-2.5', toneClass)}>
      <p className="nums text-xl font-semibold leading-none text-white">{value}</p>
      <p className="mt-1 text-2xs font-bold uppercase tracking-label text-current">{label}</p>
    </div>
  )
}

function customerName(value: string | null | undefined) {
  const cleaned = value?.trim()
  if (!cleaned || cleaned === '.' || cleaned === '?') return 'Cliente sem nome'
  return displayName(cleaned)
}

function NewCustomerModal({
  open,
  onClose,
  companyId,
  userId,
}: {
  open: boolean
  onClose: () => void
  companyId?: string
  userId?: string
}) {
  const navigate = useNavigate()
  const { data: members } = useCompanyMembers(companyId)
  const createCustomer = useCreateCustomer(companyId, userId)
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    company_name: '',
    document: '',
    owner_id: '',
  })
  const [error, setError] = useState<string | null>(null)
  const [duplicateId, setDuplicateId] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setForm({ name: '', phone: '', email: '', company_name: '', document: '', owner_id: '' })
      setError(null)
      setDuplicateId(null)
    }
  }, [open])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setDuplicateId(null)

    if (!isValidPhone(form.phone)) {
      setError('Informe um telefone válido com DDD.')
      return
    }

    try {
      const customer = await createCustomer.mutateAsync({
        ...form,
        owner_id: form.owner_id || null,
      })
      onClose()
      navigate(`/clientes/${customer.id}`)
    } catch (err) {
      const typed = err as Error & { customerId?: string }
      setError(typed.message)
      if (typed.customerId) setDuplicateId(typed.customerId)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Novo cliente"
      description="O telefone identifica o cliente e evita cadastros duplicados."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={createCustomer.isPending}>
            Cancelar
          </Button>
          <Button type="submit" form="new-customer-form" loading={createCustomer.isPending}>
            Cadastrar cliente
          </Button>
        </>
      }
    >
      <form id="new-customer-form" onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <Alert tone="error">
            {error}
            {duplicateId && (
              <button
                type="button"
                onClick={() => {
                  onClose()
                  navigate(`/clientes/${duplicateId}`)
                }}
                className="ml-1 font-medium underline"
              >
                Abrir cadastro existente
              </button>
            )}
          </Alert>
        )}

        <Field
          label="Telefone / WhatsApp"
          name="phone"
          required
          autoFocus
          placeholder="(11) 98888-7777"
          value={form.phone}
          onChange={(e) => setForm((f) => ({ ...f, phone: maskPhoneInput(e.target.value) }))}
          hint="Números brasileiros sem DDI recebem +55 automaticamente."
        />
        <Field
          label="Nome"
          name="name"
          placeholder="Nome do cliente"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Empresa"
            name="company_name"
            value={form.company_name}
            onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))}
          />
          <Field
            label="Documento"
            name="document"
            placeholder="CPF ou CNPJ"
            value={form.document}
            onChange={(e) => setForm((f) => ({ ...f, document: e.target.value }))}
          />
        </div>
        <Field
          label="E-mail"
          name="email"
          type="email"
          value={form.email}
          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
        />
        <Select
          label="Responsável"
          name="owner_id"
          value={form.owner_id}
          onChange={(e) => setForm((f) => ({ ...f, owner_id: e.target.value }))}
        >
          <option value="">Sem responsável definido</option>
          {(members ?? []).map((member) => (
            <option key={member.id} value={member.id}>
              {member.full_name || member.email}
            </option>
          ))}
        </Select>
      </form>
    </Modal>
  )
}
