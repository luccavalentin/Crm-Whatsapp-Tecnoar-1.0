import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { BadgeTone } from '@/components/ui'
import type { TagColor, TagRow, WorkspaceLabelsRow } from '@/types/database'

/** A cor da etiqueta é uma chave da paleta, não hex solto — sem isso cada
 *  etiqueta nova puxaria o app para fora da identidade da Tecnoar. */
export const CORES_ETIQUETA: Array<{ key: TagColor; label: string; tone: BadgeTone }> = [
  { key: 'neutral', label: 'Cinza', tone: 'neutral' },
  { key: 'orange', label: 'Laranja', tone: 'orange' },
  { key: 'cyan', label: 'Ciano', tone: 'cyan' },
  { key: 'navy', label: 'Azul', tone: 'navy' },
  { key: 'success', label: 'Verde', tone: 'success' },
  { key: 'danger', label: 'Vermelho', tone: 'danger' },
]

export const toneDaEtiqueta = (cor: TagColor): BadgeTone =>
  CORES_ETIQUETA.find((c) => c.key === cor)?.tone ?? 'neutral'

export function useTags(companyId: string | undefined) {
  return useQuery({
    queryKey: ['tags', companyId],
    enabled: Boolean(companyId),
    queryFn: async (): Promise<TagRow[]> => {
      const { data, error } = await supabase
        .from('tags')
        .select('*')
        .order('position', { ascending: true })
        .order('name', { ascending: true })
      if (error) throw error
      return (data ?? []) as TagRow[]
    },
  })
}

export interface TagInput {
  name: string
  color: TagColor
  description: string | null
  is_ai_assignable: boolean
  position: number
}

export function useSaveTag(companyId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...input }: TagInput & { id?: string }) => {
      if (id) {
        const { error } = await supabase.from('tags').update(input).eq('id', id)
        if (error) throw error
        return
      }
      if (!companyId) throw new Error('Empresa não identificada. Recarregue a página.')
      const { error } = await supabase.from('tags').insert({ ...input, company_id: companyId })
      if (error) {
        // O banco impede duas etiquetas com o mesmo nome na mesma empresa.
        if (error.code === '23505') throw new Error('Já existe uma etiqueta com esse nome.')
        throw error
      }
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['tags'] }),
  })
}

export function useDeleteTag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('tags').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tags'] })
      void qc.invalidateQueries({ queryKey: ['conversation-tags'] })
    },
  })
}

/* ------------------------------------------------ Etiquetas de uma conversa */

export interface EtiquetaDaConversa {
  tag_id: string
  by_ai: boolean
  tag: Pick<TagRow, 'id' | 'name' | 'color'> | null
}

export function useConversationTags(conversationId: string | undefined) {
  return useQuery({
    queryKey: ['conversation-tags', conversationId],
    enabled: Boolean(conversationId),
    queryFn: async (): Promise<EtiquetaDaConversa[]> => {
      const { data, error } = await supabase
        .from('conversation_tags')
        .select('tag_id, by_ai, tag:tags(id, name, color)')
        .eq('conversation_id', conversationId!)
      if (error) throw error
      return (data ?? []) as unknown as EtiquetaDaConversa[]
    },
  })
}

export function useToggleConversationTag(companyId: string | undefined, profileId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      conversationId,
      tagId,
      marcada,
    }: {
      conversationId: string
      tagId: string
      marcada: boolean
    }) => {
      if (marcada) {
        const { error } = await supabase
          .from('conversation_tags')
          .delete()
          .eq('conversation_id', conversationId)
          .eq('tag_id', tagId)
        if (error) throw error
        return
      }
      if (!companyId) throw new Error('Empresa não identificada.')
      // Marcada por gente sobrepõe o palpite da IA: by_ai volta a ser falso.
      const { error } = await supabase.from('conversation_tags').upsert(
        {
          conversation_id: conversationId,
          tag_id: tagId,
          company_id: companyId,
          assigned_by: profileId ?? null,
          by_ai: false,
        },
        { onConflict: 'conversation_id,tag_id' },
      )
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['conversation-tags'] }),
  })
}

/* ------------------------------------------- Como a empresa chama as coisas */

export const NOMES_PADRAO: Omit<WorkspaceLabelsRow, 'company_id' | 'updated_at'> = {
  queue_name: 'Atendimentos',
  queue_name_singular: 'Atendimento',
  tag_name: 'Etiquetas',
  funnel_name: 'Funil',
}

export function useWorkspaceLabels(companyId: string | undefined) {
  return useQuery({
    queryKey: ['workspace-labels', companyId],
    enabled: Boolean(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workspace_labels')
        .select('*')
        .eq('company_id', companyId!)
        .maybeSingle()
      if (error) throw error
      return { ...NOMES_PADRAO, ...(data ?? {}) }
    },
  })
}

export function useSaveWorkspaceLabels(companyId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: typeof NOMES_PADRAO) => {
      if (!companyId) throw new Error('Empresa não identificada. Recarregue a página.')
      const { error } = await supabase
        .from('workspace_labels')
        .upsert({ ...input, company_id: companyId }, { onConflict: 'company_id' })
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['workspace-labels'] }),
  })
}
