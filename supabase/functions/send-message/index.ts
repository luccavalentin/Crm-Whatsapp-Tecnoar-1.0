import { json, preflight } from '../_shared/cors.ts'
import { adminClient, requireUser } from '../_shared/supabase.ts'
import { deliverOutbound, type OutboundMedia } from '../_shared/outbound.ts'

const MEDIA_KINDS = ['image', 'video', 'audio', 'document'] as const

interface SendRequest {
  conversationId?: string
  customerId?: string
  text?: string
  clientToken: string
  template?: { name: string; language: string; params: string[] }
  /** Anexo ja enviado ao bucket whatsapp-media pelo navegador */
  media?: { path?: string; mime?: string; name?: string; kind?: string }
  /** Id da mensagem que esta sendo respondida */
  replyToId?: string
  /** Reenvio de uma mensagem que falhou */
  retryMessageId?: string
}

/** Envio de mensagem pelo CRM. A entrega é sempre real — nunca simulada. */
Deno.serve(async (req) => {
  const pre = preflight(req)
  if (pre) return pre
  if (req.method !== 'POST') return json({ error: 'Metodo nao permitido' }, 405)

  const auth = await requireUser(req)
  if (!auth) return json({ error: 'Nao autorizado' }, 401)

  let payload: SendRequest
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'Corpo invalido' }, 400)
  }

  if (!payload.clientToken) return json({ error: 'clientToken obrigatorio' }, 400)

  const admin = adminClient()

  // ------------------------------------------------------------- Reenvio
  if (payload.retryMessageId) {
    const { data: original } = await admin
      .from('messages')
      .select('*')
      .eq('id', payload.retryMessageId)
      .maybeSingle()

    if (!original || original.company_id !== auth.companyId) {
      return json({ error: 'Mensagem nao encontrada' }, 404)
    }
    if (original.status !== 'falhou') {
      return json({ error: 'Só é possível reenviar mensagens que falharam.' }, 400)
    }

    try {
      const retry = await deliverOutbound(admin, {
        companyId: auth.companyId,
        conversationId: original.conversation_id,
        customerId: original.customer_id,
        text: original.body ?? '',
        media: original.media_url
          ? {
              path: original.media_url as string,
              mime: (original.media_mime as string) ?? 'application/octet-stream',
              name: (original.media_name as string) ?? 'arquivo',
              kind: MEDIA_KINDS.includes(original.type as (typeof MEDIA_KINDS)[number])
                ? (original.type as OutboundMedia['kind'])
                : 'document',
            }
          : undefined,
        sender: original.sender === 'ia' ? 'ia' : 'atendente',
        senderUserId: original.sender === 'ia' ? null : auth.userId,
        senderName: original.sender === 'ia' ? null : auth.fullName,
        clientToken: payload.clientToken,
      })

      await admin
        .from('messages')
        .update({ retry_of: original.id, retry_count: (original.retry_count ?? 0) + 1 })
        .eq('id', retry.message.id as string)

      return json({
        message: retry.message,
        error: retry.error,
        requiresTemplate: retry.requiresTemplate,
      })
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : 'Falha no reenvio' }, 400)
    }
  }

  const text = (payload.text ?? '').trim()

  // ------------------------------------------------------------ Anexo
  let media: OutboundMedia | undefined
  if (payload.media?.path) {
    const kind = payload.media.kind ?? ''
    if (!MEDIA_KINDS.includes(kind as (typeof MEDIA_KINDS)[number])) {
      return json({ error: 'Tipo de anexo nao suportado' }, 400)
    }
    // O caminho sempre comeca pelo id da empresa: ninguem envia arquivo de outra.
    if (!payload.media.path.startsWith(`${auth.companyId}/`)) {
      return json({ error: 'Arquivo fora da pasta da empresa' }, 403)
    }
    media = {
      path: payload.media.path,
      mime: payload.media.mime || 'application/octet-stream',
      name: payload.media.name || 'arquivo',
      kind: kind as OutboundMedia['kind'],
    }
  }

  if (!text && !media) return json({ error: 'Mensagem vazia' }, 400)

  let conversationId = payload.conversationId ?? null
  let customerId = payload.customerId ?? null

  if (conversationId) {
    const { data: conversation } = await admin
      .from('conversations')
      .select('id, customer_id, company_id')
      .eq('id', conversationId)
      .maybeSingle()
    if (!conversation || conversation.company_id !== auth.companyId) {
      return json({ error: 'Atendimento nao encontrado' }, 404)
    }
    customerId = conversation.customer_id
  } else if (customerId) {
    const { data: customer } = await admin
      .from('customers')
      .select('id, company_id')
      .eq('id', customerId)
      .maybeSingle()
    if (!customer || customer.company_id !== auth.companyId) {
      return json({ error: 'Cliente nao encontrado' }, 404)
    }

    const { data: open } = await admin
      .from('conversations')
      .select('id')
      .eq('customer_id', customerId)
      .neq('status', 'concluido')
      .maybeSingle()

    if (open) {
      conversationId = open.id
    } else {
      const { data: created, error } = await admin
        .from('conversations')
        .insert({
          company_id: auth.companyId,
          customer_id: customerId,
          status: 'em_atendimento',
          assigned_to: auth.userId,
        })
        .select('id')
        .single()
      if (error) return json({ error: error.message }, 400)
      conversationId = created.id

      await admin.from('conversation_events').insert({
        company_id: auth.companyId,
        conversation_id: conversationId,
        type: 'conversation.opened',
        title: 'Atendimento iniciado pelo CRM',
        description: `${auth.fullName || 'Usuario'} iniciou a conversa`,
        actor_type: 'usuario',
        actor_id: auth.userId,
        actor_name: auth.fullName,
      })
    }
  } else {
    return json({ error: 'Informe conversationId ou customerId' }, 400)
  }

  try {
    const result = await deliverOutbound(admin, {
      companyId: auth.companyId,
      conversationId: conversationId!,
      customerId: customerId!,
      text,
      media,
      sender: 'atendente',
      senderUserId: auth.userId,
      senderName: auth.fullName,
      clientToken: payload.clientToken,
      template: payload.template,
      replyToId: payload.replyToId ?? null,
    })

    return json({
      message: result.message,
      error: result.error,
      duplicated: result.duplicated,
      requiresTemplate: result.requiresTemplate,
    })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Falha no envio' }, 400)
  }
})
