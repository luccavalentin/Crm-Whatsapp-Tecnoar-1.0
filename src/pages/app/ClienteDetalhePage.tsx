import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Bot,
  Clock,
  History,
  MessageSquare,
  MessagesSquare,
  NotebookPen,
  Pencil,
  Plus,
  Repeat2,
  Trash2,
  User,
} from 'lucide-react'
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
  TextArea,
} from '@/components/ui'
import { ConfirmDialog, Modal } from '@/components/ui/Modal'
import { usePageChrome } from '@/components/layout/AppLayout'
import { useAuth } from '@/contexts/AuthContext'
import { useCompanyMembers } from '@/features/team/api'
import {
  useCreateNote,
  useCustomer,
  useCustomerEvents,
  useCustomerFields,
  useCustomerNotes,
  useDeleteCustomer,
  useDeleteCustomerField,
  useDeleteNote,
  useSaveCustomerField,
  useUpdateCustomer,
} from '@/features/customers/api'
import { useCustomerConversations, useCustomerMessages } from '@/features/conversations/api'
import { formatPhone, isValidPhone, maskPhoneInput } from '@/lib/phone'
import { formatFull, relativeFromNow } from '@/lib/datetime'
import { Avatar } from '@/components/ui/Avatar'
import { cn, displayName } from '@/lib/utils'
import type { ActorType, CustomerFieldRow, DataSource } from '@/types/database'

type TabKey = 'visao' | 'atendimentos' | 'conversas' | 'historico' | 'observacoes' | 'dados'

const SOURCE_LABEL: Record<DataSource, string> = {
  ia: 'Capturado pela IA',
  whatsapp: 'Informado pelo WhatsApp',
  manual: 'Cadastro manual',
  sistema: 'Registrado pelo sistema',
}

const CONVERSATION_STATUS_LABEL: Record<string, string> = {
  novo: 'Novo',
  ia: 'Com a IA',
  aguardando_humano: 'Aguardando humano',
  em_atendimento: 'Em atendimento',
  concluido: 'Concluído',
}

const ACTOR_ICON: Record<ActorType, typeof User> = {
  cliente: MessageSquare,
  ia: Bot,
  usuario: User,
  sistema: Clock,
}

export function ClienteDetalhePage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { company, user, profile } = useAuth()
  const [tab, setTab] = useState<TabKey>('visao')
  const [editOpen, setEditOpen] = useState(false)
  const [confirmArchive, setConfirmArchive] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)

  const { data: customer, isLoading, error } = useCustomer(id)
  const { data: fields } = useCustomerFields(id)
  const { data: notes } = useCustomerNotes(id)
  const { data: events } = useCustomerEvents(id)
  const { data: conversations } = useCustomerConversations(id)
  const { data: customerMessages } = useCustomerMessages(id)
  const updateCustomer = useUpdateCustomer(id)
  const deleteCustomer = useDeleteCustomer()

  const canManage = profile?.role !== 'agent'
  const nomeCliente = displayName(customer?.name || customer?.whatsapp_name)
  const isRecurring = (customer?.service_count ?? 0) > 1

  usePageChrome(
    {
      title: customer ? nomeCliente : 'Cliente',
      subtitle: customer ? formatPhone(customer.phone) : undefined,
      actions: customer ? (
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil className="size-4" />
            <span className="hidden sm:inline">Editar</span>
          </Button>
        </div>
      ) : undefined,
    },
    [customer?.id, nomeCliente],
  )

  if (isLoading) return <SkeletonPage tiles={3} rows={4} />

  if (error || !customer) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <Alert tone="error">
          Cliente não encontrado ou sem permissão de acesso.{' '}
          <Link to="/clientes" className="font-medium underline">
            Voltar para clientes
          </Link>
        </Alert>
      </div>
    )
  }

  return (
    <div className="animate-in-fade px-4 py-5 sm:px-6 sm:py-6">
      <button
        type="button"
        onClick={() => navigate('/clientes')}
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-ink"
      >
        <ArrowLeft className="size-4" />
        Clientes
      </button>

      {feedback && (
        <div className="mb-4">
          <Alert tone="success">{feedback}</Alert>
        </div>
      )}

      {/* Cabeçalho do cliente */}
      <Card className="mb-4 p-5">
        <div className="flex flex-wrap items-start gap-4">
          <Avatar name={nomeCliente} seed={customer.id} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold tracking-tight text-ink">{nomeCliente}</h2>
              {customer.status === 'archived' && (
                <Badge tone="neutral">
                  <Archive className="size-3" />
                  Arquivado
                </Badge>
              )}
              {isRecurring && (
                <Badge tone="cyan">
                  <Repeat2 className="size-3" />
                  Cliente recorrente
                </Badge>
              )}
            </div>
            <p className="mt-0.5 text-sm text-muted">
              {formatPhone(customer.phone)}
              {customer.company_name ? ` · ${customer.company_name}` : ''}
            </p>
            {isRecurring && customer.last_interaction_at && (
              <p className="mt-1 text-xs text-cyan-600">
                Último atendimento {relativeFromNow(customer.last_interaction_at)}
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setConfirmArchive(true)}
              disabled={updateCustomer.isPending}
            >
              {customer.status === 'archived' ? (
                <>
                  <ArchiveRestore className="size-4" />
                  Reativar
                </>
              ) : (
                <>
                  <Archive className="size-4" />
                  Arquivar
                </>
              )}
            </Button>
            {canManage && (
              <Button size="sm" variant="outline" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="size-4 text-red-600" />
                <span className="text-red-600">Excluir</span>
              </Button>
            )}
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-4 sm:grid-cols-4">
          <Metric label="Atendimentos" value={String(customer.service_count)} />
          <Metric
            label="Primeiro contato"
            value={relativeFromNow(customer.first_contact_at ?? customer.created_at)}
          />
          <Metric label="Última interação" value={relativeFromNow(customer.last_interaction_at)} />
          <Metric label="Responsável" value={customer.owner?.full_name || '—'} />
        </dl>
      </Card>

      <Tabs
        className="mb-4"
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'visao', label: 'Visão geral' },
          { key: 'atendimentos', label: 'Atendimentos', count: conversations?.length },
          { key: 'conversas', label: 'Conversas', count: customerMessages?.length },
          { key: 'historico', label: 'Histórico', count: events?.length },
          { key: 'observacoes', label: 'Observações', count: notes?.length },
          { key: 'dados', label: 'Dados', count: fields?.length },
        ]}
      />

      {tab === 'visao' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Informações principais" />
            <dl className="divide-y divide-line">
              <Row label="Nome" value={customer.name} />
              <Row label="Nome no WhatsApp" value={customer.whatsapp_name} />
              <Row label="Telefone" value={formatPhone(customer.phone)} />
              <Row label="E-mail" value={customer.email} />
              <Row label="Empresa" value={customer.company_name} />
              <Row label="Documento" value={customer.document} />
              <Row label="Cadastrado em" value={formatFull(customer.created_at)} />
              <Row label="Origem do cadastro" value={SOURCE_LABEL[customer.created_source]} />
            </dl>
          </Card>

          <Card>
            <CardHeader
              title="Últimos acontecimentos"
              description="Resumo da linha do tempo deste cliente."
            />
            {!events || events.length === 0 ? (
              <EmptyState icon={History} title="Sem histórico registrado" />
            ) : (
              <ul className="divide-y divide-line">
                {events.slice(0, 6).map((event) => (
                  <TimelineItem key={event.id} event={event} />
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      {tab === 'atendimentos' && (
        <Card>
          <CardHeader
            title="Atendimentos"
            description="Todos os atendimentos deste cliente, do mais recente ao mais antigo."
          />
          {!conversations || conversations.length === 0 ? (
            <EmptyState
              icon={MessagesSquare}
              title="Nenhum atendimento registrado"
              description="Os atendimentos aparecem aqui assim que houver conversa pelo WhatsApp."
            />
          ) : (
            <ul className="divide-y divide-line">
              {conversations.map((conversation) => (
                <li key={conversation.id}>
                  <Link
                    to={`/atendimentos?conversa=${conversation.id}`}
                    className="flex items-start gap-3 px-5 py-3.5 transition-colors hover:bg-ink/[0.02]"
                  >
                    <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl bg-ink/[0.06] text-ink/60">
                      <MessagesSquare className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={conversation.status === 'concluido' ? 'success' : 'navy'}>
                          {CONVERSATION_STATUS_LABEL[conversation.status]}
                        </Badge>
                        {conversation.priority === 'emergencia' && (
                          <Badge tone="danger">Emergência</Badge>
                        )}
                        <span className="text-xs text-muted">
                          {formatFull(conversation.started_at)}
                        </span>
                      </div>
                      {conversation.ai_summary && (
                        <p className="mt-1 text-sm text-ink/75">{conversation.ai_summary}</p>
                      )}
                      <p className="mt-1 line-clamp-1 text-xs text-muted">
                        {conversation.last_message_text ?? 'Sem mensagens'}
                      </p>
                      <p className="mt-1 text-xs text-muted">
                        Responsável: {conversation.assignee?.full_name ?? '—'}
                        {conversation.closed_at ? ` · Concluído ${relativeFromNow(conversation.closed_at)}` : ''}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === 'conversas' && (
        <Card>
          <CardHeader title="Conversas" description="Mensagens trocadas com este cliente." />
          {!customerMessages || customerMessages.length === 0 ? (
            <EmptyState
              icon={MessageSquare}
              title="Nenhuma conversa registrada"
              description="As mensagens trocadas com este cliente aparecem aqui."
            />
          ) : (
            <ul className="divide-y divide-line">
              {customerMessages.map((message) => (
                <li key={message.id} className="px-5 py-3">
                  <div className="flex items-center gap-2 text-xs text-muted">
                    <Badge tone={message.direction === 'inbound' ? 'neutral' : message.sender === 'ia' ? 'cyan' : 'navy'}>
                      {message.direction === 'inbound'
                        ? 'Cliente'
                        : message.sender === 'ia'
                          ? 'IA'
                          : message.sender_profile?.full_name || 'Atendente'}
                    </Badge>
                    <span>{formatFull(message.sent_at ?? message.created_at)}</span>
                    {message.status === 'falhou' && <span className="text-red-600">não enviada</span>}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{message.body}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === 'historico' && (
        <Card>
          <CardHeader title="Linha do tempo" description="Tudo que aconteceu com este cliente." />
          {!events || events.length === 0 ? (
            <EmptyState icon={History} title="Sem histórico registrado" />
          ) : (
            <ul className="divide-y divide-line">
              {events.map((event) => (
                <TimelineItem key={event.id} event={event} />
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === 'observacoes' && (
        <NotesTab
          customerId={id}
          companyId={company?.id ?? ''}
          userId={user?.id ?? ''}
          notes={notes ?? []}
          canDeleteAny={canManage}
        />
      )}

      {tab === 'dados' && (
        <DataTab
          customerId={id}
          companyId={company?.id ?? ''}
          userId={user?.id}
          fields={fields ?? []}
          canDelete={canManage}
        />
      )}

      <EditCustomerModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        customerId={id}
        initial={{
          name: customer.name ?? '',
          phone: customer.phone,
          email: customer.email ?? '',
          company_name: customer.company_name ?? '',
          document: customer.document ?? '',
          owner_id: customer.owner_id ?? '',
        }}
        companyId={company?.id}
        onSaved={() => setFeedback('Cadastro atualizado.')}
      />

      <ConfirmDialog
        open={confirmArchive}
        onClose={() => setConfirmArchive(false)}
        loading={updateCustomer.isPending}
        title={customer.status === 'archived' ? 'Reativar cliente' : 'Arquivar cliente'}
        tone="primary"
        confirmLabel={customer.status === 'archived' ? 'Reativar' : 'Arquivar'}
        message={
          customer.status === 'archived'
            ? 'O cliente voltará a aparecer na lista de ativos. O histórico permanece intacto.'
            : 'O cliente sai da lista de ativos, mas todo o histórico e as conversas são preservados.'
        }
        onConfirm={async () => {
          await updateCustomer.mutateAsync({
            status: customer.status === 'archived' ? 'active' : 'archived',
          })
          setConfirmArchive(false)
          setFeedback(customer.status === 'archived' ? 'Cliente reativado.' : 'Cliente arquivado.')
        }}
      />

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        loading={deleteCustomer.isPending}
        title="Excluir cliente"
        confirmLabel="Excluir definitivamente"
        message={
          <>
            Esta ação remove <strong>permanentemente</strong> o cadastro de {nomeCliente}, junto com
            observações, dados coletados e histórico. Não é possível desfazer.
            <br />
            <br />
            Se quiser apenas tirar o cliente da lista sem destruir o histórico, use{' '}
            <strong>Arquivar</strong>.
          </>
        }
        onConfirm={async () => {
          await deleteCustomer.mutateAsync(id)
          navigate('/clientes')
        }}
      />
    </div>
  )
}

/* --------------------------------------------------------------- Auxiliares */

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-2xs uppercase tracking-label text-muted">{label}</dt>
      <dd className="mt-0.5 truncate text-base font-medium text-ink">{value}</dd>
    </div>
  )
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 py-3">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="min-w-0 text-right text-sm text-ink">{value || '—'}</dd>
    </div>
  )
}

function TimelineItem({
  event,
}: {
  event: { id: string; type: string; title: string; description: string | null; actor_type: ActorType; actor_name: string | null; created_at: string }
}) {
  const Icon = ACTOR_ICON[event.actor_type] ?? Clock
  const tone =
    event.actor_type === 'ia'
      ? 'bg-cyan-100 text-cyan-600'
      : event.actor_type === 'cliente'
        ? 'bg-orange-100 text-orange-600'
        : 'bg-ink/[0.06] text-ink/60'

  return (
    <li className="flex gap-3 px-5 py-3.5">
      <span className={cn('mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl', tone)}>
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink">{event.title}</p>
        {event.description && (
          <p className="mt-0.5 text-sm text-ink/70">{event.description}</p>
        )}
        <p className="mt-1 text-xs text-muted">
          {formatFull(event.created_at)}
          {event.actor_name ? ` · ${event.actor_name}` : ''}
        </p>
      </div>
    </li>
  )
}

/* ------------------------------------------------------------- Observações */

function NotesTab({
  customerId,
  companyId,
  userId,
  notes,
  canDeleteAny,
}: {
  customerId: string
  companyId: string
  userId: string
  notes: Array<{ id: string; body: string; created_at: string; author_id: string | null; author: { full_name: string } | null }>
  canDeleteAny: boolean
}) {
  const createNote = useCreateNote(companyId, customerId, userId)
  const deleteNote = useDeleteNote(customerId)
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!body.trim()) return
    setError(null)
    try {
      await createNote.mutateAsync(body)
      setBody('')
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <form onSubmit={submit} className="space-y-3">
          {error && <Alert tone="error">{error}</Alert>}
          <TextArea
            label="Nova observação interna"
            name="note"
            placeholder="Registre uma informação relevante sobre este cliente…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <Button type="submit" size="sm" loading={createNote.isPending} disabled={!body.trim()}>
            <Plus className="size-4" />
            Adicionar observação
          </Button>
        </form>
      </Card>

      <Card>
        {notes.length === 0 ? (
          <EmptyState
            icon={NotebookPen}
            title="Nenhuma observação registrada"
            description="As observações são visíveis apenas para a equipe interna."
          />
        ) : (
          <ul className="divide-y divide-line">
            {notes.map((note) => (
              <li key={note.id} className="flex gap-3 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <p className="whitespace-pre-wrap text-sm text-ink">{note.body}</p>
                  <p className="mt-1.5 text-xs text-muted">
                    {note.author?.full_name || 'Usuário removido'} · {formatFull(note.created_at)}
                  </p>
                </div>
                {(canDeleteAny || note.author_id === userId) && (
                  <button
                    type="button"
                    onClick={() => deleteNote.mutate(note.id)}
                    className="h-fit rounded-lg p-1.5 text-muted transition-colors hover:bg-red-50 hover:text-red-600"
                    aria-label="Excluir observação"
                  >
                    <Trash2 className="size-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

/* -------------------------------------------------------- Dados coletados */

function DataTab({
  customerId,
  companyId,
  userId,
  fields,
  canDelete,
}: {
  customerId: string
  companyId: string
  userId?: string
  fields: CustomerFieldRow[]
  canDelete: boolean
}) {
  const saveField = useSaveCustomerField(companyId, customerId, userId)
  const deleteField = useDeleteCustomerField(customerId)
  const [editing, setEditing] = useState<CustomerFieldRow | null>(null)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ label: '', value: '' })
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setForm({ label: editing?.label ?? '', value: editing?.value ?? '' })
      setError(null)
    }
  }, [open, editing])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    try {
      await saveField.mutateAsync({
        id: editing?.id,
        key: editing?.key ?? '',
        label: form.label,
        value: form.value,
      })
      setOpen(false)
      setEditing(null)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <>
      <Card>
        <CardHeader
          title="Informações coletadas"
          description="Dados informados pelo cliente, capturados pela IA ou preenchidos pela equipe."
          action={
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setEditing(null)
                setOpen(true)
              }}
            >
              <Plus className="size-4" />
              Adicionar
            </Button>
          }
        />
        {fields.length === 0 ? (
          <EmptyState
            icon={NotebookPen}
            title="Nenhuma informação coletada"
            description="A IA registra aqui os dados que o cliente informar durante o atendimento."
          />
        ) : (
          <ul className="divide-y divide-line">
            {fields.map((field) => (
              <li key={field.id} className="flex items-start gap-3 px-5 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="text-xs uppercase tracking-label text-muted">{field.label}</p>
                  <p className="mt-0.5 text-sm text-ink">{field.value}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                    <Badge tone={field.source === 'ia' ? 'cyan' : 'neutral'}>
                      {SOURCE_LABEL[field.source]}
                    </Badge>
                    <span>atualizado {relativeFromNow(field.updated_at)}</span>
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(field)
                      setOpen(true)
                    }}
                    className="rounded-lg p-1.5 text-muted transition-colors hover:bg-ink/[0.05] hover:text-ink"
                    aria-label="Editar informação"
                  >
                    <Pencil className="size-4" />
                  </button>
                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => deleteField.mutate(field.id)}
                      className="rounded-lg p-1.5 text-muted transition-colors hover:bg-red-50 hover:text-red-600"
                      aria-label="Excluir informação"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? 'Editar informação' : 'Nova informação'}
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" form="field-form" loading={saveField.isPending}>
              Salvar
            </Button>
          </>
        }
      >
        <form id="field-form" onSubmit={submit} className="space-y-4">
          {error && <Alert tone="error">{error}</Alert>}
          <Field
            label="Título"
            name="label"
            required
            placeholder="Ex.: Veículo, Placa, Frota"
            value={form.label}
            onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
          />
          <Field
            label="Valor"
            name="value"
            required
            placeholder="Ex.: Scania R450"
            value={form.value}
            onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
          />
        </form>
      </Modal>
    </>
  )
}

/* ------------------------------------------------------------ Edição base */

function EditCustomerModal({
  open,
  onClose,
  customerId,
  initial,
  companyId,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  customerId: string
  initial: {
    name: string
    phone: string
    email: string
    company_name: string
    document: string
    owner_id: string
  }
  companyId?: string
  onSaved: () => void
}) {
  const { data: members } = useCompanyMembers(companyId)
  const update = useUpdateCustomer(customerId)
  const [form, setForm] = useState(initial)
  const [error, setError] = useState<string | null>(null)

  const initialKey = useMemo(() => JSON.stringify(initial), [initial])
  useEffect(() => {
    if (open) {
      setForm(initial)
      setError(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialKey])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (!isValidPhone(form.phone)) {
      setError('Informe um telefone válido com DDD.')
      return
    }
    try {
      await update.mutateAsync({ ...form, owner_id: form.owner_id || null })
      onSaved()
      onClose()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Editar cliente"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={update.isPending}>
            Cancelar
          </Button>
          <Button type="submit" form="edit-customer-form" loading={update.isPending}>
            Salvar alterações
          </Button>
        </>
      }
    >
      <form id="edit-customer-form" onSubmit={submit} className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <Field
          label="Nome"
          name="name"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        />
        <Field
          label="Telefone / WhatsApp"
          name="phone"
          required
          value={maskPhoneInput(form.phone)}
          onChange={(e) => setForm((f) => ({ ...f, phone: maskPhoneInput(e.target.value) }))}
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
