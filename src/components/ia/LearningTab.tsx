import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, GraduationCap, MessageSquare, X } from 'lucide-react'
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  SkeletonList,
  Tabs,
  TextArea,
} from '@/components/ui'
import {
  useApproveLearning,
  useDiscardLearning,
  useLearningQueue,
  type LearningRow,
} from '@/features/knowledge/api'
import { useAuth } from '@/contexts/AuthContext'
import { formatFull } from '@/lib/datetime'

type Aba = 'pendente' | 'aprovado' | 'descartado'

/**
 * Fila de aprendizado.
 *
 * Toda pergunta que a IA não soube responder cai aqui. Ela não aprende sozinha
 * e não repete o que inventou: alguém escreve a resposta certa e aprova. Só
 * depois disso a frase entra na base e a IA passa a poder usar.
 */
export function LearningTab({ canManage }: { canManage: boolean }) {
  const { company, profile } = useAuth()
  const [aba, setAba] = useState<Aba>('pendente')

  const { data: pendentes } = useLearningQueue(company?.id, 'pendente')
  const { data: itens, isLoading } = useLearningQueue(company?.id, aba)

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Fila de aprendizado"
          description="Perguntas que a IA recebeu e não tinha resposta oficial para dar."
        />

        <div className="border-b border-line px-4 py-2.5 sm:px-5">
          <Tabs
            tabs={[
              { key: 'pendente', label: 'Aguardando revisão', count: pendentes?.length },
              { key: 'aprovado', label: 'Aprovadas' },
              { key: 'descartado', label: 'Descartadas' },
            ]}
            value={aba}
            onChange={setAba}
          />
        </div>

        {isLoading ? (
          <SkeletonList rows={4} />
        ) : !itens || itens.length === 0 ? (
          <EmptyState
            icon={GraduationCap}
            title={
              aba === 'pendente'
                ? 'Nenhuma pergunta aguardando'
                : aba === 'aprovado'
                  ? 'Nenhuma resposta aprovada ainda'
                  : 'Nada descartado'
            }
            description={
              aba === 'pendente'
                ? 'Quando a IA não souber responder algo, a pergunta aparece aqui para alguém escrever a resposta oficial.'
                : undefined
            }
          />
        ) : (
          <ul className="divide-y divide-line">
            {itens.map((item) => (
              <ItemDaFila
                key={item.id}
                item={item}
                canManage={canManage && aba === 'pendente'}
                companyId={company?.id}
                profileId={profile?.id}
              />
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

function ItemDaFila({
  item,
  canManage,
  companyId,
  profileId,
}: {
  item: LearningRow
  canManage: boolean
  companyId: string | undefined
  profileId: string | undefined
}) {
  const aprovar = useApproveLearning(companyId, profileId)
  const descartar = useDiscardLearning(profileId)
  const [resposta, setResposta] = useState('')
  const [aberto, setAberto] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  return (
    <li className="px-4 py-3.5 sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-[200px] flex-1">
          <p className="text-sm font-medium text-ink">{item.question}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-2xs text-muted">
            {formatFull(item.created_at)}
            {item.intent && <Badge tone="neutral">{item.intent}</Badge>}
            {item.conversation_id && (
              <Link
                to={`/atendimentos?conversa=${item.conversation_id}`}
                className="inline-flex items-center gap-1 text-link hover:text-orange-500"
              >
                <MessageSquare className="size-3" />
                ver conversa
              </Link>
            )}
          </p>
          {item.ai_note && (
            <p className="mt-1 text-xs leading-snug text-ink/60">{item.ai_note}</p>
          )}
          {item.approved_answer && (
            <p className="mt-1.5 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs leading-relaxed text-emerald-900">
              {item.approved_answer}
            </p>
          )}
        </div>

        {canManage && !aberto && (
          <div className="flex shrink-0 items-center gap-1.5">
            <Button size="sm" onClick={() => setAberto(true)}>
              <Check className="size-4" />
              Responder
            </Button>
            <Button
              size="sm"
              variant="outline"
              loading={descartar.isPending}
              onClick={() => descartar.mutate(item.id)}
              title="Não vale a pena cadastrar"
            >
              <X className="size-4" />
            </Button>
          </div>
        )}
      </div>

      {aberto && (
        <div className="mt-3 space-y-2.5">
          {erro && <Alert tone="error">{erro}</Alert>}
          <TextArea
            label="Resposta oficial"
            autoFocus
            placeholder="Escreva como você responderia ao cliente."
            hint="Ao aprovar, esta frase entra nas respostas aprovadas e a IA passa a poder usar."
            value={resposta}
            onChange={(e) => setResposta(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              loading={aprovar.isPending}
              onClick={async () => {
                setErro(null)
                if (!resposta.trim()) {
                  setErro('Escreva a resposta antes de aprovar.')
                  return
                }
                try {
                  await aprovar.mutateAsync({
                    id: item.id,
                    question: item.question,
                    answer: resposta.trim(),
                  })
                  setAberto(false)
                } catch (err) {
                  setErro((err as Error).message)
                }
              }}
            >
              Aprovar e cadastrar
            </Button>
            <Button size="sm" variant="outline" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </li>
  )
}
