import { describe, expect, it } from 'vitest'
import {
  cortarNoLimite,
  parseOutcome,
  slugKey,
} from '../supabase/functions/_shared/ai.ts'
import { selecionarFaq } from '../supabase/functions/_shared/knowledge.ts'

describe('parseOutcome — o que a IA devolve nunca entra cru no banco', () => {
  const completo = JSON.stringify({
    reply: 'Sim, trabalhamos com compressor.',
    intent: 'servicos',
    category: 'consulta',
    priority: 'normal',
    confidence: 0.82,
    summary: 'Cliente pergunta sobre compressor',
    escalate: false,
    escalation_reason: null,
    funnel_stage: 'qualificando',
    lead_temperature: 'morno',
    unanswered_question: null,
    tags: ['orcamento'],
    customer_fields: [{ key: 'placa', label: 'Placa', value: 'ABC1D23', confidence: 0.9 }],
  })

  it('lê a resposta completa', () => {
    const r = parseOutcome(completo)!
    expect(r.intent).toBe('servicos')
    expect(r.confidence).toBeCloseTo(0.82)
    expect(r.customer_fields[0].value).toBe('ABC1D23')
  })

  it('aceita JSON embrulhado em bloco de código', () => {
    expect(parseOutcome('```json\n' + completo + '\n```')?.intent).toBe('servicos')
  })

  it('aceita JSON com conversa em volta', () => {
    expect(parseOutcome('Claro! ' + completo + ' Espero ter ajudado.')?.intent).toBe('servicos')
  })

  // O ponto da validação: etapa de funil inventada viraria categoria fantasma
  // no relatório, que ninguém consegue explicar depois.
  it('descarta etapa de funil que não existe', () => {
    const r = parseOutcome(JSON.stringify({ reply: 'oi', funnel_stage: 'negociando_desconto' }))!
    expect(r.funnel_stage).toBeNull()
  })

  it('descarta temperatura e intenção fora da lista', () => {
    const r = parseOutcome(JSON.stringify({ reply: 'oi', intent: 'vender_carro', lead_temperature: 'quentissimo' }))!
    expect(r.intent).toBe('fora_de_contexto')
    expect(r.lead_temperature).toBeNull()
  })

  it('prende a confiança entre 0 e 1', () => {
    expect(parseOutcome(JSON.stringify({ reply: 'a', confidence: 7 }))!.confidence).toBe(1)
    expect(parseOutcome(JSON.stringify({ reply: 'a', confidence: -3 }))!.confidence).toBe(0)
    expect(parseOutcome(JSON.stringify({ reply: 'a', confidence: 'muita' }))!.confidence).toBe(0)
  })

  it('prioridade desconhecida vira normal, não quebra', () => {
    expect(parseOutcome(JSON.stringify({ reply: 'a', priority: 'urgentissima' }))!.priority).toBe('normal')
  })

  it('ignora campo de cliente sem valor', () => {
    const r = parseOutcome(
      JSON.stringify({
        reply: 'a',
        customer_fields: [
          { label: 'Placa', value: '   ' },
          { label: 'Cidade', value: 'Limeira' },
        ],
      }),
    )!
    expect(r.customer_fields).toHaveLength(1)
    expect(r.customer_fields[0].label).toBe('Cidade')
  })

  it('limita a seis etiquetas', () => {
    const muitas = Array.from({ length: 20 }, (_, i) => `etiqueta ${i}`)
    expect(parseOutcome(JSON.stringify({ reply: 'a', tags: muitas }))!.tags).toHaveLength(6)
  })

  // Seis cópias da mesma etiqueta é pior que uma: ocupa o limite e não
  // acrescenta nada ao atendimento.
  it('não repete a mesma etiqueta', () => {
    const r = parseOutcome(JSON.stringify({ reply: 'a', tags: ['socorro', 'socorro', ' socorro '] }))!
    expect(r.tags).toEqual(['socorro'])
  })

  it('devolve null quando não há JSON nenhum', () => {
    expect(parseOutcome('desculpe, não consegui responder')).toBeNull()
    expect(parseOutcome('')).toBeNull()
  })
})

describe('cortarNoLimite — o cliente não pode receber frase partida', () => {
  it('não mexe no que já cabe', () => {
    expect(cortarNoLimite('Sim, trabalhamos com compressor.', 100)).toBe(
      'Sim, trabalhamos com compressor.',
    )
  })

  it('fecha na última frase inteira', () => {
    const texto = 'Entendi. Por segurança, não rode com o caminhão. Me passa a cidade onde está?'
    expect(cortarNoLimite(texto, 60)).toBe('Entendi. Por segurança, não rode com o caminhão.')
  })

  it('sem frase que caiba, corta na palavra inteira', () => {
    const r = cortarNoLimite('Consigo te ajudar a encaminhar um orcamento hoje', 30)
    expect(r.endsWith('…')).toBe(true)
    expect(r.length).toBeLessThanOrEqual(30)
    // A última palavra tem de estar completa: o texto cortado, sem as
    // reticências, precisa ser um prefixo de palavras inteiras do original.
    const semReticencias = r.slice(0, -1).trim()
    expect('Consigo te ajudar a encaminhar um orcamento hoje').toContain(semReticencias + ' ')
  })

  // As reticências contam para o limite: o teto é do que o cliente recebe.
  it('nunca estoura o limite, nem em palavra única gigante', () => {
    for (const limite of [10, 20, 33, 47]) {
      expect(cortarNoLimite('palavraunicagigantescasemespacoalgum', limite).length)
        .toBeLessThanOrEqual(limite)
    }
  })
})

describe('slugKey — chave estável para o campo do cliente', () => {
  it('tira acento e espaço', () => {
    expect(slugKey('Número da Placa')).toBe('numero_da_placa')
  })
  it('não deixa separador sobrando nas pontas', () => {
    expect(slugKey('  Modelo!  ')).toBe('modelo')
  })
  it('mesma etiqueta, mesma chave — é o que evita campo duplicado', () => {
    expect(slugKey('Placa')).toBe(slugKey('placa '))
  })
})

describe('selecionarFaq — o que entra no prompt', () => {
  const faq = Array.from({ length: 20 }, (_, i) => ({
    question: `Pergunta genérica número ${i}`,
    answer: `Resposta genérica número ${i}`,
  }))
  const comAssunto = [
    { question: 'Vocês trocam cuíca de freio?', answer: 'Sim, trocamos cuíca.' },
    { question: 'Qual o horário de sábado?', answer: 'Sábado até meio-dia.' },
    ...faq,
  ]

  it('base pequena vai inteira', () => {
    expect(selecionarFaq(faq.slice(0, 5), 'qualquer coisa')).toHaveLength(5)
  })

  it('respeita o limite', () => {
    expect(selecionarFaq(comAssunto, 'cuíca', 8)).toHaveLength(8)
  })

  it('coloca a entrada do assunto entre as escolhidas', () => {
    const escolhidas = selecionarFaq(comAssunto, 'preciso trocar a cuica do freio', 4)
    expect(escolhidas.some((f) => f.question.includes('cuíca'))).toBe(true)
  })

  it('mensagem sem palavra útil não quebra e devolve o limite', () => {
    expect(selecionarFaq(comAssunto, 'oi tudo bem', 6)).toHaveLength(6)
  })

  it('nunca inventa entrada que não existe na base', () => {
    const escolhidas = selecionarFaq(comAssunto, 'horário sábado', 5)
    for (const item of escolhidas) expect(comAssunto).toContain(item)
  })
})

describe('triagem técnica — o que a oficina lê antes de abrir a conversa', () => {
  it('lê os cinco eixos', () => {
    const r = parseOutcome(
      JSON.stringify({
        reply: 'ok',
        sistema: 'ar_comprimido',
        componentes: ['compressor', 'secador'],
        sintoma: 'demora demais para carregar',
        veiculo_parado: true,
        risco_seguranca: true,
      }),
    )!
    expect(r.sistema).toBe('ar_comprimido')
    expect(r.componentes).toEqual(['compressor', 'secador'])
    expect(r.veiculo_parado).toBe(true)
    expect(r.risco_seguranca).toBe(true)
  })

  it('sistema inventado não entra no banco', () => {
    expect(parseOutcome(JSON.stringify({ reply: 'a', sistema: 'turbina' }))!.sistema)
      .toBe('nao_identificado')
  })

  // "ninguém disse ainda" não é a mesma coisa que "está rodando".
  it('preserva o não-se-sabe do veículo parado', () => {
    expect(parseOutcome(JSON.stringify({ reply: 'a' }))!.veiculo_parado).toBeNull()
    expect(parseOutcome(JSON.stringify({ reply: 'a', veiculo_parado: 'talvez' }))!.veiculo_parado)
      .toBeNull()
    expect(parseOutcome(JSON.stringify({ reply: 'a', veiculo_parado: false }))!.veiculo_parado)
      .toBe(false)
  })

  it('risco de segurança ausente é falso, nunca indefinido', () => {
    expect(parseOutcome(JSON.stringify({ reply: 'a' }))!.risco_seguranca).toBe(false)
  })
})

describe('resposta em partes — o que faz parecer gente digitando', () => {
  it('guarda as partes na ordem', () => {
    const r = parseOutcome(
      JSON.stringify({
        reply: 'Opa, bom dia! Me conta o que houve?',
        reply_partes: ['Opa, bom dia!', 'Me conta o que houve?'],
      }),
    )!
    expect(r.reply_partes).toEqual(['Opa, bom dia!', 'Me conta o que houve?'])
  })

  // Uma parte só não é quebra: encenar duas digitadas para mandar a mesma
  // frase seria teatro, e teatro aparece.
  it('parte única não vira quebra', () => {
    const r = parseOutcome(JSON.stringify({ reply: 'Sim, trabalhamos.', reply_partes: ['Sim, trabalhamos.'] }))!
    expect(r.reply_partes).toEqual([])
  })

  it('no máximo três mensagens', () => {
    const r = parseOutcome(
      JSON.stringify({ reply: 'a', reply_partes: ['um', 'dois', 'tres', 'quatro', 'cinco'] }),
    )!
    expect(r.reply_partes).toHaveLength(3)
  })

  it('sem partes, o texto inteiro continua valendo', () => {
    const r = parseOutcome(JSON.stringify({ reply: 'Resposta inteira.' }))!
    expect(r.reply).toBe('Resposta inteira.')
    expect(r.reply_partes).toEqual([])
  })

  // Se o modelo mandar só as partes, a resposta cheia é reconstruída — é ela
  // que vai para o registro e para as métricas.
  it('reconstrói a resposta cheia a partir das partes', () => {
    const r = parseOutcome(JSON.stringify({ reply_partes: ['Opa!', 'Tudo certo?'] }))!
    expect(r.reply).toBe('Opa! Tudo certo?')
  })
})
