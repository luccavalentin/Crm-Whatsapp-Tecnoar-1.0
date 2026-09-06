import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Briefcase,
  CircleCheck,
  Clock,
  Hand,
  Search,
  Smile,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface EmojiGroup {
  key: string
  label: string
  icon: LucideIcon
  emojis: Array<[string, string]>
}

/** Conjunto usado no dia a dia do atendimento, com busca em português. */
const GROUPS: EmojiGroup[] = [
  {
    key: 'frequentes',
    label: 'Frequentes',
    icon: Clock,
    emojis: [
      ['👍', 'joia positivo ok curtir'],
      ['🙏', 'obrigado por favor agradecido'],
      ['✅', 'certo confirmado feito ok'],
      ['❌', 'errado nao cancelado'],
      ['⚠️', 'atencao alerta cuidado'],
      ['🔧', 'chave ferramenta reparo conserto'],
      ['🚗', 'carro veiculo automovel'],
      ['🛻', 'caminhonete picape veiculo'],
      ['🚚', 'caminhao frota veiculo'],
      ['⏰', 'hora prazo horario relogio'],
      ['📅', 'agenda data calendario'],
      ['📍', 'local endereco onde'],
      ['💰', 'dinheiro preco valor orcamento'],
      ['📄', 'documento nota arquivo'],
      ['📞', 'telefone ligar contato'],
      ['🔥', 'urgente quente emergencia'],
    ],
  },
  {
    key: 'rostos',
    label: 'Rostos',
    icon: Smile,
    emojis: [
      ['😀', 'sorriso feliz alegre'],
      ['😃', 'sorriso alegre'],
      ['😁', 'sorriso dentes'],
      ['🤣', 'rindo muito chorando de rir'],
      ['😅', 'alivio suor riso'],
      ['🙂', 'leve sorriso'],
      ['😉', 'piscada'],
      ['😊', 'feliz corado'],
      ['😇', 'anjo inocente'],
      ['🥰', 'apaixonado coracoes'],
      ['😍', 'apaixonado olhos coracao'],
      ['😘', 'beijo'],
      ['😋', 'delicia gostoso'],
      ['🤗', 'abraco'],
      ['🤔', 'pensando duvida'],
      ['😐', 'neutro serio'],
      ['😏', 'malicioso'],
      ['😴', 'dormindo sono'],
      ['😪', 'sono cansado'],
      ['🤒', 'doente febre'],
      ['🥳', 'festa comemorar'],
      ['😎', 'oculos estiloso'],
      ['🤩', 'impressionado estrelas'],
      ['😤', 'bufando irritado'],
      ['😡', 'raiva bravo'],
      ['🤬', 'xingando raiva'],
      ['😱', 'susto medo'],
      ['😰', 'ansioso suor'],
      ['😭', 'chorando muito'],
      ['🥲', 'sorriso com lagrima'],
      ['😀', 'sorriso feliz alegre'],
      ['😃', 'sorriso feliz'],
      ['😄', 'sorriso alegre'],
      ['😁', 'sorriso dentes'],
      ['😊', 'sorriso timido feliz'],
      ['🙂', 'sorriso leve'],
      ['😉', 'piscada'],
      ['😍', 'apaixonado amor coracao'],
      ['🤩', 'estrelas incrivel uau'],
      ['😎', 'oculos legal estiloso'],
      ['🤝', 'aperto de mao acordo negocio'],
      ['😅', 'aliviado suor risada'],
      ['😂', 'risada chorando de rir'],
      ['🤣', 'gargalhada rolando de rir'],
      ['🙃', 'de cabeca para baixo ironia'],
      ['😌', 'aliviado calmo'],
      ['🤔', 'pensando duvida'],
      ['😐', 'neutro serio'],
      ['😕', 'confuso'],
      ['😟', 'preocupado'],
      ['😢', 'triste chorando'],
      ['😭', 'chorando muito'],
      ['😤', 'irritado bufando'],
      ['😠', 'bravo raiva'],
      ['😱', 'susto medo'],
      ['🤯', 'explodindo espanto'],
      ['😴', 'dormindo sono'],
      ['🤗', 'abraco acolhida'],
      ['🫡', 'continencia entendido'],
      ['🥳', 'festa comemorar'],
    ],
  },
  {
    key: 'gestos',
    label: 'Gestos',
    icon: Hand,
    emojis: [
      ['👋', 'tchau ola aceno'],
      ['🤝', 'aperto de mao acordo negocio'],
      ['👏', 'palmas parabens'],
      ['🙌', 'maos ao alto comemorar'],
      ['👌', 'ok certo joia'],
      ['✌️', 'paz vitoria'],
      ['🤙', 'chama shaka'],
      ['👇', 'aponta para baixo'],
      ['👆', 'aponta para cima'],
      ['👉', 'aponta direita'],
      ['👈', 'aponta esquerda'],
      ['💪', 'forca musculo'],
      ['🫡', 'continencia entendido'],
      ['🤞', 'dedos cruzados torcendo'],
      ['👊', 'soco toca aqui'],
      ['👋', 'oi tchau aceno ola'],
      ['👍', 'joia positivo ok'],
      ['👎', 'negativo ruim'],
      ['👌', 'ok perfeito'],
      ['✌️', 'paz vitoria'],
      ['🤞', 'dedos cruzados torcendo'],
      ['🙏', 'obrigado por favor'],
      ['👏', 'palmas parabens'],
      ['💪', 'forca musculo'],
      ['🤙', 'me liga shaka'],
      ['☝️', 'atencao um ponto'],
      ['👇', 'abaixo veja'],
      ['👉', 'aponta direita'],
      ['🫰', 'coracao dedos'],
      ['✍️', 'escrevendo anotar'],
      ['🤲', 'maos abertas'],
    ],
  },
  {
    key: 'oficina',
    label: 'Oficina',
    icon: Wrench,
    emojis: [
      ['🔩', 'parafuso porca'],
      ['⚙️', 'engrenagem mecanica'],
      ['🛠️', 'ferramentas manutencao'],
      ['🪛', 'chave de fenda'],
      ['🔨', 'martelo'],
      ['🧰', 'caixa de ferramentas'],
      ['🚛', 'carreta caminhao grande'],
      ['🚐', 'van furgao'],
      ['🚌', 'onibus'],
      ['🛞', 'pneu roda'],
      ['⛽', 'combustivel posto diesel'],
      ['🔋', 'bateria'],
      ['🧯', 'extintor'],
      ['🚨', 'sirene emergencia socorro'],
      ['🦺', 'colete seguranca'],
      ['🛣️', 'rodovia estrada'],
      ['🏁', 'chegada fim'],
      ['🔥', 'fogo quente superaquecendo'],
      ['💨', 'ar pressao vazamento'],
      ['💧', 'agua vazamento gota'],
      ['🛢️', 'oleo tambor'],
      ['🔧', 'chave inglesa ferramenta'],
      ['🔩', 'parafuso porca'],
      ['⚙️', 'engrenagem mecanica'],
      ['🛠️', 'ferramentas manutencao'],
      ['🧰', 'caixa de ferramentas'],
      ['🚗', 'carro veiculo'],
      ['🚙', 'suv veiculo'],
      ['🛻', 'picape caminhonete'],
      ['🚚', 'caminhao'],
      ['🚛', 'carreta caminhao'],
      ['🚜', 'trator maquina'],
      ['🏍️', 'moto motocicleta'],
      ['🛞', 'pneu roda'],
      ['⛽', 'combustivel posto'],
      ['🔋', 'bateria'],
      ['🧯', 'extintor seguranca'],
      ['🦺', 'colete seguranca'],
      ['🧑‍🔧', 'mecanico tecnico'],
      ['🏭', 'fabrica industria'],
      ['📦', 'caixa peca entrega'],
      ['🚨', 'emergencia urgente sirene'],
      ['🛑', 'pare parada freio'],
    ],
  },
  {
    key: 'negocio',
    label: 'Negócio',
    icon: Briefcase,
    emojis: [
      ['📞', 'telefone ligacao'],
      ['📱', 'celular whatsapp'],
      ['📧', 'email'],
      ['📄', 'documento nota'],
      ['🧾', 'recibo nota fiscal'],
      ['📦', 'pacote peca entrega'],
      ['🚀', 'rapido urgente'],
      ['📊', 'grafico relatorio'],
      ['🕐', 'hora relogio'],
      ['💳', 'cartao pagamento'],
      ['🏦', 'banco transferencia'],
      ['🤑', 'dinheiro lucro'],
      ['📌', 'fixar importante'],
      ['🔖', 'marcador etiqueta'],
      ['🗓️', 'agenda mes'],
      ['💰', 'dinheiro valor preco'],
      ['💵', 'nota dinheiro'],
      ['💳', 'cartao pagamento'],
      ['🧾', 'nota fiscal recibo'],
      ['📄', 'documento arquivo'],
      ['📋', 'prancheta lista orcamento'],
      ['📊', 'grafico relatorio'],
      ['📈', 'crescimento alta'],
      ['📉', 'queda baixa'],
      ['🗓️', 'agenda data'],
      ['📅', 'calendario data'],
      ['⏰', 'hora prazo'],
      ['⏳', 'aguardando tempo'],
      ['📌', 'fixar importante'],
      ['📍', 'local endereco'],
      ['🏢', 'empresa escritorio'],
      ['📞', 'telefone ligar'],
      ['📲', 'whatsapp celular'],
      ['✉️', 'email mensagem'],
      ['🔗', 'link'],
      ['🔒', 'seguro bloqueado'],
      ['💼', 'trabalho negocio'],
    ],
  },
  {
    key: 'simbolos',
    label: 'Símbolos',
    icon: CircleCheck,
    emojis: [
      ['❤️', 'coracao amor'],
      ['👍', 'joia positivo'],
      ['🙏', 'obrigado por favor'],
      ['❗', 'exclamacao atencao'],
      ['❓', 'duvida pergunta'],
      ['✔️', 'confirmado certo'],
      ['➡️', 'seta direita proximo'],
      ['🔴', 'vermelho parado critico'],
      ['🟢', 'verde ok liberado'],
      ['🟡', 'amarelo atencao'],
      ['⭐', 'estrela favorito'],
      ['🎯', 'alvo meta'],
      ['🆗', 'ok'],
      ['🔝', 'topo melhor'],
      ['♻️', 'recondicionado reciclado'],
      ['✅', 'certo confirmado feito'],
      ['☑️', 'marcado feito'],
      ['❌', 'errado cancelado nao'],
      ['⛔', 'proibido bloqueado'],
      ['⚠️', 'atencao alerta'],
      ['❗', 'importante exclamacao'],
      ['❓', 'duvida pergunta'],
      ['💡', 'ideia dica sugestao'],
      ['🔥', 'urgente quente'],
      ['⭐', 'estrela destaque'],
      ['❤️', 'coracao amor'],
      ['🧡', 'coracao laranja'],
      ['💙', 'coracao azul'],
      ['🎉', 'festa parabens'],
      ['🎯', 'meta objetivo alvo'],
      ['🔔', 'aviso notificacao sino'],
      ['🔎', 'buscar procurar'],
      ['♻️', 'reciclar reaproveitar'],
      ['🆗', 'ok'],
      ['🆕', 'novo'],
      ['🔝', 'topo melhor'],
      ['💯', 'cem perfeito'],
    ],
  },
]

const CHAVE_RECENTES = 'tecnoar:emojis-recentes'

/**
 * Os emojis que esta pessoa mais usa, e nao uma lista que alguem chutou.
 *
 * O WhatsApp chama de "Frequentes" e e a aba que resolve 90% dos casos, porque
 * cada atendente repete os mesmos cinco o dia inteiro. Fica no aparelho: e
 * preferencia de quem digita, nao dado da empresa.
 */
function lerRecentes(): string[] {
  try {
    const cru = JSON.parse(localStorage.getItem(CHAVE_RECENTES) ?? '[]')
    return Array.isArray(cru) ? cru.filter((e): e is string => typeof e === 'string').slice(0, 24) : []
  } catch {
    return []
  }
}

function guardarRecente(emoji: string) {
  try {
    const lista = [emoji, ...lerRecentes().filter((e) => e !== emoji)].slice(0, 24)
    localStorage.setItem(CHAVE_RECENTES, JSON.stringify(lista))
  } catch {
    // Armazenamento bloqueado: os frequentes somem, o teclado continua inteiro.
  }
}

export function EmojiPicker({ onPick, disabled }: { onPick: (emoji: string) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false)
  const [group, setGroup] = useState(GROUPS[0].key)
  const [search, setSearch] = useState('')
  const [recentes, setRecentes] = useState<string[]>([])
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  useEffect(() => {
    if (!open) setSearch('')
    else setRecentes(lerRecentes())
  }, [open])

  const escolher = (emoji: string) => {
    guardarRecente(emoji)
    setRecentes(lerRecentes())
    onPick(emoji)
  }

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) {
      const doGrupo = GROUPS.find((item) => item.key === group)?.emojis ?? []
      if (group !== 'frequentes' || recentes.length === 0) return doGrupo
      // Os usados de verdade vem primeiro; o resto do grupo completa a grade.
      const usados = recentes.map((e) => [e, ''] as [string, string])
      const jaTem = new Set(recentes)
      return [...usados, ...doGrupo.filter(([e]) => !jaTem.has(e))]
    }
    const seen = new Set<string>()
    const found: Array<[string, string]> = []
    for (const item of GROUPS) {
      for (const entry of item.emojis) {
        if (seen.has(entry[0])) continue
        if (entry[1].includes(term)) {
          seen.add(entry[0])
          found.push(entry)
        }
      }
    }
    return found
  }, [group, search, recentes])

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
        title="Emojis"
        aria-label="Emojis"
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-xl text-muted transition-colors sm:size-9',
          'hover:bg-ink/[0.05] hover:text-ink disabled:opacity-40',
          open && 'bg-ink/[0.06] text-ink',
        )}
      >
        <Smile className="size-[18px]" />
      </button>

      {open && (
        <div
          // Largura em min(88vw, 352px): ancorado no botao (canto inferior
          // esquerdo do composer), uma largura fixa estourava a tela em
          // aparelhos de 360-390px. O clamp por vw acompanha o espaco real
          // disponivel a direita do botao sem precisar medir em JS.
          className="animate-in-rise absolute bottom-11 left-0 z-30 flex w-[min(88vw,352px)] flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-[var(--shadow-pop)]"
        >
          <div className="flex items-center gap-2 border-b border-line px-3 py-2">
            <Search className="size-3.5 shrink-0 text-muted" />
            <input
              autoFocus
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar emoji…"
              className="min-w-0 flex-1 bg-transparent text-sm text-ink placeholder:text-muted focus:outline-none"
            />
          </div>

          <div className="scrollbar-thin grid h-[264px] grid-cols-8 content-start gap-0.5 overflow-y-auto p-2">
            {visible.length === 0 ? (
              <p className="col-span-8 px-2 py-8 text-center text-xs text-muted">
                Nenhum emoji para “{search.trim()}”.
              </p>
            ) : (
              visible.map(([emoji, keywords]) => (
                <button
                  key={emoji}
                  type="button"
                  title={keywords.split(' ')[0]}
                  onClick={() => escolher(emoji)}
                  className="flex size-10 items-center justify-center rounded-lg text-2xl leading-none transition-transform hover:scale-125 hover:bg-ink/[0.06]"
                >
                  {emoji}
                </button>
              ))
            )}
          </div>

          {/* Categorias embaixo, como no WhatsApp: a mao ja esta ali, no
              polegar, e nao sobe ate o topo para trocar de aba. */}
          {!search.trim() && (
            <div className="flex items-center gap-0.5 border-t border-line px-1.5 py-1">
              {GROUPS.map((item) => {
                const Icone = item.icon
                const ativo = group === item.key
                return (
                  <button
                    key={item.key}
                    type="button"
                    title={item.label}
                    aria-label={item.label}
                    aria-pressed={ativo}
                    onClick={() => setGroup(item.key)}
                    className={cn(
                      'relative flex h-10 flex-1 items-center justify-center rounded-lg transition-colors sm:h-9',
                      ativo ? 'text-ink' : 'text-muted hover:bg-ink/[0.04] hover:text-ink',
                    )}
                  >
                    <Icone className="size-[17px]" />
                    {ativo && (
                      <span className="absolute inset-x-2 bottom-0.5 h-[2px] rounded-full bg-orange-500" />
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
