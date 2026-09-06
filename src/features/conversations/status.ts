import type { ConversationPriority, ConversationStatus } from '@/types/database'
import type { BadgeTone } from '@/components/ui'

/**
 * Vocabulário de situação do atendimento — um só lugar.
 *
 * A regra de cor é semântica e vale no app inteiro:
 *   laranja  precisa de alguém agora
 *   ciano    a IA está conduzindo
 *   navy     um humano assumiu
 *   verde    encerrado
 *   vermelho emergência ou falha
 *
 * Antes disto, Atendimentos e Kanban pintavam o mesmo status de formas
 * diferentes, e "aguardando humano" mudava de cor conforme a tela.
 */

export const STATUS_LABEL: Record<ConversationStatus, string> = {
  novo: 'Novo',
  ia: 'Com a IA',
  aguardando_humano: 'Aguardando humano',
  em_atendimento: 'Em atendimento',
  concluido: 'Concluído',
}

export const STATUS_TONE: Record<ConversationStatus, BadgeTone> = {
  novo: 'orange',
  ia: 'cyan',
  aguardando_humano: 'orange',
  em_atendimento: 'navy',
  concluido: 'success',
}

/** Chip de fundo suave, para a lista de conversas. */
export const STATUS_CHIP: Record<ConversationStatus, string> = {
  novo: 'bg-orange-100 text-orange-600',
  ia: 'bg-cyan-100 text-cyan-600',
  aguardando_humano: 'bg-orange-100 text-orange-600',
  em_atendimento: 'bg-navy-900 text-white',
  concluido: 'bg-emerald-50 text-emerald-700',
}

/** Ponto sólido — é o que se lê de relance, antes do texto. */
export const STATUS_DOT: Record<ConversationStatus, string> = {
  novo: 'bg-orange-500',
  ia: 'bg-cyan-500',
  aguardando_humano: 'bg-orange-500',
  em_atendimento: 'bg-navy-900/60',
  concluido: 'bg-emerald-500',
}

export const PRIORITY_LABEL: Record<ConversationPriority, string> = {
  baixa: 'Baixa',
  normal: 'Normal',
  alta: 'Alta',
  emergencia: 'Emergência',
}

/**
 * Só emergência e alta merecem cor. Pintar "normal" e "baixa" gasta a
 * atenção do atendente no que não precisa dela.
 */
export const PRIORITY_TONE: Record<ConversationPriority, BadgeTone | null> = {
  baixa: null,
  normal: null,
  alta: 'orange',
  emergencia: 'danger',
}

/** Um atendimento parado esperando gente é o que a operação precisa ver. */
export function needsAttention(status: ConversationStatus): boolean {
  return status === 'novo' || status === 'aguardando_humano'
}
