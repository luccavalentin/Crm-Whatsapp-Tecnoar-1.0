import { json, preflight } from '../_shared/cors.ts'
import { adminClient, requireUser } from '../_shared/supabase.ts'
import { deliverOutbound } from '../_shared/outbound.ts'
import { activeChannel, sinalizarDigitando } from '../_shared/providers.ts'
import {
  dispatchEmergency,
  lastKnownLocation,
  loadEmergencyContacts,
} from '../_shared/emergency.ts'
import {
  aplicarEtiquetas,
  classificacaoDaConversa,
  loadKnowledge,
  registrarDuvida,
  selecionarFaq,
} from '../_shared/knowledge.ts'
import { limiteEstourado } from '../_shared/limites.ts'
import {
  lerMidiasPendentes,
  precisaDeLeitura,
  textoDaMidia,
  type MediaMessage,
} from '../_shared/transcribe.ts'
import {
  buildSystemPrompt,
  buildUserPrompt,
  cortarNoLimite,
  loadAiConfig,
  runAi,
  type AiProviderRow,
  type AiSettings,
  type ConversationTurn,
} from '../_shared/ai.ts'

/**
 * Motor de atendimento da IA.
 * Chamado pelos webhooks quando chega mensagem do cliente, ou pelo CRM.
 * Nunca responde se a IA estiver desligada na conversa.
 */

/**
 * Janela de rajada.
 *
 * Ninguem escreve no WhatsApp em turnos: manda "oi", depois "meu caminhao
 * travou o freio na Dutra", depois a localizacao. Respondendo a primeira
 * mensagem isolada, a IA responde ao "oi" e ignora a emergencia. Esperar
 * alguns segundos junta a rajada num contexto so — e ainda faz a resposta
 * parecer de gente, nao de robo com gatilho.
 */
const JANELA_RAJADA_MS = 6_000

/** Quantas vezes a janela pode ser esticada enquanto o cliente continua digitando. */
const MAX_EXTENSOES = 2

/**
 * Quantas voltas o mesmo acionamento pode dar.
 *
 * Mensagem que chega enquanto a IA responde nao pode ser descartada: e
 * exatamente ali que aparece "estou sem freio". Ao terminar, conferimos se
 * entrou mensagem nova e rodamos de novo. O teto existe para uma conversa
 * agitada nao prender a execucao indefinidamente.
 */
const MAX_PASSOS = 3

/**
 * Teto de tempo do acionamento inteiro.
 *
 * A trava desta conversa fica na mao desta execucao, e `try_lock_ai` descarta
 * trava com mais de 2 MINUTOS. Se a execucao passar disso, outra entra em
 * paralelo e o cliente recebe duas respostas.
 *
 * A conta do pior caso: 18s de janela de rajada + 30s ate a ultima volta
 * comecar + 40s da chamada mais a repeticao + 7s encenando digitacao = ~95s.
 * Fica abaixo dos 120s com folga. Subir este numero, o TETO_DIGITACAO_MS ou o
 * TIMEOUT_MS da chamada exige subir o intervalo do try_lock_ai junto — os
 * quatro andam amarrados.
 */
const PRAZO_TOTAL_MS = 30_000

const espera = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Teto do tempo total encenando digitacao. Passar disso vira espera, nao realismo. */
const TETO_DIGITACAO_MS = 7_000

/**
 * Quanto tempo uma pessoa levaria para digitar este trecho.
 *
 * Nao e enfeite: mensagem que chega no mesmo milissegundo da anterior denuncia
 * o automatico mais do que qualquer palavra escolhida. A conta e grosseira de
 * proposito — o que importa e existir uma pausa proporcional ao tamanho, nao
 * acertar a velocidade de ninguem.
 */
function tempoDeDigitar(texto: string, jaGasto: number): number {
  const estimado = 700 + texto.length * 45
  const possivel = Math.max(0, TETO_DIGITACAO_MS - jaGasto)
  return Math.min(estimado, 3_200, possivel)
}

type Admin = ReturnType<typeof adminClient>

/** So os campos que este arquivo usa; o resto da linha vem junto. */
interface ConversationRow {
  id: string
  company_id: string
  customer_id: string
  status: string
  ai_enabled: boolean
  ai_summary: string | null
  [campo: string]: unknown
}

Deno.serve(async (req) => {
  const pre = preflight(req)
  if (pre) return pre
  if (req.method !== 'POST') return json({ error: 'Metodo nao permitido' }, 405)

  const authorization = req.headers.get('Authorization') ?? ''
  const isInternal = authorization === `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`

  let companyId: string | null = null
  if (!isInternal) {
    const auth = await requireUser(req)
    if (!auth) return json({ error: 'Nao autorizado' }, 401)
    companyId = auth.companyId
  }

  let body: { conversationId?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Corpo invalido' }, 400)
  }
  if (!body.conversationId) return json({ error: 'conversationId obrigatorio' }, 400)

  const admin = adminClient()

  const { data: conversation } = await admin
    .from('conversations')
    .select('*')
    .eq('id', body.conversationId)
    .maybeSingle()

  if (!conversation) return json({ error: 'Atendimento nao encontrado' }, 404)
  if (companyId && conversation.company_id !== companyId) {
    return json({ error: 'Atendimento nao encontrado' }, 404)
  }

  const company = conversation.company_id

  // ------------------------------------------------------------- Bloqueios
  if (conversation.status === 'concluido') {
    return json({ skipped: 'atendimento_concluido' })
  }
  if (!conversation.ai_enabled) {
    return json({ skipped: 'ia_desativada_na_conversa' })
  }

  const { primary, fallback, settings } = await loadAiConfig(admin, company)

  if (!settings.enabled) return json({ skipped: 'ia_desativada_na_empresa' })
  if (!primary && !fallback) {
    await admin.rpc('raise_alert', {
      p_company_id: company,
      p_source: 'ia',
      p_code: 'sem_provedor',
      p_title: 'Inteligencia artificial nao configurada',
      p_description:
        'Chegou mensagem de cliente, mas nenhum provedor de IA esta configurado. O atendimento aguarda um humano.',
      p_severity: 'critico',
      p_metadata: { conversation_id: conversation.id },
    })
    await escalate(admin, conversation, 'IA nao configurada')
    return json({ skipped: 'sem_provedor' })
  }

  // -------------------------------------------------------------- Trava
  // Tomada ANTES de carregar o contexto, de proposito: assim o contexto e
  // sempre lido ja com a trava na mao, e quem entrar depois sabe que o
  // detentor vai reprocessar o que chegar. Antes a trava vinha no meio, e a
  // mensagem que caia nessa fresta desaparecia sem ninguem responder.
  const { data: locked } = await admin.rpc('try_lock_ai', {
    p_conversation_id: conversation.id,
    p_owner: 'ai-reply',
  })
  if (!locked) return json({ skipped: 'execucao_em_andamento' })

  const comecou = Date.now()

  try {
    let ultimaResposta: Record<string, unknown> = { skipped: 'sem_mensagens' }

    for (let passo = 1; passo <= MAX_PASSOS; passo++) {
      // A espera pela rajada so faz sentido na primeira volta: nas seguintes
      // a mensagem nova ja esta no banco esperando resposta.
      if (passo === 1) await aguardarRajada(admin, conversation.id)

      const resultado = await executarPasso(admin, {
        conversation,
        company,
        settings,
        primary,
        fallback,
      })

      ultimaResposta = resultado.resposta
      if (!resultado.repetir) break

      if (Date.now() - comecou > PRAZO_TOTAL_MS) {
        console.warn(`[ia] prazo esgotado no atendimento ${conversation.id}; solta a trava`)
        break
      }

      console.log(
        `[ia] mensagem nova durante o atendimento ${conversation.id}: rodando passo ${passo + 1}`,
      )
      // Recarrega o estado: o passo anterior mudou status, resumo e prioridade.
      const { data: atualizada } = await admin
        .from('conversations')
        .select('*')
        .eq('id', conversation.id)
        .maybeSingle()
      if (!atualizada || atualizada.status === 'concluido' || !atualizada.ai_enabled) break
      Object.assign(conversation, atualizada)
    }

    return json(ultimaResposta)
  } finally {
    await admin.rpc('unlock_ai', { p_conversation_id: conversation.id })
  }
})

/* ------------------------------------------------------------- Rajada */

async function maiorSequencia(admin: Admin, conversationId: string): Promise<number> {
  const { data } = await admin
    .from('messages')
    .select('sequence')
    .eq('conversation_id', conversationId)
    .order('sequence', { ascending: false })
    .limit(1)
    .maybeSingle()
  return Number(data?.sequence ?? 0)
}

/**
 * Segura a resposta enquanto o cliente ainda esta escrevendo.
 * Cada mensagem nova durante a espera estica a janela — ate o teto, para uma
 * pessoa que escreve muito nao adiar o atendimento para sempre.
 */
async function aguardarRajada(admin: Admin, conversationId: string): Promise<void> {
  let ultima = await maiorSequencia(admin, conversationId)

  for (let i = 0; i <= MAX_EXTENSOES; i++) {
    await espera(JANELA_RAJADA_MS)
    const agora = await maiorSequencia(admin, conversationId)
    if (agora === ultima) return
    ultima = agora
  }
}

/* -------------------------------------------------------------- Passo */

/** Aviso no historico quando o arquivo existe mas nao foi possivel ler. */
function marcadorDeMidia(type: string): string | null {
  switch (type) {
    case 'audio':
      return '[o cliente enviou um audio que nao foi possivel transcrever]'
    case 'image':
      return '[o cliente enviou uma foto que nao foi possivel analisar]'
    case 'video':
      return '[o cliente enviou um video]'
    case 'document':
      return '[o cliente enviou um documento]'
    case 'sticker':
      return '[o cliente enviou uma figurinha]'
    default:
      return null
  }
}

interface PassoInput {
  conversation: ConversationRow
  company: string
  settings: AiSettings
  primary: AiProviderRow | null
  fallback: AiProviderRow | null
}

async function executarPasso(
  admin: Admin,
  { conversation, company, settings, primary, fallback }: PassoInput,
): Promise<{ repetir: boolean; resposta: Record<string, unknown> }> {
  // -------------------------------------------------------------- Contexto
  // Nenhuma destas consultas depende do resultado das outras: todas saem
  // juntas em vez de uma esperar a anterior terminar, o que tirava segundos
  // de round-trip ao banco antes mesmo de a IA comecar a pensar.
  const [
    { data: customer },
    { data: fields },
    { data: messages },
    emergencyContacts,
    { knowledge, faq, tags },
  ] = await Promise.all([
    admin.from('customers').select('*').eq('id', conversation.customer_id).single(),
    admin.from('customer_fields').select('*').eq('customer_id', conversation.customer_id),
    admin
      .from('messages')
      .select(
        'id, direction, sender, body, type, media_url, media_mime, metadata, created_at, sequence',
      )
      .eq('conversation_id', conversation.id)
      .order('sequence', { ascending: false })
      .limit(20),
    // Plantonistas: entram no prompt para a IA poder passar o telefone.
    loadEmergencyContacts(admin, company),
    // Base oficial, respostas aprovadas e etiquetas. Recarregado a cada
    // resposta para que uma correcao feita na tela valha ja na proxima mensagem.
    loadKnowledge(admin, company),
  ])

  const ordered = (messages ?? []).slice().reverse()
  const maiorSequenciaVista = ordered.length
    ? Number(ordered[ordered.length - 1].sequence ?? 0)
    : 0

  // -------------------------------------------------------- Audio e foto
  // O arquivo vira texto antes de montar o historico. Sem isto o motorista
  // que manda audio da estrada — o normal em campo — simplesmente nao existe
  // para a IA: a mensagem entra com corpo vazio e some do contexto.
  const transcricoes = await lerMidiasPendentes(
    admin,
    [primary, fallback],
    ordered as unknown as MediaMessage[],
  )

  let ultimaMidiaIlegivel = false

  const turns: ConversationTurn[] = []
  for (const m of ordered) {
    if (m.sender === 'sistema') continue

    const midia = m as unknown as MediaMessage
    const lido = transcricoes.get(m.id as string) ?? textoDaMidia(midia)

    // Texto vindo de arquivo entra identificado. Transcricao erra nome e
    // placa; a IA precisa saber que aquilo foi ouvido, nao escrito, para
    // confirmar em vez de tratar como dado certo.
    const texto =
      (m.body as string | null)?.trim() ||
      (lido
        ? m.type === 'audio'
          ? `(audio transcrito) ${lido}`
          : `(foto enviada pelo cliente) ${lido}`
        : null) ||
      (m.direction === 'inbound' ? marcadorDeMidia(m.type as string) : null)

    if (!texto) continue

    const role: ConversationTurn['role'] =
      m.direction === 'inbound' ? 'cliente' : m.sender === 'ia' ? 'ia' : 'atendente'

    // Guarda se a ULTIMA fala do cliente foi um arquivo que ninguem conseguiu
    // ler: nesse caso a IA nao tem como resolver e o atendimento vai para uma
    // pessoa, em vez de responder no escuro.
    if (role === 'cliente') {
      ultimaMidiaIlegivel = precisaDeLeitura(midia) && !transcricoes.get(m.id as string)
    }

    turns.push({ role, text: texto })
  }

  if (turns.length === 0) return { repetir: false, resposta: { skipped: 'sem_mensagens' } }
  if (turns[turns.length - 1].role !== 'cliente') {
    return { repetir: false, resposta: { skipped: 'ultima_mensagem_nao_e_do_cliente' } }
  }

  // A palavra do cliente vale por si so. Se ele escreveu "emergencia",
  // a equipe e avisada mesmo que a IA classifique errado ou esteja fora do ar.
  const ultimaDoCliente = turns[turns.length - 1].text
  const pediuSocorro = /emerg[eê]nc|socorro|acidente/i.test(ultimaDoCliente)

  // ------------------------------------------------------------- Freio
  // Conferido aqui, e nao na entrada: so conta como uso quando ha de fato uma
  // mensagem de cliente esperando resposta. E vem antes de montar o prompt —
  // nao adianta pagar a chamada para depois descobrir que estourou.
  const estouro = await limiteEstourado(admin, company, conversation.id, settings)
  if (estouro) {
    await admin.rpc('raise_alert', {
      p_company_id: company,
      p_source: 'ia',
      p_code: estouro.codigo,
      p_title: 'Limite de uso da inteligencia artificial atingido',
      p_description: estouro.descricao,
      p_severity: 'aviso',
      p_metadata: { conversation_id: conversation.id },
    })
    await escalate(admin, conversation, estouro.descricao)
    return { repetir: false, resposta: { skipped: estouro.codigo } }
  }

  const systemPrompt = buildSystemPrompt({
    settings,
    customer: {
      name: customer!.name,
      phone: customer!.phone,
      company_name: customer!.company_name,
      isRecurring: (customer!.service_count ?? 0) > 1,
      serviceCount: customer!.service_count ?? 0,
      lastInteraction: customer!.last_interaction_at,
    },
    knownFields: (fields ?? []).map((f) => ({ label: f.label, value: f.value })),
    previousSummary: conversation.ai_summary,
    turns,
    emergencyContact: emergencyContacts[0] ?? null,
    knowledge,
    // So as respostas aprovadas que tem a ver com o que o cliente perguntou.
    // Despejar as 40 a cada mensagem incha a instrucao e dilui o que importa.
    faq: selecionarFaq(faq, ultimaDoCliente),
    tags,
  })

  const result = await runAi(
    primary,
    fallback,
    systemPrompt,
    buildUserPrompt(turns),
    settings.max_reply_chars,
  )

  /** Chegou mensagem nova do cliente enquanto este passo rodava? */
  const chegouMensagemNova = async (): Promise<boolean> => {
    const { data } = await admin
      .from('messages')
      .select('id')
      .eq('conversation_id', conversation.id)
      .eq('direction', 'inbound')
      .gt('sequence', maiorSequenciaVista)
      .limit(1)
      .maybeSingle()
    return Boolean(data)
  }

  // ----------------------------------------------------------------- Falha
  if (!result.ok || !result.outcome) {
    await admin.from('ai_runs').insert({
      company_id: company,
      conversation_id: conversation.id,
      kind: 'resposta',
      provider: result.provider ?? null,
      model: result.model ?? null,
      used_fallback: result.usedFallback,
      ok: false,
      error_message: result.error ?? 'Falha na IA.',
      latency_ms: result.latencyMs,
    })

    await admin.rpc('raise_alert', {
      p_company_id: company,
      p_source: 'ia',
      p_code: 'falha_execucao',
      p_title: 'Falha na inteligencia artificial',
      p_description: result.error ?? 'A IA nao conseguiu responder. O atendimento aguarda um humano.',
      p_severity: 'critico',
      p_metadata: { conversation_id: conversation.id },
    })

    // A IA caiu, mas o cliente pediu socorro: a equipe nao pode ficar sem saber.
    if (pediuSocorro && emergencyContacts.length > 0) {
      await dispatchEmergency(admin, {
        companyId: company,
        conversationId: conversation.id,
        customerName: customer!.name,
        customerPhone: customer!.phone,
        summary: `O cliente escreveu: "${ultimaDoCliente.slice(0, 300)}"`,
        location: await lastKnownLocation(admin, conversation.id),
        contacts: emergencyContacts,
      })
    }

    await escalate(admin, conversation, 'Falha tecnica na IA')
    // Ja esta com um humano: nao adianta rodar de novo por mensagem nova.
    return { repetir: false, resposta: { ok: false, error: result.error } }
  }

  const outcome = result.outcome
  if (pediuSocorro) outcome.priority = 'emergencia'

  // Risco de acidente nao depende de a IA ter lembrado de marcar prioridade:
  // se ela reconheceu o risco, o atendimento e emergencia e vai para gente.
  if (outcome.risco_seguranca) {
    outcome.priority = 'emergencia'
    outcome.escalate = true
  }

  const lowConfidence = outcome.confidence < settings.min_confidence
  const mustEscalate =
    outcome.escalate || lowConfidence || outcome.priority === 'emergencia' || ultimaMidiaIlegivel

  // ------------------------------------------------------------- Resposta
  // O cliente vem primeiro: a mensagem sai antes da escrita de analise,
  // campos, alertas e eventos. Fazer o contrario adiciona segundos de espera
  // do outro lado da conversa sem nenhum ganho.
  let sendError: string | undefined
  let messageId: string | null = null

  if (settings.auto_reply && outcome.reply) {
    // Uma pessoa manda duas ou tres mensagens curtas, com pausa entre elas —
    // nao um bloco de texto que aparece inteiro de uma vez. O bloco unico e
    // instantaneo e o que mais denuncia atendimento automatico.
    const partes = outcome.reply_partes.length
      ? outcome.reply_partes
      : [cortarNoLimite(outcome.reply, settings.max_reply_chars)]

    // O "digitando..." precisa do canal em mao. Se nao vier, a conversa segue
    // igual — so sem o aviso.
    const canal = await activeChannel(admin, company)
    const telefone = customer!.phone as string

    let gasto = 0
    for (const [indice, parte] of partes.entries()) {
      if (indice > 0) {
        const pausa = tempoDeDigitar(parte, gasto)
        gasto += pausa
        // Liga o aviso ANTES de esperar: pausa sem "digitando" nao parece
        // alguem escrevendo, parece sistema travado.
        if (canal) await sinalizarDigitando(canal, telefone, null, true)
        await espera(pausa)
      }

      const delivery = await deliverOutbound(admin, {
        companyId: company,
        conversationId: conversation.id,
        customerId: conversation.customer_id,
        text: cortarNoLimite(parte, settings.max_reply_chars),
        sender: 'ia',
        clientToken: crypto.randomUUID(),
      })

      // O erro que interessa e o da primeira: se ela nao saiu, o cliente nao
      // recebeu nada. As seguintes ficam registradas na propria mensagem.
      if (indice === 0) {
        sendError = delivery.error
        messageId = (delivery.message.id as string) ?? null
      }
      if (delivery.error) break
    }

    // A propria mensagem que chega ja apaga o aviso no aplicativo; desligar e
    // garantia para o caso de a ultima ter falhado no meio.
    if (canal) await sinalizarDigitando(canal, telefone, null, false)
  }

  // ------------------------------------------------ Aciona a equipe
  // Depois de responder ao cliente e antes da papelada: quem esta na estrada
  // nao pode esperar a gravacao de metricas.
  if (outcome.priority === 'emergencia' && emergencyContacts.length > 0) {
    const local = await lastKnownLocation(admin, conversation.id)
    const aviso = await dispatchEmergency(admin, {
      companyId: company,
      conversationId: conversation.id,
      customerName: customer!.name,
      customerPhone: customer!.phone,
      summary: outcome.summary || outcome.intent,
      location: local,
      contacts: emergencyContacts,
    })

    if (aviso.sent > 0) {
      await admin.from('conversation_events').insert({
        company_id: company,
        conversation_id: conversation.id,
        type: 'emergency.dispatched',
        title: 'Equipe de plantao avisada',
        description:
          `${aviso.sent} contato(s) receberam o aviso de emergencia pelo WhatsApp` +
          (aviso.failed > 0 ? ` - ${aviso.failed} falharam.` : '.'),
        actor_type: 'sistema',
      })
    }
  }

  // ------------------------------------------------------- Atualiza análise
  await admin
    .from('conversations')
    .update({
      ai_summary: outcome.summary || conversation.ai_summary,
      ai_category: outcome.category || null,
      ai_confidence: outcome.confidence,
      ai_updated_at: new Date().toISOString(),
      priority: outcome.priority,
      status: mustEscalate ? 'aguardando_humano' : 'ia',
      // Intencao, etapa do funil e temperatura do lead, todas validadas contra
      // lista fechada antes de chegar aqui.
      ...classificacaoDaConversa(outcome),
    })
    .eq('id', conversation.id)

  await aplicarEtiquetas(admin, company, conversation.id, outcome.tags)

  // A IA nao teve resposta oficial: a pergunta vai para a fila de aprendizado
  // e espera um humano aprovar. Nunca entra sozinha na base.
  if (outcome.unanswered_question) {
    await registrarDuvida(admin, {
      companyId: company,
      conversationId: conversation.id,
      customerId: conversation.customer_id,
      question: outcome.unanswered_question,
      intent: outcome.intent,
      aiNote: outcome.summary || null,
    })
  }

  // ------------------------------------------- Dados do cliente (sem sobrescrever humano)
  for (const field of outcome.customer_fields) {
    const { data: existing } = await admin
      .from('customer_fields')
      .select('id, source')
      .eq('customer_id', conversation.customer_id)
      .eq('key', field.key)
      .maybeSingle()

    if (!existing) {
      await admin.from('customer_fields').insert({
        company_id: company,
        customer_id: conversation.customer_id,
        key: field.key,
        label: field.label,
        value: field.value,
        source: 'ia',
        confidence: field.confidence ?? outcome.confidence,
      })
    } else if (existing.source === 'ia') {
      await admin
        .from('customer_fields')
        .update({ value: field.value, confidence: field.confidence ?? outcome.confidence })
        .eq('id', existing.id)
    }
  }

  // Nome do cliente ainda desconhecido: a IA pode preencher
  const nameField = outcome.customer_fields.find((f) => f.key === 'nome')
  if (nameField && !customer!.name) {
    await admin.from('customers').update({ name: nameField.value }).eq('id', customer!.id)
  }

  // ------------------------------------------------------------ Emergência
  if (outcome.priority === 'emergencia') {
    await admin.rpc('raise_alert', {
      p_company_id: company,
      p_source: 'atendimento',
      p_code: `emergencia_${conversation.id}`,
      p_title: 'Emergencia identificada pela IA',
      p_description: outcome.summary || 'Atendimento marcado como emergencia.',
      p_severity: 'critico',
      p_metadata: { conversation_id: conversation.id, customer_id: conversation.customer_id },
    })
  }

  if (mustEscalate) {
    await admin.from('conversation_events').insert({
      company_id: company,
      conversation_id: conversation.id,
      type: 'conversation.escalated',
      title: 'Encaminhado para atendimento humano',
      description:
        outcome.escalation_reason ??
        (ultimaMidiaIlegivel
          ? 'O cliente enviou um arquivo que a IA nao conseguiu ler.'
          : lowConfidence
            ? 'Confianca da IA abaixo do minimo configurado.'
            : 'Solicitado pela IA.'),
      actor_type: 'ia',
    })
  }

  await admin.from('ai_runs').insert({
    company_id: company,
    conversation_id: conversation.id,
    message_id: messageId,
    kind: 'resposta',
    provider: result.provider ?? null,
    model: result.model ?? null,
    used_fallback: result.usedFallback,
    ok: true,
    intent: outcome.intent,
    category: outcome.category,
    priority: outcome.priority,
    confidence: outcome.confidence,
    summary: outcome.summary,
    reply: outcome.reply,
    action: mustEscalate ? 'escalonado' : 'respondido',
    escalated: mustEscalate,
    latency_ms: result.latencyMs,
    input_tokens: result.inputTokens ?? null,
    output_tokens: result.outputTokens ?? null,
  })

  await admin
    .from('ai_providers')
    .update({ last_used_at: new Date().toISOString() })
    .eq('company_id', company)
    .eq('provider', result.provider!)

  // Escalonado significa que uma pessoa assumiu: mensagem nova nao volta
  // para a IA. Fora isso, se entrou mensagem enquanto respondiamos, ela
  // precisa de resposta — e este e o unico lugar que sabe disso.
  const repetir = !mustEscalate && (await chegouMensagemNova())

  return {
    repetir,
    resposta: { ok: true, outcome, escalated: mustEscalate, sendError },
  }
}

async function escalate(
  admin: Admin,
  conversation: { id: string; company_id: string },
  reason: string,
) {
  await admin
    .from('conversations')
    .update({ status: 'aguardando_humano' })
    .eq('id', conversation.id)

  await admin.from('conversation_events').insert({
    company_id: conversation.company_id,
    conversation_id: conversation.id,
    type: 'conversation.escalated',
    title: 'Encaminhado para atendimento humano',
    description: reason,
    actor_type: 'sistema',
  })
}
