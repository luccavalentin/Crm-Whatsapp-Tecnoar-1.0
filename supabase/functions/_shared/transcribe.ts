import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import type { AiProviderRow } from './ai.ts'

/**
 * Áudio e foto viram texto antes de chegarem na IA.
 *
 * Motorista na beira da estrada, de mãos sujas, manda áudio — não digita. E
 * quando o problema é visível, manda foto do freio. Sem esta etapa a IA
 * simplesmente não enxerga nenhuma das duas coisas: a mensagem entra no banco
 * com o arquivo guardado e o texto vazio, some do histórico e o atendimento
 * fica mudo.
 *
 * O resultado é gravado em `metadata.transcricao` da própria mensagem, então
 * cada arquivo é lido uma vez só: se a conversa continuar, as respostas
 * seguintes reaproveitam o texto em vez de pagar a leitura de novo.
 */

const BUCKET = 'whatsapp-media'

/** Acima disto o arquivo não é lido: custo e espera não compensam. */
const MAX_BYTES = 12 * 1024 * 1024

/** Leitura de mídia é acessória — não pode segurar a resposta ao cliente. */
const TIMEOUT_MS = 25_000

export interface MediaMessage {
  id: string
  type: string
  body: string | null
  media_url: string | null
  media_mime: string | null
  metadata: Record<string, unknown> | null
}

/** Texto já apurado para esta mensagem, se houver. */
export function textoDaMidia(message: MediaMessage): string | null {
  const guardado = (message.metadata as Record<string, unknown> | null)?.transcricao
  return typeof guardado === 'string' && guardado.trim() ? guardado.trim() : null
}

/** A mensagem tem arquivo que valeria a pena ler e ainda não foi lido. */
export function precisaDeLeitura(message: MediaMessage): boolean {
  if (message.body?.trim()) return false
  if (textoDaMidia(message)) return false
  if (!message.media_url) return false
  return message.type === 'audio' || message.type === 'image'
}

function comLimiteDeTempo(): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), TIMEOUT_MS)
  return { signal: controller.signal, cancel: () => clearTimeout(id) }
}

function paraBase64(bytes: Uint8Array): string {
  // Em pedaços: `String.fromCharCode(...bytes)` de uma vez estoura a pilha
  // num áudio de poucos megabytes.
  let binario = ''
  const passo = 0x8000
  for (let i = 0; i < bytes.length; i += passo) {
    binario += String.fromCharCode(...bytes.subarray(i, i + passo))
  }
  return btoa(binario)
}

/** Quem consegue ler o quê. Anthropic lê imagem, mas não áudio. */
function sabeLer(provider: AiProviderRow, tipo: 'audio' | 'image'): boolean {
  if (provider.provider === 'gemini') return true
  if (provider.provider === 'openai') return true
  return tipo === 'image'
}

function escolherProvedor(
  provedores: Array<AiProviderRow | null>,
  tipo: 'audio' | 'image',
): AiProviderRow | null {
  for (const p of provedores) {
    if (p?.api_key && sabeLer(p, tipo)) return p
  }
  return null
}

const PROMPT_AUDIO =
  'Transcreva este áudio em português do Brasil, literalmente, sem resumir e sem comentar. ' +
  'Devolva apenas a transcrição. Se não houver fala audível, devolva exatamente: (áudio sem fala)'

const PROMPT_IMAGEM =
  'Você é assistente de uma oficina de freios de caminhão. Descreva objetivamente esta ' +
  'imagem enviada por um cliente, em português do Brasil, em no máximo duas frases. ' +
  'Diga o que aparece (peça, painel, documento, placa, local) e qualquer texto legível. ' +
  'Não faça diagnóstico e não invente o que não dá para ver.'

/**
 * Lê o arquivo de uma mensagem e devolve o texto.
 * Devolve null quando não deu — a conversa segue com o aviso de que veio
 * um arquivo, nunca com um conteúdo inventado.
 */
export async function lerMidia(
  admin: SupabaseClient,
  provedores: Array<AiProviderRow | null>,
  message: MediaMessage,
): Promise<string | null> {
  const tipo = message.type === 'audio' ? 'audio' : 'image'
  const provider = escolherProvedor(provedores, tipo)
  if (!provider || !message.media_url) return null

  try {
    const { data: arquivo, error } = await admin.storage.from(BUCKET).download(message.media_url)
    if (error || !arquivo) return null

    const bytes = new Uint8Array(await arquivo.arrayBuffer())
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_BYTES) return null

    const mime = (message.media_mime || arquivo.type || '').split(';')[0].trim() ||
      (tipo === 'audio' ? 'audio/ogg' : 'image/jpeg')

    const texto =
      provider.provider === 'gemini'
        ? await lerComGemini(provider, bytes, mime, tipo)
        : provider.provider === 'openai'
          ? await lerComOpenAI(provider, bytes, mime, tipo)
          : await lerComAnthropic(provider, bytes, mime)

    const limpo = texto?.trim()
    if (!limpo || limpo === '(áudio sem fala)') return null
    return limpo.slice(0, 2000)
  } catch (erro) {
    console.error('[ia] falha ao ler midia', erro)
    return null
  }
}

async function lerComGemini(
  provider: AiProviderRow,
  bytes: Uint8Array,
  mime: string,
  tipo: 'audio' | 'image',
): Promise<string | null> {
  const { signal, cancel } = comLimiteDeTempo()
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${provider.model}:generateContent`,
      {
        method: 'POST',
        signal,
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': provider.api_key! },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                { text: tipo === 'audio' ? PROMPT_AUDIO : PROMPT_IMAGEM },
                { inlineData: { mimeType: mime, data: paraBase64(bytes) } },
              ],
            },
          ],
          generationConfig: { temperature: 0, maxOutputTokens: 900 },
        }),
      },
    )
    if (!response.ok) {
      console.error('[ia] Gemini recusou a leitura da midia', response.status)
      return null
    }
    const body = await response.json()
    return ((body?.candidates?.[0]?.content?.parts ?? []) as Array<{ text?: string }>)
      .map((p) => p.text ?? '')
      .join('')
  } finally {
    cancel()
  }
}

async function lerComOpenAI(
  provider: AiProviderRow,
  bytes: Uint8Array,
  mime: string,
  tipo: 'audio' | 'image',
): Promise<string | null> {
  const { signal, cancel } = comLimiteDeTempo()
  try {
    // Áudio tem endpoint próprio; o modelo de conversa configurado pela
    // empresa não serve aqui.
    if (tipo === 'audio') {
      const form = new FormData()
      form.append('file', new Blob([bytes as unknown as BlobPart], { type: mime }), 'audio.ogg')
      form.append('model', 'whisper-1')
      form.append('language', 'pt')

      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        signal,
        headers: { Authorization: `Bearer ${provider.api_key}` },
        body: form,
      })
      if (!response.ok) {
        console.error('[ia] OpenAI recusou a transcricao', response.status)
        return null
      }
      const body = await response.json()
      return typeof body?.text === 'string' ? body.text : null
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal,
      headers: {
        Authorization: `Bearer ${provider.api_key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: provider.model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: PROMPT_IMAGEM },
              {
                type: 'image_url',
                image_url: { url: `data:${mime};base64,${paraBase64(bytes)}` },
              },
            ],
          },
        ],
        max_completion_tokens: 400,
      }),
    })
    if (!response.ok) {
      console.error('[ia] OpenAI recusou a leitura da imagem', response.status)
      return null
    }
    const body = await response.json()
    return body?.choices?.[0]?.message?.content ?? null
  } finally {
    cancel()
  }
}

async function lerComAnthropic(
  provider: AiProviderRow,
  bytes: Uint8Array,
  mime: string,
): Promise<string | null> {
  const { signal, cancel } = comLimiteDeTempo()
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal,
      headers: {
        'x-api-key': provider.api_key!,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: provider.model,
        max_tokens: 400,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mime, data: paraBase64(bytes) } },
              { type: 'text', text: PROMPT_IMAGEM },
            ],
          },
        ],
      }),
    })
    if (!response.ok) {
      console.error('[ia] Anthropic recusou a leitura da imagem', response.status)
      return null
    }
    const body = await response.json()
    return ((body?.content ?? []) as Array<{ type: string; text?: string }>)
      .filter((p) => p.type === 'text')
      .map((p) => p.text ?? '')
      .join('\n')
  } finally {
    cancel()
  }
}

/**
 * Lê os arquivos pendentes de um lote de mensagens e grava o texto apurado.
 *
 * Só as mais recentes: histórico antigo não muda a resposta de agora e cada
 * leitura custa tempo e dinheiro. Todas em paralelo — o cliente já está
 * esperando.
 */
export async function lerMidiasPendentes(
  admin: SupabaseClient,
  provedores: Array<AiProviderRow | null>,
  mensagens: MediaMessage[],
  limite = 3,
): Promise<Map<string, string>> {
  const pendentes = mensagens.filter(precisaDeLeitura).slice(-limite)
  const resultado = new Map<string, string>()
  if (pendentes.length === 0) return resultado

  await Promise.all(
    pendentes.map(async (message) => {
      const texto = await lerMidia(admin, provedores, message)
      if (!texto) return
      resultado.set(message.id, texto)

      await admin
        .from('messages')
        .update({ metadata: { ...(message.metadata ?? {}), transcricao: texto } })
        .eq('id', message.id)
    }),
  )

  return resultado
}
