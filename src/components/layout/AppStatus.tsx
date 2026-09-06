import { CloudOff, RefreshCw } from 'lucide-react'
import { useAppShell } from '@/features/pwa/useAppShell'

/**
 * Faixa de estado do app: sem conexão e versão nova.
 *
 * Fica no topo do conteúdo, acima de tudo, porque um atendente que não sabe
 * que está sem rede acha que mandou a mensagem. O texto diz o que está
 * acontecendo de verdade — não mostra dado velho fingindo ser atual.
 */
export function AppStatus() {
  const { offline, atualizacaoPronta, aplicarAtualizacao } = useAppShell()

  if (!offline && !atualizacaoPronta) return null

  return (
    <div className="shrink-0">
      {offline && (
        <div className="flex items-center gap-2.5 border-b border-orange-500/25 bg-orange-100/70 px-4 py-2 text-xs text-ink sm:px-6">
          <CloudOff className="size-4 shrink-0 text-orange-600" />
          <p className="min-w-0 flex-1 leading-snug">
            <strong className="font-medium">Sem conexão.</strong> O que está na tela pode estar
            desatualizado e novas mensagens não serão enviadas até a rede voltar.
          </p>
        </div>
      )}

      {atualizacaoPronta && (
        <div className="flex items-center gap-2.5 border-b border-cyan-500/25 bg-cyan-100/60 px-4 py-2 text-xs text-ink sm:px-6">
          <RefreshCw className="size-4 shrink-0 text-cyan-600" />
          <p className="min-w-0 flex-1 leading-snug">
            <strong className="font-medium">Nova versão disponível.</strong> Atualize quando puder —
            a página vai recarregar.
          </p>
          <button
            type="button"
            onClick={aplicarAtualizacao}
            className="shrink-0 rounded-lg bg-navy-900 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-navy-800"
          >
            Atualizar
          </button>
        </div>
      )}
    </div>
  )
}
