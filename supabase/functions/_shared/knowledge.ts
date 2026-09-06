import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import type { AiOutcome, CompanyKnowledge, FaqEntry } from './ai.ts'

/**
 * Tudo que a IA pode afirmar, mais as etiquetas que ela pode aplicar.
 *
 * Carregado a cada resposta de propósito: quando alguém corrige o endereço na
 * tela de conhecimento, a correção vale na próxima mensagem — não depois de um
 * deploy.
 */
export async function loadKnowledge(admin: SupabaseClient, companyId: string) {
  const [{ data: base }, { data: faq }, { data: tags }] = await Promise.all([
    admin.from('company_knowledge').select('*').eq('company_id', companyId).maybeSingle(),
    admin
      .from('knowledge_faq')
      .select('question, answer')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .order('created_at', { ascending: true })
      .limit(40),
    admin
      .from('tags')
      .select('name, description')
      .eq('company_id', companyId)
      .eq('is_ai_assignable', true)
      .order('position', { ascending: true }),
  ])

  return {
    knowledge: (base ?? null) as CompanyKnowledge | null,
    faq: (faq ?? []) as FaqEntry[],
    tags: (tags ?? []) as Array<{ name: string; description: string | null }>,
  }
}

/**
 * Guarda a pergunta que a IA não soube responder.
 *
 * Não é aprendizado automático: fica parada até alguém escrever a resposta e
 * aprovar. É o que impede a IA de "aprender" uma informação errada que ela
 * mesma inventou numa conversa anterior.
 */
export async function registrarDuvida(
  admin: SupabaseClient,
  input: {
    companyId: string
    conversationId: string
    customerId: string | null
    question: string
    intent: string | null
    aiNote: string | null
  },
) {
  // Mesma dúvida já esperando revisão não vira uma segunda linha na fila.
  const { data: repetida } = await admin
    .from('ai_learning_queue')
    .select('id')
    .eq('company_id', input.companyId)
    .eq('status', 'pendente')
    .ilike('question', input.question.slice(0, 120))
    .maybeSingle()
  if (repetida) return

  await admin.from('ai_learning_queue').insert({
    company_id: input.companyId,
    conversation_id: input.conversationId,
    customer_id: input.customerId,
    question: input.question,
    intent: input.intent,
    ai_note: input.aiNote,
  })
}

/**
 * Aplica as etiquetas que a IA escolheu.
 *
 * Só cola etiqueta que já existe e que está liberada para a IA — ela não cria
 * vocabulário novo. Fica marcado `by_ai` para dar para separar depois o que a
 * máquina achou do que uma pessoa confirmou.
 */
export async function aplicarEtiquetas(
  admin: SupabaseClient,
  companyId: string,
  conversationId: string,
  nomes: string[],
) {
  if (nomes.length === 0) return

  const { data: existentes } = await admin
    .from('tags')
    .select('id, name')
    .eq('company_id', companyId)
    .eq('is_ai_assignable', true)

  if (!existentes || existentes.length === 0) return

  const porNome = new Map(
    existentes.map((t) => [String(t.name).trim().toLowerCase(), t.id as string]),
  )

  const linhas = nomes
    .map((nome) => porNome.get(nome.trim().toLowerCase()))
    .filter((id): id is string => Boolean(id))
    .map((tag_id) => ({
      conversation_id: conversationId,
      tag_id,
      company_id: companyId,
      by_ai: true,
    }))

  if (linhas.length === 0) return

  // Já marcada por uma pessoa continua sendo dela: não sobrescreve.
  await admin.from('conversation_tags').upsert(linhas, {
    onConflict: 'conversation_id,tag_id',
    ignoreDuplicates: true,
  })
}

/* ------------------------------------------------------ Escolha das respostas */

/**
 * Palavras que aparecem em qualquer frase e não dizem nada sobre o assunto.
 * Sem esta lista, "de" e "que" fariam toda pergunta parecer relevante.
 */
const VAZIAS = new Set([
  'para', 'pelo', 'pela', 'como', 'onde', 'quando', 'qual', 'quais', 'quanto',
  'quanta', 'esse', 'essa', 'isso', 'este', 'esta', 'aquele', 'aquela', 'com',
  'sem', 'por', 'dos', 'das', 'nos', 'nas', 'uma', 'uns', 'umas', 'meu', 'minha',
  'seu', 'sua', 'voces', 'voce', 'tem', 'tem', 'ter', 'fazer', 'faz', 'ser',
  'estar', 'esta', 'mais', 'menos', 'muito', 'pouco', 'aqui', 'ali', 'sobre',
  'entao', 'porque', 'pois', 'mas', 'ainda', 'ja', 'nao', 'sim', 'obrigado',
  'bom', 'boa', 'dia', 'tarde', 'noite', 'preciso', 'queria', 'gostaria',
])

function palavras(texto: string): string[] {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((p) => p.length >= 4 && !VAZIAS.has(p))
}

/**
 * Escolhe as respostas aprovadas que têm a ver com o que o cliente acabou de
 * perguntar.
 *
 * Antes as 40 iam inteiras para o prompt, toda vez. Conforme a base cresce
 * isso incha a instrução, encarece cada mensagem e — o pior — dilui o que
 * importa no meio do que não tem nada a ver com a conversa. Aqui entram as
 * mais próximas do assunto; o resto continua na base, só não ocupa espaço
 * agora.
 *
 * A pontuação é por palavra em comum, com a pergunta valendo o dobro da
 * resposta: quem casa com a pergunta cadastrada é quase sempre a entrada certa.
 * Sem nenhuma palavra em comum, completa com as primeiras cadastradas — que
 * costumam ser as básicas (endereço, horário, o que a empresa faz).
 */
export function selecionarFaq(faq: FaqEntry[], assunto: string, limite = 8): FaqEntry[] {
  if (faq.length <= limite) return faq

  const alvo = new Set(palavras(assunto))
  if (alvo.size === 0) return faq.slice(0, limite)

  const pontuadas = faq.map((item, ordem) => {
    const naPergunta = palavras(item.question).filter((p) => alvo.has(p)).length
    const naResposta = palavras(item.answer).filter((p) => alvo.has(p)).length
    return { item, ordem, pontos: naPergunta * 2 + naResposta }
  })

  const relevantes = pontuadas
    .filter((p) => p.pontos > 0)
    .sort((a, b) => b.pontos - a.pontos || a.ordem - b.ordem)
    .slice(0, limite)

  if (relevantes.length === limite) return relevantes.map((p) => p.item)

  // Completa com as cadastradas primeiro, sem repetir o que já entrou.
  const escolhidas = new Set(relevantes.map((p) => p.ordem))
  for (const p of pontuadas) {
    if (escolhidas.size >= limite) break
    escolhidas.add(p.ordem)
  }

  return [...escolhidas].sort((a, b) => a - b).map((ordem) => faq[ordem])
}

/**
 * O que a IA apurou e vai para a linha da conversa.
 *
 * São duas leituras da mesma mensagem: a comercial (em que pé está a venda) e
 * a técnica (o que a oficina precisa saber para se preparar). Ficam juntas
 * porque são gravadas na mesma escrita — separá-las custaria uma ida a mais ao
 * banco enquanto o cliente espera.
 */
export function classificacaoDaConversa(outcome: AiOutcome) {
  return {
    ai_intent: outcome.intent,
    funnel_stage: outcome.funnel_stage,
    lead_temperature: outcome.lead_temperature,

    ai_sistema: outcome.sistema,
    ai_componentes: outcome.componentes,
    ai_sintoma: outcome.sintoma,
    ai_veiculo_parado: outcome.veiculo_parado,
    ai_risco_seguranca: outcome.risco_seguranca,
  }
}
