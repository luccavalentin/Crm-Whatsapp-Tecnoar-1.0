#!/usr/bin/env node
/**
 * Roda as conversas-padrão contra a IA de verdade e dá uma nota.
 *
 * Existe porque, até aqui, mudar o prompt era um ato de fé: alguém ajustava
 * uma frase, testava duas mensagens no simulador e concluía que tinha
 * melhorado. Aqui as mesmas situações passam pela IA toda vez, com o mesmo
 * critério, e a nota diz se melhorou de fato — ou se consertar um caso quebrou
 * outro, que é o que costuma acontecer.
 *
 * Usa o simulador (ai-simulate), então nada é gravado em clientes, conversas,
 * mensagens, métricas ou Kanban. Consome tokens do provedor configurado.
 *
 * Uso:
 *   export TECNOAR_EMAIL="voce@empresa.com.br"
 *   export TECNOAR_SENHA="sua-senha"
 *   npm run avaliar
 *
 * A URL e a chave pública saem de .env.local automaticamente.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const AQUI = dirname(fileURLToPath(import.meta.url))
const RAIZ = join(AQUI, '..')

/* ------------------------------------------------------------ Configuração */

function lerEnvLocal() {
  const caminho = join(RAIZ, '.env.local')
  if (!existsSync(caminho)) return {}
  const valores = {}
  for (const linha of readFileSync(caminho, 'utf-8').split('\n')) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) valores[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return valores
}

const env = { ...lerEnvLocal(), ...process.env }
const URL_SUPABASE = env.VITE_SUPABASE_URL
const CHAVE = env.VITE_SUPABASE_ANON_KEY
const EMAIL = env.TECNOAR_EMAIL
const SENHA = env.TECNOAR_SENHA

if (!URL_SUPABASE || !CHAVE) {
  console.error('Falta VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY (.env.local).')
  process.exit(1)
}
if (!EMAIL || !SENHA) {
  console.error('Defina TECNOAR_EMAIL e TECNOAR_SENHA antes de rodar.')
  console.error('São as suas credenciais do CRM — a avaliação entra como você.')
  process.exit(1)
}

/* ------------------------------------------------------------------ Sessão */

async function entrar() {
  const resposta = await fetch(`${URL_SUPABASE}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: CHAVE, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: SENHA }),
  })
  const corpo = await resposta.json()
  if (!resposta.ok) throw new Error(corpo.error_description ?? corpo.msg ?? 'Login recusado.')
  return corpo.access_token
}

async function simular(token, mensagens) {
  const resposta = await fetch(`${URL_SUPABASE}/functions/v1/ai-simulate`, {
    method: 'POST',
    headers: {
      apikey: CHAVE,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ messages: mensagens }),
  })
  const corpo = await resposta.json()
  if (!resposta.ok || corpo.ok === false) {
    throw new Error(corpo.error ?? `Falha HTTP ${resposta.status}`)
  }
  return corpo.outcome ?? corpo
}

/* ---------------------------------------------------------------- Critério */

/**
 * Confere um caso e devolve a lista de falhas.
 *
 * Cada verificação é separada de propósito: saber QUE falhou vale pouco;
 * o que orienta a correção é saber O QUE falhou.
 */
function conferir(espera, resultado) {
  const falhas = []
  const resposta = String(resultado.reply ?? '')

  if (espera.intent && !espera.intent.includes(resultado.intent)) {
    falhas.push(`intenção "${resultado.intent}", esperava uma de [${espera.intent.join(', ')}]`)
  }

  if (typeof espera.escalate === 'boolean' && Boolean(resultado.escalate) !== espera.escalate) {
    falhas.push(espera.escalate ? 'deveria escalar e não escalou' : 'escalou sem precisar')
  }

  if (espera.prioridade && !espera.prioridade.includes(resultado.priority)) {
    falhas.push(
      `prioridade "${resultado.priority}", esperava uma de [${espera.prioridade.join(', ')}]`,
    )
  }

  if (espera.temperatura && !espera.temperatura.includes(resultado.lead_temperature)) {
    falhas.push(`temperatura "${resultado.lead_temperature}"`)
  }

  for (const padrao of espera.precisaConter ?? []) {
    if (!new RegExp(padrao, 'i').test(resposta)) falhas.push(`não disse o esperado (/${padrao}/)`)
  }

  // O mais importante da suíte: o que a IA NÃO pode dizer. Inventar preço,
  // prazo ou andamento é pior do que não responder.
  for (const padrao of espera.naoPodeConter ?? []) {
    if (new RegExp(padrao, 'i').test(resposta)) falhas.push(`disse o que não podia (/${padrao}/)`)
  }

  if (espera.sistema && !espera.sistema.includes(resultado.sistema)) {
    falhas.push(`sistema "${resultado.sistema}", esperava um de [${espera.sistema.join(', ')}]`)
  }

  if (typeof espera.risco === 'boolean' && Boolean(resultado.risco_seguranca) !== espera.risco) {
    falhas.push(
      espera.risco ? 'não marcou risco de segurança' : 'marcou risco onde não havia',
    )
  }

  // Vale para TODA resposta, sem o caso precisar pedir: se soar como circular
  // de empresa, o atendimento já falhou por aí.
  const CORPORATIVES = [
    'como posso ajud', 'estou à disposição', 'estou a disposição', 'fico no aguardo',
    'entendo perfeitamente', 'peço desculpas pelo transtorno', 'prezado',
    'não hesite', 'nao hesite', 'conforme solicitado', 'segue abaixo',
  ]
  for (const frase of CORPORATIVES) {
    if (resposta.toLowerCase().includes(frase)) falhas.push(`soou corporativo ("${frase}")`)
  }
  // Marcador, negrito e numeração não existem em conversa de WhatsApp.
  if (/^\s*[-•*]\s|\*\*|^\s*\d+\.\s/m.test(resposta)) {
    falhas.push('formatou a mensagem como documento')
  }

  if (espera.precisaPerguntar && !resposta.includes('?')) {
    falhas.push('fechou sem pergunta — o atendimento não anda')
  }

  if (espera.maxCaracteres && resposta.length > espera.maxCaracteres) {
    falhas.push(`resposta com ${resposta.length} caracteres (máximo ${espera.maxCaracteres})`)
  }

  return falhas
}

/* -------------------------------------------------------------------- Fluxo */

const VERDE = '\x1b[32m'
const VERMELHO = '\x1b[31m'
const CINZA = '\x1b[90m'
const FIM = '\x1b[0m'

const { casos } = JSON.parse(readFileSync(join(AQUI, 'conversas.json'), 'utf-8'))

console.log(`\nAvaliação da IA — ${casos.length} conversas-padrão\n`)

const token = await entrar()
const relatorio = []
let aprovados = 0

for (const caso of casos) {
  process.stdout.write(`  ${caso.titulo.padEnd(46, '.')} `)
  try {
    const resultado = await simular(token, caso.mensagens)
    const falhas = conferir(caso.espera, resultado)

    if (falhas.length === 0) {
      aprovados += 1
      console.log(`${VERDE}passou${FIM}`)
    } else {
      console.log(`${VERMELHO}falhou${FIM}`)
      for (const falha of falhas) console.log(`      ${VERMELHO}·${FIM} ${falha}`)
      console.log(`      ${CINZA}resposta: ${String(resultado.reply).slice(0, 160)}${FIM}`)
    }

    relatorio.push({ id: caso.id, titulo: caso.titulo, falhas, resultado })
  } catch (erro) {
    console.log(`${VERMELHO}erro${FIM}`)
    console.log(`      ${VERMELHO}·${FIM} ${erro.message}`)
    relatorio.push({ id: caso.id, titulo: caso.titulo, falhas: [erro.message], resultado: null })
  }
}

const nota = (aprovados / casos.length) * 10
const arquivo = join(AQUI, 'ultimo-resultado.json')
writeFileSync(
  arquivo,
  JSON.stringify({ quando: new Date().toISOString(), aprovados, total: casos.length, nota, relatorio }, null, 2),
)

console.log(`\n  ${aprovados} de ${casos.length} — nota ${nota.toFixed(1)}`)
console.log(`  ${CINZA}detalhes em avaliacao/ultimo-resultado.json${FIM}\n`)

// Abaixo de 8 alguma coisa regrediu: não é para seguir para produção assim.
process.exit(nota >= 8 ? 0 : 1)
