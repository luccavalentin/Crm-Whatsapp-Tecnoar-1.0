import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { activeChannel, sendViaChannel } from './providers.ts'

export interface EmergencyContact {
  id: string
  name: string
  phone: string
  role: string | null
}

/** Contatos que devem ser acionados, na ordem definida em Configuracoes. */
export async function loadEmergencyContacts(
  admin: SupabaseClient,
  companyId: string,
): Promise<EmergencyContact[]> {
  const { data } = await admin
    .from('emergency_contacts')
    .select('id, name, phone, role')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .order('position', { ascending: true })

  return (data ?? []) as EmergencyContact[]
}

interface DispatchInput {
  companyId: string
  conversationId: string
  customerName: string | null
  customerPhone: string
  summary: string
  location: { lat: number; lng: number; name: string | null; address: string | null } | null
  contacts: EmergencyContact[]
}

export interface DispatchResult {
  sent: number
  failed: number
}

/**
 * Avisa a equipe de plantao sobre uma emergencia.
 *
 * O aviso vai pelo mesmo WhatsApp da empresa, direto para o telefone do
 * contato - nao entra na conversa do cliente. Cada acionamento fica gravado em
 * emergency_dispatches: e a prova de que o aviso saiu, com o erro real quando
 * nao sai. Um aviso por pessoa por atendimento, entao mensagens seguidas do
 * cliente nao viram enxurrada no telefone de ninguem.
 */
export async function dispatchEmergency(
  admin: SupabaseClient,
  input: DispatchInput,
): Promise<DispatchResult> {
  if (input.contacts.length === 0) return { sent: 0, failed: 0 }

  const channel = await activeChannel(admin, input.companyId)
  if (!channel) return { sent: 0, failed: 0 }

  const cliente = input.customerName?.trim() || 'Cliente sem nome'
  const local = input.location
    ? input.location.address ||
      input.location.name ||
      `${input.location.lat.toFixed(5)}, ${input.location.lng.toFixed(5)}`
    : 'nao informado'
  const mapa = input.location
    ? `\nMapa: https://www.google.com/maps/search/?api=1&query=${input.location.lat}%2C${input.location.lng}`
    : ''

  let sent = 0
  let failed = 0

  for (const contact of input.contacts) {
    // Ja avisado neste atendimento: nao repete.
    const { data: anterior } = await admin
      .from('emergency_dispatches')
      .select('id')
      .eq('conversation_id', input.conversationId)
      .eq('contact_phone', contact.phone)
      .eq('ok', true)
      .maybeSingle()
    if (anterior) continue

    const texto =
      `*${contact.name}, temos uma emergencia.*\n\n` +
      `Cliente: ${cliente}\n` +
      `Telefone: ${input.customerPhone}\n` +
      `Local: ${local}${mapa}\n\n` +
      `Situacao: ${input.summary || 'O cliente relatou uma emergencia.'}\n\n` +
      `O cliente ja foi avisado de que voce vai entrar em contato.`

    const result = await sendViaChannel(channel, {
      to: contact.phone,
      type: 'text',
      text: texto,
    })

    if (result.ok) sent += 1
    else failed += 1

    await admin.from('emergency_dispatches').insert({
      company_id: input.companyId,
      conversation_id: input.conversationId,
      contact_id: contact.id,
      contact_name: contact.name,
      contact_phone: contact.phone,
      message: texto,
      ok: result.ok,
      error_message: result.ok ? null : (result.error ?? 'Falha no envio.'),
    })

    if (!result.ok) {
      await admin.rpc('raise_alert', {
        p_company_id: input.companyId,
        p_source: 'atendimento',
        p_code: `emergencia_nao_avisada_${input.conversationId}`,
        p_title: 'Nao foi possivel avisar o contato de emergencia',
        p_description:
          `O aviso para ${contact.name} (${contact.phone}) nao saiu: ` +
          `${result.error ?? 'falha no envio'}. Ligue para o cliente.`,
        p_severity: 'critico',
        p_metadata: { conversation_id: input.conversationId, contact_id: contact.id },
      })
    }
  }

  return { sent, failed }
}

/** Localizacao mais recente que o cliente compartilhou nesta conversa. */
export async function lastKnownLocation(
  admin: SupabaseClient,
  conversationId: string,
): Promise<DispatchInput['location']> {
  const { data } = await admin
    .from('messages')
    .select('location')
    .eq('conversation_id', conversationId)
    .not('location', 'is', null)
    .order('sequence', { ascending: false })
    .limit(1)
    .maybeSingle()

  const raw = data?.location as Record<string, unknown> | null | undefined
  if (!raw) return null

  const lat = Number(raw.lat)
  const lng = Number(raw.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null

  return {
    lat,
    lng,
    name: typeof raw.name === 'string' ? raw.name : null,
    address: typeof raw.address === 'string' ? raw.address : null,
  }
}
