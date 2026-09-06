/* eslint-disable no-undef */
/**
 * Service worker do Tecnoar Atendimento.
 *
 * A regra que manda aqui é de segurança, não de desempenho: este worker só
 * enxerga arquivo estático da própria origem. Tudo que é dado de cliente —
 * Supabase (sessão, consultas, realtime, storage), Edge Functions, WhatsApp e
 * IA — sai de outra origem, e para essas requisições nós simplesmente não
 * chamamos respondWith. Sem respondWith o navegador trata a requisição
 * sozinho: o worker não lê a resposta, não guarda e não consegue vazar sessão
 * de um usuário para o próximo que usar o mesmo aparelho.
 *
 * BUILD_ID muda a cada build, então o navegador vê um arquivo diferente e
 * dispara a atualização. Sem isso o worker ficaria congelado enquanto os
 * assets mudam de hash.
 */

const BUILD_ID = '__BUILD_ID__'
const CACHE_ESTATICO = `tecnoar-estatico-${BUILD_ID}`
const CACHE_SHELL = `tecnoar-shell-${BUILD_ID}`

/** Casca do app: o HTML sem dado nenhum dentro. */
const SHELL = '/index.html'

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_SHELL)
      // `reload` evita gravar uma casca que já veio velha do cache HTTP.
      await cache.add(new Request(SHELL, { cache: 'reload' }))
      // Não ativa sozinho: quem manda atualizar é a página, para não trocar o
      // app por baixo de um atendimento em andamento.
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const nomes = await caches.keys()
      await Promise.all(
        nomes
          .filter((nome) => nome.startsWith('tecnoar-') && !nome.endsWith(BUILD_ID))
          .map((nome) => caches.delete(nome)),
      )
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('message', (event) => {
  // A página pede a troca depois que o atendente confirmou.
  if (event.data && event.data.type === 'APLICAR_ATUALIZACAO') self.skipWaiting()
})

/** Arquivo de build com hash no nome: o conteúdo nunca muda para aquele nome. */
function ehAssetImutavel(url) {
  return url.pathname.startsWith('/assets/')
}

/** Estático nosso, sem dado de usuário dentro. */
function ehEstaticoPublico(url) {
  return (
    url.pathname.startsWith('/icons/') ||
    url.pathname.startsWith('/brand/') ||
    url.pathname === '/favicon.png' ||
    url.pathname === '/manifest.webmanifest'
  )
}

self.addEventListener('fetch', (event) => {
  const req = event.request

  // Só GET. POST/PATCH/DELETE são mutação e nunca passam por aqui.
  if (req.method !== 'GET') return

  const url = new URL(req.url)

  // Outra origem (Supabase, WhatsApp, provedores de IA, fontes): não tocamos.
  if (url.origin !== self.location.origin) return

  // Requisição com credencial explícita não é assunto de cache.
  if (req.headers.has('Authorization') || req.headers.has('apikey')) return

  if (ehAssetImutavel(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_ESTATICO)
        const guardado = await cache.match(req)
        if (guardado) return guardado
        const resposta = await fetch(req)
        if (resposta.ok && resposta.type === 'basic') cache.put(req, resposta.clone())
        return resposta
      })(),
    )
    return
  }

  if (ehEstaticoPublico(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_ESTATICO)
        const guardado = await cache.match(req)
        const rede = fetch(req)
          .then((resposta) => {
            if (resposta.ok && resposta.type === 'basic') cache.put(req, resposta.clone())
            return resposta
          })
          .catch(() => guardado)
        return guardado || rede
      })(),
    )
    return
  }

  // Navegação: tenta a rede; sem rede, devolve a casca. A casca não tem dado
  // nenhum — quem monta a tela é o React, que mostra o aviso de sem conexão.
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          return await fetch(req)
        } catch {
          const cache = await caches.open(CACHE_SHELL)
          const casca = await cache.match(SHELL)
          return (
            casca ||
            new Response('Sem conexão.', {
              status: 503,
              headers: { 'Content-Type': 'text/plain; charset=utf-8' },
            })
          )
        }
      })(),
    )
    return
  }

  // Qualquer outra coisa da nossa origem vai direto para a rede, sem guardar.
})
