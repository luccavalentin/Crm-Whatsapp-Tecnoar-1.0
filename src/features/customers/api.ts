import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { normalizePhone } from '@/lib/phone'
import type {
  CustomerEventRow,
  CustomerFieldRow,
  CustomerNoteRow,
  CustomerRow,
  CustomerStatus,
  DataSource,
} from '@/types/database'

export interface CustomerListFilters {
  search: string
  status: CustomerStatus | 'all'
}

export interface CustomerWithOwner extends CustomerRow {
  owner: { id: string; full_name: string } | null
}

const KEY = {
  list: (companyId: string, filters: CustomerListFilters) =>
    ['customers', companyId, filters] as const,
  detail: (id: string) => ['customer', id] as const,
  fields: (id: string) => ['customer-fields', id] as const,
  notes: (id: string) => ['customer-notes', id] as const,
  events: (id: string) => ['customer-events', id] as const,
}

/* ------------------------------------------------------------------ Lista */

export function useCustomers(companyId: string | undefined, filters: CustomerListFilters) {
  return useQuery({
    queryKey: KEY.list(companyId ?? '', filters),
    enabled: Boolean(companyId),
    queryFn: async (): Promise<CustomerWithOwner[]> => {
      let query = supabase
        .from('customers')
        .select('*, owner:profiles!customers_owner_id_fkey(id, full_name)')
        .eq('company_id', companyId!)
        .order('last_interaction_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(200)

      if (filters.status !== 'all') query = query.eq('status', filters.status)

      const term = filters.search.trim()
      if (term) {
        const digits = normalizePhone(term)
        const escaped = term.replace(/[%,()]/g, ' ')
        const conditions = [`name.ilike.%${escaped}%`, `company_name.ilike.%${escaped}%`]
        if (digits) conditions.push(`phone.ilike.%${digits}%`)
        else if (/\d/.test(term)) conditions.push(`phone.ilike.%${term.replace(/\D/g, '')}%`)
        query = query.or(conditions.join(','))
      }

      const { data, error } = await query
      if (error) throw error
      return (data ?? []) as unknown as CustomerWithOwner[]
    },
  })
}

/* ----------------------------------------------------------------- Perfil */

export function useCustomer(customerId: string | undefined) {
  return useQuery({
    queryKey: KEY.detail(customerId ?? ''),
    enabled: Boolean(customerId),
    queryFn: async (): Promise<CustomerWithOwner | null> => {
      const { data, error } = await supabase
        .from('customers')
        .select('*, owner:profiles!customers_owner_id_fkey(id, full_name)')
        .eq('id', customerId!)
        .maybeSingle()
      if (error) throw error
      return (data as unknown as CustomerWithOwner) ?? null
    },
  })
}

export function useCustomerFields(customerId: string | undefined) {
  return useQuery({
    queryKey: KEY.fields(customerId ?? ''),
    enabled: Boolean(customerId),
    queryFn: async (): Promise<CustomerFieldRow[]> => {
      const { data, error } = await supabase
        .from('customer_fields')
        .select('*')
        .eq('customer_id', customerId!)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as CustomerFieldRow[]
    },
  })
}

export interface NoteWithAuthor extends CustomerNoteRow {
  author: { id: string; full_name: string } | null
}

export function useCustomerNotes(customerId: string | undefined) {
  return useQuery({
    queryKey: KEY.notes(customerId ?? ''),
    enabled: Boolean(customerId),
    queryFn: async (): Promise<NoteWithAuthor[]> => {
      const { data, error } = await supabase
        .from('customer_notes')
        .select('*, author:profiles!customer_notes_author_id_fkey(id, full_name)')
        .eq('customer_id', customerId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as NoteWithAuthor[]
    },
  })
}

export function useCustomerEvents(customerId: string | undefined) {
  return useQuery({
    queryKey: KEY.events(customerId ?? ''),
    enabled: Boolean(customerId),
    queryFn: async (): Promise<CustomerEventRow[]> => {
      const { data, error } = await supabase
        .from('customer_events')
        .select('*')
        .eq('customer_id', customerId!)
        .order('created_at', { ascending: false })
        .limit(300)
      if (error) throw error
      return (data ?? []) as CustomerEventRow[]
    },
  })
}

/* --------------------------------------------------------------- Mutações */

export interface CustomerInput {
  name: string
  phone: string
  email: string
  company_name: string
  document: string
  owner_id: string | null
}

export function useCreateCustomer(companyId: string | undefined, userId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: CustomerInput): Promise<CustomerRow> => {
      const phone = normalizePhone(input.phone)
      if (!phone) throw new Error('Telefone inválido.')

      const { data: existing } = await supabase
        .from('customers')
        .select('id, name')
        .eq('company_id', companyId!)
        .eq('phone', phone)
        .maybeSingle()

      if (existing) {
        const err = new Error('Já existe um cliente cadastrado com este telefone.') as Error & {
          customerId?: string
        }
        err.customerId = existing.id
        throw err
      }

      const { data, error } = await supabase
        .from('customers')
        .insert({
          company_id: companyId!,
          name: input.name.trim() || null,
          phone,
          phone_raw: input.phone,
          email: input.email.trim() || null,
          company_name: input.company_name.trim() || null,
          document: input.document.trim() || null,
          owner_id: input.owner_id,
          created_by: userId ?? null,
          created_source: 'manual' as DataSource,
        })
        .select('*')
        .single()

      if (error) throw error
      return data as CustomerRow
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['customers'] })
    },
  })
}

export function useUpdateCustomer(customerId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (patch: Partial<CustomerInput> & { status?: CustomerStatus }) => {
      const payload: Partial<CustomerRow> = {}
      if (patch.name !== undefined) payload.name = patch.name.trim() || null
      if (patch.email !== undefined) payload.email = patch.email.trim() || null
      if (patch.company_name !== undefined) payload.company_name = patch.company_name.trim() || null
      if (patch.document !== undefined) payload.document = patch.document.trim() || null
      if (patch.owner_id !== undefined) payload.owner_id = patch.owner_id
      if (patch.status !== undefined) payload.status = patch.status
      if (patch.phone !== undefined) {
        const phone = normalizePhone(patch.phone)
        if (!phone) throw new Error('Telefone inválido.')
        payload.phone = phone
        payload.phone_raw = patch.phone
      }

      const { data, error } = await supabase
        .from('customers')
        .update(payload)
        .eq('id', customerId)
        .select('id')
      if (error) {
        if (error.code === '23505') throw new Error('Já existe outro cliente com este telefone.')
        throw error
      }
      if (!data || data.length === 0) {
        throw new Error('Você não tem permissão para alterar este cliente.')
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: KEY.detail(customerId) })
      void qc.invalidateQueries({ queryKey: KEY.events(customerId) })
      void qc.invalidateQueries({ queryKey: ['customers'] })
    },
  })
}

export function useDeleteCustomer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (customerId: string) => {
      // `select()` confirma o que foi realmente excluído: sem permissão, a RLS
      // filtra a linha e nada é removido — precisamos avisar o usuário.
      const { data, error } = await supabase
        .from('customers')
        .delete()
        .eq('id', customerId)
        .select('id')
      if (error) throw error
      if (!data || data.length === 0) {
        throw new Error('Você não tem permissão para excluir clientes.')
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['customers'] })
    },
  })
}

export function useSaveCustomerField(companyId: string, customerId: string, userId?: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id?: string; key: string; label: string; value: string }) => {
      if (input.id) {
        const { error } = await supabase
          .from('customer_fields')
          .update({
            label: input.label.trim(),
            value: input.value.trim(),
            source: 'manual' as DataSource,
            source_user_id: userId ?? null,
          })
          .eq('id', input.id)
        if (error) throw error
        return
      }

      const key = input.key.trim() || slugKey(input.label)
      const { error } = await supabase.from('customer_fields').insert({
        company_id: companyId,
        customer_id: customerId,
        key,
        label: input.label.trim(),
        value: input.value.trim(),
        source: 'manual' as DataSource,
        source_user_id: userId ?? null,
      })
      if (error) {
        if (error.code === '23505') throw new Error('Já existe uma informação com este identificador.')
        throw error
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: KEY.fields(customerId) })
      void qc.invalidateQueries({ queryKey: KEY.events(customerId) })
    },
  })
}

export function useDeleteCustomerField(customerId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (fieldId: string) => {
      const { error } = await supabase.from('customer_fields').delete().eq('id', fieldId)
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: KEY.fields(customerId) }),
  })
}

export function useCreateNote(companyId: string, customerId: string, userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: string) => {
      const { error } = await supabase.from('customer_notes').insert({
        company_id: companyId,
        customer_id: customerId,
        author_id: userId,
        body: body.trim(),
      })
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: KEY.notes(customerId) }),
  })
}

export function useDeleteNote(customerId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (noteId: string) => {
      const { error } = await supabase.from('customer_notes').delete().eq('id', noteId)
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: KEY.notes(customerId) }),
  })
}

function slugKey(label: string): string {
  return label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
}
