import { useEffect, useState, type FormEvent } from 'react'
import { Bot, Pencil, Plus, Tags, Trash2 } from 'lucide-react'
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  SkeletonList,
  Select,
  TextArea,
} from '@/components/ui'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import {
  CORES_ETIQUETA,
  NOMES_PADRAO,
  toneDaEtiqueta,
  useDeleteTag,
  useSaveTag,
  useSaveWorkspaceLabels,
  useTags,
  useWorkspaceLabels,
} from '@/features/tags/api'
import { useAuth } from '@/contexts/AuthContext'
import type { TagColor, TagRow } from '@/types/database'

/**
 * Etiquetas e vocabulário da operação.
 *
 * Duas coisas que o sistema não deveria decidir sozinho: como a empresa
 * classifica um atendimento e como ela chama as próprias telas. Cada oficina
 * fala de um jeito.
 */
export function TagsSettings({ canManage }: { canManage: boolean }) {
  const { company } = useAuth()
  const { data: tags, isLoading } = useTags(company?.id)
  const remover = useDeleteTag()

  const [editando, setEditando] = useState<TagRow | null>(null)
  const [criando, setCriando] = useState(false)
  const [aRemover, setARemover] = useState<TagRow | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const daIa = (tags ?? []).filter((t) => t.is_ai_assignable).length

  return (
    <div className="space-y-4">
      {erro && <Alert tone="error">{erro}</Alert>}

      <Card>
        <CardHeader
          title="Etiquetas do atendimento"
          description="Servem para o atendente marcar à mão e para a IA classificar automaticamente."
          action={
            canManage ? (
              <Button size="sm" onClick={() => setCriando(true)}>
                <Plus className="size-4" />
                Nova etiqueta
              </Button>
            ) : undefined
          }
        />

        {(tags?.length ?? 0) > 0 && (
          <div className="border-b border-line px-4 py-2.5 text-xs leading-snug text-ink/60 sm:px-5">
            {daIa === 0 ? (
              <>Nenhuma etiqueta está liberada para a IA — todas dependem de alguém marcar.</>
            ) : (
              <>
                A IA pode aplicar <strong>{daIa}</strong> de {tags!.length}. Ela só usa etiqueta que
                já existe: nunca cria nome novo.
              </>
            )}
          </div>
        )}

        {isLoading ? (
          <SkeletonList rows={4} />
        ) : !tags || tags.length === 0 ? (
          <EmptyState
            icon={Tags}
            title="Nenhuma etiqueta cadastrada"
            description="Crie as marcações que a operação usa no dia a dia — socorro, orçamento, garantia, frota."
            action={
              canManage ? (
                <Button onClick={() => setCriando(true)}>
                  <Plus className="size-4" />
                  Nova etiqueta
                </Button>
              ) : undefined
            }
          />
        ) : (
          <ul className="divide-y divide-line">
            {tags.map((tag) => (
              <li key={tag.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                <div className="min-w-[160px] flex-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <Badge tone={toneDaEtiqueta(tag.color)} dot>
                      {tag.name}
                    </Badge>
                    {tag.is_ai_assignable && (
                      <span className="inline-flex items-center gap-1 text-2xs text-cyan-600">
                        <Bot className="size-3" />
                        IA pode aplicar
                      </span>
                    )}
                  </p>
                  {tag.description && (
                    <p className="mt-1 text-xs leading-snug text-muted">{tag.description}</p>
                  )}
                </div>
                {canManage && (
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button size="sm" variant="outline" onClick={() => setEditando(tag)}>
                      <Pencil className="size-4" />
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setARemover(tag)}>
                      <Trash2 className="size-4 text-red-600" />
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <NomesDaOperacao canManage={canManage} />

      <TagModal
        open={criando || Boolean(editando)}
        tag={editando}
        proximaPosicao={(tags?.length ?? 0) + 1}
        onClose={() => {
          setCriando(false)
          setEditando(null)
        }}
      />

      <ConfirmDialog
        open={Boolean(aRemover)}
        tone="danger"
        icon={Trash2}
        title="Remover esta etiqueta?"
        description={
          aRemover
            ? `"${aRemover.name}" sai de todos os atendimentos que a usam. O histórico das conversas continua intacto.`
            : ''
        }
        confirmLabel="Remover"
        loading={remover.isPending}
        onClose={() => setARemover(null)}
        onConfirm={async () => {
          if (!aRemover) return
          try {
            await remover.mutateAsync(aRemover.id)
          } catch (err) {
            setErro((err as Error).message)
          }
          setARemover(null)
        }}
      />
    </div>
  )
}

function TagModal({
  open,
  tag,
  proximaPosicao,
  onClose,
}: {
  open: boolean
  tag: TagRow | null
  proximaPosicao: number
  onClose: () => void
}) {
  const { company } = useAuth()
  const salvar = useSaveTag(company?.id)
  const [form, setForm] = useState({
    name: '',
    color: 'neutral' as TagColor,
    description: '',
    is_ai_assignable: true,
  })
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setForm({
      name: tag?.name ?? '',
      color: tag?.color ?? 'neutral',
      description: tag?.description ?? '',
      is_ai_assignable: tag?.is_ai_assignable ?? true,
    })
    setErro(null)
  }, [open, tag])

  async function submeter(event: FormEvent) {
    event.preventDefault()
    setErro(null)
    if (!form.name.trim()) {
      setErro('Dê um nome à etiqueta.')
      return
    }
    try {
      await salvar.mutateAsync({
        id: tag?.id,
        name: form.name.trim(),
        color: form.color,
        description: form.description.trim() || null,
        is_ai_assignable: form.is_ai_assignable,
        position: tag?.position ?? proximaPosicao,
      })
      onClose()
    } catch (err) {
      setErro((err as Error).message)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={tag ? 'Editar etiqueta' : 'Nova etiqueta'}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={salvar.isPending}>
            Cancelar
          </Button>
          <Button type="submit" form="tag-form" loading={salvar.isPending}>
            Salvar
          </Button>
        </>
      }
    >
      <form id="tag-form" onSubmit={submeter} className="space-y-4">
        {erro && <Alert tone="error">{erro}</Alert>}

        <Field
          label="Nome"
          name="name"
          required
          autoFocus
          placeholder="Socorro na estrada"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        />

        <Select
          label="Cor"
          name="color"
          value={form.color}
          onChange={(e) => setForm((f) => ({ ...f, color: e.target.value as TagColor }))}
        >
          {CORES_ETIQUETA.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </Select>

        <div className="flex items-center gap-2 rounded-xl bg-canvas px-3 py-2.5">
          <span className="text-xs text-muted">Fica assim:</span>
          <Badge tone={toneDaEtiqueta(form.color)} dot>
            {form.name.trim() || 'Etiqueta'}
          </Badge>
        </div>

        <TextArea
          label="Quando usar (opcional)"
          name="description"
          hint="A IA lê isto para decidir se a etiqueta se aplica. Seja específico."
          placeholder="Cliente parado na rodovia precisando de atendimento no local."
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
        />

        <label className="flex items-start gap-2.5 text-sm text-ink">
          <input
            type="checkbox"
            checked={form.is_ai_assignable}
            onChange={(e) => setForm((f) => ({ ...f, is_ai_assignable: e.target.checked }))}
            className="mt-0.5 size-4 shrink-0 rounded border-muted accent-orange-500"
          />
          <span>
            A IA pode aplicar esta etiqueta
            <span className="mt-0.5 block text-xs leading-snug text-muted">
              Desmarque para marcações que exigem julgamento humano, como "cliente VIP".
            </span>
          </span>
        </label>
      </form>
    </Modal>
  )
}

/* --------------------------------------- Como a empresa chama as próprias telas */

function NomesDaOperacao({ canManage }: { canManage: boolean }) {
  const { company } = useAuth()
  const { data } = useWorkspaceLabels(company?.id)
  const salvar = useSaveWorkspaceLabels(company?.id)
  const [form, setForm] = useState(NOMES_PADRAO)
  const [aviso, setAviso] = useState<{ tom: 'success' | 'error'; texto: string } | null>(null)

  useEffect(() => {
    if (data) {
      setForm({
        queue_name: data.queue_name,
        queue_name_singular: data.queue_name_singular,
        tag_name: data.tag_name,
        funnel_name: data.funnel_name,
      })
    }
  }, [data])

  return (
    <Card>
      <CardHeader
        title="Nomes usados na operação"
        description="Cada empresa chama de um jeito. Ajuste para o vocabulário da sua equipe."
      />
      <form
        className="space-y-4 p-4 sm:p-5"
        onSubmit={async (event) => {
          event.preventDefault()
          setAviso(null)
          try {
            await salvar.mutateAsync(form)
            setAviso({ tom: 'success', texto: 'Nomes atualizados.' })
          } catch (err) {
            setAviso({ tom: 'error', texto: (err as Error).message })
          }
        }}
      >
        {aviso && <Alert tone={aviso.tom}>{aviso.texto}</Alert>}
        {!canManage && <Alert tone="info">Você não tem permissão para alterar estes nomes.</Alert>}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Nome da fila (plural)"
            name="queue_name"
            disabled={!canManage}
            hint="Ex.: Atendimentos, Chamados, Conversas."
            value={form.queue_name}
            onChange={(e) => setForm((f) => ({ ...f, queue_name: e.target.value }))}
          />
          <Field
            label="Nome da fila (singular)"
            name="queue_name_singular"
            disabled={!canManage}
            hint="Ex.: Atendimento, Chamado."
            value={form.queue_name_singular}
            onChange={(e) => setForm((f) => ({ ...f, queue_name_singular: e.target.value }))}
          />
          <Field
            label="Como chamar as etiquetas"
            name="tag_name"
            disabled={!canManage}
            hint="Ex.: Etiquetas, Tags, Marcadores."
            value={form.tag_name}
            onChange={(e) => setForm((f) => ({ ...f, tag_name: e.target.value }))}
          />
          <Field
            label="Como chamar o funil"
            name="funnel_name"
            disabled={!canManage}
            hint="Ex.: Funil, Fluxo, Etapas."
            value={form.funnel_name}
            onChange={(e) => setForm((f) => ({ ...f, funnel_name: e.target.value }))}
          />
        </div>

        {canManage && (
          <Button type="submit" loading={salvar.isPending}>
            Salvar nomes
          </Button>
        )}
      </form>
    </Card>
  )
}
