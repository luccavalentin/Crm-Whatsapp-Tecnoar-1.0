import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import type { AiSettings } from './ai.ts'

/**
 * Freio de gasto da IA.
 *
 * Os tokens de cada execução já eram gravados; o que faltava era alguém ler
 * esse número antes de fazer a próxima chamada. Sem isso, um número em laço,
 * um cliente irritado mandando cinquenta mensagens ou um webhook reentregando
 * em rajada viram custo direto no cartão, sem alerta e sem teto.
 *
 * São dois freios com propósitos diferentes:
 *
 *   respostas por hora, na conversa  → corta laço e enxurrada de uma pessoa só
 *   tokens por dia, na empresa       → corta o gasto do mês
 *
 * Estourar não é o fim do atendimento: é o fim do atendimento AUTOMÁTICO. A
 * conversa vai para uma pessoa e um alerta é aberto. Parar de responder é
 * ruim; parar de responder sem ninguém saber é o que não pode acontecer.
 */

export interface LimiteEstourado {
  /** Código curto, para o retorno da função e para os registros. */
  codigo: 'limite_respostas_hora' | 'limite_tokens_dia'
  /** Frase que uma pessoa vai ler no alerta. */
  descricao: string
}

/**
 * Confere os dois freios. Devolve null quando pode seguir.
 *
 * As duas contas saem juntas: nenhuma depende da outra e o cliente já está
 * esperando.
 */
export async function limiteEstourado(
  admin: SupabaseClient,
  companyId: string,
  conversationId: string,
  settings: AiSettings,
): Promise<LimiteEstourado | null> {
  const maxHora = Number(settings.max_replies_per_hour ?? 0)
  const tetoDia = Number(settings.daily_token_budget ?? 0)

  // Zero significa "sem freio" — é uma escolha da empresa, não um descuido.
  const precisaContarRespostas = maxHora > 0
  const precisaContarTokens = tetoDia > 0
  if (!precisaContarRespostas && !precisaContarTokens) return null

  const umaHoraAtras = new Date(Date.now() - 60 * 60 * 1000).toISOString()

  const [respostas, tokens] = await Promise.all([
    precisaContarRespostas
      ? admin
          .from('ai_runs')
          .select('id', { count: 'exact', head: true })
          .eq('conversation_id', conversationId)
          .eq('kind', 'resposta')
          .eq('ok', true)
          .gte('created_at', umaHoraAtras)
      : Promise.resolve({ count: 0 }),
    precisaContarTokens
      ? admin.rpc('ai_tokens_hoje', { p_company_id: companyId })
      : Promise.resolve({ data: 0 }),
  ])

  const jaRespondeu = Number((respostas as { count: number | null }).count ?? 0)
  if (precisaContarRespostas && jaRespondeu >= maxHora) {
    return {
      codigo: 'limite_respostas_hora',
      descricao:
        `A IA já respondeu ${jaRespondeu} vezes nesta conversa na última hora, ` +
        `o limite configurado é ${maxHora}. O atendimento foi passado para uma pessoa.`,
    }
  }

  const gastoHoje = Number((tokens as { data: unknown }).data ?? 0)
  if (precisaContarTokens && gastoHoje >= tetoDia) {
    return {
      codigo: 'limite_tokens_dia',
      descricao:
        `O consumo de IA de hoje (${gastoHoje.toLocaleString('pt-BR')} tokens) atingiu o ` +
        `teto diário de ${tetoDia.toLocaleString('pt-BR')}. Os atendimentos seguem com ` +
        `a equipe até a virada do dia ou até o teto ser aumentado em IA > Comportamento.`,
    }
  }

  return null
}
