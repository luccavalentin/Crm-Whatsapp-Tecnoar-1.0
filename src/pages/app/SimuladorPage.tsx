import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bot, Send, Sparkles, Trash2, User } from 'lucide-react'
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  SkeletonList,
  TextArea,
} from '@/components/ui'
import { usePageChrome } from '@/components/layout/AppLayout'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { formatFull } from '@/lib/datetime'
import { cn } from '@/lib/utils'
import type { ConversationPriority } from '@/types/database'

interface SimulationOutcome {
  reply: string
  intent: string
  category: string
  priority: ConversationPriority
  confidence: number
  summary: string
  escalate: boolean
  escalation_reason: string | null
  customer_fields: Array<{ label: string; value: string }>
}

interface SimulationResponse {
  ok: boolean
  error?: string
  outcome?: SimulationOutcome
  escalated?: boolean
  action?: string
  provider?: string
  model?: string
  usedFallback?: boolean
  latencyMs?: number
}

interface SimulationRow {
  id: string
  input: string
  reply: string | null
  intent: string | null
  category: string | null
  priority: ConversationPriority | null
  confidence: number | null
  summary: string | null
  action: string | null
  escalated: boolean
  provider: string | null
  model: string | null
  ok: boolean
  error_message: string | null
  latency_ms: number | null
  created_at: string
}

const PRIORITY_LABEL: Record<ConversationPriority, string> = {
  baixa: 'Baixa',
  normal: 'Normal',
  alta: 'Alta',
  emergencia: 'Emergência',
}

const EXAMPLES = [
  'Meu caminhão está parado com problema no freio.',
  'Bom dia, vocês fazem revisão do sistema de ar?',
  'Quero falar com um atendente.',
  'Tenho um Scania R450 e preciso de orçamento para o compressor.',
]

export function SimuladorPage() {
  const { company } = useAuth()
  const qc = useQueryClient()
  const [text, setText] = useState('')
  const [turns, setTurns] = useState<Array<{ role: 'cliente' | 'ia'; text: string }>>([])
  const [result, setResult] = useState<SimulationResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  usePageChrome({ subtitle: 'Teste a IA sem impactar dados reais' }, [])

  const history = useQuery({
    queryKey: ['ai-simulations', company?.id],
    enabled: Boolean(company?.id),
    queryFn: async (): Promise<SimulationRow[]> => {
      const { data, error: queryError } = await supabase
        .from('ai_simulations')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20)
      if (queryError) throw queryError
      return (data ?? []) as unknown as SimulationRow[]
    },
  })

  const simulate = useMutation({
    mutationFn: async (payload: {
      messages: Array<{ role: 'cliente' | 'ia'; text: string }>
      text: string
    }): Promise<SimulationResponse> => {
      const { data, error: fnError } = await supabase.functions.invoke<SimulationResponse>(
        'ai-simulate',
        { body: payload },
      )
      if (fnError) {
        const context = (fnError as unknown as { context?: Response }).context
        if (context) {
          const body = await context.json().catch(() => null)
          throw new Error(body?.error ?? fnError.message)
        }
        throw fnError
      }
      return data ?? { ok: false, error: 'Resposta vazia do simulador.' }
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['ai-simulations'] }),
  })

  const clearHistory = useMutation({
    mutationFn: async () => {
      const { error: deleteError } = await supabase
        .from('ai_simulations')
        .delete()
        .eq('company_id', company!.id)
      if (deleteError) throw deleteError
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['ai-simulations'] }),
  })

  async function submit(event: FormEvent) {
    event.preventDefault()
    const content = text.trim()
    if (!content) return
    setError(null)

    const previous = [...turns]
    setTurns([...previous, { role: 'cliente', text: content }])
    setText('')

    try {
      const response = await simulate.mutateAsync({ messages: previous, text: content })
      setResult(response)
      if (response.ok && response.outcome?.reply) {
        setTurns((current) => [...current, { role: 'ia', text: response.outcome!.reply }])
      } else if (response.error) {
        setError(response.error)
      }
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <div className="animate-in-fade mx-auto max-w-5xl space-y-4 px-4 py-5 sm:px-6 sm:py-6">
      <Alert tone="info">
        As simulações usam o mesmo motor do atendimento real, mas <strong>não criam clientes,
        conversas, mensagens, cartões no Kanban nem entram nas métricas</strong>.
      </Alert>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        {/* Altura travada (min + max) para a lista de mensagens rolar por
            dentro e o campo de envio ficar sempre visível, sem precisar
            rolar a página inteira no celular. */}
        <Card className="flex h-[min(70dvh,640px)] min-h-[420px] flex-col">
          <CardHeader title="Conversa de teste" description="Escreva como se fosse o cliente." />

          <div className="scrollbar-thin min-h-0 flex-1 space-y-3 overflow-y-auto p-5">
            {turns.length === 0 ? (
              <div className="space-y-3">
                <p className="text-sm text-muted">Comece com um exemplo:</p>
                <div className="flex flex-wrap gap-2">
                  {EXAMPLES.map((example) => (
                    <button
                      key={example}
                      type="button"
                      onClick={() => setText(example)}
                      className="rounded-xl border border-line bg-surface px-3 py-2 text-left text-xs text-ink/80 transition-colors hover:border-cyan-500/50 hover:bg-cyan-100/30"
                    >
                      {example}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              turns.map((turn, index) => (
                <div
                  key={index}
                  className={cn('flex', turn.role === 'cliente' ? 'justify-start' : 'justify-end')}
                >
                  <div
                    className={cn(
                      'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
                      turn.role === 'cliente'
                        ? 'rounded-tl-md border border-line bg-surface text-ink'
                        : 'rounded-tr-md bg-cyan-500 text-white',
                    )}
                  >
                    <p
                      className={cn(
                        'mb-0.5 flex items-center gap-1 text-2xs font-medium',
                        turn.role === 'cliente' ? 'text-muted' : 'text-white/80',
                      )}
                    >
                      {turn.role === 'cliente' ? (
                        <>
                          <User className="size-3" /> Cliente (simulado)
                        </>
                      ) : (
                        <>
                          <Bot className="size-3" /> IA
                        </>
                      )}
                    </p>
                    <p className="whitespace-pre-wrap">{turn.text}</p>
                  </div>
                </div>
              ))
            )}
          </div>

          {error && (
            <div className="px-5 pb-3">
              <Alert tone="error">{error}</Alert>
            </div>
          )}

          <form onSubmit={submit} className="shrink-0 border-t border-line p-4 pb-safe-3">
            <div className="flex items-end gap-2">
              <TextArea
                name="simulacao"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Mensagem do cliente…"
                // min-w-0: sem isto o textarea recusa encolher dentro do flex
                // e empurra o botão para fora da tela em telas estreitas.
                className="min-h-[46px] min-w-0 flex-1 resize-none py-3"
                rows={1}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    void submit(e as unknown as FormEvent)
                  }
                }}
              />
              <Button type="submit" size="lg" loading={simulate.isPending} disabled={!text.trim()}>
                <Send className="size-4" />
                Testar
              </Button>
            </div>
            {turns.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setTurns([])
                  setResult(null)
                  setError(null)
                }}
                className="mt-2 text-xs text-muted hover:text-ink"
              >
                Reiniciar conversa de teste
              </button>
            )}
          </form>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader
              title="Análise da IA"
              description="O que a IA entendeu e qual ação tomaria."
            />
            {!result?.outcome ? (
              <EmptyState
                icon={Sparkles}
                title="Nenhuma simulação executada"
                description="Envie uma mensagem para ver a resposta e a classificação."
              />
            ) : (
              <dl className="divide-y divide-line">
                <Row label="Intenção" value={result.outcome.intent || '—'} />
                <Row label="Categoria" value={result.outcome.category || '—'} />
                <Row
                  label="Prioridade"
                  value={PRIORITY_LABEL[result.outcome.priority]}
                  tone={result.outcome.priority === 'emergencia' ? 'danger' : undefined}
                />
                <Row
                  label="Confiança"
                  value={`${Math.round(result.outcome.confidence * 100)}%`}
                />
                <Row
                  label="Ação tomada"
                  value={
                    result.escalated
                      ? 'Encaminhar para atendente humano'
                      : 'Responder automaticamente'
                  }
                  tone={result.escalated ? 'orange' : undefined}
                />
                <div className="px-5 py-3">
                  <dt className="text-sm text-muted">Resumo interno</dt>
                  <dd className="mt-1 text-sm leading-relaxed text-ink">
                    {result.outcome.summary || '—'}
                  </dd>
                </div>
                {result.outcome.customer_fields.length > 0 && (
                  <div className="px-5 py-3">
                    <dt className="text-sm text-muted">Dados que seriam salvos no CRM</dt>
                    <dd className="mt-1 space-y-1">
                      {result.outcome.customer_fields.map((field) => (
                        <p key={field.label} className="text-sm text-ink">
                          <span className="text-muted">{field.label}:</span> {field.value}
                        </p>
                      ))}
                    </dd>
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2 px-5 py-3 text-xs text-muted">
                  <Badge tone="neutral">{result.provider ?? '—'}</Badge>
                  <span>{result.model}</span>
                  {result.usedFallback && <Badge tone="orange">Provedor reserva</Badge>}
                  <span>· {result.latencyMs} ms</span>
                </div>
              </dl>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Testes anteriores"
              action={
                (history.data?.length ?? 0) > 0 ? (
                  <Button
                    size="sm"
                    variant="outline"
                    loading={clearHistory.isPending}
                    onClick={() => clearHistory.mutate()}
                  >
                    <Trash2 className="size-4" />
                    Limpar
                  </Button>
                ) : undefined
              }
            />
            {history.isLoading ? (
              <SkeletonList rows={3} />
            ) : !history.data || history.data.length === 0 ? (
              <EmptyState title="Nenhum teste registrado" />
            ) : (
              <ul className="scrollbar-thin max-h-72 divide-y divide-line overflow-y-auto">
                {history.data.map((row) => (
                  <li key={row.id} className="px-5 py-3">
                    <p className="line-clamp-2 text-sm text-ink">{row.input}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                      {row.ok ? (
                        <>
                          <Badge tone={row.escalated ? 'orange' : 'cyan'}>
                            {row.escalated ? 'Encaminhado' : 'Respondido'}
                          </Badge>
                          {row.category && <span>{row.category}</span>}
                          {row.confidence !== null && (
                            <span>{Math.round(row.confidence * 100)}%</span>
                          )}
                        </>
                      ) : (
                        <Badge tone="danger">Falhou</Badge>
                      )}
                      <span>{formatFull(row.created_at)}</span>
                    </p>
                    {!row.ok && row.error_message && (
                      <p className="mt-1 text-xs text-red-600">{row.error_message}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}

function Row({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: 'danger' | 'orange'
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-3">
      <dt className="text-sm text-muted">{label}</dt>
      <dd
        className={cn(
          'text-right text-sm font-medium',
          tone === 'danger' ? 'text-red-600' : tone === 'orange' ? 'text-orange-600' : 'text-ink',
        )}
      >
        {value}
      </dd>
    </div>
  )
}
