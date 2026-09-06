import { useState } from 'react'
import { Bell, BellOff, Volume2 } from 'lucide-react'
import { Alert, Badge, Button, Card, CardHeader } from '@/components/ui'
import {
  definirNotificacao,
  definirSom,
  notificacaoLigada,
  pedirPermissao,
  permissaoAtual,
  somLigado,
  tocarAviso,
} from '@/features/notifications/aviso'

/**
 * Preferências de aviso.
 *
 * Ficam no aparelho, não na conta: o mesmo atendente pode querer som no
 * computador do balcão e silêncio no celular pessoal.
 */
export function NotificationSettings() {
  const [som, setSom] = useState(somLigado)
  const [desktop, setDesktop] = useState(notificacaoLigada)
  const [permissao, setPermissao] = useState(permissaoAtual)

  const bloqueada = permissao === 'denied'
  const indisponivel = permissao === 'indisponivel'

  return (
    <Card>
      <CardHeader
        title="Avisos de mensagem"
        description="Vale só neste aparelho. Cada dispositivo tem a própria preferência."
      />

      <div className="divide-y divide-line">
        <label className="flex cursor-pointer items-start gap-3 px-4 py-3.5 sm:px-5">
          <input
            type="checkbox"
            checked={som}
            onChange={(e) => {
              setSom(e.target.checked)
              definirSom(e.target.checked)
              if (e.target.checked) tocarAviso('mensagem')
            }}
            className="mt-0.5 size-4 shrink-0 rounded border-muted accent-orange-500"
          />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2 text-sm font-medium text-ink">
              <Volume2 className="size-4 text-muted" />
              Tocar som ao receber mensagem
            </span>
            <span className="mt-0.5 block text-xs leading-snug text-muted">
              Emergência toca diferente de mensagem comum, para dar para distinguir sem olhar.
            </span>
          </span>
          {som && (
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => {
                e.preventDefault()
                tocarAviso('emergencia')
              }}
            >
              Ouvir emergência
            </Button>
          )}
        </label>

        <div className="px-4 py-3.5 sm:px-5">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              disabled={bloqueada || indisponivel}
              checked={desktop && permissao === 'granted'}
              onChange={async (e) => {
                if (e.target.checked) {
                  const resultado = await pedirPermissao()
                  setPermissao(resultado)
                  if (resultado !== 'granted') return
                }
                setDesktop(e.target.checked)
                definirNotificacao(e.target.checked)
              }}
              className="mt-0.5 size-4 shrink-0 rounded border-muted accent-orange-500 disabled:opacity-50"
            />
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
                {permissao === 'granted' ? (
                  <Bell className="size-4 text-muted" />
                ) : (
                  <BellOff className="size-4 text-muted" />
                )}
                Notificação do sistema
                {permissao === 'granted' && <Badge tone="success">Autorizada</Badge>}
                {bloqueada && <Badge tone="danger">Bloqueada</Badge>}
              </span>
              <span className="mt-0.5 block text-xs leading-snug text-muted">
                Aparece fora do navegador quando a aba não está à frente. Tocar na notificação abre
                a conversa.
              </span>
            </span>
          </label>

          {bloqueada && (
            <Alert tone="warning" className="mt-3">
              As notificações estão bloqueadas para este site. Para liberar, abra as permissões do
              navegador (o cadeado ao lado do endereço) e autorize notificações — o sistema não
              consegue pedir de novo depois de negado.
            </Alert>
          )}

          {indisponivel && (
            <Alert tone="info" className="mt-3">
              Este navegador não oferece notificações do sistema. O som continua funcionando.
            </Alert>
          )}
        </div>
      </div>
    </Card>
  )
}
