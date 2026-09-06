import { useCallback, useEffect, useState } from 'react'

/**
 * Conexão e versão do app.
 *
 * O registro do worker mora fora do React e é disparado no main.tsx, porque
 * ele não pode depender de estar autenticado: quem abre o app na tela de
 * login também precisa da casca em cache para conseguir entrar sem rede.
 *
 * A atualização nunca é aplicada sozinha. Um atendente pode estar no meio de
 * uma conversa, com texto digitado e anexo escolhido — recarregar por conta
 * própria jogaria isso fora. O worker novo fica esperando e só assume quando
 * a pessoa clica.
 */

let workerEsperando: ServiceWorker | null = null
const ouvintes = new Set<() => void>()

function avisar() {
  for (const ouvinte of ouvintes) ouvinte()
}

function marcarPronta(worker: ServiceWorker | null) {
  if (!worker || workerEsperando === worker) return
  workerEsperando = worker
  avisar()
}

/** Chamado uma vez, no arranque. Silencioso se o navegador não suportar. */
export function registrarServiceWorker() {
  if (!import.meta.env.PROD) return
  if (!('serviceWorker' in navigator)) return

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((registro) => {
        // Já havia uma versão nova esperando de uma visita anterior.
        if (registro.waiting && navigator.serviceWorker.controller) {
          marcarPronta(registro.waiting)
        }

        registro.addEventListener('updatefound', () => {
          const novo = registro.installing
          if (!novo) return
          novo.addEventListener('statechange', () => {
            // Ter `controller` significa que não é a primeira instalação: é
            // troca de versão, e aí sim vale avisar alguém.
            if (novo.state === 'installed' && navigator.serviceWorker.controller) {
              marcarPronta(novo)
            }
          })
        })
      })
      .catch(() => {
        // Sem service worker o app continua funcionando normalmente online.
      })
  })
}

export function useAppShell() {
  const [offline, setOffline] = useState(
    () => typeof navigator !== 'undefined' && !navigator.onLine,
  )
  const [atualizacaoPronta, setAtualizacaoPronta] = useState(() => workerEsperando !== null)

  useEffect(() => {
    const online = () => setOffline(false)
    const semRede = () => setOffline(true)
    window.addEventListener('online', online)
    window.addEventListener('offline', semRede)
    return () => {
      window.removeEventListener('online', online)
      window.removeEventListener('offline', semRede)
    }
  }, [])

  useEffect(() => {
    const ouvinte = () => setAtualizacaoPronta(workerEsperando !== null)
    ouvintes.add(ouvinte)
    ouvinte()
    return () => {
      ouvintes.delete(ouvinte)
    }
  }, [])

  const aplicarAtualizacao = useCallback(() => {
    if (!workerEsperando) return
    // Recarrega só quando o worker novo assumir o controle de verdade.
    navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), {
      once: true,
    })
    workerEsperando.postMessage({ type: 'APLICAR_ATUALIZACAO' })
  }, [])

  return { offline, atualizacaoPronta, aplicarAtualizacao }
}
