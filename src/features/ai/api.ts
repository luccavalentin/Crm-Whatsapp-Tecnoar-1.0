import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type {
  AiProviderName,
  AiProviderPublicRow,
  AiRole,
  AiRunRow,
  AiSettingsRow,
} from '@/types/database'

export const PROVIDER_LABEL: Record<AiProviderName, string> = {
  gemini: 'Google Gemini',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
}

/**
 * Modelos oferecidos no menu. É um atalho, não uma trava: o campo aceita
 * qualquer identificador, e quem manda é o provedor — use "Testar" para
 * confirmar que o modelo escolhido responde de verdade.
 */
export const PROVIDER_MODELS: Record<AiProviderName, Array<{ id: string; label: string }>> = {
  gemini: [
    { id: 'gemini-3.6-pro', label: 'Gemini 3.6 Pro — mais capaz' },
    { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash — equilíbrio (recomendado)' },
    { id: 'gemini-3.6-flash-lite', label: 'Gemini 3.6 Flash Lite — mais barato' },
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite' },
  ],
  openai: [
    { id: 'gpt-5.1', label: 'GPT-5.1 — mais capaz' },
    { id: 'gpt-5.1-mini', label: 'GPT-5.1 mini — equilíbrio' },
    { id: 'gpt-5', label: 'GPT-5' },
    { id: 'gpt-5-mini', label: 'GPT-5 mini' },
    { id: 'gpt-4.1', label: 'GPT-4.1' },
    { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini' },
    { id: 'gpt-4o', label: 'GPT-4o' },
    { id: 'gpt-4o-mini', label: 'GPT-4o mini — mais barato' },
  ],
  anthropic: [
    { id: 'claude-opus-5', label: 'Claude Opus 5 — mais capaz' },
    { id: 'claude-sonnet-5', label: 'Claude Sonnet 5 — equilíbrio (recomendado)' },
    { id: 'claude-fable-5', label: 'Claude Fable 5' },
    { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 — mais rápido e barato' },
    { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
  ],
}

export const PROVIDER_DEFAULT_MODEL: Record<AiProviderName, string> = {
  gemini: 'gemini-3.6-flash',
  openai: 'gpt-5.1-mini',
  anthropic: 'claude-sonnet-5',
}

export const PROVIDER_KEY_HELP: Record<AiProviderName, string> = {
  gemini: 'Chave criada no Google AI Studio.',
  openai: 'Chave da plataforma OpenAI (começa com sk-).',
  anthropic: 'Chave do console Anthropic (começa com sk-ant-).',
}

/* --------------------------------------------------------------- Provedores */

export function useAiProviders(companyId: string | undefined) {
  return useQuery({
    queryKey: ['ai-providers', companyId],
    enabled: Boolean(companyId),
    queryFn: async (): Promise<AiProviderPublicRow[]> => {
      const { data, error } = await supabase
        .from('ai_providers_public')
        .select('*')
        .order('provider', { ascending: true })
      if (error) throw error
      return (data ?? []) as AiProviderPublicRow[]
    },
  })
}

export function useSaveAiProvider() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      provider: AiProviderName
      model: string
      apiKey?: string
      role?: AiRole
    }) => {
      const { error } = await supabase.rpc('save_ai_provider', {
        p_provider: input.provider,
        p_model: input.model,
        p_api_key: input.apiKey && input.apiKey.trim() ? input.apiKey.trim() : null,
        p_role: input.role ?? null,
        p_settings: null,
      })
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['ai-providers'] }),
  })
}

export function useSetAiProviderRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, role }: { id: string; role: AiRole }) => {
      const { error } = await supabase.rpc('set_ai_provider_role', { p_id: id, p_role: role })
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['ai-providers'] }),
  })
}

export function useDeleteAiProvider() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('delete_ai_provider', { p_id: id })
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['ai-providers'] }),
  })
}

export interface AiTestResult {
  ok: boolean
  error?: string
  latencyMs?: number
  model?: string
  provider?: AiProviderName
}

export function useTestAiProvider() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (providerId: string): Promise<AiTestResult> => {
      const { data, error } = await supabase.functions.invoke<AiTestResult>('ai-test', {
        body: { providerId },
      })
      if (error) {
        const context = (error as unknown as { context?: Response }).context
        if (context) {
          const body = await context.json().catch(() => null)
          if (body?.error) throw new Error(body.error)
        }
        throw error
      }
      return data ?? { ok: false, error: 'Resposta vazia do teste.' }
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['ai-providers'] }),
  })
}

/* ------------------------------------------------------------ Configuração */

export const AI_SETTINGS_DEFAULT: Omit<AiSettingsRow, 'company_id' | 'created_at' | 'updated_at'> = {
  enabled: true,
  assistant_name: 'Assistente Tecnoar',
  business_context: '',
  tone_instructions: '',
  escalation_rules: '',
  auto_reply: true,
  min_confidence: 0.6,
  max_reply_chars: 600,
  max_replies_per_hour: 12,
  daily_token_budget: 2_000_000,
  working_hours: {},
}

/**
 * Tokens de IA gastos pela empresa hoje.
 *
 * Fica ao lado do campo de teto na tela de comportamento: número sem
 * referência não ajuda ninguém a decidir se o limite está apertado ou frouxo.
 * Recarrega sozinho porque o número muda a cada atendimento.
 */
export function useAiTokensHoje(companyId: string | undefined) {
  return useQuery({
    queryKey: ['ai-tokens-hoje', companyId],
    enabled: Boolean(companyId),
    refetchInterval: 60_000,
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase.rpc('ai_tokens_hoje', { p_company_id: companyId! })
      if (error) throw error
      return Number(data ?? 0)
    },
  })
}

export function useAiSettings(companyId: string | undefined) {
  return useQuery({
    queryKey: ['ai-settings', companyId],
    enabled: Boolean(companyId),
    queryFn: async (): Promise<AiSettingsRow | null> => {
      const { data, error } = await supabase
        .from('ai_settings')
        .select('*')
        .eq('company_id', companyId!)
        .maybeSingle()
      if (error) throw error
      return (data as AiSettingsRow) ?? null
    },
  })
}

export function useSaveAiSettings(companyId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (patch: Partial<AiSettingsRow>) => {
      const { error } = await supabase
        .from('ai_settings')
        .upsert({ company_id: companyId!, ...patch }, { onConflict: 'company_id' })
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['ai-settings'] }),
  })
}

/* -------------------------------------------------------------- Execuções */

export function useAiRuns(companyId: string | undefined, limit = 50) {
  return useQuery({
    queryKey: ['ai-runs', companyId, limit],
    enabled: Boolean(companyId),
    queryFn: async (): Promise<AiRunRow[]> => {
      const { data, error } = await supabase
        .from('ai_runs')
        .select('*')
        .eq('company_id', companyId!)
        .neq('kind', 'simulacao')
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return (data ?? []) as AiRunRow[]
    },
  })
}
