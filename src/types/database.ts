/**
 * Tipos do banco (mantidos manualmente, espelhando as migrations aplicadas
 * no projeto Supabase). Cada nova migration deve atualizar este arquivo.
 *
 * IMPORTANTE: usar `type` (nunca `interface`) nas linhas de tabela — o
 * supabase-js exige tipos com índice implícito e interfaces não satisfazem.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type UserRole = 'owner' | 'admin' | 'manager' | 'agent'
export type UserStatus = 'active' | 'inactive'
export type CustomerStatus = 'active' | 'archived'
export type DataSource = 'ia' | 'whatsapp' | 'manual' | 'sistema'
export type ActorType = 'cliente' | 'ia' | 'usuario' | 'sistema'

export type CompanyRow = {
  id: string
  name: string
  slug: string | null
  document: string | null
  phone: string | null
  email: string | null
  timezone: string
  settings: Json
  created_at: string
  updated_at: string
}

export type ProfileRow = {
  id: string
  company_id: string | null
  full_name: string
  email: string
  phone: string | null
  avatar_url: string | null
  role: UserRole
  status: UserStatus
  permissions: Json
  last_seen_at: string | null
  created_at: string
  updated_at: string
}

export type CustomerRow = {
  id: string
  company_id: string
  name: string | null
  phone: string
  phone_raw: string | null
  whatsapp_name: string | null
  /** Foto de perfil do WhatsApp. Nulo = sem foto ou perfil restrito. */
  photo_url: string | null
  /** Quando a foto foi conferida. Nulo = nunca conferida. */
  photo_checked_at: string | null
  email: string | null
  document: string | null
  company_name: string | null
  status: CustomerStatus
  owner_id: string | null
  first_contact_at: string | null
  last_interaction_at: string | null
  service_count: number
  tags: string[]
  created_by: string | null
  created_source: DataSource
  created_at: string
  updated_at: string
}

export type CustomerFieldRow = {
  id: string
  company_id: string
  customer_id: string
  key: string
  label: string
  value: string
  source: DataSource
  source_user_id: string | null
  confidence: number | null
  created_at: string
  updated_at: string
}

export type CustomerNoteRow = {
  id: string
  company_id: string
  customer_id: string
  author_id: string | null
  body: string
  created_at: string
  updated_at: string
}

export type CustomerEventRow = {
  id: string
  company_id: string
  customer_id: string
  type: string
  title: string
  description: string | null
  actor_type: ActorType
  actor_id: string | null
  actor_name: string | null
  metadata: Json
  created_at: string
}

export type ConversationStatus = 'novo' | 'ia' | 'aguardando_humano' | 'em_atendimento' | 'concluido'
export type ConversationPriority = 'baixa' | 'normal' | 'alta' | 'emergencia'
export type MessageDirection = 'inbound' | 'outbound'
export type MessageSender = 'cliente' | 'ia' | 'atendente' | 'sistema'
export type MessageStatus = 'pendente' | 'enviando' | 'enviada' | 'entregue' | 'lida' | 'falhou'
export type MessageType =
  | 'text' | 'image' | 'audio' | 'video' | 'document'
  | 'sticker' | 'location' | 'contact' | 'template' | 'system'
export type ChannelProvider = 'meta' | 'evolution'
export type ChannelStatus = 'desconectado' | 'conectando' | 'conectado' | 'erro'
export type AlertSeverity = 'info' | 'aviso' | 'critico'
export type AlertStatus = 'aberto' | 'reconhecido' | 'resolvido'
export type AiProviderName = 'gemini' | 'openai' | 'anthropic'
export type AiRole = 'principal' | 'reserva' | 'inativo'
export type AiRunKind = 'resposta' | 'classificacao' | 'simulacao'

export type AiProviderPublicRow = {
  id: string
  company_id: string
  provider: AiProviderName
  role: AiRole
  model: string
  key_hint: string | null
  settings: Json
  last_test_at: string | null
  last_test_ok: boolean | null
  last_test_error: string | null
  last_used_at: string | null
  created_at: string
  updated_at: string
  has_key: boolean
}

export type AiSettingsRow = {
  company_id: string
  enabled: boolean
  assistant_name: string
  business_context: string
  tone_instructions: string
  escalation_rules: string
  auto_reply: boolean
  min_confidence: number
  max_reply_chars: number
  /** Respostas da IA na mesma conversa por hora. 0 desliga o freio. */
  max_replies_per_hour: number
  /** Tokens (entrada + saída) que a empresa pode gastar por dia. 0 desliga. */
  daily_token_budget: number
  working_hours: Json
  created_at: string
  updated_at: string
}

export type AiRunRow = {
  id: string
  company_id: string
  conversation_id: string | null
  message_id: string | null
  kind: AiRunKind
  provider: AiProviderName | null
  model: string | null
  used_fallback: boolean
  ok: boolean
  error_message: string | null
  intent: string | null
  category: string | null
  priority: ConversationPriority | null
  confidence: number | null
  summary: string | null
  reply: string | null
  action: string | null
  escalated: boolean
  latency_ms: number | null
  input_tokens: number | null
  output_tokens: number | null
  raw: Json
  created_at: string
}

export type ConversationRow = {
  id: string
  company_id: string
  customer_id: string
  status: ConversationStatus
  priority: ConversationPriority
  assigned_to: string | null
  ai_enabled: boolean
  ai_disabled_by: string | null
  ai_disabled_at: string | null
  channel: ChannelProvider | null
  channel_account_id: string | null
  ai_summary: string | null
  ai_intent: string | null
  ai_category: string | null
  ai_confidence: number | null
  ai_updated_at: string | null
  funnel_stage: FunnelStage | null
  lead_temperature: LeadTemperature | null
  unread_count: number
  last_message_at: string | null
  last_message_text: string | null
  last_message_sender: MessageSender | null
  first_response_at: string | null
  started_at: string
  closed_at: string | null
  closed_by: string | null
  rating: number | null
  created_at: string
  updated_at: string
  archived_at: string | null
}

export type MessageRow = {
  id: string
  company_id: string
  conversation_id: string
  customer_id: string
  direction: MessageDirection
  sender: MessageSender
  sender_user_id: string | null
  type: MessageType
  body: string | null
  media_url: string | null
  media_mime: string | null
  media_name: string | null
  reply_to_id: string | null
  provider_chat_id: string | null
  location: Json | null
  status: MessageStatus
  error_message: string | null
  channel: ChannelProvider | null
  provider_message_id: string | null
  client_token: string | null
  sent_at: string | null
  delivered_at: string | null
  read_at: string | null
  failed_at: string | null
  metadata: Json
  created_at: string
  updated_at: string
}

export type ConversationEventRow = {
  id: string
  company_id: string
  conversation_id: string
  type: string
  title: string
  description: string | null
  actor_type: ActorType
  actor_id: string | null
  actor_name: string | null
  metadata: Json
  created_at: string
}

export type WhatsAppChannelPublicRow = {
  id: string
  company_id: string
  provider: ChannelProvider
  name: string
  is_active: boolean
  status: ChannelStatus
  phone_number: string | null
  display_name: string | null
  external_id: string | null
  settings: Json
  last_checked_at: string | null
  last_inbound_at: string | null
  last_outbound_at: string | null
  last_error: string | null
  last_error_at: string | null
  created_at: string
  updated_at: string
  has_credentials: boolean
}

export type CompanyKnowledgeRow = {
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

export type KnowledgeFaqRow = {
  id: string
  company_id: string
  question: string
  answer: string
  keywords: string[]
  is_active: boolean
  approved_by: string | null
  approved_at: string
  created_at: string
  updated_at: string
}

export type AiLearningQueueRow = {
  id: string
  company_id: string
  conversation_id: string | null
  customer_id: string | null
  question: string
  ai_note: string | null
  intent: string | null
  status: 'pendente' | 'aprovado' | 'descartado'
  approved_answer: string | null
  faq_id: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
}

export type TagColor = 'neutral' | 'orange' | 'cyan' | 'navy' | 'success' | 'danger'

export type TagRow = {
  id: string
  company_id: string
  name: string
  color: TagColor
  description: string | null
  is_ai_assignable: boolean
  position: number
  created_at: string
  updated_at: string
}

export type ConversationTagRow = {
  conversation_id: string
  tag_id: string
  company_id: string
  assigned_by: string | null
  by_ai: boolean
  created_at: string
}

export type WorkspaceLabelsRow = {
  company_id: string
  queue_name: string
  queue_name_singular: string
  tag_name: string
  funnel_name: string
  updated_at: string
}

export type FunnelStage =
  | 'novo_contato' | 'qualificando' | 'precisa_socorro' | 'quer_orcamento'
  | 'aguardando_dados' | 'aguardando_humano' | 'agendamento_pendente'
  | 'os_em_andamento' | 'pos_venda' | 'perdido' | 'fora_do_perfil'

export type LeadTemperature = 'quente' | 'morno' | 'frio' | 'fora_do_contexto'

export type EmergencyContactRow = {
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

export type EmergencyDispatchRow = {
  id: string
  company_id: string
  conversation_id: string
  contact_id: string | null
  contact_name: string
  contact_phone: string
  message: string
  ok: boolean
  error_message: string | null
  created_at: string
}

export type SystemAlertRow = {
  id: string
  company_id: string
  severity: AlertSeverity
  status: AlertStatus
  source: string
  code: string
  title: string
  description: string | null
  metadata: Json
  dedupe_key: string | null
  occurrences: number
  last_seen_at: string
  acknowledged_by: string | null
  acknowledged_at: string | null
  resolved_at: string | null
  created_at: string
  updated_at: string
}

export type AiSimulationRow = {
  id: string
  company_id: string
  created_by: string | null
  input: string
  reply: string | null
  intent: string | null
  category: string | null
  priority: ConversationPriority | null
  confidence: number | null
  summary: string | null
  action: string | null
  escalated: boolean
  provider: AiProviderName | null
  model: string | null
  used_fallback: boolean
  ok: boolean
  error_message: string | null
  latency_ms: number | null
  created_at: string
}

export type Database = {
  __InternalSupabase: { PostgrestVersion: '14.15' }
  public: {
    Tables: {
      companies: {
        Row: CompanyRow
        Insert: Partial<CompanyRow> & { name: string }
        Update: Partial<CompanyRow>
        Relationships: []
      }
      profiles: {
        Row: ProfileRow
        Insert: Partial<ProfileRow> & { id: string; email: string }
        Update: Partial<ProfileRow>
        Relationships: []
      }
      customers: {
        Row: CustomerRow
        Insert: Partial<CustomerRow> & { company_id: string; phone: string }
        Update: Partial<CustomerRow>
        Relationships: []
      }
      customer_fields: {
        Row: CustomerFieldRow
        Insert: Partial<CustomerFieldRow> & {
          company_id: string
          customer_id: string
          key: string
          label: string
          value: string
        }
        Update: Partial<CustomerFieldRow>
        Relationships: []
      }
      customer_notes: {
        Row: CustomerNoteRow
        Insert: Partial<CustomerNoteRow> & { company_id: string; customer_id: string; body: string }
        Update: Partial<CustomerNoteRow>
        Relationships: []
      }
      customer_events: {
        Row: CustomerEventRow
        Insert: Partial<CustomerEventRow> & {
          company_id: string
          customer_id: string
          type: string
          title: string
        }
        Update: Partial<CustomerEventRow>
        Relationships: []
      }
      conversations: {
        Row: ConversationRow
        Insert: Partial<ConversationRow> & { company_id: string; customer_id: string }
        Update: Partial<ConversationRow>
        Relationships: []
      }
      messages: {
        Row: MessageRow
        Insert: Partial<MessageRow> & {
          company_id: string
          conversation_id: string
          customer_id: string
          direction: MessageDirection
          sender: MessageSender
        }
        Update: Partial<MessageRow>
        Relationships: []
      }
      conversation_events: {
        Row: ConversationEventRow
        Insert: Partial<ConversationEventRow> & {
          company_id: string
          conversation_id: string
          type: string
          title: string
        }
        Update: Partial<ConversationEventRow>
        Relationships: []
      }
      ai_settings: {
        Row: AiSettingsRow
        Insert: Partial<AiSettingsRow> & { company_id: string }
        Update: Partial<AiSettingsRow>
        Relationships: []
      }
      ai_runs: {
        Row: AiRunRow
        Insert: Partial<AiRunRow> & { company_id: string }
        Update: Partial<AiRunRow>
        Relationships: []
      }
      ai_simulations: {
        Row: AiSimulationRow
        Insert: Partial<AiSimulationRow> & { company_id: string; input: string }
        Update: Partial<AiSimulationRow>
        Relationships: []
      }
      system_alerts: {
        Row: SystemAlertRow
        Insert: Partial<SystemAlertRow> & { company_id: string; source: string; code: string; title: string }
        Update: Partial<SystemAlertRow>
        Relationships: []
      }
      emergency_contacts: {
        Row: EmergencyContactRow
        Insert: Partial<EmergencyContactRow> & { company_id: string; name: string; phone: string }
        Update: Partial<EmergencyContactRow>
        Relationships: []
      }
      emergency_dispatches: {
        Row: EmergencyDispatchRow
        Insert: Partial<EmergencyDispatchRow> & {
          company_id: string
          conversation_id: string
          contact_name: string
          contact_phone: string
          message: string
          ok: boolean
        }
        Update: Partial<EmergencyDispatchRow>
        Relationships: []
      }
      company_knowledge: {
        Row: CompanyKnowledgeRow
        Insert: Partial<CompanyKnowledgeRow> & { company_id: string }
        Update: Partial<CompanyKnowledgeRow>
        Relationships: []
      }
      knowledge_faq: {
        Row: KnowledgeFaqRow
        Insert: Partial<KnowledgeFaqRow> & { company_id: string; question: string; answer: string }
        Update: Partial<KnowledgeFaqRow>
        Relationships: []
      }
      ai_learning_queue: {
        Row: AiLearningQueueRow
        Insert: Partial<AiLearningQueueRow> & { company_id: string; question: string }
        Update: Partial<AiLearningQueueRow>
        Relationships: []
      }
      tags: {
        Row: TagRow
        Insert: Partial<TagRow> & { company_id: string; name: string }
        Update: Partial<TagRow>
        Relationships: []
      }
      conversation_tags: {
        Row: ConversationTagRow
        Insert: Partial<ConversationTagRow> & {
          conversation_id: string
          tag_id: string
          company_id: string
        }
        Update: Partial<ConversationTagRow>
        Relationships: []
      }
      workspace_labels: {
        Row: WorkspaceLabelsRow
        Insert: Partial<WorkspaceLabelsRow> & { company_id: string }
        Update: Partial<WorkspaceLabelsRow>
        Relationships: []
      }
    }
    Views: {
      whatsapp_channels_public: {
        Row: WhatsAppChannelPublicRow
        Relationships: []
      }
      ai_providers_public: {
        Row: AiProviderPublicRow
        Relationships: []
      }
    }
    Functions: {
      /** Um ponto por dia do periodo: volume, emergencias, risco e concluidos. */
      metrics_serie: {
        Args: { p_from: string; p_to: string }
        Returns: Array<{
          dia: string
          atendimentos: number
          emergencias: number
          com_risco: number
          concluidos: number
        }>
      }
      /** Tokens de IA gastos pela empresa desde a meia-noite, no fuso dela. */
      ai_tokens_hoje: { Args: { p_company_id: string }; Returns: number }
      current_company_id: { Args: Record<string, never>; Returns: string }
      current_user_role: { Args: Record<string, never>; Returns: UserRole }
      is_admin: { Args: Record<string, never>; Returns: boolean }
      is_manager: { Args: Record<string, never>; Returns: boolean }
      normalize_phone: { Args: { v: string }; Returns: string }
      open_conversation: { Args: { p_customer_id: string }; Returns: ConversationRow }
      assign_conversation: { Args: { p_conversation_id: string; p_user_id?: string }; Returns: ConversationRow }
      transfer_conversation: {
        Args: { p_conversation_id: string; p_to_user_id: string; p_note?: string }
        Returns: ConversationRow
      }
      set_conversation_ai: { Args: { p_conversation_id: string; p_enabled: boolean }; Returns: ConversationRow }
      mark_conversation_read: { Args: { p_conversation_id: string }; Returns: undefined }
      close_conversation: { Args: { p_conversation_id: string }; Returns: ConversationRow }
      reopen_conversation: { Args: { p_conversation_id: string }; Returns: ConversationRow }
      save_ai_provider: {
        Args: {
          p_provider: AiProviderName
          p_model: string
          p_api_key?: string | null
          p_role?: AiRole | null
          p_settings?: Json | null
        }
        Returns: string
      }
      set_ai_provider_role: { Args: { p_id: string; p_role: AiRole }; Returns: undefined }
      delete_ai_provider: { Args: { p_id: string }; Returns: undefined }
      save_whatsapp_channel: {
        Args: {
          p_provider: ChannelProvider
          p_name?: string | null
          p_settings?: Json | null
          p_secrets?: Json | null
          p_external_id?: string | null
          p_phone_number?: string | null
        }
        Returns: string
      }
      activate_whatsapp_channel: { Args: { p_id: string; p_active?: boolean }; Returns: undefined }
      delete_whatsapp_channel: { Args: { p_id: string }; Returns: undefined }
      whatsapp_webhook_info: { Args: { p_id: string }; Returns: { webhook_token: string }[] }
      dashboard_overview: { Args: { p_from: string; p_to: string }; Returns: Json }
      metrics_summary: { Args: { p_from: string; p_to: string }; Returns: Json }
      metrics_volume: {
        Args: { p_from: string; p_to: string }
        Returns: { dia: string; atendimentos: number; mensagens: number; novos_clientes: number }[]
      }
      metrics_ai: { Args: { p_from: string; p_to: string }; Returns: Json }
      metrics_breakdown: {
        Args: { p_from: string; p_to: string }
        Returns: {
          dimensao: string
          chave: string
          total: number
        }[]
      }
      metrics_team: {
        Args: { p_from: string; p_to: string }
        Returns: {
          user_id: string
          full_name: string
          ativos: number
          concluidos: number
          aguardando: number
          mensagens: number
          tempo_resposta_seg: number | null
          avaliacao_media: number | null
          avaliacoes: number
        }[]
      }
      move_conversation_stage: {
        Args: { p_conversation_id: string; p_status: ConversationStatus }
        Returns: ConversationRow
      }
      set_conversation_priority: {
        Args: { p_conversation_id: string; p_priority: ConversationPriority }
        Returns: undefined
      }
      acknowledge_alert: { Args: { p_id: string }; Returns: undefined }
      resolve_alert: { Args: { p_id: string }; Returns: undefined }
      my_permissions: { Args: Record<string, never>; Returns: Json }
      effective_permissions: { Args: { p_user_id: string }; Returns: Json }
      has_permission: { Args: { p_key: string }; Returns: boolean }
      update_team_member: {
        Args: {
          p_user_id: string
          p_full_name?: string | null
          p_phone?: string | null
          p_role?: UserRole | null
          p_status?: UserStatus | null
          p_permissions?: Json | null
        }
        Returns: undefined
      }
      delete_team_member: { Args: { p_user_id: string }; Returns: undefined }
      set_conversation_archived: {
        Args: { p_conversation_id: string; p_archived: boolean }
        Returns: undefined
      }
      erase_conversation: {
        Args: { p_conversation_id: string; p_reason?: string | null }
        Returns: Array<{ media_paths: string[] | null; messages_removed: number }>
      }
      erase_customer: {
        Args: { p_customer_id: string; p_reason?: string | null }
        Returns: Array<{ media_paths: string[] | null; messages_removed: number }>
      }
    }
    Enums: {
      user_role: UserRole
      user_status: UserStatus
      customer_status: CustomerStatus
      data_source: DataSource
      actor_type: ActorType
      conversation_status: ConversationStatus
      conversation_priority: ConversationPriority
      message_direction: MessageDirection
      message_sender: MessageSender
      message_status: MessageStatus
      message_type: MessageType
      channel_provider: ChannelProvider
      channel_status: ChannelStatus
      alert_severity: AlertSeverity
      alert_status: AlertStatus
      ai_provider: AiProviderName
      ai_role: AiRole
      ai_run_kind: AiRunKind
    }
    CompositeTypes: { [_ in never]: never }
  }
}
