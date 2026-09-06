import { useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { UserRole } from '@/types/database'

export interface PermissionArea {
  key: string
  label: string
  actions: Array<{ key: string; label: string }>
}

/** Áreas e ações configuráveis por usuário. */
export const PERMISSION_AREAS: PermissionArea[] = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    actions: [{ key: 'dashboard.visualizar', label: 'Visualizar' }],
  },
  {
    key: 'atendimentos',
    label: 'Atendimentos',
    actions: [
      { key: 'atendimentos.visualizar', label: 'Visualizar' },
      { key: 'atendimentos.enviar', label: 'Enviar mensagens' },
      { key: 'atendimentos.assumir', label: 'Assumir atendimento' },
      { key: 'atendimentos.transferir', label: 'Transferir' },
      { key: 'atendimentos.iniciar', label: 'Iniciar conversa' },
      { key: 'atendimentos.desligar_ia', label: 'Desligar a IA' },
    ],
  },
  {
    key: 'kanban',
    label: 'Kanban',
    actions: [
      { key: 'kanban.visualizar', label: 'Visualizar' },
      { key: 'kanban.gerenciar', label: 'Mover cartões' },
    ],
  },
  {
    key: 'clientes',
    label: 'Clientes',
    actions: [
      { key: 'clientes.visualizar', label: 'Visualizar' },
      { key: 'clientes.criar', label: 'Criar' },
      { key: 'clientes.editar', label: 'Editar' },
      { key: 'clientes.arquivar', label: 'Arquivar' },
      { key: 'clientes.excluir', label: 'Excluir' },
    ],
  },
  {
    key: 'metricas',
    label: 'Métricas',
    actions: [{ key: 'metricas.visualizar', label: 'Visualizar' }],
  },
  {
    key: 'ia',
    label: 'Inteligência artificial',
    actions: [
      { key: 'ia.visualizar', label: 'Visualizar' },
      { key: 'ia.gerenciar', label: 'Gerenciar provedores' },
    ],
  },
  {
    key: 'simulador',
    label: 'Simulador de IA',
    actions: [{ key: 'simulador.visualizar', label: 'Visualizar' }],
  },
  {
    key: 'equipe',
    label: 'Equipe',
    actions: [
      { key: 'equipe.visualizar', label: 'Visualizar' },
      { key: 'equipe.gerenciar', label: 'Gerenciar usuários' },
    ],
  },
  {
    key: 'whatsapp',
    label: 'WhatsApp',
    actions: [
      { key: 'whatsapp.visualizar', label: 'Visualizar' },
      { key: 'whatsapp.gerenciar', label: 'Gerenciar integrações' },
    ],
  },
  {
    key: 'configuracoes',
    label: 'Configurações',
    actions: [
      { key: 'configuracoes.visualizar', label: 'Visualizar' },
      { key: 'configuracoes.gerenciar', label: 'Alterar configurações' },
    ],
  },
]

export const ALL_PERMISSION_KEYS = PERMISSION_AREAS.flatMap((area) =>
  area.actions.map((action) => action.key),
)

/** Espelha `public.default_permissions` do banco. */
export function defaultPermissions(role: UserRole): Record<string, boolean> {
  if (role === 'owner' || role === 'admin') {
    return Object.fromEntries(ALL_PERMISSION_KEYS.map((key) => [key, true]))
  }

  if (role === 'manager') {
    const denied = new Set(['whatsapp.gerenciar', 'configuracoes.gerenciar'])
    return Object.fromEntries(ALL_PERMISSION_KEYS.map((key) => [key, !denied.has(key)]))
  }

  const allowed = new Set([
    'dashboard.visualizar',
    'atendimentos.visualizar',
    'atendimentos.enviar',
    'atendimentos.assumir',
    'atendimentos.transferir',
    'atendimentos.iniciar',
    'atendimentos.desligar_ia',
    'kanban.visualizar',
    'kanban.gerenciar',
    'clientes.visualizar',
    'clientes.criar',
    'clientes.editar',
  ])
  return Object.fromEntries(ALL_PERMISSION_KEYS.map((key) => [key, allowed.has(key)]))
}

/** Permissões efetivas do usuário logado, vindas do banco. */
export function usePermissions() {
  const { user, profile } = useAuth()

  const query = useQuery({
    queryKey: ['my-permissions', user?.id, profile?.updated_at],
    enabled: Boolean(user?.id),
    staleTime: 30_000,
    queryFn: async (): Promise<Record<string, boolean>> => {
      const { data, error } = await supabase.rpc('my_permissions')
      if (error) throw error
      return (data ?? {}) as Record<string, boolean>
    },
  })

  const permissions = query.data ?? {}

  const can = useCallback(
    (key: string): boolean => {
      if (permissions['*']) return true
      return permissions[key] === true
    },
    [permissions],
  )

  return { can, permissions, isLoading: query.isLoading }
}
