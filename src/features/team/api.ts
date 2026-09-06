import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { ProfileRow } from '@/types/database'

/** Usuários ativos da empresa — usado em seletores de responsável/transferência. */
export function useCompanyMembers(companyId: string | undefined, includeInactive = false) {
  return useQuery({
    queryKey: ['company-members', companyId, includeInactive],
    enabled: Boolean(companyId),
    staleTime: 60_000,
    queryFn: async (): Promise<ProfileRow[]> => {
      let query = supabase
        .from('profiles')
        .select('*')
        .eq('company_id', companyId!)
        .order('full_name', { ascending: true })

      if (!includeInactive) query = query.eq('status', 'active')

      const { data, error } = await query
      if (error) throw error
      return (data ?? []) as ProfileRow[]
    },
  })
}
