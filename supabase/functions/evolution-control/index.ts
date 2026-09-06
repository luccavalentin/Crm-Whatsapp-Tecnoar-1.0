import { json, preflight } from '../_shared/cors.ts'
import { adminClient, requireUser } from '../_shared/supabase.ts'

type Action = 'status' | 'connect' | 'disconnect' | 'test' | 'set-webhook' | 'create-instance'

/**
 * Controle da instância da Evolution API: criação da instância, status real,
 * QR Code real, reconexão, desconexão e registro do webhook.
 * Nada é simulado — todas as respostas vêm da instância configurada.
 */
Deno.serve(async (req) => {
  const pre = preflight(req)
  if (pre) return pre
  if (req.method !== 'POST') return json({ error: 'Metodo nao permitido' }, 405)

  const auth = await requireUser(req)
  if (!auth) return json({ error: 'Nao autorizado' }, 401)
  if (!['owner', 'admin', 'manager'].includes(auth.role)) {
    return json({ error: 'Sem permissao para gerenciar o WhatsApp' }, 403)
  }

  let body: { action?: Action }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Corpo invalido' }, 400)
  }

  const admin = adminClient()
  const { data: channel } = await admin
    .from('whatsapp_channels')
    .select('*')
    .eq('company_id', auth.companyId)
    .eq('provider', 'evolution')
    .maybeSingle()

  if (!channel) return json({ error: 'Evolution API nao configurada' }, 404)

  const baseUrl = String(channel.settings?.base_url ?? '').replace(/\/+$/, '')
  const instance = String(channel.settings?.instance ?? '')
  const apiKey = channel.secrets?.api_key

  if (!baseUrl || !instance || !apiKey) {
    return json({ ok: false, error: 'Credenciais da Evolution API incompletas.' })
  }

  const headers = { apikey: apiKey, 'Content-Type': 'application/json' }
  const webhookUrl =
    `${Deno.env.get('SUPABASE_URL')}/functions/v1/whatsapp-webhook/evolution/${channel.webhook_token}`
  // Só assinamos eventos de mensagem. CONNECTION_UPDATE e QRCODE_UPDATED são
  // emitidos dezenas de vezes por segundo enquanto a instância tenta conectar e
  // inundavam o CRM — o status e o QR passam a vir das consultas sob demanda.
  const WEBHOOK_EVENTS = ['MESSAGES_UPSERT', 'MESSAGES_UPDATE']

  async function call(path: string, init?: RequestInit) {
    const response = await fetch(`${baseUrl}${path}`, { ...init, headers })
    const text = await response.text()
    let parsed: unknown = null
    try {
      parsed = text ? JSON.parse(text) : null
    } catch {
      parsed = text
    }
    return { ok: response.ok, status: response.status, body: parsed }
  }

  async function persistError(message: string) {
    const now = new Date().toISOString()
    await admin
      .from('whatsapp_channels')
      .update({ status: 'erro', last_error: message, last_error_at: now, last_checked_at: now })
      .eq('id', channel.id)

    await admin.rpc('raise_alert', {
      p_company_id: auth!.companyId,
      p_source: 'whatsapp',
      p_code: 'evolution_indisponivel',
      p_title: 'Evolution API indisponivel',
      p_description: message,
      p_severity: 'critico',
      p_metadata: { channel_id: channel.id },
    })
  }

  /** Guarda o número conectado quando a instância informa o dono. */
  async function captureOwner() {
    const info = await call(`/instance/fetchInstances?instanceName=${encodeURIComponent(instance)}`)
    if (!info.ok) return null
    const list = Array.isArray(info.body) ? info.body : [info.body]
    const first = list[0] as Record<string, unknown> | undefined
    const nested = (first?.instance ?? first) as Record<string, unknown> | undefined
    const jid = String(nested?.owner ?? nested?.ownerJid ?? '')
    const phone = jid.split('@')[0].replace(/\D/g, '')
    const profileName = (nested?.profileName ?? nested?.profileName) as string | undefined

    if (phone) {
      await admin
        .from('whatsapp_channels')
        .update({ phone_number: phone, display_name: profileName ?? null })
        .eq('id', channel.id)
    }
    return phone || null
  }

  try {
    switch (body.action) {
      /* ------------------------------------------------- Criar instância */
      case 'create-instance': {
        // Se a instância já existe, apenas seguimos para a conexão
        const existing = await call(`/instance/connectionState/${instance}`)
        if (existing.ok) {
          return json({ ok: true, alreadyExists: true, state: extractState(existing.body) })
        }

        const created = await call('/instance/create', {
          method: 'POST',
          body: JSON.stringify({
            instanceName: instance,
            qrcode: true,
            integration: 'WHATSAPP-BAILEYS',
            webhook: { url: webhookUrl, byEvents: false, base64: true, events: WEBHOOK_EVENTS },
            // formato antigo da Evolution
            webhook_url: webhookUrl,
            webhook_by_events: false,
            events: WEBHOOK_EVENTS,
          }),
        })

        if (!created.ok) {
          const message =
            extractMessage(created.body) ?? `A instancia respondeu HTTP ${created.status}.`
          await persistError(message)
          return json({ ok: false, error: message })
        }

        const payload = created.body as Record<string, unknown> | null
        const qrcode = extractQr(payload)

        await admin
          .from('whatsapp_channels')
          .update({
            status: 'conectando',
            last_checked_at: new Date().toISOString(),
            last_error: null,
            last_error_at: null,
          })
          .eq('id', channel.id)

        return json({ ok: true, created: true, qrcode, pairingCode: extractPairing(payload) })
      }

      /* --------------------------------------------------------- Status */
      case 'test':
      case 'status': {
        const result = await call(`/instance/connectionState/${instance}`)
        if (!result.ok) {
          const message =
            extractMessage(result.body) ?? `A instancia respondeu HTTP ${result.status}.`
          await persistError(message)
          return json({ ok: false, error: message, notFound: result.status === 404 })
        }

        const state = extractState(result.body)
        const status =
          state === 'open' ? 'conectado' : state === 'connecting' ? 'conectando' : 'desconectado'

        await admin
          .from('whatsapp_channels')
          .update({
            status,
            last_checked_at: new Date().toISOString(),
            last_error: null,
            last_error_at: null,
          })
          .eq('id', channel.id)

        let phone: string | null = null
        if (state === 'open') phone = await captureOwner()

        return json({ ok: true, state, status, phone })
      }

      /* -------------------------------------------------------- Conectar */
      case 'connect': {
        const result = await call(`/instance/connect/${instance}`)
        if (!result.ok) {
          // Instância ainda não existe: cria e já devolve o QR
          if (result.status === 404) {
            const created = await call('/instance/create', {
              method: 'POST',
              body: JSON.stringify({
                instanceName: instance,
                qrcode: true,
                integration: 'WHATSAPP-BAILEYS',
                webhook: { url: webhookUrl, byEvents: false, base64: true, events: WEBHOOK_EVENTS },
                webhook_url: webhookUrl,
                webhook_by_events: false,
                events: WEBHOOK_EVENTS,
              }),
            })
            if (created.ok) {
              const payload = created.body as Record<string, unknown> | null
              await admin
                .from('whatsapp_channels')
                .update({ status: 'conectando', last_checked_at: new Date().toISOString() })
                .eq('id', channel.id)
              return json({
                ok: true,
                created: true,
                qrcode: extractQr(payload),
                pairingCode: extractPairing(payload),
              })
            }
          }

          const message =
            extractMessage(result.body) ?? `A instancia respondeu HTTP ${result.status}.`
          await persistError(message)
          return json({ ok: false, error: message })
        }

        const payload = result.body as Record<string, unknown> | null
        const qrcode = extractQr(payload)

        await admin
          .from('whatsapp_channels')
          .update({
            status: qrcode ? 'conectando' : 'conectado',
            last_checked_at: new Date().toISOString(),
            last_error: null,
          })
          .eq('id', channel.id)

        let phone: string | null = null
        if (!qrcode) phone = await captureOwner()

        return json({ ok: true, qrcode, pairingCode: extractPairing(payload), phone })
      }

      /* ----------------------------------------------------- Desconectar */
      case 'disconnect': {
        const result = await call(`/instance/logout/${instance}`, { method: 'DELETE' })
        await admin
          .from('whatsapp_channels')
          .update({ status: 'desconectado', last_checked_at: new Date().toISOString() })
          .eq('id', channel.id)
        return json({ ok: result.ok, error: result.ok ? undefined : extractMessage(result.body) })
      }

      /* --------------------------------------------------------- Webhook */
      case 'set-webhook': {
        const result = await call(`/webhook/set/${instance}`, {
          method: 'POST',
          body: JSON.stringify({
            webhook: {
              enabled: true,
              url: webhookUrl,
              byEvents: false,
              base64: true,
              events: WEBHOOK_EVENTS,
            },
            enabled: true,
            url: webhookUrl,
            events: WEBHOOK_EVENTS,
          }),
        })
        if (!result.ok) {
          const message =
            extractMessage(result.body) ?? `A instancia respondeu HTTP ${result.status}.`
          return json({ ok: false, error: message })
        }
        return json({ ok: true, url: webhookUrl })
      }

      default:
        return json({ error: 'Acao invalida' }, 400)
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Nao foi possivel falar com a Evolution API.'
    await persistError(message)
    return json({ ok: false, error: message })
  }
})

function extractState(body: unknown): string {
  const data = body as Record<string, unknown> | null
  if (!data) return ''
  const instanceInfo = data.instance as Record<string, unknown> | undefined
  return String(instanceInfo?.state ?? data.state ?? data.connectionStatus ?? '').toLowerCase()
}

function extractQr(payload: Record<string, unknown> | null): string | null {
  if (!payload) return null
  const qrcode = payload.qrcode as Record<string, string> | undefined
  return (payload.base64 as string) ?? qrcode?.base64 ?? (payload.code as string) ?? null
}

function extractPairing(payload: Record<string, unknown> | null): string | null {
  if (!payload) return null
  const qrcode = payload.qrcode as Record<string, string> | undefined
  return (payload.pairingCode as string) ?? qrcode?.pairingCode ?? null
}

function extractMessage(body: unknown): string | null {
  if (!body) return null
  if (typeof body === 'string') return body.slice(0, 300)
  const data = body as Record<string, unknown>
  const value = data.message ?? data.error ?? data.response
  if (!value) return null
  return typeof value === 'string' ? value : JSON.stringify(value).slice(0, 300)
}
