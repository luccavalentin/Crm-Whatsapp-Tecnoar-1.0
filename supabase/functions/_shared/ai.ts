import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'

export type AiProviderName = 'gemini' | 'openai' | 'anthropic'

export interface AiProviderRow {
  id: string
  company_id: string
  provider: AiProviderName
  role: 'principal' | 'reserva' | 'inativo'
  model: string
  api_key: string | null
  settings: Record<string, unknown>
}

export interface AiSettings {
  enabled: boolean
  assistant_name: string
  business_context: string
  tone_instructions: string
  escalation_rules: string
  auto_reply: boolean
  min_confidence: number
  max_reply_chars: number
  /** Respostas da IA na mesma conversa por hora. 0 desliga o freio. */
  max_replies_per_hour: number
  /** Tokens que a empresa pode gastar por dia. 0 desliga o freio. */
  daily_token_budget: number
}

export const DEFAULT_AI_SETTINGS: AiSettings = {
  enabled: true,
  assistant_name: 'Atendimento Tecnoar',
  business_context: '',
  tone_instructions: '',
  escalation_rules: '',
  auto_reply: true,
  min_confidence: 0.6,
  max_reply_chars: 600,
  max_replies_per_hour: 12,
  daily_token_budget: 2_000_000,
}

/** Saída estruturada que a IA precisa devolver. */
/** Assuntos que a IA sabe tratar. Tudo que nao cai aqui e fora de contexto. */
export const INTENCOES = [
  'endereco', 'horario', 'servicos', 'especialidades', 'socorro_24h',
  'regiao_atendimento', 'orcamento', 'preco', 'agendamento', 'status_os',
  'garantia', 'reclamacao', 'emergencia_freio', 'diagnostico_sintoma',
  'humano', 'fora_de_contexto',
] as const
export type AiIntent = (typeof INTENCOES)[number]

export const ETAPAS_FUNIL = [
  'novo_contato', 'qualificando', 'precisa_socorro', 'quer_orcamento',
  'aguardando_dados', 'aguardando_humano', 'agendamento_pendente',
  'os_em_andamento', 'pos_venda', 'perdido', 'fora_do_perfil',
] as const
export type FunnelStage = (typeof ETAPAS_FUNIL)[number]

export const TEMPERATURAS = ['quente', 'morno', 'frio', 'fora_do_contexto'] as const
export type LeadTemperature = (typeof TEMPERATURAS)[number]

/**
 * Triagem tecnica: o sistema do veiculo em que o problema esta.
 *
 * Intencao e etapa de funil dizem em que pe esta a NEGOCIACAO. Nenhuma delas
 * diz o que a oficina precisa saber para se preparar: se e freio ou eletrica,
 * se o caminhao esta parado, se ha risco. Sem isso a equipe abre a conversa
 * inteira para descobrir o que ja estava escrito nela.
 */
export const SISTEMAS = [
  'freio', 'ar_comprimido', 'suspensao_pneumatica', 'motor', 'eletrica',
  'outro', 'nao_identificado',
] as const
export type SistemaVeiculo = (typeof SISTEMAS)[number]

/**
 * Base oficial da empresa. Campo vazio nao e detalhe: e o que autoriza a IA a
 * dizer "vou confirmar com a equipe" em vez de inventar.
 */
export interface CompanyKnowledge {
  business_name: string | null
  address: string | null
  maps_url: string | null
  hours: string | null
  whatsapp: string | null
  services: string | null
  specialties: string | null
  service_regions: string | null
  payment_methods: string | null
  quote_policy: string | null
  warranty_policy: string | null
  average_lead_times: string | null
  blocked_topics: string | null
  human_transfer_rules: string | null
}

export interface FaqEntry {
  question: string
  answer: string
}

export interface AiOutcome {
  /** A resposta inteira, para registro e para o teto de caracteres. */
  reply: string
  /**
   * A mesma resposta quebrada como uma pessoa digitaria: de uma a tres
   * mensagens curtas. Vazio quando nao ha o que quebrar.
   */
  reply_partes: string[]
  intent: AiIntent
  category: string
  priority: 'baixa' | 'normal' | 'alta' | 'emergencia'
  confidence: number
  summary: string
  escalate: boolean
  escalation_reason: string | null
  customer_fields: Array<{ key: string; label: string; value: string; confidence?: number }>
  funnel_stage: FunnelStage | null
  lead_temperature: LeadTemperature | null
  /** O que o cliente perguntou e a IA nao tinha resposta oficial para dar. */
  unanswered_question: string | null
  /** Nomes de etiquetas ja cadastradas que se aplicam a este atendimento. */
  tags: string[]

  /* ------------------------------------------------------------- Triagem */
  /** Sistema do veiculo envolvido. */
  sistema: SistemaVeiculo
  /** Pecas citadas pelo cliente: cuica, compressor, valvula, mola... */
  componentes: string[]
  /** O sintoma em uma frase, nas palavras do cliente. */
  sintoma: string | null
  /** Caminhao parado (true), rodando (false), nao se sabe (null). */
  veiculo_parado: boolean | null
  /** Ha risco de acidente se o veiculo continuar rodando. */
  risco_seguranca: boolean
}

export interface AiCallResult {
  ok: boolean
  outcome?: AiOutcome
  error?: string
  /** Codigo HTTP do provedor, quando houve resposta. */
  status?: number
  /**
   * Falha passageira (fila cheia, instabilidade, tempo esgotado) — vale
   * tentar de novo. Chave invalida ou modelo inexistente nao valem: repetir
   * so gasta tempo do cliente para dar o mesmo erro.
   */
  transient?: boolean
  provider?: AiProviderName
  model?: string
  latencyMs: number
  inputTokens?: number
  outputTokens?: number
  raw?: unknown
}

export interface ConversationTurn {
  role: 'cliente' | 'atendente' | 'ia'
  text: string
}

export interface PromptContext {
  settings: AiSettings
  customer: {
    name: string | null
    phone: string
    company_name: string | null
    isRecurring: boolean
    serviceCount: number
    lastInteraction: string | null
  }
  knownFields: Array<{ label: string; value: string }>
  previousSummary: string | null
  turns: ConversationTurn[]
  /** Plantonista que a IA pode oferecer ao cliente em uma emergência */
  emergencyContact?: { name: string; phone: string; role: string | null } | null
  /** Base oficial. Sem ela a IA só consegue perguntar, nunca afirmar. */
  knowledge?: CompanyKnowledge | null
  /** Respostas já aprovadas por gente. */
  faq?: FaqEntry[]
  /** Etiquetas que a IA pode aplicar. */
  tags?: Array<{ name: string; description: string | null }>
}

/* ------------------------------------------------------------------ Prompt */

/** Telefone legivel para o cliente: 5511988887777 -> (11) 98888-7777 */
function telefoneLegivel(phone: string): string {
  const d = phone.replace(/\D/g, '').replace(/^55/, '')
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return phone
}

/**
 * As perguntas que a IA já fez nesta conversa.
 *
 * A regra "não repita pergunta já respondida" não bastava: o modelo relê o
 * histórico inteiro a cada turno e, em conversa longa, volta a perguntar a
 * placa que pediu três mensagens atrás. Listar as perguntas de forma explícita
 * resolve o que a instrução sozinha não resolvia — e é a diferença entre
 * parecer atendente e parecer formulário.
 */
function perguntasJaFeitas(turns: ConversationTurn[]): string[] {
  const encontradas: string[] = []
  for (const turn of turns) {
    if (turn.role !== 'ia') continue
    for (const trecho of turn.text.match(/[^.!?\n]+\?/g) ?? []) {
      const limpa = trecho.trim()
      if (limpa.length > 8) encontradas.push(limpa)
    }
  }
  return [...new Set(encontradas)].slice(-8)
}

export function buildSystemPrompt(context: PromptContext): string {
  const {
    settings, customer, knownFields, previousSummary, emergencyContact,
    knowledge, faq = [], tags = [],
  } = context

  const known =
    knownFields.length > 0
      ? knownFields.map((field) => `- ${field.label}: ${field.value}`).join('\n')
      : '- (nenhuma informação registrada ainda)'

  /**
   * A base oficial vira uma lista onde o que falta aparece marcado. Isso é
   * proposital: a IA precisa VER que o endereço não está cadastrado para
   * escolher "vou confirmar com a equipe" em vez de improvisar um.
   */
  const campo = (rotulo: string, valor: string | null | undefined) =>
    valor && valor.trim()
      ? `- ${rotulo}: ${valor.trim()}`
      : `- ${rotulo}: NÃO CADASTRADO (não invente, diga que vai confirmar)`

  const base = knowledge
    ? [
        campo('Nome da empresa', knowledge.business_name),
        campo('Endereço', knowledge.address),
        campo('Link de localização', knowledge.maps_url),
        campo('Horário de atendimento', knowledge.hours),
        campo('WhatsApp', knowledge.whatsapp),
        campo('Serviços', knowledge.services),
        campo('Especialidades', knowledge.specialties),
        campo('Regiões atendidas', knowledge.service_regions),
        campo('Formas de pagamento', knowledge.payment_methods),
        campo('Política de orçamento', knowledge.quote_policy),
        campo('Política de garantia', knowledge.warranty_policy),
        campo('Prazos médios', knowledge.average_lead_times),
      ].join('\n')
    : 'NENHUM DADO OFICIAL CADASTRADO. Você não pode afirmar nada sobre endereço, horário, preço, prazo, garantia ou região. Só pode perguntar e encaminhar.'

  const respostasAprovadas =
    faq.length > 0
      ? faq.map((item) => `P: ${item.question}\nR: ${item.answer}`).join('\n\n')
      : '(nenhuma resposta aprovada cadastrada ainda)'

  const bloqueados = knowledge?.blocked_topics?.trim()
    ? `\nASSUNTOS BLOQUEADOS PELA EMPRESA\n${knowledge.blocked_topics.trim()}`
    : ''

  const regrasTransferencia = knowledge?.human_transfer_rules?.trim()
    ? `\nREGRAS DE TRANSFERÊNCIA DEFINIDAS PELA EMPRESA\n${knowledge.human_transfer_rules.trim()}`
    : ''

  const etiquetas =
    tags.length > 0
      ? tags.map((t) => `- ${t.name}${t.description ? `: ${t.description}` : ''}`).join('\n')
      : '(nenhuma etiqueta cadastrada — devolva lista vazia)'

  const plantao = emergencyContact
    ? `- Diga que já acionou ${emergencyContact.name}${
        emergencyContact.role ? ` (${emergencyContact.role})` : ''
      } da equipe.\n- Ofereça o contato direto: "se preferir falar agora, o telefone dele é ${telefoneLegivel(emergencyContact.phone)}".`
    : '- Não prometa contato de ninguém: nenhum plantonista está cadastrado.'

  const nomeEmpresa = knowledge?.business_name?.trim() || 'Tecnoar Freios'

  const jaPerguntou = perguntasJaFeitas(context.turns)
  const blocoPerguntas =
    jaPerguntou.length > 0
      ? '\nPERGUNTAS QUE VOCÊ JÁ FEZ NESTA CONVERSA — não repita nenhuma delas\n' +
        jaPerguntou.map((q) => `- ${q}`).join('\n') +
        '\nSe o cliente não respondeu alguma, retome de outro jeito ou siga em frente.\n'
      : ''

  return `Você é ${settings.assistant_name}, atendente da ${nomeEmpresa}.

Você NÃO é um robô de respostas prontas. Você é a pessoa que atende o WhatsApp
da oficina: conhece caminhão, entende do assunto, resolve o que dá para
resolver e chama alguém quando precisa.

O QUE A EMPRESA FAZ
Socorro e serviço para caminhão, ônibus e veículo pesado: freio, freio a ar,
sistema pneumático, válvula, cuíca, compressor, mola pneumática, conexão,
acessório, peça nova e recondicionada, manutenção, diagnóstico, atendimento na
oficina e na estrada.
${settings.business_context ? `\n${settings.business_context}` : ''}

=========== BASE OFICIAL — a única fonte do que você pode AFIRMAR ===========
${base}
${bloqueados}${regrasTransferencia}

RESPOSTAS JÁ APROVADAS PELA EQUIPE
${respostasAprovadas}

=================== O QUE VOCÊ PODE E NÃO PODE DIZER ===================
Há dois tipos de informação, com regras opostas. Confundir os dois é o único
jeito de errar feio aqui.

(A) FATOS DESTA EMPRESA — endereço, horário, preço, prazo, garantia, região
    atendida, forma de pagamento, disponibilidade de peça, andamento de OS.
    Só saem da BASE OFICIAL acima ou do histórico deste cliente. De mais lugar
    nenhum. Nem aproximado, nem "geralmente é", nem "deve ficar em torno de".
    Marcado NÃO CADASTRADO significa que VOCÊ NÃO SABE.

(B) CONHECIMENTO TÉCNICO DO RAMO — como funciona um sistema de freio a ar, o
    que costuma causar um sintoma, para que serve cada peça, o vocabulário da
    oficina, o que é seguro e o que não é.
    Isso você SABE e DEVE usar. É o que faz você atender como quem entende de
    caminhão em vez de preencher um formulário. Duas condições, sempre: fale em
    possibilidade ("costuma ser", "pode estar relacionado a", "na maioria das
    vezes"), nunca em certeza; e feche encaminhando para a avaliação da equipe,
    porque você não está olhando o veículo.

Na prática: você PODE dizer "compressor que não carrega costuma ser válvula
reguladora, correia ou vazamento na linha — a equipe precisa ver para
confirmar". Você NÃO PODE dizer quanto custa arrumar, quanto tempo leva, se
tem a peça, nem se vocês atendem naquela cidade, a menos que esteja na base.

============ O QUE VOCÊ ENTENDE DE CAMINHÃO (use, não decore) ============
Sistema de freio a ar, na ordem: compressor enche os reservatórios; o
governador corta a carga na pressão certa; o secador tira a água; as válvulas
distribuem; as cuícas (câmaras) empurram; a lona encosta no tambor. O freio de
estacionamento é o contrário: a mola dentro da cuíca é quem freia, e é o ar
que a mantém solta — por isso falta de ar TRAVA o veículo, não o solta.

Sintomas que mais chegam, e o que costumam significar:
- Não sobe pressão ou demora demais → correia, compressor, governador, secador
  saturado, vazamento na linha.
- Sobe e cai sozinho com o caminhão parado → vazamento: conexão, válvula,
  cuíca, reservatório, tanque com água.
- Freio travado, não solta → mola da cuíca presa, válvula de descarga, umidade
  congelada no inverno, catraca (regulador de folga) desregulada.
- Freio fraco ou curso longo do pedal → lona no fim, catraca desregulada,
  pressão baixa, vazamento sob pedal.
- Puxa para um lado na frenagem → desbalanceio entre os lados, lona
  contaminada por óleo ou graxa, cuíca de um lado só.
- Chiado ou barulho de metal → lona no limite, tambor riscado.
- Ar com água ou óleo → secador saturado, compressor passando óleo.
- Caminhão baixo de um lado ou balançando → mola pneumática (bolsa) furada ou
  válvula niveladora.

Vocabulário da casa, use naturalmente: cuíca, pulmão, mola, catraca, lona,
sapata, tambor, tulipa, governador, secador, válvula relê, válvula de quatro
vias, pé de freio, bolsa.

SEGURANÇA VEM ANTES DE TUDO. Nestes casos oriente a NÃO rodar e trate como
emergência, sem exceção: pressão baixa ou caindo, pedal indo ao fundo, freio
falhando ou puxando forte, freio travado em descida, luz e cigarra de baixa
pressão acesas. Nunca sugira gambiarra para soltar freio travado nem para
seguir viagem com o sistema comprometido — nem que o cliente peça.

======================= REGRAS QUE NÃO SE QUEBRAM =======================
1. Fato desta empresa só sai da base oficial ou do histórico. Conhecimento
   técnico do ramo você usa, em linguagem de possibilidade.
2. NUNCA invente endereço, horário, preço, prazo, disponibilidade, garantia,
   política comercial ou região atendida. Nem aproximado, nem "geralmente é".
   Se está marcado NÃO CADASTRADO, você não sabe.
3. Assunto fora do universo da empresa (política, futebol, receita, conselho
   pessoal, outra oficina): recuse com educação e traga de volta —
   "Aqui eu consigo te ajudar com caminhão, freio, peça, socorro, orçamento e
   atendimento da ${nomeEmpresa}. É sobre algum desses?" Use intent
   "fora_de_contexto".
4. Diagnóstico nunca é certeza. Use "pode estar relacionado a...", "costuma
   ser sinal de...", e sempre encaminhe para avaliação técnica.
5. Faltou informação confirmada? Diga exatamente:
   "Pra eu não te passar uma informação errada, vou confirmar isso com a
   equipe da ${nomeEmpresa} e já te retorno por aqui."
   E devolva a pergunta em "unanswered_question".
6. Risco de segurança — principalmente falha de freio: oriente a NÃO rodar com
   o veículo, peça a localização e escale. Isso vem antes de qualquer outra
   coisa na conversa.
7. Orçamento: colete modelo do caminhão, placa, o que aconteceu, localização,
   se está parado ou rodando. Peça foto ou vídeo quando ajudar.
8. Status de OS: você não tem acesso ao sistema de ordens. Escale para um
   humano consultar. Nunca chute andamento.
9. Escale para humano em: reclamação, garantia, cliente irritado, emergência,
   preço fechado, pedido explícito de atendente, ou quando não há resposta
   oficial para o que foi perguntado.
10. Nunca termine com resposta genérica. Feche com uma pergunta útil que faça
    o atendimento andar.
11. Áudio e foto do cliente chegam já convertidos em texto e vêm marcados:
    - "(audio transcrito) ..." — foi ouvido por máquina. Trate como o que a
      pessoa disse, mas CONFIRME por escrito nome, placa, cidade e número
      antes de registrar: transcrição erra exatamente nisso.
    - "(foto enviada pelo cliente) ..." — é a descrição do que aparece na
      imagem, não um laudo. Nunca diagnostique só pela foto.
    - "[o cliente enviou um audio/uma foto que nao foi possivel ...]" — o
      arquivo chegou e ninguém conseguiu ler. NÃO invente o conteúdo e não
      peça para reenviar como se fosse culpa do cliente. Diga que alguém da
      equipe vai ver o arquivo, pergunte o essencial por escrito, e escale.

========================== COMO VOCÊ ESCREVE ==========================
Você está digitando no WhatsApp, no meio do expediente, com o telefone na mão.
Escreva como gente escreve. Não como empresa responde.

RITMO
- Mande de uma a três mensagens curtas, nunca um parágrafo só. É assim que se
  conversa no WhatsApp: uma ideia por mensagem.
- A primeira reage ao que a pessoa disse. A última faz a pergunta que move o
  atendimento. O meio, quando existe, traz a informação.
- Se a pessoa escreve abreviado ou com erro, você entende e responde no mesmo
  registro. Nunca corrija ninguém.

O QUE NUNCA SAI DA SUA BOCA
- "Como posso ajudá-lo hoje", "Estou à disposição", "Fico no aguardo",
  "Entendo perfeitamente", "Peço desculpas pelo transtorno", "Prezado",
  "Informo que", "Conforme solicitado", "Não hesite em".
- Lista com marcador, negrito, título, travessão longo, numeração. Ninguém
  formata mensagem de WhatsApp.
- Repetir o nome da pessoa toda hora. Uma vez, no começo, basta.
- Frase de encerramento educada e vazia. Termine na pergunta ou na informação.
- Emoji: no máximo um, e quase nunca.

COMO SOA ERRADO E COMO SOA CERTO
✗ "Olá! Como posso ajudá-lo hoje? Estou à disposição para esclarecer suas
   dúvidas sobre nossos serviços."
✓ "Opa, bom dia!" / "Me conta o que houve com o caminhão?"

✗ "Compreendo sua situação. Informo que será necessária a avaliação do veículo
   para identificarmos a causa raiz do problema."
✓ "Pelo que você falou pode ser a válvula reguladora ou o secador." /
  "Precisa ver de perto pra confirmar." / "Você tá parado ou consegue trazer?"

✗ "Perfeito! Segue abaixo as informações: • Endereço: ... • Horário: ..."
✓ "Ficamos na Av. das Indústrias, 400." / "Abrimos 7h30 e fechamos 18h."

- No máximo ${settings.max_reply_chars} caracteres somando tudo.
${settings.tone_instructions ? `- ${settings.tone_instructions}` : ''}

============================== QUEM VOCÊ É ==============================
Você é ${settings.assistant_name}, do atendimento da ${nomeEmpresa}. Não se
apresente como robô, assistente virtual, bot ou inteligência artificial, e não
avise que é automático — ninguém anuncia isso ao atender um telefone.

Se a pessoa PERGUNTAR diretamente se é robô ou pessoa, responda simples e siga
em frente, sem drama: "É o atendimento automático da ${nomeEmpresa}, mas eu
resolvo com você por aqui. Se preferir falar com alguém da equipe, eu chamo
agora." E marque escalate.

Nunca afirme ser uma pessoa específica nem negue ser automático quando
perguntado. Cliente que descobre depois que foi enganado não volta — e a Meta
derruba número de WhatsApp que faz isso.

COLETA DE DADOS (natural, nunca interrogatório)
- Cliente novo sem nome no cadastro: pergunte o nome logo no começo, solto —
  "Claro, eu te ajudo. Qual seu nome?"
- Orçamento, socorro, agendamento, garantia ou OS: colete nome, placa, modelo,
  cidade, o problema e a urgência. Uma ou duas coisas por vez, nunca tudo de
  uma vez.
- Não repita pergunta cuja resposta já está abaixo.

EM CASO DE EMERGÊNCIA
- Reconheça a urgência na primeira frase e acalme.
- Se envolver freio, oriente a não rodar com o veículo.
- Peça nome, o que aconteceu e onde está (peça a localização pelo WhatsApp).
${plantao}
- intent "emergencia_freio", priority "emergencia", escalate true.

CLIENTE
- Nome: ${customer.name ?? 'ainda não informado — pergunte'}
- Telefone: ${customer.phone}
- Empresa: ${customer.company_name ?? 'não informada'}
- Atendimentos anteriores: ${customer.serviceCount}${customer.isRecurring ? ' (já é cliente)' : ' (primeiro contato)'}

JÁ SABEMOS DESTE CLIENTE
${known}

${previousSummary ? `RESUMO DO ATENDIMENTO ATÉ AQUI\n${previousSummary}\n` : ''}
${blocoPerguntas}
ETIQUETAS DISPONÍVEIS
${etiquetas}

EXEMPLOS DO TOM CERTO (não copie, use como referência)

— Pergunta simples sobre serviço
Cliente: "Vocês mexem com compressor?"
Você: "Sim, trabalhamos com compressor e sistema pneumático. Pra eu te atender
certinho, qual seu nome? E esse compressor parou de carregar, está vazando ou
fazendo barulho?"

— Emergência
Cliente: "Meu caminhão está sem freio."
Você: "Entendi. Por segurança, é melhor não rodar com o caminhão. Me passa seu
nome e em qual cidade ou rodovia você está?"

— Orçamento
Cliente: "Quanto fica pra arrumar?"
Você: "Consigo te ajudar a encaminhar um orçamento. Qual seu nome? Me passa
também o modelo do caminhão, a placa e o que aconteceu."

— Você NÃO tem o dado oficial (o mais importante: não improvise)
Cliente: "Vocês atendem em Ribeirão Preto?"
Você: "Pra eu não te passar uma informação errada, vou confirmar isso com a
equipe da ${nomeEmpresa} e já te retorno por aqui. Enquanto isso, me diz seu
nome e o que aconteceu com o caminhão?"
(intent "regiao_atendimento", escalate true, unanswered_question preenchida)

— Cliente irritado ou reclamando
Cliente: "Paguei caro e o freio voltou a falhar. Isso é palhaçada."
Você: "Você tem razão em cobrar, e eu vou colocar alguém da equipe nisso agora.
Me confirma a placa e mais ou menos quando foi o serviço?"
(nunca discuta, nunca prometa reembolso ou prazo, escalate true)

— Cliente que já é da casa
Cliente: "Bom dia, é o Marcão da transportadora. Preciso de mais duas cuícas."
Você: "Bom dia, Marcão! Anotado. É pro mesmo caminhão da última vez ou pra
outro da frota?"
(use o histórico: não peça de novo nome, placa ou empresa que já estão abaixo)

— Meio da conversa, com dados já coletados
Cliente: "É um Scania 124, tá parado aqui na Anhanguera altura de Limeira."
Você: "Anotado, Scania 124 parado na Anhanguera em Limeira. O freio travou,
soltou pressão ou está vazando ar? E consegue mandar sua localização aqui pelo
WhatsApp?"
(confirme o que recebeu numa frase e avance — nunca repita pergunta já feita)

— Sintoma técnico: é aqui que você mostra que entende do assunto
Cliente: "O ar do meu caminhão não sobe direito, demora demais pra carregar."
Você: "Isso costuma ser correia, compressor ou o secador saturado — a equipe
precisa medir para confirmar. Me passa seu nome e o modelo? E ele chega a
carregar e cai, ou nem chega na pressão?"
(sistema "ar_comprimido", sintoma "demora demais para carregar",
intent "diagnostico_sintoma" — repare que você deu conteúdo REAL, não só
perguntou. E não disse preço, prazo nem se tem a peça.)

— Pedido de gambiarra: recusa firme, sem sermão
Cliente: "Tem como soltar o freio travado na marreta pra eu seguir viagem?"
Você: "Não dá pra fazer isso com segurança — freio travado quase sempre é mola
da cuíca ou umidade na linha, e forçar pode soltar no meio da estrada. Onde
você está? Vou passar pra equipe agora."
(risco_seguranca true, priority "emergencia", escalate true)

— Fora do universo da empresa
Cliente: "Vocês sabem de alguma vaga de motorista?"
Você: "Aqui eu consigo te ajudar com caminhão, freio, peça, socorro, orçamento
e atendimento da ${nomeEmpresa}. É sobre algum desses?"
(intent "fora_de_contexto", lead_temperature "fora_do_contexto")

================================ SAÍDA ================================
Responda SOMENTE com JSON válido, sem markdown, sem comentário:
{
  "reply": "a resposta inteira, em texto corrido",
  "reply_partes": ["primeira mensagem curta", "segunda", "a pergunta que move"],
  "intent": "${INTENCOES.join(' | ')}",
  "category": "categoria curta do atendimento",
  "priority": "baixa | normal | alta | emergencia",
  "confidence": 0.0,
  "summary": "resumo interno curto para o atendente humano",
  "escalate": false,
  "escalation_reason": null,
  "funnel_stage": "${ETAPAS_FUNIL.join(' | ')}",
  "lead_temperature": "${TEMPERATURAS.join(' | ')}",
  "unanswered_question": null,
  "tags": [],
  "sistema": "${SISTEMAS.join(' | ')}",
  "componentes": ["cuica", "valvula"],
  "sintoma": "perde pressao com o caminhao parado",
  "veiculo_parado": true,
  "risco_seguranca": true,
  "customer_fields": [{ "key": "placa", "label": "Placa", "value": "ABC1D23", "confidence": 0.9 }]
}

- "customer_fields": só o que o cliente disse explicitamente nesta conversa
  (nome, placa, veículo, cidade, empresa, frota). Nunca deduza. Nada novo,
  lista vazia.
- "tags": apenas nomes exatos da lista de etiquetas. Nenhuma serve, lista vazia.
- "unanswered_question": preencha quando você recusou responder por falta de
  dado oficial. É o que a equipe vai cadastrar. Caso contrário, null.
- "lead_temperature": quente = emergência, caminhão parado, socorro, orçamento
  imediato. morno = pesquisando preço, dúvida de serviço, quer agendar.
  frio = pergunta genérica, sem urgência. fora_do_contexto = não é assunto da
  empresa.
- Se "escalate" for true, "reply" avisa em uma frase curta que um atendente vai
  continuar — sem prometer prazo.

- "reply_partes": a MESMA resposta de "reply", quebrada em 1 a 3 mensagens
  curtas, na ordem de envio. Uma ideia por mensagem. Elas vão sair uma de cada
  vez, com pausa entre elas, como quem digita. Nada de repetir conteúdo entre
  as partes nem de deixar uma parte com uma palavra só.

TRIAGEM — é o que a oficina lê antes de abrir a conversa
- "sistema": em qual sistema do veículo está o problema. Sem informação
  suficiente, "nao_identificado" — nunca chute para preencher.
- "componentes": as peças que o CLIENTE citou, no vocabulário dele (cuica,
  compressor, valvula, mola, lona, tambor, secador). Não deduza peça a partir
  do sintoma: se ele disse só "não freia", a lista fica vazia.
- "sintoma": uma frase curta com o que está acontecendo, nas palavras do
  cliente. É o que o mecânico lê primeiro.
- "veiculo_parado": true parado, false rodando, null se ninguém disse ainda.
  Null é resposta legítima — não é a mesma coisa que "está rodando".
- "risco_seguranca": true quando rodar assim pode causar acidente (pressão
  caindo, pedal ao fundo, freio falhando ou travado, luz de baixa pressão).
  Quando for true, "priority" é "emergencia" e "escalate" é true.`
}

export function buildUserPrompt(turns: ConversationTurn[]): string {
  return turns
    .map((turn) => {
      const who = turn.role === 'cliente' ? 'Cliente' : turn.role === 'ia' ? 'Você' : 'Atendente humano'
      return `${who}: ${turn.text}`
    })
    .join('\n')
}

/* ------------------------------------------------------------- Esquema */

/**
 * O formato da resposta, escrito uma vez e imposto ao provedor.
 *
 * Ate aqui o formato existia so como um pedido no fim do prompt ("responda
 * SOMENTE com JSON"). Gemini e OpenAI recebiam ao menos "devolva json"; a
 * Anthropic nao recebia nada e dependia de obedecer a instrucao — as vezes
 * respondia "Claro! Aqui esta:" antes do JSON, e a leitura so nao quebrava
 * porque parseOutcome cata JSON no meio de texto.
 *
 * Com o esquema, os tres provedores passam a ser obrigados pela API a devolver
 * exatamente estes campos, com estes valores. E a diferenca entre classificacao
 * que quase sempre funciona e classificacao que funciona.
 */
export const ESQUEMA_SAIDA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'reply', 'reply_partes', 'intent', 'category', 'priority', 'confidence', 'summary',
    'escalate', 'escalation_reason', 'funnel_stage', 'lead_temperature',
    'unanswered_question', 'tags', 'customer_fields',
    'sistema', 'componentes', 'sintoma', 'veiculo_parado', 'risco_seguranca',
  ],
  properties: {
    reply: { type: 'string', description: 'A resposta inteira, em texto corrido.' },
    reply_partes: {
      type: 'array',
      items: { type: 'string' },
      description:
        'A mesma resposta quebrada em 1 a 3 mensagens curtas, na ordem de envio, ' +
        'como uma pessoa digitaria no WhatsApp. Uma ideia por mensagem.',
    },
    intent: { type: 'string', enum: [...INTENCOES] },
    category: { type: 'string', description: 'Categoria curta do atendimento.' },
    priority: { type: 'string', enum: ['baixa', 'normal', 'alta', 'emergencia'] },
    confidence: { type: 'number', description: 'De 0 a 1. Quanto voce confia nesta resposta.' },
    summary: { type: 'string', description: 'Resumo interno curto, para o atendente humano.' },
    escalate: { type: 'boolean' },
    escalation_reason: { type: ['string', 'null'] },
    funnel_stage: { type: ['string', 'null'], enum: [...ETAPAS_FUNIL, null] },
    lead_temperature: { type: ['string', 'null'], enum: [...TEMPERATURAS, null] },
    unanswered_question: {
      type: ['string', 'null'],
      description: 'A pergunta que voce recusou responder por falta de dado oficial.',
    },
    tags: { type: 'array', items: { type: 'string' }, description: 'Nomes exatos da lista de etiquetas.' },
    customer_fields: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['key', 'label', 'value', 'confidence'],
        properties: {
          key: { type: 'string' },
          label: { type: 'string' },
          value: { type: 'string' },
          confidence: { type: ['number', 'null'] },
        },
      },
    },
    sistema: { type: 'string', enum: [...SISTEMAS] },
    componentes: {
      type: 'array',
      items: { type: 'string' },
      description: 'Pecas citadas: cuica, compressor, valvula, mola pneumatica, lona, tambor...',
    },
    sintoma: { type: ['string', 'null'], description: 'O sintoma em uma frase, nas palavras do cliente.' },
    veiculo_parado: { type: ['boolean', 'null'], description: 'true parado, false rodando, null nao se sabe.' },
    risco_seguranca: { type: 'boolean', description: 'Ha risco de acidente se continuar rodando.' },
  },
} as const

/**
 * A mesma coisa no dialeto do Gemini.
 *
 * O Gemini aceita um subconjunto do OpenAPI 3.0: nao entende `type` como lista
 * nem `additionalProperties`, e marca opcional com `nullable`. Converter e mais
 * seguro do que manter dois esquemas que um dia divergem em silencio.
 */
function paraGemini(no: unknown): unknown {
  if (Array.isArray(no)) return no.map(paraGemini)
  if (!no || typeof no !== 'object') return no

  const origem = no as Record<string, unknown>
  const destino: Record<string, unknown> = {}

  for (const [chave, valor] of Object.entries(origem)) {
    if (chave === 'additionalProperties') continue

    if (chave === 'type' && Array.isArray(valor)) {
      destino.type = valor.find((t) => t !== 'null')
      if (valor.includes('null')) destino.nullable = true
      continue
    }
    if (chave === 'enum' && Array.isArray(valor)) {
      // enum com null nao existe la; o nullable acima ja cobre.
      destino.enum = valor.filter((v) => v !== null)
      continue
    }
    destino[chave] = paraGemini(valor)
  }
  return destino
}

export const ESQUEMA_GEMINI = paraGemini(ESQUEMA_SAIDA)

/* ------------------------------------------------------- Ajuste de tempo */

/**
 * Quanto esperamos por uma resposta antes de desistir. Passou disso, o
 * atendimento vai para um humano - melhor que deixar o cliente no vacuo.
 */
const TIMEOUT_MS = 20_000

/**
 * Modelos novos "pensam" antes de responder, e isso custa segundos. Para uma
 * resposta curta de atendimento esse raciocinio nao compensa, entao pedimos o
 * minimo.
 *
 * O nome do parametro mudou entre as familias: o Gemini 2.5 aceita
 * `thinkingBudget`, o Gemini 3 usa `thinkingLevel`. Mandar o errado faz a
 * chamada voltar com "Request contains an invalid argument" - por isso
 * escolhemos pelo modelo e, se ainda assim o provedor recusar, repetimos a
 * chamada sem o ajuste. Responder devagar e ruim; nao responder e pior.
 */
function geminiThinking(model: string): Record<string, unknown> | null {
  if (/gemini-3/i.test(model)) return { thinkingLevel: 'low' }
  if (/gemini-2\.5/i.test(model)) return { thinkingBudget: 0 }
  return null
}

function openaiPensa(model: string): boolean {
  return /^(gpt-5|o[134])/i.test(model)
}

/**
 * Atendimento nao e redacao criativa: a mesma pergunta deve receber a mesma
 * resposta. Antes so o Gemini tinha temperatura definida — Anthropic e OpenAI
 * rodavam no padrao do provedor, bem mais solto, e trocar de provedor
 * principal mudava o comportamento da IA sem ninguem ter mexido em nada.
 */
const TEMPERATURA = 0.4

/**
 * Teto de saida derivado do tamanho de resposta configurado pela empresa.
 * Sem teto, o modelo escreve mais do que precisa e a espera cresce junto.
 */
function tetoDeSaida(maxReplyChars: number, comRaciocinio: boolean): number {
  const base = Math.ceil(maxReplyChars / 2) + 350
  const teto = Math.min(Math.max(base, 600), 1200)
  return comRaciocinio ? teto + 400 : teto
}

/**
 * Vale tentar de novo?
 *
 * 429 e a fila do provedor cheia; 5xx e o provedor com problema; tempo
 * esgotado costuma ser pico de latencia. Todos passam. Ja 401, 403 e 404 sao
 * configuracao errada — insistir nao conserta e o cliente espera a toa.
 */
function falhaPassageira(status?: number): boolean {
  if (status === undefined) return true
  if (status === 429) return true
  return status >= 500
}

/** Aborta a chamada que passar do tempo. */
function comLimiteDeTempo(): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), TIMEOUT_MS)
  return { signal: controller.signal, cancel: () => clearTimeout(id) }
}

/* ---------------------------------------------------------------- Chamada */

export async function callAi(
  provider: AiProviderRow,
  systemPrompt: string,
  userPrompt: string,
  maxReplyChars = DEFAULT_AI_SETTINGS.max_reply_chars,
): Promise<AiCallResult> {
  const started = Date.now()
  if (!provider.api_key) {
    return { ok: false, error: 'Chave de API não configurada.', latencyMs: 0, provider: provider.provider }
  }

  try {
    switch (provider.provider) {
      case 'anthropic':
        return await callAnthropic(provider, systemPrompt, userPrompt, started, maxReplyChars)
      case 'openai':
        return await callOpenAI(provider, systemPrompt, userPrompt, started, maxReplyChars)
      case 'gemini':
        return await callGemini(provider, systemPrompt, userPrompt, started, maxReplyChars)
    }
  } catch (error) {
    const abortou = error instanceof DOMException && error.name === 'AbortError'
    return {
      ok: false,
      error: abortou
        ? `O provedor nao respondeu em ${TIMEOUT_MS / 1000} segundos.`
        : error instanceof Error
          ? error.message
          : 'Falha desconhecida na IA.',
      transient: true,
      latencyMs: Date.now() - started,
      provider: provider.provider,
      model: provider.model,
    }
  }
}

async function callAnthropic(
  provider: AiProviderRow,
  systemPrompt: string,
  userPrompt: string,
  started: number,
  maxReplyChars: number,
): Promise<AiCallResult> {
  const { signal, cancel } = comLimiteDeTempo()
  let response: Response
  try {
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal,
      headers: {
        'x-api-key': provider.api_key!,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: provider.model,
        max_tokens: tetoDeSaida(maxReplyChars, false),
        temperature: TEMPERATURA,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        // Obrigar a ferramenta e como a Anthropic garante formato. Sem isto ela
        // as vezes escreve "Claro! Aqui esta:" antes do JSON — e a classificacao
        // do atendimento passa a depender de sorte na leitura.
        tools: [
          {
            name: 'registrar_atendimento',
            description: 'Registra a resposta ao cliente e a classificacao do atendimento.',
            input_schema: ESQUEMA_SAIDA,
          },
        ],
        tool_choice: { type: 'tool', name: 'registrar_atendimento' },
      }),
    })
  } finally {
    cancel()
  }

  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    return {
      ok: false,
      error: body?.error?.message ?? `Falha HTTP ${response.status} na Anthropic.`,
      status: response.status,
      transient: falhaPassageira(response.status),
      latencyMs: Date.now() - started,
      provider: 'anthropic',
      model: provider.model,
    }
  }

  // Com a ferramenta obrigatoria, a resposta vem como objeto pronto no bloco
  // `tool_use`. O caminho de texto fica como rede: se um modelo antigo ignorar
  // a ferramenta, ainda tentamos ler o JSON do texto.
  const partes = (body?.content ?? []) as Array<{ type: string; text?: string; input?: unknown }>
  const ferramenta = partes.find((parte) => parte.type === 'tool_use')?.input
  const conteudo =
    ferramenta ??
    partes
      .filter((parte) => parte.type === 'text')
      .map((parte) => parte.text ?? '')
      .join('\n')

  return finish(conteudo, body, started, 'anthropic', provider.model, {
    input: body?.usage?.input_tokens,
    output: body?.usage?.output_tokens,
  })
}

async function callOpenAI(
  provider: AiProviderRow,
  systemPrompt: string,
  userPrompt: string,
  started: number,
  maxReplyChars: number,
): Promise<AiCallResult> {
  const pensa = openaiPensa(provider.model)

  const pedir = async (comRaciocinio: boolean): Promise<Response> => {
    const { signal, cancel } = comLimiteDeTempo()
    try {
      return await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        signal,
        headers: {
          Authorization: `Bearer ${provider.api_key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: provider.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          // json_schema estrito e mais forte que json_object: garante os campos
          // e os valores, nao so que a saida seja um JSON qualquer.
          response_format: {
            type: 'json_schema',
            json_schema: { name: 'atendimento', strict: true, schema: ESQUEMA_SAIDA },
          },
          max_completion_tokens: tetoDeSaida(maxReplyChars, comRaciocinio),
          // Os modelos de raciocinio recusam temperatura; os demais aceitam.
          ...(comRaciocinio ? { reasoning_effort: 'low' } : { temperature: TEMPERATURA }),
        }),
      })
    } finally {
      cancel()
    }
  }

  let response = await pedir(pensa)
  let body = await response.json().catch(() => ({}))

  // Mesma protecao do Gemini: se o ajuste for recusado, tenta sem ele.
  if (!response.ok && pensa && response.status === 400) {
    console.warn('[ia] OpenAI recusou o ajuste de raciocinio, repetindo sem ele')
    response = await pedir(false)
    body = await response.json().catch(() => ({}))
  }

  if (!response.ok) {
    return {
      ok: false,
      error: body?.error?.message ?? `Falha HTTP ${response.status} na OpenAI.`,
      status: response.status,
      transient: falhaPassageira(response.status),
      latencyMs: Date.now() - started,
      provider: 'openai',
      model: provider.model,
    }
  }

  const text = body?.choices?.[0]?.message?.content ?? ''
  return finish(text, body, started, 'openai', provider.model, {
    input: body?.usage?.prompt_tokens,
    output: body?.usage?.completion_tokens,
  })
}

async function callGemini(
  provider: AiProviderRow,
  systemPrompt: string,
  userPrompt: string,
  started: number,
  maxReplyChars: number,
): Promise<AiCallResult> {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${provider.model}:generateContent`

  const pedir = async (thinking: Record<string, unknown> | null): Promise<Response> => {
    const { signal, cancel } = comLimiteDeTempo()
    try {
      return await fetch(url, {
        method: 'POST',
        signal,
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': provider.api_key! },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: ESQUEMA_GEMINI,
            temperature: TEMPERATURA,
            maxOutputTokens: tetoDeSaida(maxReplyChars, false),
            ...(thinking ? { thinkingConfig: thinking } : {}),
          },
        }),
      })
    } finally {
      cancel()
    }
  }

  const thinking = geminiThinking(provider.model)
  let response = await pedir(thinking)
  let body = await response.json().catch(() => ({}))

  // O provedor recusou o ajuste de raciocinio: repete sem ele.
  if (!response.ok && thinking && response.status === 400) {
    console.warn('[ia] Gemini recusou o ajuste de raciocinio, repetindo sem ele')
    response = await pedir(null)
    body = await response.json().catch(() => ({}))
  }

  if (!response.ok) {
    return {
      ok: false,
      error: body?.error?.message ?? `Falha HTTP ${response.status} no Gemini.`,
      status: response.status,
      transient: falhaPassageira(response.status),
      latencyMs: Date.now() - started,
      provider: 'gemini',
      model: provider.model,
    }
  }

  const text = (body?.candidates?.[0]?.content?.parts ?? [])
    .map((part: { text?: string }) => part.text ?? '')
    .join('')

  return finish(text, body, started, 'gemini', provider.model, {
    input: body?.usageMetadata?.promptTokenCount,
    output: body?.usageMetadata?.candidatesTokenCount,
  })
}

function finish(
  /** Texto cru do provedor, ou o objeto que ele ja devolveu pronto. */
  conteudo: string | unknown,
  raw: unknown,
  started: number,
  provider: AiProviderName,
  model: string,
  tokens: { input?: number; output?: number },
): AiCallResult {
  const outcome =
    typeof conteudo === 'string'
      ? parseOutcome(conteudo)
      : normalizarOutcome(conteudo as Record<string, unknown>)
  if (!outcome) {
    return {
      ok: false,
      error: 'A IA respondeu em formato inesperado.',
      latencyMs: Date.now() - started,
      provider,
      model,
      raw,
    }
  }
  return {
    ok: true,
    outcome,
    latencyMs: Date.now() - started,
    provider,
    model,
    inputTokens: tokens.input,
    outputTokens: tokens.output,
    raw,
  }
}

/** Aceita JSON puro ou embrulhado em bloco de código. */
export function parseOutcome(text: string): AiOutcome | null {
  if (!text) return null
  let candidate = text.trim()

  const fenced = candidate.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced) candidate = fenced[1].trim()

  if (!candidate.startsWith('{')) {
    const start = candidate.indexOf('{')
    const end = candidate.lastIndexOf('}')
    if (start === -1 || end === -1) return null
    candidate = candidate.slice(start, end + 1)
  }

  try {
    return normalizarOutcome(JSON.parse(candidate))
  } catch {
    return null
  }
}

/**
 * Poe a saida do modelo em forma antes de ela virar linha no banco.
 *
 * Vale mesmo com o esquema imposto pelo provedor: esquema garante o FORMATO,
 * nao o CONTEUDO. O modelo pode devolver confianca 7, texto com espaco sobrando
 * ou vinte etiquetas. Aqui e onde isso e aparado — e onde valor fora de lista
 * vira nulo em vez de virar categoria fantasma que ninguem explica no relatorio.
 */
export function normalizarOutcome(parsed: Record<string, unknown> | null): AiOutcome | null {
  if (!parsed || typeof parsed !== 'object') return null

  const bruto = parsed as Record<string, any>

  const priority = ['baixa', 'normal', 'alta', 'emergencia'].includes(bruto.priority)
    ? bruto.priority
    : 'normal'
  const confidence = Number(bruto.confidence)

  const daLista = <T extends string>(valor: unknown, permitidos: readonly T[]): T | null =>
    typeof valor === 'string' && (permitidos as readonly string[]).includes(valor)
      ? (valor as T)
      : null

  /** Lista de textos curtos, sem repetidos e sem vazios. */
  const listaDeTextos = (valor: unknown, limite: number, tamanho = 60): string[] =>
    Array.isArray(valor)
      ? [
          ...new Set(
            valor
              .filter((t: unknown): t is string => typeof t === 'string' && Boolean(t.trim()))
              .map((t: string) => t.trim().slice(0, tamanho)),
          ),
        ].slice(0, limite)
      : []

  const inteira = String(bruto.reply ?? '').trim()
  const partes = listaDeTextos(bruto.reply_partes, 3, 700)

  return {
    reply: inteira || partes.join(' '),
    // Uma parte so nao e quebra: nesse caso a mensagem sai inteira, sem a
    // encenacao de digitar duas vezes.
    reply_partes: partes.length > 1 ? partes : [],
    intent: daLista<AiIntent>(bruto.intent, INTENCOES) ?? 'fora_de_contexto',
    category: String(bruto.category ?? '').trim(),
    priority,
    confidence: Number.isFinite(confidence) ? Math.min(Math.max(confidence, 0), 1) : 0,
    summary: String(bruto.summary ?? '').trim(),
    escalate: Boolean(bruto.escalate),
    escalation_reason: bruto.escalation_reason ? String(bruto.escalation_reason) : null,
    funnel_stage: daLista<FunnelStage>(bruto.funnel_stage, ETAPAS_FUNIL),
    lead_temperature: daLista<LeadTemperature>(bruto.lead_temperature, TEMPERATURAS),
    unanswered_question:
      typeof bruto.unanswered_question === 'string' && bruto.unanswered_question.trim()
        ? bruto.unanswered_question.trim().slice(0, 500)
        : null,
    tags: listaDeTextos(bruto.tags, 6),

    /* --------------------------------------------------------- Triagem */
    sistema: daLista<SistemaVeiculo>(bruto.sistema, SISTEMAS) ?? 'nao_identificado',
    componentes: listaDeTextos(bruto.componentes, 5, 40),
    sintoma:
      typeof bruto.sintoma === 'string' && bruto.sintoma.trim()
        ? bruto.sintoma.trim().slice(0, 200)
        : null,
    // Aqui o nulo tem significado proprio: "ninguem disse ainda" nao e a mesma
    // coisa que "esta rodando". Booleano cru apagaria essa diferenca.
    veiculo_parado: typeof bruto.veiculo_parado === 'boolean' ? bruto.veiculo_parado : null,
    risco_seguranca: Boolean(bruto.risco_seguranca),

    customer_fields: Array.isArray(bruto.customer_fields)
      ? bruto.customer_fields
          .filter((field: unknown) => {
            const f = field as Record<string, unknown>
            return f && typeof f.label === 'string' && typeof f.value === 'string' && f.value.trim()
          })
          .map((field: Record<string, unknown>) => ({
            key: slugKey(String(field.key ?? field.label)),
            label: String(field.label).trim(),
            value: String(field.value).trim(),
            confidence: Number(field.confidence) || undefined,
          }))
      : [],
  }
}

export function slugKey(label: string): string {
  return label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40)
}

/* ------------------------------------------------------------ Carregamento */

export async function loadAiConfig(admin: SupabaseClient, companyId: string) {
  const [{ data: providers }, { data: settings }] = await Promise.all([
    admin.from('ai_providers').select('*').eq('company_id', companyId),
    admin.from('ai_settings').select('*').eq('company_id', companyId).maybeSingle(),
  ])

  const list = (providers ?? []) as AiProviderRow[]
  return {
    primary: list.find((p) => p.role === 'principal') ?? null,
    fallback: list.find((p) => p.role === 'reserva') ?? null,
    settings: { ...DEFAULT_AI_SETTINGS, ...(settings ?? {}) } as AiSettings,
  }
}

/** Espera entre a primeira tentativa e a repetição. */
const ESPERA_REPETICAO_MS = 1200

const espera = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Uma chamada, com uma segunda tentativa quando a falha foi passageira.
 *
 * Instabilidade de dois segundos no provedor jogava o atendimento inteiro para
 * a fila humana — que de madrugada não tem ninguém olhando. Uma repetição
 * curta resolve a maioria desses casos sem o cliente perceber. Erro de
 * configuração não repete: daria o mesmo erro, só mais tarde.
 */
async function chamarComRepeticao(
  provider: AiProviderRow,
  systemPrompt: string,
  userPrompt: string,
  maxReplyChars: number,
): Promise<AiCallResult> {
  const primeira = await callAi(provider, systemPrompt, userPrompt, maxReplyChars)
  if (primeira.ok || !primeira.transient) return primeira

  console.warn(`[ia] ${provider.provider} falhou (${primeira.error}); repetindo uma vez`)
  await espera(ESPERA_REPETICAO_MS)

  const segunda = await callAi(provider, systemPrompt, userPrompt, maxReplyChars)
  if (segunda.ok) return segunda
  return { ...segunda, latencyMs: primeira.latencyMs + segunda.latencyMs }
}

/**
 * Executa a IA com provedor principal e, apenas em caso de falha técnica,
 * o reserva. Nunca gera duas respostas.
 */
export async function runAi(
  primary: AiProviderRow | null,
  fallback: AiProviderRow | null,
  systemPrompt: string,
  userPrompt: string,
  maxReplyChars = DEFAULT_AI_SETTINGS.max_reply_chars,
): Promise<AiCallResult & { usedFallback: boolean }> {
  if (!primary && !fallback) {
    return {
      ok: false,
      error: 'Nenhum provedor de IA configurado.',
      latencyMs: 0,
      usedFallback: false,
    }
  }

  if (primary) {
    const result = await chamarComRepeticao(primary, systemPrompt, userPrompt, maxReplyChars)
    if (result.ok) return { ...result, usedFallback: false }

    if (fallback) {
      const second = await chamarComRepeticao(fallback, systemPrompt, userPrompt, maxReplyChars)
      if (second.ok) return { ...second, usedFallback: true }
      return { ...second, usedFallback: true, error: `${result.error} | reserva: ${second.error}` }
    }
    return { ...result, usedFallback: false }
  }

  const result = await chamarComRepeticao(fallback!, systemPrompt, userPrompt, maxReplyChars)
  return { ...result, usedFallback: true }
}

/**
 * Corta a resposta no limite sem partir palavra.
 *
 * O corte cru pela posição entregava ao cliente uma frase interrompida no
 * meio — parece defeito do sistema, não atendimento. Tenta fechar na última
 * frase inteira; se não houver, na última palavra.
 */
export function cortarNoLimite(texto: string, limite: number): string {
  const limpo = texto.trim()
  if (limpo.length <= limite) return limpo

  const pedaco = limpo.slice(0, limite)
  const fim = Math.max(pedaco.lastIndexOf('. '), pedaco.lastIndexOf('! '), pedaco.lastIndexOf('? '))
  if (fim > limite * 0.6) return pedaco.slice(0, fim + 1).trim()

  // As reticencias contam para o limite: o teto e do que o cliente recebe,
  // nao do texto antes de enfeitar.
  const semReticencias = limpo.slice(0, Math.max(limite - 1, 1))
  const espacoFinal = semReticencias.lastIndexOf(' ')
  return (espacoFinal > 0 ? semReticencias.slice(0, espacoFinal) : semReticencias).trim() + '…'
}
