import { json, preflight } from '../_shared/cors.ts'
import { adminClient, requireUser } from '../_shared/supabase.ts'
import { activeChannel, sendReaction } from '../_shared/providers.ts'

interface ActionRequest {
  action?: 'react'
  messageId?: string
  /** Emoji da reação. Vazio ou nulo remove a reação, igual ao WhatsApp. */
  emoji?: string | null
}

/**
 * Ações sobre uma mensagem já entregue. Hoje: reagir com emoji.
 * A reação só é gravada depois que o provedor confirma — se o WhatsApp
 * recusar, ela não aparece no CRM.
 */
Deno.serve(async (req) => {
  const pre = preflight(req)
  if (pre) return pre
  if (req.method !== 'POST') return json({ error: 'Metodo nao permitido' }, 405)

  const auth = await requireUser(req)
  if (!auth) return json({ error: 'Nao autorizado' }, 401)

  let payload: ActionRequest
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'Corpo invalido' }, 400)
  }

  if (payload.action !== 'react') return json({ error: 'Acao nao suportada' }, 400)
  if (!payload.messageId) return json({ error: 'messageId obrigatorio' }, 400)

  const emoji = (payload.emoji ?? '').trim()
  if (emoji.length > 16) return json({ error: 'Emoji invalido' }, 400)

  const admin = adminClient()

  const { data: message } = await admin
    .from('messages')
    .select('id, company_id, direction, provider_message_id, provider_chat_id, customer_id')
    .eq('id', payload.messageId)
    .maybeSingle()

  if (!message || message.company_id !== auth.companyId) {
    return json({ error: 'Mensagem nao encontrada' }, 404)
  }
  if (!message.provider_message_id) {
    return json({ error: 'Esta mensagem ainda nao foi entregue no WhatsApp.' }, 400)
  }

  const { data: customer } = await admin
    .from('customers')
    .select('phone')
    .eq('id', message.customer_id)
    .single()

  const channel = await activeChannel(admin, auth.companyId)
  if (!channel) return json({ error: 'Nenhum canal de WhatsApp ativo configurado.' }, 400)

  const result = await sendReaction(channel, {
    chatId: message.provider_chat_id as string | null,
    to: customer!.phone,
    providerMessageId: message.provider_message_id as string,
    fromMe: message.direction === 'outbound',
    emoji,
  })

  if (!result.ok) return json({ error: result.error ?? 'O WhatsApp recusou a reacao.' }, 400)

  // Confirmado pelo provedor: agora sim registra no CRM.
  if (!emoji) {
    await admin
      .from('message_reactions')
      .delete()
      .eq('message_id', message.id)
      .eq('profile_id', auth.userId)
    return json({ ok: true, emoji: null })
  }

  const { error } = await admin
    .from('message_reactions')
    .upsert(
      {
        company_id: auth.companyId,
        message_id: message.id,
        emoji,
        by_customer: false,
        profile_id: auth.userId,
      },
      { onConflict: 'message_id,profile_id' },
    )

  if (error) return json({ error: error.message }, 400)

  return json({ ok: true, emoji })
})
