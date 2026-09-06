import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface EmergencyContactRow {
  id: string
  company_id: string
  name: string
  phone: string
  role: string | null
  is_active: boolean
  position: number
  notes: string | null
  created_at: string
  updated_at: string
}

export interface EmergencyDispatchRow {
  id: string
  conversation_id: string
  contact_name: string
  contact_phone: string
  ok: boolean
  error_message: string | null
  created_at: string
}

export function useEmergencyContacts(companyId: string | undefined) {
  return useQuery({
    queryKey: ['emergency-contacts', companyId],
    enabled: Boolean(companyId),
    queryFn: async (): Promise<EmergencyContactRow[]> => {
      const { data, error } = await supabase
        .from('emergency_contacts')
        .select('*')
        .order('position', { ascending: true })
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as EmergencyContactRow[]
    },
  })
}

export interface EmergencyContactInput {
  name: string
  phone: string
  role: string | null
  notes: string | null
  is_active: boolean
  position: number
}

export function useSaveEmergencyContact(companyId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...input }: EmergencyContactInput & { id?: string }) => {
      if (id) {
        const { error } = await supabase.from('emergency_contacts').update(input).eq('id', id)
        if (error) throw error
        return
      }
      if (!companyId) {
        // Sem isto o insert ia com company_id vazio e o banco recusava com uma
        // mensagem de constraint que nao dizia nada para quem estava usando.
        throw new Error('Empresa não identificada. Recarregue a página e tente de novo.')
      }
      const { error } = await supabase
        .from('emergency_contacts')
        .insert({ ...input, company_id: companyId })
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['emergency-contacts'] }),
  })
}

export function useDeleteEmergencyContact() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('emergency_contacts').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['emergency-contacts'] }),
  })
}

/** Últimos acionamentos — a prova de que o aviso saiu. */
export function useEmergencyDispatches(companyId: string | undefined) {
  return useQuery({
    queryKey: ['emergency-dispatches', companyId],
    enabled: Boolean(companyId),
    queryFn: async (): Promise<EmergencyDispatchRow[]> => {
      const { data, error } = await supabase
        .from('emergency_dispatches')
        .select('id, conversation_id, contact_name, contact_phone, ok, error_message, created_at')
        .order('created_at', { ascending: false })
        .limit(20)
      if (error) throw error
      return (data ?? []) as EmergencyDispatchRow[]
    },
  })
}
