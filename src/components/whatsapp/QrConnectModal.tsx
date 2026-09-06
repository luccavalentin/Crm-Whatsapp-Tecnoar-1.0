import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2, QrCode, RefreshCw, Smartphone } from 'lucide-react'
import { Alert, Button, Spinner } from '@/components/ui'
import { Modal } from '@/components/ui/Modal'
import { formatPhone } from '@/lib/phone'
import type { EvolutionControlResult } from '@/features/whatsapp/api'

const QR_LIFETIME_SECONDS = 40
const STATUS_POLL_MS = 4000

/**
 * Conexão do WhatsApp por QR Code (Evolution API).
 * O código é renovado antes de expirar e o status da instância é consultado
 * periodicamente — quando o celular conecta, a tela avisa sozinha.
 *
 * As funções recebidas por props ficam em refs: se fossem usadas direto nas
 * dependências dos efeitos, cada renderização criaria uma nova referência e o
 * efeito dispararia em laço, inundando a Edge Function de chamadas.
 */
export function QrConnectModal({
  open,
  onClose,
  onConnect,
  onStatus,
  onConnected,
}: {
  open: boolean
  onClose: () => void
  onConnect: () => Promise<EvolutionControlResult>
  onStatus: () => Promise<EvolutionControlResult>
  onConnected: (phone: string | null) => void
}) {
  const [qrcode, setQrcode] = useState<string | null>(null)
  const [pairingCode, setPairingCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [connected, setConnected] = useState<{ phone: string | null } | null>(null)
  const [seconds, setSeconds] = useState(QR_LIFETIME_SECONDS)

  const handlers = useRef({ onConnect, onStatus, onConnected })
  handlers.current = { onConnect, onStatus, onConnected }

  const openRef = useRef(open)
  openRef.current = open
  const busyRef = useRef(false)
  const connectedRef = useRef(false)

  /** Pede um QR novo. Nunca roda duas vezes ao mesmo tempo. */
  const requestQr = useCallback(async () => {
    if (busyRef.current || connectedRef.current) return
    busyRef.current = true
    setLoading(true)
    setError(null)
    try {
      const result = await handlers.current.onConnect()
      if (!openRef.current) return

      if (!result.ok) {
        setError(result.error ?? 'Não foi possível gerar o QR Code.')
        return
      }
      if (result.qrcode) {
        setQrcode(result.qrcode)
        setPairingCode(result.pairingCode ?? null)
        setSeconds(QR_LIFETIME_SECONDS)
        return
      }
      // Sem QR significa que a instância já está conectada
      connectedRef.current = true
      setConnected({ phone: result.phone ?? null })
      handlers.current.onConnected(result.phone ?? null)
    } catch (err) {
      if (openRef.current) setError((err as Error).message)
    } finally {
      busyRef.current = false
      if (openRef.current) setLoading(false)
    }
  }, [])

  // Abre pedindo o QR — depende apenas de `open`
  useEffect(() => {
    if (!open) {
      setQrcode(null)
      setPairingCode(null)
      setError(null)
      setConnected(null)
      setSeconds(QR_LIFETIME_SECONDS)
      connectedRef.current = false
      busyRef.current = false
      return
    }
    void requestQr()
  }, [open, requestQr])

  // Contagem regressiva e renovação automática do código
  useEffect(() => {
    if (!open) return
    const timer = setInterval(() => {
      if (connectedRef.current) return
      setSeconds((current) => {
        if (current <= 1) {
          void requestQr()
          return QR_LIFETIME_SECONDS
        }
        return current - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [open, requestQr])

  // Verifica a conexão enquanto o QR estiver na tela
  useEffect(() => {
    if (!open) return
    const poll = setInterval(async () => {
      if (connectedRef.current) return
      try {
        const result = await handlers.current.onStatus()
        if (!openRef.current || connectedRef.current) return
        if (result.ok && result.state === 'open') {
          connectedRef.current = true
          setConnected({ phone: result.phone ?? null })
          handlers.current.onConnected(result.phone ?? null)
        }
      } catch {
        // silencioso: a próxima verificação tenta de novo
      }
    }, STATUS_POLL_MS)
    return () => clearInterval(poll)
  }, [open])

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={connected ? 'WhatsApp conectado' : 'Conectar WhatsApp por QR Code'}
      description={
        connected
          ? undefined
          : 'No celular: WhatsApp → Aparelhos conectados → Conectar um aparelho.'
      }
      footer={
        connected ? (
          <Button onClick={onClose}>Concluir</Button>
        ) : (
          <>
            <Button variant="outline" onClick={onClose}>
              Fechar
            </Button>
            <Button variant="outline" loading={loading} onClick={() => void requestQr()}>
              <RefreshCw className="size-4" />
              Gerar novo código
            </Button>
          </>
        )
      }
    >
      {connected ? (
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
            <CheckCircle2 className="size-7" />
          </span>
          <p className="text-base font-medium text-ink">Aparelho conectado com sucesso</p>
          {connected.phone && (
            <p className="text-sm text-muted">
              Número: <span className="text-ink">{formatPhone(connected.phone)}</span>
            </p>
          )}
          <p className="max-w-sm text-sm text-muted">
            As mensagens recebidas já entram no CRM. Mantenha este canal ativo na tela de WhatsApp.
          </p>
        </div>
      ) : error ? (
        <Alert tone="error">{error}</Alert>
      ) : loading && !qrcode ? (
        <div className="flex flex-col items-center gap-3 py-10">
          <Spinner className="size-6" />
          <p className="text-sm text-muted">Gerando código na sua instância…</p>
        </div>
      ) : qrcode ? (
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <img
              src={qrcode.startsWith('data:') ? qrcode : `data:image/png;base64,${qrcode}`}
              alt="QR Code para conectar o WhatsApp"
              className="size-64 rounded-xl border border-line bg-surface p-2"
            />
            {loading && (
              <span className="absolute inset-0 flex items-center justify-center rounded-xl bg-surface/70">
                <Spinner className="size-6" />
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 text-xs text-muted">
            <RefreshCw className="size-3.5" />O código se renova em {seconds}s
          </div>

          {pairingCode && (
            <p className="text-sm text-muted">
              Ou use o código de pareamento:{' '}
              <span className="font-medium tracking-wider text-ink">{pairingCode}</span>
            </p>
          )}

          <ol className="w-full space-y-1.5 rounded-xl bg-canvas p-4 text-xs text-ink/75">
            <li className="flex gap-2">
              <Smartphone className="mt-0.5 size-3.5 shrink-0 text-muted" />
              Abra o WhatsApp no celular que vai atender
            </li>
            <li className="flex gap-2">
              <QrCode className="mt-0.5 size-3.5 shrink-0 text-muted" />
              Toque em Aparelhos conectados → Conectar um aparelho e aponte para o código
            </li>
            <li className="flex gap-2">
              <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-muted" />
              Esta tela avisa sozinha assim que a conexão for concluída
            </li>
          </ol>
        </div>
      ) : (
        <Alert tone="info">
          A instância não retornou QR Code — normalmente isso significa que ela já está conectada.
        </Alert>
      )}
    </Modal>
  )
}
