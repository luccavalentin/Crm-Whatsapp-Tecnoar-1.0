import { json, preflight } from '../_shared/cors.ts'
import { adminClient, requireUser } from '../_shared/supabase.ts'
import {
  buildSystemPrompt,
  buildUserPrompt,
  loadAiConfig,
  runAi,
  type ConversationTurn,
} from '../_shared/ai.ts'
import { loadKnowledge } from '../_shared/knowledge.ts'

/**
 * Simulador de IA.
 * Usa exatamente o mesmo motor do atendimento real, mas nada é gravado em
 * clientes, conversas, mensagens, métricas ou Kanban — apenas em ai_simulations.
 */
Deno.serve(async (req) => {
  const pre = preflight(req)
  if (pre) return pre
  if (req.method !== 'POST') return json({ error: 'Metodo nao permitido' }, 405)

  const auth = await requireUser(req)
  if (!auth) return json({ error: 'Nao autorizado' }, 401)

  const admin = adminClient()
  const { data: perms } = await admin.rpc('effective_permissions', { p_user_id: auth.userId })
  const permissions = (perms ?? {}) as Record<string, boolean>
  if (!(permissions['*'] || permissions['simulador.visualizar'])) {
    return json({ error: 'Sem permissao para usar o simulador' }, 403)
  }

  let body: { messages?: Array<{ role: 'cliente' | 'ia'; text: string }>; text?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Corpo invalido' }, 400)
  }

  const turns: ConversationTurn[] = (body.messages ?? [])
    .filter((m) => m.text?.trim())
    .map((m) => ({ role: m.role === 'ia' ? 'ia' : 'cliente', text: m.text.trim() }))

  if (body.text?.trim()) turns.push({ role: 'cliente', text: body.text.trim() })
  if (turns.length === 0) return json({ error: 'Escreva a mensagem do cliente' }, 400)

  const { primary, fallback, settings } = await loadAiConfig(admin, auth.companyId)
  // O simulador usa a MESMA base da produção. Sem isso ele responderia
  // "vou confirmar" para tudo e ninguém conseguiria testar de verdade.
  const { knowledge, faq, tags } = await loadKnowledge(admin, auth.companyId)
  if (!primary && !fallback) {
    return json({
      ok: false,
      error:
        'Nenhum provedor de IA configurado. Cadastre uma chave em IA > Provedores para usar o simulador.',
    })
  }

  const systemPrompt = buildSystemPrompt({
    settings,
    customer: {
      // Cliente fictício explícito: o simulador não toca no CRM
      name: 'Cliente de teste',
      phone: '(simulacao)',
      company_name: null,
      isRecurring: false,
      serviceCount: 0,
      lastInteraction: null,
    },
    knownFields: [],
    previousSummary: null,
    turns,
    knowledge,
    faq,
    tags,
  })

  const result = await runAi(primary, fallback, systemPrompt, buildUserPrompt(turns), settings.max_reply_chars)
  const outcome = result.outcome

  const escalated = Boolean(
    outcome &&
      (outcome.escalate ||
        outcome.confidence < settings.min_confidence ||
        outcome.priority === 'emergencia'),
  )

  await admin.from('ai_simulations').insert({
    company_id: auth.companyId,
    created_by: auth.userId,
    input: turns[turns.length - 1].text,
    reply: outcome?.reply ?? null,
    intent: outcome?.intent ?? null,
    category: outcome?.category ?? null,
    priority: outcome?.priority ?? null,
    confidence: outcome?.confidence ?? null,
    summary: outcome?.summary ?? null,
    action: outcome ? (escalated ? 'encaminhado_para_humano' : 'respondido_pela_ia') : null,
    escalated,
    provider: result.provider ?? null,
    model: result.model ?? null,
    used_fallback: result.usedFallback,
    ok: result.ok,
    error_message: result.ok ? null : (result.error ?? 'Falha na IA.'),
    latency_ms: result.latencyMs,
  })

  if (!result.ok || !outcome) {
    return json({ ok: false, error: result.error })
  }

  return json({
    ok: true,
    outcome,
    escalated,
    action: escalated ? 'encaminhado_para_humano' : 'respondido_pela_ia',
    provider: result.provider,
    model: result.model,
    usedFallback: result.usedFallback,
    latencyMs: result.latencyMs,
  })
})
