import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { BookOpen, CircleAlert, Pencil, Plus, Trash2 } from 'lucide-react'
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  SectionTitle,
  SkeletonPanel,
  TextArea,
} from '@/components/ui'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import {
  CAMPOS_CONHECIMENTO,
  useCompanyKnowledge,
  useDeleteFaq,
  useFaq,
  useSaveCompanyKnowledge,
  useSaveFaq,
  type FaqRow,
  type KnowledgeForm,
} from '@/features/knowledge/api'
import { useAuth } from '@/contexts/AuthContext'

const VAZIO: KnowledgeForm = {
  business_name: null, address: null, maps_url: null, hours: null, whatsapp: null,
  services: null, specialties: null, service_regions: null, payment_methods: null,
  quote_policy: null, warranty_policy: null, average_lead_times: null,
  blocked_topics: null, human_transfer_rules: null,
}

/**
 * A base que autoriza a IA a afirmar alguma coisa.
 *
 * O contador de campos vazios fica no topo de propósito: cada lacuna aqui é
 * uma pergunta que o cliente vai fazer e a IA vai ter que devolver com
 * "vou confirmar com a equipe".
 */
export function KnowledgeTab({ canManage }: { canManage: boolean }) {
  const { company, profile } = useAuth()
  const { data: base, isLoading } = useCompanyKnowledge(company?.id)
  const salvar = useSaveCompanyKnowledge(company?.id)

  const [form, setForm] = useState<KnowledgeForm>(VAZIO)
  const [aviso, setAviso] = useState<{ tom: 'success' | 'error'; texto: string } | null>(null)

  useEffect(() => {
    if (base) {
      const { company_id: _c, updated_at: _u, updated_by: _b, ...resto } = base
      setForm(resto)
    }
  }, [base])

  const vazios = useMemo(
    () => CAMPOS_CONHECIMENTO.filter((c) => !form[c.key] || !String(form[c.key]).trim()).length,
    [form],
  )

  async function submeter(event: FormEvent) {
    event.preventDefault()
    setAviso(null)
    try {
      await salvar.mutateAsync({ ...form, updated_by: profile?.id } as KnowledgeForm)
      setAviso({ tom: 'success', texto: 'Base atualizada. A IA já usa nas próximas mensagens.' })
    } catch (err) {
      setAviso({ tom: 'error', texto: (err as Error).message })
    }
  }

  if (isLoading) return <SkeletonPanel rows={5} />

  return (
    <div className="space-y-4">
      {aviso && <Alert tone={aviso.tom}>{aviso.texto}</Alert>}

      {vazios > 0 && (
        <Alert tone="warning">
          <strong className="font-medium">
            {vazios} {vazios === 1 ? 'campo ainda não preenchido' : 'campos ainda não preenchidos'}.
          </strong>{' '}
          Enquanto estiverem vazios, a IA não afirma nada sobre eles — ela responde que vai
          confirmar com a equipe. Isso é proposital: é o que impede resposta inventada.
        </Alert>
      )}

      <Card>
        <CardHeader
          title="Base oficial da empresa"
          description="A única fonte que a IA pode usar para afirmar endereço, horário, preço, prazo, garantia e região."
        />
        <form onSubmit={submeter} className="space-y-4 p-4 sm:p-5">
          {!canManage && (
            <Alert tone="info">Você não tem permissão para alterar a base de conhecimento.</Alert>
          )}

          {CAMPOS_CONHECIMENTO.map((campo) =>
            campo.longo ? (
              <TextArea
                key={campo.key}
                label={campo.label}
                name={campo.key}
                hint={campo.hint}
                disabled={!canManage}
                value={form[campo.key] ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, [campo.key]: e.target.value }))}
              />
            ) : (
              <Field
                key={campo.key}
                label={campo.label}
                name={campo.key}
                hint={campo.hint}
                disabled={!canManage}
                value={form[campo.key] ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, [campo.key]: e.target.value }))}
              />
            ),
          )}

          {canManage && (
            <Button type="submit" loading={salvar.isPending}>
              Salvar base
            </Button>
          )}
        </form>
      </Card>

      <FaqCard canManage={canManage} />
    </div>
  )
}

/* ------------------------------------------------------ Respostas aprovadas */

function FaqCard({ canManage }: { canManage: boolean }) {
  const { company } = useAuth()
  const { data: faq, isLoading } = useFaq(company?.id)
  const remover = useDeleteFaq()

  const [editando, setEditando] = useState<FaqRow | null>(null)
  const [criando, setCriando] = useState(false)
  const [aRemover, setARemover] = useState<FaqRow | null>(null)

  return (
    <Card>
      <CardHeader
        title="Respostas aprovadas"
        description="Perguntas frequentes com resposta escrita e validada por uma pessoa."
        action={
          canManage ? (
            <Button size="sm" onClick={() => setCriando(true)}>
              <Plus className="size-4" />
              Nova resposta
            </Button>
          ) : undefined
        }
      />

      {isLoading ? (
        <SkeletonPanel rows={5} />
      ) : !faq || faq.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="Nenhuma resposta aprovada"
          description="Cadastre as perguntas que o cliente mais faz. A IA só repete o que estiver aqui."
          action={
            canManage ? (
              <Button onClick={() => setCriando(true)}>
                <Plus className="size-4" />
                Nova resposta
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="divide-y divide-line">
          {faq.map((item) => (
            <li key={item.id} className="flex items-start gap-3 px-4 py-3.5 sm:px-5">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
                  {item.question}
                  {!item.is_active && <Badge tone="neutral">Desativada</Badge>}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-ink/70">
                  {item.answer}
                </p>
              </div>
              {canManage && (
                <div className="flex shrink-0 items-center gap-1.5">
                  <Button size="sm" variant="outline" onClick={() => setEditando(item)}>
                    <Pencil className="size-4" />
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setARemover(item)}>
                    <Trash2 className="size-4 text-red-600" />
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <FaqModal
        open={criando || Boolean(editando)}
        item={editando}
        onClose={() => {
          setCriando(false)
          setEditando(null)
        }}
      />

      <ConfirmDialog
        open={Boolean(aRemover)}
        tone="danger"
        icon={Trash2}
        title="Remover esta resposta?"
        description={
          aRemover ? `A IA deixa de responder "${aRemover.question}" e passa a encaminhar para a equipe.` : ''
        }
        confirmLabel="Remover"
        loading={remover.isPending}
        onClose={() => setARemover(null)}
        onConfirm={async () => {
          if (aRemover) await remover.mutateAsync(aRemover.id).catch(() => {})
          setARemover(null)
        }}
      />
    </Card>
  )
}

function FaqModal({
  open,
  item,
  onClose,
}: {
  open: boolean
  item: FaqRow | null
  onClose: () => void
}) {
  const { company } = useAuth()
  const salvar = useSaveFaq(company?.id)
  const [form, setForm] = useState({ question: '', answer: '', is_active: true })
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setForm({
      question: item?.question ?? '',
      answer: item?.answer ?? '',
      is_active: item?.is_active ?? true,
    })
    setErro(null)
  }, [open, item])

  async function submeter(event: FormEvent) {
    event.preventDefault()
    setErro(null)
    if (!form.question.trim() || !form.answer.trim()) {
      setErro('Pergunta e resposta são obrigatórias.')
      return
    }
    try {
      await salvar.mutateAsync({ id: item?.id, ...form })
      onClose()
    } catch (err) {
      setErro((err as Error).message)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={item ? 'Editar resposta aprovada' : 'Nova resposta aprovada'}
      description="A IA usa este texto como resposta oficial. Escreva como você falaria com o cliente."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={salvar.isPending}>
            Cancelar
          </Button>
          <Button type="submit" form="faq-form" loading={salvar.isPending}>
            Salvar
          </Button>
        </>
      }
    >
      <form id="faq-form" onSubmit={submeter} className="space-y-4">
        {erro && <Alert tone="error">{erro}</Alert>}
        <Field
          label="Pergunta do cliente"
          name="question"
          required
          autoFocus
          placeholder="Vocês atendem na estrada?"
          value={form.question}
          onChange={(e) => setForm((f) => ({ ...f, question: e.target.value }))}
        />
        <TextArea
          label="Resposta oficial"
          name="answer"
          required
          placeholder="Sim, atendemos socorro na estrada em…"
          hint="Frases curtas. A IA vai usar quase palavra por palavra."
          value={form.answer}
          onChange={(e) => setForm((f) => ({ ...f, answer: e.target.value }))}
        />
        <label className="flex items-center gap-2.5 text-sm text-ink">
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
            className="size-4 rounded border-muted accent-orange-500"
          />
          A IA pode usar esta resposta
        </label>
      </form>
    </Modal>
  )
}

/* Reexportado para a aba de aprendizado usar o mesmo aviso visual. */
export function SemBase() {
  return (
    <p className="flex items-start gap-2 text-xs leading-snug text-orange-600">
      <CircleAlert className="mt-0.5 size-4 shrink-0" />
      Sem base preenchida, a IA só consegue perguntar e encaminhar.
    </p>
  )
}

export { SectionTitle }
