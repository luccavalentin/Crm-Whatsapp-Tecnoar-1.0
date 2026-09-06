import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/* -------------------------------------------------- Base oficial da empresa */

export interface CompanyKnowledgeRow {
  company_id: string
  business_name: string | null
  address: string | null
  maps_url: string | null
  hours: string | null
  whatsapp: string | null
  services: string | null
  specialties: string | null
  service_regions: string | null
  payment_methods: string | null
  quote_policy: string | null
  warranty_policy: string | null
  average_lead_times: string | null
  blocked_topics: string | null
  human_transfer_rules: string | null
  updated_at: string
  updated_by: string | null
}

export type KnowledgeForm = Omit<CompanyKnowledgeRow, 'company_id' | 'updated_at' | 'updated_by'>

export const CAMPOS_CONHECIMENTO: Array<{
  key: keyof KnowledgeForm
  label: string
  hint: string
  longo?: boolean
}> = [
  { key: 'business_name', label: 'Nome da empresa', hint: 'Como a IA chama a empresa ao falar com o cliente.' },
  { key: 'address', label: 'Endereço', hint: 'Endereço completo. Vazio: a IA nunca vai arriscar um.' },
  { key: 'maps_url', label: 'Link de localização', hint: 'Link do mapa que a IA pode oferecer.' },
  { key: 'hours', label: 'Horário de atendimento', hint: 'Ex.: seg a sex 8h–18h, sáb 8h–12h.' },
  { key: 'whatsapp', label: 'WhatsApp de contato', hint: 'Número que a IA pode passar.' },
  { key: 'services', label: 'Serviços', hint: 'O que a oficina faz.', longo: true },
  { key: 'specialties', label: 'Especialidades', hint: 'Onde a empresa é referência.', longo: true },
  { key: 'service_regions', label: 'Regiões atendidas', hint: 'Cidades e rodovias onde há atendimento.', longo: true },
  { key: 'payment_methods', label: 'Formas de pagamento', hint: 'Só o que é aceito de verdade.', longo: true },
  { key: 'quote_policy', label: 'Política de orçamento', hint: 'Como funciona: visita, avaliação, prazo de retorno.', longo: true },
  { key: 'warranty_policy', label: 'Política de garantia', hint: 'Prazo e cobertura reais.', longo: true },
  { key: 'average_lead_times', label: 'Prazos médios', hint: 'Só prazos que a operação consegue cumprir.', longo: true },
  { key: 'blocked_topics', label: 'Assuntos bloqueados', hint: 'Um por linha. A IA recusa educadamente.', longo: true },
  { key: 'human_transfer_rules', label: 'Quando chamar um humano', hint: 'Regras próprias, além das que já existem.', longo: true },
]

export function useCompanyKnowledge(companyId: string | undefined) {
  return useQuery({
    queryKey: ['company-knowledge', companyId],
    enabled: Boolean(companyId),
    queryFn: async (): Promise<CompanyKnowledgeRow | null> => {
      const { data, error } = await supabase
        .from('company_knowledge')
        .select('*')
        .eq('company_id', companyId!)
        .maybeSingle()
      if (error) throw error
      return (data as CompanyKnowledgeRow) ?? null
    },
  })
}

export function useSaveCompanyKnowledge(companyId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (form: KnowledgeForm) => {
      if (!companyId) throw new Error('Empresa não identificada. Recarregue a página.')
      // Campo em branco vira null: é assim que a IA sabe que o dado não existe
      // e responde "vou confirmar" em vez de mandar uma string vazia.
      const limpo = Object.fromEntries(
        Object.entries(form).map(([k, v]) => [k, typeof v === 'string' && !v.trim() ? null : v]),
      )
      const { error } = await supabase
        .from('company_knowledge')
        .upsert({ ...limpo, company_id: companyId }, { onConflict: 'company_id' })
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['company-knowledge'] }),
  })
}

/* ------------------------------------------------------ Respostas aprovadas */

export interface FaqRow {
  id: string
  company_id: string
  question: string
  answer: string
  keywords: string[]
  is_active: boolean
  approved_at: string
  created_at: string
}

export function useFaq(companyId: string | undefined) {
  return useQuery({
    queryKey: ['knowledge-faq', companyId],
    enabled: Boolean(companyId),
    queryFn: async (): Promise<FaqRow[]> => {
      const { data, error } = await supabase
        .from('knowledge_faq')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as FaqRow[]
    },
  })
}

export function useSaveFaq(companyId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id?: string; question: string; answer: string; is_active: boolean }) => {
      const { id, ...campos } = input
      if (id) {
        const { error } = await supabase.from('knowledge_faq').update(campos).eq('id', id)
        if (error) throw error
        return
      }
      if (!companyId) throw new Error('Empresa não identificada. Recarregue a página.')
      const { error } = await supabase
        .from('knowledge_faq')
        .insert({ ...campos, company_id: companyId })
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['knowledge-faq'] }),
  })
}

export function useDeleteFaq() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('knowledge_faq').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['knowledge-faq'] }),
  })
}

/* --------------------------------------------------- Fila de aprendizado */

export interface LearningRow {
  id: string
  question: string
  ai_note: string | null
  intent: string | null
  status: 'pendente' | 'aprovado' | 'descartado'
  approved_answer: string | null
  conversation_id: string | null
  created_at: string
}

export function useLearningQueue(companyId: string | undefined, status: LearningRow['status']) {
  return useQuery({
    queryKey: ['learning-queue', companyId, status],
    enabled: Boolean(companyId),
    queryFn: async (): Promise<LearningRow[]> => {
      const { data, error } = await supabase
        .from('ai_learning_queue')
        .select('id, question, ai_note, intent, status, approved_answer, conversation_id, created_at')
        .eq('status', status)
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) throw error
      return (data ?? []) as LearningRow[]
    },
  })
}

/**
 * Aprovar cria a resposta oficial e só então marca a dúvida como resolvida.
 * Se o FAQ falhar, a dúvida continua pendente — melhor repetir a revisão do
 * que sumir com a pergunta sem ter cadastrado a resposta.
 */
export function useApproveLearning(companyId: string | undefined, profileId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, question, answer }: { id: string; question: string; answer: string }) => {
      if (!companyId) throw new Error('Empresa não identificada. Recarregue a página.')
      const { data: faq, error: erroFaq } = await supabase
        .from('knowledge_faq')
        .insert({ company_id: companyId, question, answer, approved_by: profileId ?? null })
        .select('id')
        .single()
      if (erroFaq) throw erroFaq

      const { error } = await supabase
        .from('ai_learning_queue')
        .update({
          status: 'aprovado',
          approved_answer: answer,
          faq_id: faq.id,
          reviewed_by: profileId ?? null,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['learning-queue'] })
      void qc.invalidateQueries({ queryKey: ['knowledge-faq'] })
    },
  })
}

export function useDiscardLearning(profileId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('ai_learning_queue')
        .update({
          status: 'descartado',
          reviewed_by: profileId ?? null,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['learning-queue'] }),
  })
}
