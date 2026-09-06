import { useEffect, useState, type FormEvent } from 'react'
import {
  Bot,
  CheckCircle2,
  KeyRound,
  Plus,
  Sparkles,
  Trash2,
  TriangleAlert,
  Wand2,
} from 'lucide-react'
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  EscolhaSimples,
  Field,
  SectionTitle,
  Select,
  SkeletonPage,
  Tabs,
  TextArea,
} from '@/components/ui'
import { ConfirmDialog, Modal } from '@/components/ui/Modal'
import { usePageChrome } from '@/components/layout/AppLayout'
import { KnowledgeTab } from '@/components/ia/KnowledgeTab'
import { LearningTab } from '@/components/ia/LearningTab'
import { useAuth } from '@/contexts/AuthContext'
import {
  AI_SETTINGS_DEFAULT,
  PROVIDER_DEFAULT_MODEL,
  PROVIDER_MODELS,
  PROVIDER_KEY_HELP,
  PROVIDER_LABEL,
  useAiProviders,
  useAiSettings,
  useAiTokensHoje,
  useDeleteAiProvider,
  useSaveAiProvider,
  useSaveAiSettings,
  useSetAiProviderRole,
  useTestAiProvider,
} from '@/features/ai/api'
import { formatFull, relativeFromNow } from '@/lib/datetime'
import { cn } from '@/lib/utils'
import type { AiProviderName, AiProviderPublicRow, AiRole } from '@/types/database'

type TabKey = 'provedores' | 'comportamento' | 'conhecimento' | 'aprendizado'

const ROLE_LABEL: Record<AiRole, string> = {
  principal: 'Principal',
  reserva: 'Reserva',
  inativo: 'Inativa',
}

/* ------------------------------------------------- Números em português */

/**
 * O sistema guarda números; quem configura decide em palavras.
 *
 * "Confiança mínima: 0.6" é uma pergunta que só quem escreveu o código
 * responde. As tabelas abaixo traduzem cada decisão para o vocabulário de
 * quem toca a oficina — e de volta, porque o motor da IA continua lendo o
 * número.
 */
const CAUTELA = {
  cautelosa: { valor: 0.8 },
  equilibrada: { valor: 0.6 },
  solta: { valor: 0.4 },
} as const
type NivelCautela = keyof typeof CAUTELA

function nivelDeCautela(valor: number): NivelCautela {
  if (valor >= 0.75) return 'cautelosa'
  if (valor <= 0.45) return 'solta'
  return 'equilibrada'
}

const TAMANHO = {
  curta: { valor: 320 },
  media: { valor: 600 },
  longa: { valor: 1100 },
} as const
type NivelTamanho = keyof typeof TAMANHO

function tamanhoDaResposta(valor: number): NivelTamanho {
  if (valor <= 420) return 'curta'
  if (valor >= 900) return 'longa'
  return 'media'
}

/**
 * Token é unidade de cobrança do provedor de IA, não de atendimento — ninguém
 * na oficina sabe dizer se 2 milhões é muito ou pouco. Já "quantas respostas
 * por dia" é uma decisão que o dono do negócio toma sem pensar.
 *
 * A média sai do tamanho real do que enviamos: a instrução com a base da
 * empresa, o histórico da conversa e a resposta. Gira em torno de 4.500 tokens
 * por resposta. É estimativa, e é por isso que a tela fala em "respostas",
 * no plural aproximado, e não em centavos.
 */
const TOKENS_POR_RESPOSTA = 4_500

function tokensParaRespostas(tokens: number): number {
  return Math.round(tokens / TOKENS_POR_RESPOSTA)
}

function respostasParaTokens(respostas: number): number {
  return Math.max(0, Math.round(respostas)) * TOKENS_POR_RESPOSTA
}

export function IAPage() {
  const { company, profile } = useAuth()
  const [tab, setTab] = useState<TabKey>('provedores')
  const [modalProvider, setModalProvider] = useState<AiProviderName | null>(null)
  const [editing, setEditing] = useState<AiProviderPublicRow | null>(null)
  const [toDelete, setToDelete] = useState<AiProviderPublicRow | null>(null)
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)

  const canManage = profile ? ['owner', 'admin', 'manager'].includes(profile.role) : false
  const { data: providers, isLoading } = useAiProviders(company?.id)
  const testProvider = useTestAiProvider()
  const setRole = useSetAiProviderRole()
  const deleteProvider = useDeleteAiProvider()

  usePageChrome(
    {
      actions: canManage ? (
        <Button size="sm" onClick={() => setModalProvider('gemini')}>
          <Plus className="size-4" />
          <span className="hidden sm:inline">Adicionar chave</span>
        </Button>
      ) : undefined,
    },
    [canManage],
  )

  const configured = providers ?? []
  const active = configured.find((p) => p.role === 'principal')

  return (
    <div className="animate-in-fade mx-auto max-w-4xl px-4 py-5 sm:px-6 sm:py-6">
      <Tabs
        className="mb-4"
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'provedores', label: 'Chave de IA', count: configured.length },
          { key: 'comportamento', label: 'Como ela atende' },
          { key: 'conhecimento', label: 'O que ela sabe' },
          { key: 'aprendizado', label: 'O que ela não soube' },
        ]}
      />

      {feedback && (
        <div className="mb-4">
          <Alert tone={feedback.tone}>{feedback.text}</Alert>
        </div>
      )}

      {tab === 'provedores' && (
        <>
          {!active && !isLoading && (
            <div className="mb-4">
              <Alert tone="warning">
                A inteligência artificial precisa ser configurada. Sem um provedor principal ativo,
                a IA não responde e os atendimentos ficam aguardando um humano.
              </Alert>
            </div>
          )}

          <Card>
            <CardHeader
              title="Chave de IA"
              description="É a chave que faz a IA funcionar. Você contrata na Google, na OpenAI ou na Anthropic e cola aqui. Depois de salva ela não aparece mais na tela."
            />
            {isLoading ? (
              <SkeletonPage tiles={0} rows={4} />
            ) : configured.length === 0 ? (
              <EmptyState
                icon={Bot}
                title="Nenhuma chave cadastrada"
                description="Sem uma chave a IA não responde nada, e todo atendimento cai direto para a equipe."
                action={
                  canManage ? (
                    <Button onClick={() => setModalProvider('gemini')}>
                      <Plus className="size-4" />
                      Adicionar chave
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <ul className="divide-y divide-line">
                {configured.map((provider) => (
                  <li key={provider.id} className="px-5 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-base font-medium text-ink">
                            {PROVIDER_LABEL[provider.provider]}
                          </p>
                          <Badge
                            tone={
                              provider.role === 'principal'
                                ? 'cyan'
                                : provider.role === 'reserva'
                                  ? 'neutral'
                                  : 'neutral'
                            }
                          >
                            {ROLE_LABEL[provider.role]}
                          </Badge>
                          {provider.last_test_ok === true && (
                            <Badge tone="success">
                              <CheckCircle2 className="size-3" />
                              Testado
                            </Badge>
                          )}
                          {provider.last_test_ok === false && (
                            <Badge tone="danger">
                              <TriangleAlert className="size-3" />
                              Falhou no teste
                            </Badge>
                          )}
                        </div>
                        <p className="mt-1 text-sm text-muted">
                          Modelo: <span className="text-ink/75">{provider.model}</span>
                          {provider.has_key && provider.key_hint
                            ? ` · Chave ${provider.key_hint}`
                            : ' · Sem chave salva'}
                        </p>
                        <p className="mt-0.5 text-xs text-muted">
                          {provider.last_test_at
                            ? `Último teste ${formatFull(provider.last_test_at)}`
                            : 'Nunca testado'}
                          {provider.last_used_at
                            ? ` · Usado ${relativeFromNow(provider.last_used_at)}`
                            : ''}
                        </p>
                        {provider.last_test_error && (
                          <p className="mt-1 text-xs text-red-600">{provider.last_test_error}</p>
                        )}
                      </div>

                      {canManage && (
                        <div className="flex flex-wrap items-center gap-2">
                          <Select
                            className="h-9 w-[132px]"
                            value={provider.role}
                            onChange={async (e) => {
                              try {
                                await setRole.mutateAsync({
                                  id: provider.id,
                                  role: e.target.value as AiRole,
                                })
                                setFeedback({ tone: 'success', text: 'Papel do provedor atualizado.' })
                              } catch (err) {
                                setFeedback({ tone: 'error', text: (err as Error).message })
                              }
                            }}
                          >
                            <option value="principal">Principal</option>
                            <option value="reserva">Reserva</option>
                            <option value="inativo">Inativa</option>
                          </Select>
                          <Button
                            size="sm"
                            variant="outline"
                            loading={testProvider.isPending}
                            onClick={async () => {
                              setFeedback(null)
                              try {
                                const result = await testProvider.mutateAsync(provider.id)
                                setFeedback(
                                  result.ok
                                    ? {
                                        tone: 'success',
                                        text: `Conexão com ${PROVIDER_LABEL[provider.provider]} confirmada em ${result.latencyMs} ms.`,
                                      }
                                    : { tone: 'error', text: result.error ?? 'Falha no teste.' },
                                )
                              } catch (err) {
                                setFeedback({ tone: 'error', text: (err as Error).message })
                              }
                            }}
                          >
                            <Wand2 className="size-4" />
                            Testar
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setEditing(provider)
                              setModalProvider(provider.provider)
                            }}
                          >
                            <KeyRound className="size-4" />
                            Editar
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setToDelete(provider)}>
                            <Trash2 className="size-4 text-red-600" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}

      {tab === 'comportamento' && <BehaviorTab canManage={canManage} />}

      {tab === 'conhecimento' && <KnowledgeTab canManage={canManage} />}

      {tab === 'aprendizado' && <LearningTab canManage={canManage} />}

      <ProviderModal
        open={modalProvider !== null}
        provider={modalProvider}
        editing={editing}
        onClose={() => {
          setModalProvider(null)
          setEditing(null)
        }}
        onSaved={(message) => {
          setFeedback({ tone: 'success', text: message })
          setModalProvider(null)
          setEditing(null)
        }}
      />

      <ConfirmDialog
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        title="Remover esta chave"
        confirmLabel="Remover"
        loading={deleteProvider.isPending}
        message={
          <>
            A configuração e a chave de {toDelete ? PROVIDER_LABEL[toDelete.provider] : ''} serão
            removidas. Se este for o provedor principal, a IA deixa de responder até que outro seja
            ativado.
          </>
        }
        onConfirm={async () => {
          if (!toDelete) return
          await deleteProvider.mutateAsync(toDelete.id)
          setToDelete(null)
          setFeedback({ tone: 'success', text: 'Provedor removido.' })
        }}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ Modal */

function ProviderModal({
  open,
  provider,
  editing,
  onClose,
  onSaved,
}: {
  open: boolean
  provider: AiProviderName | null
  editing: AiProviderPublicRow | null
  onClose: () => void
  onSaved: (message: string) => void
}) {
  const save = useSaveAiProvider()
  const [form, setForm] = useState({
    provider: (provider ?? 'gemini') as AiProviderName,
    model: PROVIDER_DEFAULT_MODEL[provider ?? 'gemini'],
    apiKey: '',
    role: 'principal' as AiRole,
  })
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const target = editing?.provider ?? provider ?? 'gemini'
    setForm({
      provider: target,
      model: editing?.model ?? PROVIDER_DEFAULT_MODEL[target],
      apiKey: '',
      role: editing?.role ?? 'principal',
    })
    setError(null)
  }, [open, provider, editing])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (!editing && !form.apiKey.trim()) {
      setError('Informe a chave de API do provedor.')
      return
    }
    try {
      await save.mutateAsync({
        provider: form.provider,
        model: form.model.trim(),
        apiKey: form.apiKey,
        role: form.role,
      })
      onSaved(
        editing
          ? 'Provedor atualizado. Teste a conexão para confirmar.'
          : 'Provedor salvo. Teste a conexão para confirmar.',
      )
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Editar provedor' : 'Adicionar chave de IA'}
      description="A chave fica armazenada apenas no servidor e nunca volta para o navegador."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>
            Cancelar
          </Button>
          <Button type="submit" form="ai-provider-form" loading={save.isPending}>
            Salvar
          </Button>
        </>
      }
    >
      <form id="ai-provider-form" onSubmit={submit} className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}

        <Select
          label="Quem fornece a IA"
          value={form.provider}
          disabled={Boolean(editing)}
          onChange={(e) => {
            const next = e.target.value as AiProviderName
            setForm((f) => ({ ...f, provider: next, model: PROVIDER_DEFAULT_MODEL[next] }))
          }}
        >
          {(Object.keys(PROVIDER_LABEL) as AiProviderName[]).map((key) => (
            <option key={key} value={key}>
              {PROVIDER_LABEL[key]}
            </option>
          ))}
        </Select>

        <Select
          label="Modelo da IA"
          value={
            PROVIDER_MODELS[form.provider].some((m) => m.id === form.model) ? form.model : '__outro'
          }
          onChange={(e) => {
            const next = e.target.value
            setForm((f) => ({ ...f, model: next === '__outro' ? '' : next }))
          }}
          hint="Na dúvida, use “Testar”: ele diz na hora se a chave e o modelo funcionam."
        >
          {PROVIDER_MODELS[form.provider].map((model) => (
            <option key={model.id} value={model.id}>
              {model.label}
            </option>
          ))}
          <option value="__outro">Outro modelo (digitar)…</option>
        </Select>

        {!PROVIDER_MODELS[form.provider].some((m) => m.id === form.model) && (
          <Field
            label="Identificador do modelo"
            value={form.model}
            onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
            placeholder="Igual está escrito no site de quem fornece a IA"
            required
            autoFocus
          />
        )}

        <Field
          label={editing ? 'Nova chave de API (opcional)' : 'Chave de API'}
          type="password"
          autoComplete="off"
          value={form.apiKey}
          onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))}
          hint={PROVIDER_KEY_HELP[form.provider]}
          placeholder={editing ? 'Deixe em branco para manter a chave atual' : ''}
        />

        <Select
          label="Papel"
          value={form.role}
          onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as AiRole }))}
          hint="A principal atende. A reserva só entra se a principal falhar — não gera resposta dobrada."
        >
          <option value="principal">Principal</option>
          <option value="reserva">Reserva</option>
          <option value="inativo">Inativa</option>
        </Select>
      </form>
    </Modal>
  )
}

/* ---------------------------------------------------------- Comportamento */

function BehaviorTab({ canManage }: { canManage: boolean }) {
  const { company } = useAuth()
  const { data: settings, isLoading } = useAiSettings(company?.id)
  const save = useSaveAiSettings(company?.id)
  const { data: tokensHoje } = useAiTokensHoje(company?.id)
  const [form, setForm] = useState({ ...AI_SETTINGS_DEFAULT })
  const [status, setStatus] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    if (settings) {
      setForm({
        enabled: settings.enabled,
        assistant_name: settings.assistant_name,
        business_context: settings.business_context,
        tone_instructions: settings.tone_instructions,
        escalation_rules: settings.escalation_rules,
        auto_reply: settings.auto_reply,
        min_confidence: settings.min_confidence,
        max_reply_chars: settings.max_reply_chars,
        max_replies_per_hour: settings.max_replies_per_hour ?? 12,
        daily_token_budget: settings.daily_token_budget ?? 2_000_000,
        working_hours: settings.working_hours,
      })
    }
  }, [settings])

  const consumoPercent =
    form.daily_token_budget > 0 ? ((tokensHoje ?? 0) / form.daily_token_budget) * 100 : 0

  if (isLoading) return <SkeletonPage tiles={0} rows={4} />

  async function submit(event: FormEvent) {
    event.preventDefault()
    setStatus(null)
    try {
      await save.mutateAsync(form)
      setStatus({ tone: 'success', text: 'Comportamento da IA atualizado.' })
    } catch (err) {
      setStatus({ tone: 'error', text: (err as Error).message })
    }
  }

  return (
    <Card>
      <CardHeader
        title="Como ela atende"
        description="Quando a IA responde sozinha, quando ela passa para a equipe e o quanto ela escreve."
      />
      <form onSubmit={submit} className="space-y-4 p-5">
        {status && <Alert tone={status.tone}>{status.text}</Alert>}
        {!canManage && (
          <Alert tone="info">Somente gestores podem alterar a configuração da IA.</Alert>
        )}

        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={form.enabled}
              disabled={!canManage}
              onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
              className="size-4 accent-orange-500"
            />
            IA ligada
          </label>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={form.auto_reply}
              disabled={!canManage}
              onChange={(e) => setForm((f) => ({ ...f, auto_reply: e.target.checked }))}
              className="size-4 accent-orange-500"
            />
            Responder o cliente sozinha
          </label>
        </div>

        <Field
          label="Como ela se apresenta ao cliente"
          value={form.assistant_name}
          disabled={!canManage}
          onChange={(e) => setForm((f) => ({ ...f, assistant_name: e.target.value }))}
        />

        <TextArea
          label="O que contar sobre a empresa"
          value={form.business_context}
          disabled={!canManage}
          onChange={(e) => setForm((f) => ({ ...f, business_context: e.target.value }))}
          placeholder="O que a Tecnoar faz, produtos, serviços, horários, regiões atendidas…"
          hint="Quanto mais preciso, menos a IA precisa perguntar ou improvisar."
        />

        <TextArea
          label="Jeito de falar"
          value={form.tone_instructions}
          disabled={!canManage}
          onChange={(e) => setForm((f) => ({ ...f, tone_instructions: e.target.value }))}
          placeholder="Ex.: sempre confirmar o modelo do veículo antes de sugerir peça."
        />

        <TextArea
          label="Regras de encaminhamento"
          value={form.escalation_rules}
          disabled={!canManage}
          onChange={(e) => setForm((f) => ({ ...f, escalation_rules: e.target.value }))}
          placeholder="Ex.: qualquer pedido de orçamento acima de R$ 2.000 vai para atendente humano."
        />

        <EscolhaSimples
          label="Quando ela pode responder sozinha"
          valor={nivelDeCautela(form.min_confidence)}
          disabled={!canManage}
          onChange={(nivel) =>
            setForm((f) => ({ ...f, min_confidence: CAUTELA[nivel].valor }))
          }
          opcoes={[
            { valor: 'cautelosa', titulo: 'Só quando tem certeza', explicacao: 'Na dúvida, chama a equipe. Menos erro, mais trabalho para vocês.' },
            { valor: 'equilibrada', titulo: 'Equilibrada', explicacao: 'Responde o que domina e passa o resto. É o recomendado.' },
            { valor: 'solta', titulo: 'Responde quase sempre', explicacao: 'Passa pouca coisa adiante. Mais autonomia, mais risco de errar.' },
          ]}
        />

        <EscolhaSimples
          label="Tamanho da resposta"
          valor={tamanhoDaResposta(form.max_reply_chars)}
          disabled={!canManage}
          onChange={(nivel) =>
            setForm((f) => ({ ...f, max_reply_chars: TAMANHO[nivel].valor }))
          }
          opcoes={[
            { valor: 'curta', titulo: 'Curta', explicacao: 'Duas frases. Bom para quem responde dirigindo.' },
            { valor: 'media', titulo: 'Média', explicacao: 'O padrão do WhatsApp: direto, sem virar textão.' },
            { valor: 'longa', titulo: 'Detalhada', explicacao: 'Explica mais. Use só se seus clientes pedem detalhe.' },
          ]}
        />

        <div className="space-y-3 rounded-xl border border-line bg-surface-soft p-4">
          <SectionTitle>Limite de gasto</SectionTitle>
          <p className="text-xs leading-relaxed text-muted">
            Cada resposta da IA custa dinheiro no provedor. Atingido o limite ela para de
            responder e os atendimentos vão para a equipe, com um aviso em Alertas — o custo
            para de subir, mas ninguém fica sem atendimento.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Respostas por hora para o mesmo cliente"
              type="number"
              min="0"
              max="120"
              value={form.max_replies_per_hour}
              disabled={!canManage}
              onChange={(e) =>
                setForm((f) => ({ ...f, max_replies_per_hour: Number(e.target.value) || 0 }))
              }
              hint="Evita que uma única conversa consuma o dia todo."
            />
            <Field
              label="Respostas da IA por dia, na empresa"
              type="number"
              min="0"
              step="50"
              value={tokensParaRespostas(form.daily_token_budget)}
              disabled={!canManage}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  daily_token_budget: respostasParaTokens(Number(e.target.value) || 0),
                }))
              }
              hint="É o que segura a conta no fim do mês. Zero desliga o limite."
            />
          </div>

          {form.daily_token_budget > 0 && (
            <div>
              <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
                <span className="text-muted">Usado hoje</span>
                <span className="nums font-medium text-ink">
                  {tokensParaRespostas(tokensHoje ?? 0).toLocaleString('pt-BR')} de{' '}
                  {tokensParaRespostas(form.daily_token_budget).toLocaleString('pt-BR')} respostas
                </span>
              </div>
              {/* A barra existe para a decisão do teto ser informada: número
                  solto não diz se o limite está apertado ou frouxo. */}
              <div
                className="h-1.5 overflow-hidden rounded-full bg-ink/[0.08]"
                role="progressbar"
                aria-valuenow={Math.min(consumoPercent, 100)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Consumo de IA de hoje"
              >
                <div
                  className={cn(
                    'h-full rounded-full transition-[width] duration-500',
                    consumoPercent >= 90
                      ? 'bg-red-600'
                      : consumoPercent >= 70
                        ? 'bg-orange-500'
                        : 'bg-cyan-500',
                  )}
                  style={{ width: `${Math.min(consumoPercent, 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {canManage && (
          <Button type="submit" loading={save.isPending}>
            <Sparkles className="size-4" />
            Salvar comportamento
          </Button>
        )}
      </form>
    </Card>
  )
}
