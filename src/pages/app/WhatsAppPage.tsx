import { useEffect, useState, type FormEvent } from 'react'
import {
  Check,
  Copy,
  Link2,
  MessageSquare,
  Plug,
  PlugZap,
  QrCode,
  RefreshCw,
  Trash2,
  Webhook,
} from 'lucide-react'
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  SkeletonPage,
} from '@/components/ui'
import { ConfirmDialog, Modal } from '@/components/ui/Modal'
import { QrConnectModal } from '@/components/whatsapp/QrConnectModal'
import { useAuth } from '@/contexts/AuthContext'
import {
  PROVIDER_DESCRIPTION,
  PROVIDER_LABEL,
  useActivateChannel,
  useDeleteChannel,
  useEvolutionControl,
  useSaveChannel,
  useWebhookToken,
  useWhatsAppChannels,
  webhookUrl,
  type EvolutionAction,
} from '@/features/whatsapp/api'
import { formatFull, relativeFromNow } from '@/lib/datetime'
import { formatPhone, maskPhoneInput } from '@/lib/phone'
import type { ChannelStatus, WhatsAppChannelPublicRow } from '@/types/database'

const STATUS_LABEL: Record<ChannelStatus, string> = {
  desconectado: 'Desconectado',
  conectando: 'Conectando',
  conectado: 'Conectado',
  erro: 'Erro',
}

const STATUS_TONE: Record<ChannelStatus, 'success' | 'neutral' | 'orange' | 'danger'> = {
  conectado: 'success',
  conectando: 'orange',
  desconectado: 'neutral',
  erro: 'danger',
}

export function WhatsAppPage() {
  const { company, profile } = useAuth()
  const canManage = profile ? ['owner', 'admin', 'manager'].includes(profile.role) : false
  const { data: channels, isLoading } = useWhatsAppChannels(company?.id)
  const activate = useActivateChannel()
  const remove = useDeleteChannel()

  const [metaOpen, setMetaOpen] = useState(false)
  const [evolutionOpen, setEvolutionOpen] = useState(false)
  const [qrOpen, setQrOpen] = useState(false)
  const [toDelete, setToDelete] = useState<WhatsAppChannelPublicRow | null>(null)
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)

  const evolutionControl = useEvolutionControl()
  const meta = channels?.find((channel) => channel.provider === 'meta') ?? null
  const evolution = channels?.find((channel) => channel.provider === 'evolution') ?? null

  async function runEvolution(action: EvolutionAction) {
    setFeedback(null)
    try {
      const result = await evolutionControl.mutateAsync(action)
      if (!result.ok) {
        setFeedback({ tone: 'error', text: result.error ?? 'Falha na Evolution API.' })
        return
      }
      if (action === 'set-webhook') {
        setFeedback({ tone: 'success', text: 'Webhook registrado na instância.' })
        return
      }
      if (action === 'disconnect') {
        setFeedback({ tone: 'success', text: 'Instância desconectada.' })
        return
      }
      setFeedback({
        tone: 'success',
        text: `Conexão verificada. Estado atual: ${result.state ?? result.status}.`,
      })
    } catch (err) {
      setFeedback({ tone: 'error', text: (err as Error).message })
    }
  }

  if (isLoading) return <SkeletonPage tiles={0} rows={4} />

  return (
    <div className="animate-in-fade mx-auto max-w-4xl space-y-4 px-4 py-5 sm:px-6 sm:py-6">
      {feedback && <Alert tone={feedback.tone}>{feedback.text}</Alert>}

      {!channels?.some((channel) => channel.is_active) && (
        <Alert tone="warning">
          Nenhuma integração de WhatsApp está ativa. Enquanto isso, as mensagens enviadas pelo CRM
          falham e ficam registradas como não enviadas.
        </Alert>
      )}

      <ChannelCard
        provider="meta"
        channel={meta}
        canManage={canManage}
        onConfigure={() => setMetaOpen(true)}
        onToggleActive={async (active) => {
          if (!meta) return
          try {
            await activate.mutateAsync({ id: meta.id, active })
            setFeedback({
              tone: 'success',
              text: active ? 'Meta Cloud API ativada.' : 'Meta Cloud API desativada.',
            })
          } catch (err) {
            setFeedback({ tone: 'error', text: (err as Error).message })
          }
        }}
        onDelete={() => meta && setToDelete(meta)}
      />

      <ChannelCard
        provider="evolution"
        channel={evolution}
        canManage={canManage}
        onConfigure={() => setEvolutionOpen(true)}
        onToggleActive={async (active) => {
          if (!evolution) return
          try {
            await activate.mutateAsync({ id: evolution.id, active })
            setFeedback({
              tone: 'success',
              text: active ? 'Evolution API ativada.' : 'Evolution API desativada.',
            })
          } catch (err) {
            setFeedback({ tone: 'error', text: (err as Error).message })
          }
        }}
        onDelete={() => evolution && setToDelete(evolution)}
        extraActions={
          evolution ? (
            <>
              <Button
                size="sm"
                variant="outline"
                loading={evolutionControl.isPending}
                onClick={() => runEvolution('test')}
              >
                <RefreshCw className="size-4" />
                Testar conexão
              </Button>
              <Button size="sm" variant="outline" onClick={() => setQrOpen(true)}>
                <QrCode className="size-4" />
                Conectar por QR Code
              </Button>
              <Button
                size="sm"
                variant="outline"
                loading={evolutionControl.isPending}
                onClick={() => runEvolution('set-webhook')}
              >
                <Webhook className="size-4" />
                Registrar webhook
              </Button>
              <Button
                size="sm"
                variant="outline"
                loading={evolutionControl.isPending}
                onClick={() => runEvolution('disconnect')}
              >
                Desconectar
              </Button>
            </>
          ) : undefined
        }
      />

      <EvolutionModal
        open={evolutionOpen}
        channel={evolution}
        onClose={() => setEvolutionOpen(false)}
        onSaved={() => {
          setEvolutionOpen(false)
          setFeedback({
            tone: 'success',
            text: 'Dados da instancia salvos. Use Testar conexão para verificar.',
          })
        }}
      />

      <QrConnectModal
        open={qrOpen}
        onClose={() => setQrOpen(false)}
        onConnect={() => evolutionControl.mutateAsync('connect')}
        onStatus={() => evolutionControl.mutateAsync('status')}
        onConnected={(phone) => {
          setFeedback({
            tone: 'success',
            text: phone
              ? `WhatsApp conectado no número ${phone}.`
              : 'WhatsApp conectado com sucesso.',
          })
        }}
      />

      <MetaModal
        open={metaOpen}
        channel={meta}
        onClose={() => setMetaOpen(false)}
        onSaved={() => {
          setMetaOpen(false)
          setFeedback({
            tone: 'success',
            text: 'Credenciais salvas. Configure a URL do webhook no painel da Meta.',
          })
        }}
      />

      <ConfirmDialog
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        title="Remover integração"
        confirmLabel="Remover"
        loading={remove.isPending}
        message="As credenciais salvas serão apagadas e o canal deixa de receber e enviar mensagens. O histórico de conversas é preservado."
        onConfirm={async () => {
          if (!toDelete) return
          await remove.mutateAsync(toDelete.id)
          setToDelete(null)
          setFeedback({ tone: 'success', text: 'Integração removida.' })
        }}
      />
    </div>
  )
}

/* ------------------------------------------------------------ Card do canal */

function ChannelCard({
  provider,
  channel,
  canManage,
  onConfigure,
  onToggleActive,
  onDelete,
  extraActions,
}: {
  provider: 'meta' | 'evolution'
  channel: WhatsAppChannelPublicRow | null
  canManage: boolean
  onConfigure: () => void
  onToggleActive: (active: boolean) => void
  onDelete: () => void
  extraActions?: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {PROVIDER_LABEL[provider]}
            {channel && <Badge tone={STATUS_TONE[channel.status]}>{STATUS_LABEL[channel.status]}</Badge>}
            {channel?.is_active && <Badge tone="cyan">Canal ativo</Badge>}
          </span>
        }
        description={PROVIDER_DESCRIPTION[provider]}
        action={
          canManage ? (
            <div className="flex flex-wrap items-center gap-2">
              {extraActions}
              <Button size="sm" variant="outline" onClick={onConfigure}>
                <Plug className="size-4" />
                {channel ? 'Configurar' : 'Conectar'}
              </Button>
              {channel && (
                <>
                  <Button
                    size="sm"
                    variant={channel.is_active ? 'outline' : 'primary'}
                    onClick={() => onToggleActive(!channel.is_active)}
                  >
                    <PlugZap className="size-4" />
                    {channel.is_active ? 'Desativar' : 'Ativar'}
                  </Button>
                  <Button size="sm" variant="outline" onClick={onDelete}>
                    <Trash2 className="size-4 text-red-600" />
                  </Button>
                </>
              )}
            </div>
          ) : undefined
        }
      />

      {!channel ? (
        <EmptyState
          icon={MessageSquare}
          title="Integração não configurada"
          description={
            provider === 'meta'
              ? 'Informe as credenciais da sua conta WhatsApp Business na Meta para conectar o número oficial.'
              : 'Informe os dados da sua instância da Evolution API para conectar.'
          }
        />
      ) : (
        <>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 px-5 py-4 sm:grid-cols-2">
            <Row label="Número conectado" value={channel.phone_number ? formatPhone(channel.phone_number) : '—'} />
            <Row label="Conta / instância" value={channel.display_name || channel.external_id || '—'} />
            <Row label="Credenciais" value={channel.has_credentials ? 'Salvas' : 'Não informadas'} />
            <Row label="Última verificação" value={formatFull(channel.last_checked_at)} />
            <Row
              label="Última mensagem recebida"
              value={channel.last_inbound_at ? relativeFromNow(channel.last_inbound_at) : 'Nenhuma'}
            />
            <Row
              label="Última mensagem enviada"
              value={channel.last_outbound_at ? relativeFromNow(channel.last_outbound_at) : 'Nenhuma'}
            />
          </dl>

          {channel.last_error && (
            <div className="px-5 pb-4">
              <Alert tone="error">
                Último erro ({formatFull(channel.last_error_at)}): {channel.last_error}
              </Alert>
            </div>
          )}

          {canManage && <WebhookBox channel={channel} />}
        </>
      )}
    </Card>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line pb-2.5 last:border-0 sm:border-0 sm:pb-0">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="text-right text-sm text-ink">{value}</dd>
    </div>
  )
}

function WebhookBox({ channel }: { channel: WhatsAppChannelPublicRow }) {
  const { data: token } = useWebhookToken(channel.id)
  const [copied, setCopied] = useState<string | null>(null)

  if (!token) return null
  const url = webhookUrl(channel.provider, token)

  const copy = async (value: string, key: string) => {
    await navigator.clipboard.writeText(value)
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <div className="border-t border-line px-5 py-4">
      <p className="flex items-center gap-1.5 text-sm font-medium text-ink">
        <Link2 className="size-4 text-muted" />
        URL do webhook
      </p>
      <p className="mt-1 text-xs text-muted">
        {channel.provider === 'meta'
          ? 'Cadastre esta URL em Configuração → Webhooks do seu aplicativo na Meta, com o token de verificação informado.'
          : 'Cadastre esta URL como webhook da sua instância na Evolution API.'}
      </p>
      <div className="mt-2 flex items-center gap-2">
        <code className="scrollbar-thin min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded-lg border border-line bg-canvas px-3 py-2 text-xs text-ink">
          {url}
        </code>
        <Button size="sm" variant="outline" onClick={() => copy(url, 'url')}>
          {copied === 'url' ? <Check className="size-4" /> : <Copy className="size-4" />}
        </Button>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------- Meta modal */

function MetaModal({
  open,
  channel,
  onClose,
  onSaved,
}: {
  open: boolean
  channel: WhatsAppChannelPublicRow | null
  onClose: () => void
  onSaved: () => void
}) {
  const save = useSaveChannel()
  const [form, setForm] = useState({
    phoneNumberId: '',
    wabaId: '',
    phoneNumber: '',
    displayName: '',
    apiVersion: 'v21.0',
    accessToken: '',
    appSecret: '',
    verifyToken: '',
  })
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const settings = (channel?.settings ?? {}) as Record<string, string>
    setForm({
      phoneNumberId: channel?.external_id ?? '',
      wabaId: settings.waba_id ?? '',
      phoneNumber: channel?.phone_number ?? '',
      displayName: channel?.display_name ?? '',
      apiVersion: settings.api_version ?? 'v21.0',
      accessToken: '',
      appSecret: '',
      verifyToken: '',
    })
    setError(null)
  }, [open, channel])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (!form.phoneNumberId.trim()) return setError('Informe o Phone Number ID.')
    if (!channel && !form.accessToken.trim()) return setError('Informe o token de acesso.')
    if (!channel && !form.verifyToken.trim()) {
      return setError('Defina um token de verificação para o webhook.')
    }

    try {
      await save.mutateAsync({
        provider: 'meta',
        name: 'Meta Cloud API',
        externalId: form.phoneNumberId.trim(),
        phoneNumber: form.phoneNumber,
        settings: {
          waba_id: form.wabaId.trim(),
          api_version: form.apiVersion.trim() || 'v21.0',
          display_name: form.displayName.trim(),
        },
        secrets: {
          access_token: form.accessToken,
          app_secret: form.appSecret,
          verify_token: form.verifyToken,
        },
      })
      onSaved()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Meta Cloud API"
      description="Credenciais da sua conta WhatsApp Business. Depois de salvas, não são exibidas novamente."
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>
            Cancelar
          </Button>
          <Button type="submit" form="meta-form" loading={save.isPending}>
            Salvar credenciais
          </Button>
        </>
      }
    >
      <form id="meta-form" onSubmit={submit} className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        {channel?.has_credentials && (
          <Alert tone="info">
            Já existem credenciais salvas. Deixe os campos de segredo em branco para mantê-las.
          </Alert>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Phone Number ID"
            value={form.phoneNumberId}
            onChange={(e) => setForm((f) => ({ ...f, phoneNumberId: e.target.value }))}
            hint="Identificador do número no painel da Meta."
            required
          />
          <Field
            label="WhatsApp Business Account ID"
            value={form.wabaId}
            onChange={(e) => setForm((f) => ({ ...f, wabaId: e.target.value }))}
          />
          <Field
            label="Número do WhatsApp"
            value={form.phoneNumber}
            onChange={(e) => setForm((f) => ({ ...f, phoneNumber: maskPhoneInput(e.target.value) }))}
            placeholder="(11) 3333-4444"
          />
          <Field
            label="Nome de exibição"
            value={form.displayName}
            onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
          />
        </div>

        <Field
          label="Token de acesso permanente"
          type="password"
          autoComplete="off"
          value={form.accessToken}
          onChange={(e) => setForm((f) => ({ ...f, accessToken: e.target.value }))}
          placeholder={channel?.has_credentials ? 'Manter token atual' : ''}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="App Secret"
            type="password"
            autoComplete="off"
            value={form.appSecret}
            onChange={(e) => setForm((f) => ({ ...f, appSecret: e.target.value }))}
            hint="Usado para validar a assinatura dos webhooks."
            placeholder={channel?.has_credentials ? 'Manter atual' : ''}
          />
          <Field
            label="Token de verificação do webhook"
            type="password"
            autoComplete="off"
            value={form.verifyToken}
            onChange={(e) => setForm((f) => ({ ...f, verifyToken: e.target.value }))}
            hint="Você define este valor e repete no painel da Meta."
            placeholder={channel?.has_credentials ? 'Manter atual' : ''}
          />
        </div>

        <Field
          label="Versão da API"
          value={form.apiVersion}
          onChange={(e) => setForm((f) => ({ ...f, apiVersion: e.target.value }))}
        />
      </form>
    </Modal>
  )
}

/* --------------------------------------------------------- Evolution modal */

function EvolutionModal({
  open,
  channel,
  onClose,
  onSaved,
}: {
  open: boolean
  channel: WhatsAppChannelPublicRow | null
  onClose: () => void
  onSaved: () => void
}) {
  const save = useSaveChannel()
  const [form, setForm] = useState({
    baseUrl: '',
    instance: '',
    apiKey: '',
    webhookSecret: '',
    phoneNumber: '',
  })
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const settings = (channel?.settings ?? {}) as Record<string, string>
    setForm({
      baseUrl: settings.base_url ?? '',
      instance: settings.instance ?? '',
      apiKey: '',
      webhookSecret: '',
      phoneNumber: channel?.phone_number ?? '',
    })
    setError(null)
  }, [open, channel])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (!form.baseUrl.trim()) return setError('Informe a URL da instância.')
    if (!form.instance.trim()) return setError('Informe o nome da instância.')
    if (!channel && !form.apiKey.trim()) return setError('Informe a API Key da instância.')

    try {
      await save.mutateAsync({
        provider: 'evolution',
        name: 'Evolution API',
        phoneNumber: form.phoneNumber,
        settings: {
          base_url: form.baseUrl.trim().replace(/\/+$/, ''),
          instance: form.instance.trim(),
        },
        // Campo em branco mantém o valor atual — por isso só vai o que foi
        // digitado agora.
        secrets: {
          api_key: form.apiKey,
          ...(form.webhookSecret.trim() ? { webhook_secret: form.webhookSecret.trim() } : {}),
        },
      })
      onSaved()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Evolution API"
      description="Dados da sua instância. A API Key fica apenas no servidor."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>
            Cancelar
          </Button>
          <Button type="submit" form="evolution-form" loading={save.isPending}>
            Salvar
          </Button>
        </>
      }
    >
      <form id="evolution-form" onSubmit={submit} className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        {channel?.has_credentials && (
          <Alert tone="info">
            Já existe uma API Key salva. Deixe o campo em branco para mantê-la.
          </Alert>
        )}
        <Field
          label="URL da instância"
          value={form.baseUrl}
          onChange={(e) => setForm((f) => ({ ...f, baseUrl: e.target.value }))}
          placeholder="https://evolution.suaempresa.com.br"
          required
        />
        <Field
          label="Nome da instância"
          value={form.instance}
          onChange={(e) => setForm((f) => ({ ...f, instance: e.target.value }))}
          placeholder="tecnoar"
          required
        />
        <Field
          label="API Key"
          type="password"
          autoComplete="off"
          value={form.apiKey}
          onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))}
          placeholder={channel?.has_credentials ? 'Manter chave atual' : ''}
        />
        <Field
          label="Número do WhatsApp"
          value={form.phoneNumber}
          onChange={(e) => setForm((f) => ({ ...f, phoneNumber: maskPhoneInput(e.target.value) }))}
          placeholder="(11) 98888-7777"
        />
        <Field
          label="Senha do webhook (recomendado)"
          type="password"
          autoComplete="off"
          value={form.webhookSecret}
          onChange={(e) => setForm((f) => ({ ...f, webhookSecret: e.target.value }))}
          placeholder={channel ? 'Manter a senha atual' : 'Invente uma senha longa'}
          hint="Sem ela, quem descobrir o endereço do webhook consegue enviar mensagem se passando por cliente — e disparar resposta da IA e aviso de emergência. Depois de salvar, cadastre a mesma senha na Evolution como cabeçalho apikey do webhook."
        />
      </form>
    </Modal>
  )
}

export { ChannelCard }
