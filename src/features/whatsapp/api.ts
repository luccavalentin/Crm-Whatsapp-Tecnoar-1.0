import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, SUPABASE_URL } from '@/lib/supabase'
import type { ChannelProvider, Json, WhatsAppChannelPublicRow } from '@/types/database'

export const PROVIDER_LABEL: Record<ChannelProvider, string> = {
  meta: 'Meta Cloud API',
  evolution: 'Evolution API',
}

export const PROVIDER_DESCRIPTION: Record<ChannelProvider, string> = {
  meta: 'Integração oficial do WhatsApp, fornecida pela Meta.',
  evolution: 'Integração alternativa, baseada em instância própria da Evolution API.',
}

export function webhookUrl(provider: ChannelProvider, token: string): string {
  return `${SUPABASE_URL}/functions/v1/whatsapp-webhook/${provider}/${token}`
}

export function useWhatsAppChannels(companyId: string | undefined) {
  return useQuery({
    queryKey: ['whatsapp-channels', companyId],
    enabled: Boolean(companyId),
    refetchInterval: 30_000,
    queryFn: async (): Promise<WhatsAppChannelPublicRow[]> => {
      const { data, error } = await supabase
        .from('whatsapp_channels_public')
        .select('*')
        .order('provider', { ascending: true })
      if (error) throw error
      return (data ?? []) as WhatsAppChannelPublicRow[]
    },
  })
}

export function useSaveChannel() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      provider: ChannelProvider
      name?: string
      settings?: Record<string, unknown>
      secrets?: Record<string, string>
      externalId?: string
      phoneNumber?: string
    }) => {
      const { error } = await supabase.rpc('save_whatsapp_channel', {
        p_provider: input.provider,
        p_name: input.name ?? null,
        p_settings: (input.settings ?? null) as Json,
        p_secrets: (input.secrets ?? null) as Json,
        p_external_id: input.externalId ?? null,
        p_phone_number: input.phoneNumber ?? null,
      })
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['whatsapp-channels'] }),
  })
}

export function useActivateChannel() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.rpc('activate_whatsapp_channel', {
        p_id: id,
        p_active: active,
      })
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['whatsapp-channels'] }),
  })
}

export function useDeleteChannel() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('delete_whatsapp_channel', { p_id: id })
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['whatsapp-channels'] }),
  })
}

export function useWebhookToken(channelId: string | undefined) {
  return useQuery({
    queryKey: ['whatsapp-webhook-token', channelId],
    enabled: Boolean(channelId),
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase.rpc('whatsapp_webhook_info', { p_id: channelId! })
      if (error) throw error
      const rows = data as unknown as Array<{ webhook_token: string }> | null
      return rows?.[0]?.webhook_token ?? null
    },
  })
}

/* ----------------------------------------------------- Controle Evolution */

export interface EvolutionControlResult {
  ok: boolean
  error?: string
  state?: string
  status?: string
  qrcode?: string | null
  pairingCode?: string | null
  phone?: string | null
  created?: boolean
  alreadyExists?: boolean
  notFound?: boolean
  url?: string
}

export type EvolutionAction =
  | 'status'
  | 'connect'
  | 'disconnect'
  | 'test'
  | 'set-webhook'
  | 'create-instance'

export function useEvolutionControl() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (action: EvolutionAction): Promise<EvolutionControlResult> => {
      const { data, error } = await supabase.functions.invoke<EvolutionControlResult>(
        'evolution-control',
        { body: { action } },
      )
      if (error) {
        const context = (error as unknown as { context?: Response }).context
        if (context) {
          const body = await context.json().catch(() => null)
          if (body?.error) throw new Error(body.error)
        }
        throw error
      }
      return data ?? { ok: false, error: 'Resposta vazia da Evolution API.' }
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['whatsapp-channels'] }),
  })
}
