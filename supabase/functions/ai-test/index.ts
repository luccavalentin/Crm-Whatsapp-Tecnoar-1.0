import { json, preflight } from '../_shared/cors.ts'
import { adminClient, requireUser } from '../_shared/supabase.ts'
import { callAi, type AiProviderRow } from '../_shared/ai.ts'

/** Testa de verdade a chave de um provedor de IA configurado. */
Deno.serve(async (req) => {
  const pre = preflight(req)
  if (pre) return pre
  if (req.method !== 'POST') return json({ error: 'Metodo nao permitido' }, 405)

  const auth = await requireUser(req)
  if (!auth) return json({ error: 'Nao autorizado' }, 401)
  if (!['owner', 'admin', 'manager'].includes(auth.role)) {
    return json({ error: 'Sem permissao para testar a IA' }, 403)
  }

  let body: { providerId?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Corpo invalido' }, 400)
  }
  if (!body.providerId) return json({ error: 'providerId obrigatorio' }, 400)

  const admin = adminClient()
  const { data: provider } = await admin
    .from('ai_providers')
    .select('*')
    .eq('id', body.providerId)
    .eq('company_id', auth.companyId)
    .maybeSingle()

  if (!provider) return json({ error: 'Provedor nao encontrado' }, 404)
  if (!provider.api_key) return json({ ok: false, error: 'Nenhuma chave salva para este provedor.' })

  const result = await callAi(
    provider as AiProviderRow,
    'Você é um verificador de integração. Responda SOMENTE com um JSON válido no formato ' +
      '{"reply":"ok","intent":"teste","category":"teste","priority":"baixa","confidence":1,' +
      '"summary":"teste de conexao","escalate":false,"escalation_reason":null,"customer_fields":[]}',
    'Responda o JSON de teste.',
  )

  const now = new Date().toISOString()
  await admin
    .from('ai_providers')
    .update({
      last_test_at: now,
      last_test_ok: result.ok,
      last_test_error: result.ok ? null : (result.error ?? 'Falha desconhecida.'),
    })
    .eq('id', provider.id)

  if (!result.ok) {
    await admin.rpc('raise_alert', {
      p_company_id: auth.companyId,
      p_source: 'ia',
      p_code: `chave_invalida_${provider.provider}`,
      p_title: 'Chave de IA invalida',
      p_description: result.error ?? 'O teste de conexao falhou.',
      p_severity: 'aviso',
      p_metadata: { provider: provider.provider },
    })
  }

  return json({
    ok: result.ok,
    error: result.error,
    latencyMs: result.latencyMs,
    model: provider.model,
    provider: provider.provider,
  })
})
