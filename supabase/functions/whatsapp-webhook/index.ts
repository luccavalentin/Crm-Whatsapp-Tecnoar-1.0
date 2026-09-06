import { corsHeaders, json, preflight } from '../_shared/cors.ts'
import { adminClient } from '../_shared/supabase.ts'
import { handleMetaGet, handleMetaPost } from './meta.ts'
import { handleEvolutionPost } from './evolution.ts'

/**
 * Recebe os eventos reais dos provedores de WhatsApp.
 *
 *   GET|POST /whatsapp-webhook/meta/<webhook_token>
 *
 * O token identifica o canal e é secreto — ele é gerado na criação do canal e
 * só aparece para gestores dentro do CRM.
 */
Deno.serve(async (req) => {
  const pre = preflight(req)
  if (pre) return pre

  const url = new URL(req.url)
  const parts = url.pathname.split('/').filter(Boolean)
  // ['whatsapp-webhook', provider, token]
  const provider = parts[1]
  const token = parts[2]

  if (!provider || !token) {
    return json({ error: 'Endpoint invalido' }, 404)
  }

  const admin = adminClient()
  const { data: channel } = await admin
    .from('whatsapp_channels')
    .select('*')
    .eq('webhook_token', token)
    .eq('provider', provider)
    .maybeSingle()

  if (!channel) {
    return new Response('not found', { status: 404, headers: corsHeaders })
  }

  if (provider === 'meta') {
    if (req.method === 'GET') return handleMetaGet(req, channel)
    if (req.method === 'POST') return await handleMetaPost(req, admin, channel)
  }

  if (provider === 'evolution') {
    if (req.method === 'GET') return json({ ok: true, provider: 'evolution' })
    if (req.method === 'POST') return await handleEvolutionPost(req, admin, channel)
  }

  return json({ error: 'Provedor nao suportado' }, 404)
})
