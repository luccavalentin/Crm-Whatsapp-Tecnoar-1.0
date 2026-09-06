import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import {
  activeChannel,
  sendViaChannel,
  type MediaKind,
  type TemplatePayload,
} from './providers.ts'

/** Anexo já enviado ao bucket privado whatsapp-media. */
export interface OutboundMedia {
  /** Caminho dentro do bucket: <company_id>/<conversation_id>/<arquivo> */
  path: string
  mime: string
  name: string
  kind: MediaKind
}

/**
 * O cliente precisa saber com quem esta falando. Quando um atendente humano
 * responde, o nome dele vai junto na mensagem do WhatsApp - do mesmo jeito que
 * aparece no CRM. O texto guardado no banco continua limpo, para a bolha do
 * CRM nao repetir o nome.
 */
function assinar(text: string, nome: string | null | undefined): string {
  const limpo = (nome ?? '').trim()
  if (!limpo) return text
  return text.trim() ? `*${limpo}*\n${text}` : `*${limpo}*`
}

const MEDIA_BUCKET = 'whatsapp-media'
/** Tempo de vida da URL que o provedor usa para buscar o arquivo. */
const SIGNED_URL_SECONDS = 60 * 60

export interface OutboundInput {
  companyId: string
  conversationId: string
  customerId: string
  text: string
  sender: 'atendente' | 'ia' | 'sistema'
  senderUserId?: string | null
  /** Nome do atendente, usado para assinar a mensagem no WhatsApp */
  senderName?: string | null
  clientToken: string
  template?: TemplatePayload
  media?: OutboundMedia
  /** Id da mensagem que esta sendo citada */
  replyToId?: string | null
}

export interface OutboundResult {
  message: Record<string, unknown>
  error?: string
  duplicated?: boolean
  requiresTemplate?: boolean
}

/**
 * Grava e entrega uma mensagem de saída.
 * A mensagem só recebe status "enviada" quando o provedor confirma.
 */
export async function deliverOutbound(
  admin: SupabaseClient,
  input: OutboundInput,
): Promise<OutboundResult> {
  const { data: duplicate } = await admin
    .from('messages')
    .select('*')
    .eq('client_token', input.clientToken)
    .maybeSingle()
  if (duplicate) return { message: duplicate, duplicated: true }

  const { data: customer } = await admin
    .from('customers')
    .select('id, phone')
    .eq('id', input.customerId)
    .single()

  const channel = await activeChannel(admin, input.companyId)
  const now = new Date().toISOString()

  // Mensagem citada: precisamos do id no provedor para o WhatsApp mostrar a
  // citacao do lado do cliente, igual ao "responder" do aplicativo.
  let quoted: {
    providerMessageId: string
    chatId: string | null
    fromMe: boolean
    text: string | null
  } | undefined
  if (input.replyToId) {
    const { data: original } = await admin
      .from('messages')
      .select('provider_message_id, provider_chat_id, direction, body')
      .eq('id', input.replyToId)
      .eq('company_id', input.companyId)
      .maybeSingle()

    if (original?.provider_message_id) {
      quoted = {
        providerMessageId: original.provider_message_id as string,
        chatId: (original.provider_chat_id as string | null) ?? null,
        fromMe: original.direction === 'outbound',
        text: (original.body as string | null) ?? null,
      }
    }
  }

  const { data: message, error: insertError } = await admin
    .from('messages')
    .insert({
      company_id: input.companyId,
      conversation_id: input.conversationId,
      customer_id: input.customerId,
      direction: 'outbound',
      sender: input.sender,
      sender_user_id: input.senderUserId ?? null,
      type: input.media ? input.media.kind : input.template ? 'template' : 'text',
      body: input.text,
      media_url: input.media?.path ?? null,
      media_mime: input.media?.mime ?? null,
      media_name: input.media?.name ?? null,
      status: channel ? 'enviando' : 'falhou',
      channel: channel?.provider ?? null,
      client_token: input.clientToken,
      reply_to_id: input.replyToId ?? null,
      error_message: channel ? null : 'Nenhum canal de WhatsApp ativo configurado.',
      failed_at: channel ? null : now,
    })
    .select('*')
    .single()

  if (insertError) {
    if (insertError.code === '23505') {
      const { data: existing } = await admin
        .from('messages')
        .select('*')
        .eq('client_token', input.clientToken)
        .maybeSingle()
      if (existing) return { message: existing, duplicated: true }
    }
    throw new Error(insertError.message)
  }

  if (!channel) {
    await admin.rpc('raise_alert', {
      p_company_id: input.companyId,
      p_source: 'whatsapp',
      p_code: 'sem_canal_ativo',
      p_title: 'Nenhum canal de WhatsApp configurado',
      p_description:
        'Uma mensagem nao pode ser enviada porque nao existe integracao de WhatsApp ativa.',
      p_severity: 'critico',
      p_metadata: { message_id: message.id },
    })
    return { message, error: 'Nenhum canal de WhatsApp ativo configurado.' }
  }

  // O provedor busca o arquivo por conta propria, entao precisamos de uma URL
  // assinada temporaria — o bucket e privado.
  let signedUrl: string | null = null
  if (input.media) {
    const { data: signed, error: signError } = await admin.storage
      .from(MEDIA_BUCKET)
      .createSignedUrl(input.media.path, SIGNED_URL_SECONDS)

    if (signError || !signed?.signedUrl) {
      const failedAt = new Date().toISOString()
      const reason = signError?.message ?? 'Nao foi possivel liberar o arquivo para envio.'
      const { data: failed } = await admin
        .from('messages')
        .update({ status: 'falhou', failed_at: failedAt, error_message: reason })
        .eq('id', message.id)
        .select('*')
        .single()
      return { message: failed ?? message, error: reason }
    }
    signedUrl = signed.signedUrl
  }

  const textoNoWhatsApp =
    input.sender === 'atendente' ? assinar(input.text, input.senderName) : input.text

  const result = await sendViaChannel(channel, {
    to: customer!.phone,
    type: input.media ? input.media.kind : input.template ? 'template' : 'text',
    text: textoNoWhatsApp,
    template: input.template,
    quoted,
    media:
      input.media && signedUrl
        ? {
            url: signedUrl,
            mime: input.media.mime,
            name: input.media.name,
            kind: input.media.kind,
          }
        : undefined,
  })

  const sentAt = new Date().toISOString()
  const { data: updated } = await admin
    .from('messages')
    .update(
      result.ok
        ? {
            status: 'enviada',
            sent_at: sentAt,
            provider_message_id: result.providerMessageId ?? null,
            error_message: null,
          }
        : { status: 'falhou', failed_at: sentAt, error_message: result.error ?? 'Falha no envio.' },
    )
    .eq('id', message.id)
    .select('*')
    .single()

  await admin
    .from('whatsapp_channels')
    .update(
      result.ok
        ? { last_outbound_at: sentAt, last_error: null }
        : { last_error: result.error ?? 'Falha no envio.', last_error_at: sentAt },
    )
    .eq('id', channel.id)

  if (!result.ok) {
    await admin.rpc('raise_alert', {
      p_company_id: input.companyId,
      p_source: 'whatsapp',
      p_code: `falha_envio_${channel.provider}`,
      p_title: 'Falha ao enviar mensagem pelo WhatsApp',
      p_description: result.error ?? 'Falha no envio.',
      p_severity: 'critico',
      p_metadata: { message_id: message.id, channel_id: channel.id },
    })
  }

  return {
    message: updated ?? message,
    error: result.ok ? undefined : result.error,
    requiresTemplate: result.requiresTemplate,
  }
}
