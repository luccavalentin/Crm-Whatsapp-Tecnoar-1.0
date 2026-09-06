import { useEffect, useState, type FormEvent } from 'react'
import { CircleAlert, Pencil, Plus, ShieldAlert, Trash2 } from 'lucide-react'
import { Alert, Badge, Button, Card, CardHeader, EmptyState, Field, SkeletonList } from '@/components/ui'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import {
  useDeleteEmergencyContact,
  useEmergencyContacts,
  useEmergencyDispatches,
  useSaveEmergencyContact,
  type EmergencyContactRow,
} from '@/features/emergency/api'
import { formatFull } from '@/lib/datetime'
import { formatPhone, isValidPhone, maskPhoneInput, normalizePhone } from '@/lib/phone'
import { cn } from '@/lib/utils'

/**
 * Plantão de emergência: quem a IA aciona quando o cliente relata urgência.
 * O primeiro da lista é o telefone que a IA oferece ao cliente.
 */
export function EmergencyContacts({
  companyId,
  canManage,
}: {
  companyId: string | undefined
  canManage: boolean
}) {
  const { data: contacts, isLoading, error } = useEmergencyContacts(companyId)
  const { data: dispatches } = useEmergencyDispatches(companyId)
  const remove = useDeleteEmergencyContact()

  const [editing, setEditing] = useState<EmergencyContactRow | null>(null)
  const [creating, setCreating] = useState(false)
  const [toDelete, setToDelete] = useState<EmergencyContactRow | null>(null)
  const [problem, setProblem] = useState<string | null>(null)

  const ativos = (contacts ?? []).filter((contact) => contact.is_active)

  return (
    <div className="space-y-4">
      {problem && <Alert tone="error">{problem}</Alert>}

      <Card>
        <CardHeader
          title="Plantão de emergência"
          description="Quem recebe o aviso quando a IA identifica uma emergência no atendimento."
          action={
            canManage ? (
              <Button size="sm" onClick={() => setCreating(true)}>
                <Plus className="size-4" />
                Adicionar contato
              </Button>
            ) : undefined
          }
        />

        <div className="border-b border-line px-5 py-3.5">
          {ativos.length === 0 ? (
            <p className="flex items-start gap-2 text-xs leading-snug text-orange-600">
              <CircleAlert className="mt-0.5 size-4 shrink-0" />
              Sem contato ativo, a IA reconhece a emergência e encaminha para um atendente, mas
              não avisa ninguém por WhatsApp nem passa telefone para o cliente.
            </p>
          ) : (
            <p className="text-xs leading-snug text-ink/60">
              A IA avisa <strong>{ativos.map((c) => c.name).join(', ')}</strong> pelo WhatsApp com o
              nome, o telefone e a localização do cliente. O telefone de{' '}
              <strong>{ativos[0].name}</strong> é oferecido ao cliente para contato direto.
            </p>
          )}
        </div>

        {isLoading ? (
          <SkeletonList rows={3} />
        ) : error ? (
          <div className="p-5">
            <Alert tone="error">Não foi possível carregar os contatos: {error.message}</Alert>
          </div>
        ) : !contacts || contacts.length === 0 ? (
          <EmptyState
            icon={ShieldAlert}
            title="Nenhum contato de emergência"
            description="Cadastre quem deve ser acionado quando um cliente relatar urgência."
            action={
              canManage ? (
                <Button onClick={() => setCreating(true)}>
                  <Plus className="size-4" />
                  Adicionar contato
                </Button>
              ) : undefined
            }
          />
        ) : (
          <ul className="divide-y divide-line">
            {contacts.map((contact, index) => (
              <li key={contact.id} className="flex items-center gap-3 px-5 py-3.5">
                <span
                  className={cn(
                    'flex size-8 shrink-0 items-center justify-center rounded-lg text-xs font-semibold tabular-nums',
                    contact.is_active
                      ? 'bg-red-50 text-red-600'
                      : 'bg-ink/[0.05] text-muted',
                  )}
                >
                  {index + 1}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
                    {contact.name}
                    {contact.role && <Badge tone="neutral">{contact.role}</Badge>}
                    {!contact.is_active && <Badge tone="neutral">Inativo</Badge>}
                    {index === 0 && contact.is_active && (
                      <Badge tone="cyan">Telefone passado ao cliente</Badge>
                    )}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted">
                    {formatPhone(contact.phone)}
                    {contact.notes ? ` · ${contact.notes}` : ''}
                  </p>
                </div>

                {canManage && (
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button size="sm" variant="outline" onClick={() => setEditing(contact)}>
                      <Pencil className="size-4" />
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setToDelete(contact)}>
                      <Trash2 className="size-4 text-red-600" />
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Avisos enviados"
          description="Cada acionamento fica registrado com o resultado real do envio."
        />
        {!dispatches || dispatches.length === 0 ? (
          <EmptyState
            icon={ShieldAlert}
            title="Nenhum aviso enviado"
            description="Os acionamentos aparecem aqui assim que a primeira emergência acontecer."
          />
        ) : (
          <ul className="divide-y divide-line">
            {dispatches.map((dispatch) => (
              <li key={dispatch.id} className="flex items-center gap-3 px-5 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-ink">
                    {dispatch.contact_name} · {formatPhone(dispatch.contact_phone)}
                  </span>
                  <span className="block text-xs text-muted">
                    {formatFull(dispatch.created_at)}
                    {dispatch.error_message ? ` · ${dispatch.error_message}` : ''}
                  </span>
                </span>
                <Badge tone={dispatch.ok ? 'success' : 'danger'}>
                  {dispatch.ok ? 'Entregue' : 'Falhou'}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <ContactModal
        open={creating || Boolean(editing)}
        companyId={companyId}
        contact={editing}
        nextPosition={(contacts?.length ?? 0) + 1}
        onClose={() => {
          setCreating(false)
          setEditing(null)
        }}
      />

      <ConfirmDialog
        open={Boolean(toDelete)}
        tone="danger"
        icon={Trash2}
        title="Remover este contato?"
        description={
          toDelete
            ? `${toDelete.name} deixa de ser avisado nas emergências. Os avisos já enviados continuam registrados.`
            : ''
        }
        confirmLabel="Remover"
        loading={remove.isPending}
        onClose={() => setToDelete(null)}
        onConfirm={async () => {
          if (!toDelete) return
          try {
            await remove.mutateAsync(toDelete.id)
          } catch (err) {
            setProblem((err as Error).message)
          }
          setToDelete(null)
        }}
      />
    </div>
  )
}

function ContactModal({
  open,
  companyId,
  contact,
  nextPosition,
  onClose,
}: {
  open: boolean
  /** Vem de fora: ao criar, `contact` é nulo e não teria de onde tirar a
      empresa — era isso que fazia todo cadastro novo falhar com company_id
      vazio, enquanto editar funcionava. */
  companyId: string | undefined
  contact: EmergencyContactRow | null
  nextPosition: number
  onClose: () => void
}) {
  const save = useSaveEmergencyContact(companyId)
  const [form, setForm] = useState({ name: '', phone: '', role: '', notes: '', is_active: true })
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setForm({
      name: contact?.name ?? '',
      phone: contact ? formatPhone(contact.phone) : '',
      role: contact?.role ?? '',
      notes: contact?.notes ?? '',
      is_active: contact?.is_active ?? true,
    })
    setError(null)
  }, [open, contact])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError(null)

    if (!form.name.trim()) {
      setError('Informe o nome de quem será acionado.')
      return
    }
    const telefone = normalizePhone(form.phone)
    if (!isValidPhone(form.phone) || !telefone) {
      setError('Informe um telefone de WhatsApp válido com DDD.')
      return
    }
    if (!contact && !companyId) {
      setError('Não foi possível identificar a empresa. Recarregue a página e tente de novo.')
      return
    }

    try {
      await save.mutateAsync({
        id: contact?.id,
        name: form.name.trim(),
        phone: telefone,
        role: form.role.trim() || null,
        notes: form.notes.trim() || null,
        is_active: form.is_active,
        position: contact?.position ?? nextPosition,
      })
      onClose()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={contact ? 'Editar contato de emergência' : 'Novo contato de emergência'}
      description="Esta pessoa recebe o aviso no WhatsApp com os dados do cliente."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>
            Cancelar
          </Button>
          <Button type="submit" form="emergency-contact-form" loading={save.isPending}>
            Salvar
          </Button>
        </>
      }
    >
      <form id="emergency-contact-form" onSubmit={submit} className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}

        <Field
          label="Nome"
          name="name"
          required
          autoFocus
          placeholder="Nome de quem atende"
          hint="É por este nome que a IA vai chamar a pessoa no aviso."
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        />

        <Field
          label="WhatsApp"
          name="phone"
          required
          placeholder="(11) 98888-7777"
          value={form.phone}
          onChange={(e) => setForm((f) => ({ ...f, phone: maskPhoneInput(e.target.value) }))}
        />

        <Field
          label="Função (opcional)"
          name="role"
          placeholder="Socorro mecânico"
          value={form.role}
          onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
        />

        <Field
          label="Observação (opcional)"
          name="notes"
          placeholder="Plantão noturno e fins de semana"
          value={form.notes}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
        />

        <label className="flex items-center gap-2.5 text-sm text-ink">
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
            className="size-4 rounded border-muted accent-orange-500"
          />
          Acionar este contato nas emergências
        </label>
      </form>
    </Modal>
  )
}
