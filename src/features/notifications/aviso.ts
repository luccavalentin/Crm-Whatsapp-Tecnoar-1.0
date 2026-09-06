/**
 * Aviso sonoro e notificação de mensagem nova.
 *
 * O som é sintetizado na hora com Web Audio em vez de vir de um arquivo: não
 * há binário para baixar, funciona sem rede no app instalado e não depende do
 * cache do service worker. São duas notas curtas — o suficiente para chamar
 * atenção num balcão de oficina sem virar alarme.
 */

const CHAVE_SOM = 'tecnoar.aviso.som'
const CHAVE_DESKTOP = 'tecnoar.aviso.desktop'

export type TipoDeAviso = 'mensagem' | 'emergencia'

export const somLigado = () => localStorage.getItem(CHAVE_SOM) !== '0'
export const definirSom = (ligado: boolean) =>
  localStorage.setItem(CHAVE_SOM, ligado ? '1' : '0')

export const notificacaoLigada = () => localStorage.getItem(CHAVE_DESKTOP) !== '0'
export const definirNotificacao = (ligada: boolean) =>
  localStorage.setItem(CHAVE_DESKTOP, ligada ? '1' : '0')

let contexto: AudioContext | null = null
let liberado = false

/**
 * Navegador só deixa tocar som depois que a pessoa interagiu com a página.
 * Prendemos a liberação no primeiro clique/toque e não repetimos.
 */
export function prepararSom() {
  if (liberado) return
  const liberar = () => {
    liberado = true
    try {
      contexto = contexto ?? new AudioContext()
      void contexto.resume()
    } catch {
      // Sem áudio disponível: o aviso visual continua funcionando.
    }
    window.removeEventListener('pointerdown', liberar)
    window.removeEventListener('keydown', liberar)
  }
  window.addEventListener('pointerdown', liberar, { once: true })
  window.addEventListener('keydown', liberar, { once: true })
}

function nota(ctx: AudioContext, hz: number, inicio: number, duracao: number, volume: number) {
  const osc = ctx.createOscillator()
  const ganho = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.value = hz
  // Envelope curto evita o "clique" de corte abrupto.
  ganho.gain.setValueAtTime(0, inicio)
  ganho.gain.linearRampToValueAtTime(volume, inicio + 0.015)
  ganho.gain.exponentialRampToValueAtTime(0.0001, inicio + duracao)
  osc.connect(ganho).connect(ctx.destination)
  osc.start(inicio)
  osc.stop(inicio + duracao + 0.02)
}

export function tocarAviso(tipo: TipoDeAviso = 'mensagem') {
  if (!somLigado() || !liberado) return
  try {
    contexto = contexto ?? new AudioContext()
    if (contexto.state === 'suspended') void contexto.resume()
    const agora = contexto.currentTime

    if (tipo === 'emergencia') {
      // Três notas subindo: precisa soar diferente de mensagem comum.
      nota(contexto, 880, agora, 0.14, 0.22)
      nota(contexto, 1046, agora + 0.16, 0.14, 0.22)
      nota(contexto, 1318, agora + 0.32, 0.22, 0.24)
      return
    }
    nota(contexto, 660, agora, 0.11, 0.16)
    nota(contexto, 880, agora + 0.12, 0.16, 0.16)
  } catch {
    // Falha de áudio nunca pode derrubar o atendimento.
  }
}

/** Pede permissão de notificação. Só faz sentido a partir de um clique. */
export async function pedirPermissao(): Promise<NotificationPermission> {
  if (!('Notification' in window)) return 'denied'
  if (Notification.permission !== 'default') return Notification.permission
  try {
    return await Notification.requestPermission()
  } catch {
    return 'denied'
  }
}

export const permissaoAtual = (): NotificationPermission | 'indisponivel' =>
  'Notification' in window ? Notification.permission : 'indisponivel'

interface AvisoInput {
  titulo: string
  corpo: string
  conversationId: string
  tipo?: TipoDeAviso
}

/**
 * Toca e, se a aba não estiver à frente, mostra a notificação do sistema.
 *
 * Com a aba aberta e visível não faz sentido notificar: a pessoa já está
 * olhando a conversa. O som toca de qualquer jeito, porque o atendente pode
 * estar de costas para a tela.
 */
export function avisar({ titulo, corpo, conversationId, tipo = 'mensagem' }: AvisoInput) {
  tocarAviso(tipo)

  if (!notificacaoLigada()) return
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  if (document.visibilityState === 'visible') return

  try {
    const n = new Notification(titulo, {
      body: corpo.slice(0, 160),
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      // Mesma conversa substitui o aviso anterior em vez de empilhar.
      tag: `conversa-${conversationId}`,
      renotify: true,
      silent: true, // o som é nosso, para poder diferenciar emergência
    } as NotificationOptions)

    n.onclick = () => {
      window.focus()
      window.location.href = `/atendimentos?conversa=${conversationId}`
      n.close()
    }
  } catch {
    // Notificação bloqueada pelo sistema: o som já cumpriu o papel.
  }
}
