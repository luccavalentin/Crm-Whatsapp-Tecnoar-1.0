import {
  BarChart3,
  Bot,
  Columns3,
  LayoutDashboard,
  MessageSquare,
  Settings,
  Sparkles,
  Users,
  UserSquare2,
} from 'lucide-react'
import type { ComponentType } from 'react'
import { WhatsAppIcon } from '@/components/icons/WhatsAppIcon'

export interface NavItem {
  key: string
  label: string
  path: string
  icon: ComponentType<{ className?: string }>
  /** Descrição usada como subtítulo da topbar. */
  subtitle?: string
  group: 'operacao' | 'gestao' | 'sistema' | 'configuracoes'
  /** Permissão necessária para ver a área. */
  permission: string
}

export const NAV_ITEMS: NavItem[] = [
  {
    key: 'dashboard',
    permission: 'dashboard.visualizar',
    label: 'Dashboard',
    path: '/dashboard',
    icon: LayoutDashboard,
    subtitle: 'Visão geral da operação',
    group: 'operacao',
  },
  {
    key: 'atendimentos',
    permission: 'atendimentos.visualizar',
    label: 'Atendimentos',
    path: '/atendimentos',
    // O simbolo do WhatsApp deixa claro de onde vem a conversa. Antes era um
    // balao generico, igual ao da tela de integracao — dava para confundir.
    icon: WhatsAppIcon,
    subtitle: 'Central de atendimento em tempo real',
    group: 'operacao',
  },
  {
    key: 'kanban',
    permission: 'kanban.visualizar',
    label: 'Kanban',
    path: '/kanban',
    icon: Columns3,
    subtitle: 'Fluxo dos atendimentos',
    group: 'operacao',
  },
  {
    key: 'clientes',
    permission: 'clientes.visualizar',
    label: 'Clientes',
    path: '/clientes',
    icon: UserSquare2,
    subtitle: 'Cadastro e histórico de relacionamento',
    group: 'operacao',
  },
  {
    key: 'metricas',
    permission: 'metricas.visualizar',
    label: 'Métricas',
    path: '/metricas',
    icon: BarChart3,
    subtitle: 'Indicadores da operação',
    group: 'gestao',
  },
  {
    key: 'ia',
    permission: 'ia.visualizar',
    label: 'IA',
    path: '/ia',
    icon: Bot,
    subtitle: 'Configuração e desempenho da inteligência artificial',
    group: 'configuracoes',
  },
  {
    key: 'simulador',
    permission: 'simulador.visualizar',
    label: 'Simulador de IA',
    path: '/simulador',
    icon: Sparkles,
    subtitle: 'Teste a IA sem impactar dados reais',
    group: 'configuracoes',
  },
  {
    key: 'equipe',
    permission: 'equipe.visualizar',
    label: 'Usuários e Permissões',
    path: '/equipe',
    icon: Users,
    subtitle: 'Usuários, papéis e permissões',
    group: 'sistema',
  },
  {
    key: 'whatsapp',
    permission: 'whatsapp.visualizar',
    // "WhatsApp" sozinho parecia a caixa de conversas. Aqui e a tela de
    // conectar o numero e as credenciais — o nome tem que dizer isso.
    label: 'Configuração do WhatsApp',
    path: '/whatsapp',
    icon: MessageSquare,
    subtitle: 'Integrações Meta Cloud API e Evolution API',
    group: 'configuracoes',
  },
  {
    key: 'configuracoes',
    permission: 'configuracoes.visualizar',
    label: 'Configurações',
    path: '/configuracoes',
    icon: Settings,
    subtitle: 'Preferências da empresa e do sistema',
    group: 'configuracoes',
  },
]

export const NAV_GROUPS: Array<{ key: NavItem['group']; label: string }> = [
  { key: 'operacao', label: 'Operação' },
  { key: 'gestao', label: 'Gestão' },
  { key: 'sistema', label: 'Sistema' },
  { key: 'configuracoes', label: 'Configurações' },
]

export function findNavItem(pathname: string): NavItem | undefined {
  return NAV_ITEMS.find((item) => pathname === item.path || pathname.startsWith(item.path + '/'))
}
