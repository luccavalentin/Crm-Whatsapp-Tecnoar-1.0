import { useState } from 'react'
import { Bot, Check, Plus, Tag } from 'lucide-react'
import { Badge, SectionTitle } from '@/components/ui'
import { toneDaEtiqueta, useConversationTags, useTags, useToggleConversationTag } from '@/features/tags/api'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'

/**
 * Etiquetas do atendimento.
 *
 * O que a IA marcou aparece com o ícone dela: quem olha precisa saber se
 * aquilo foi decisão de máquina ou de gente. Clicar numa etiqueta sugerida
 * pela IA a confirma como humana; clicar de novo remove.
 */
export function ConversationTags({ conversationId }: { conversationId: string }) {
  const { company, profile } = useAuth()
  const { data: disponiveis } = useTags(company?.id)
  const { data: marcadas } = useConversationTags(conversationId)
  const alternar = useToggleConversationTag(company?.id, profile?.id)

  const [abrindo, setAbrindo] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const marcadasPorId = new Map((marcadas ?? []).map((m) => [m.tag_id, m]))
  const naoMarcadas = (disponiveis ?? []).filter((t) => !marcadasPorId.has(t.id))

  return (
    <section className="border-t border-line px-4 py-3.5">
      <SectionTitle
        action={
          (disponiveis?.length ?? 0) > 0 ? (
            <button
              type="button"
              onClick={() => setAbrindo((v) => !v)}
              className="inline-flex items-center gap-1 text-2xs font-medium text-link transition-colors hover:text-orange-500"
            >
              <Plus className="size-3" />
              {abrindo ? 'fechar' : 'marcar'}
            </button>
          ) : undefined
        }
      >
        Etiquetas
      </SectionTitle>

      {erro && <p className="mt-2 text-xs text-red-600">{erro}</p>}

      {(marcadas?.length ?? 0) === 0 && !abrindo && (
        <p className="mt-2 text-xs leading-snug text-muted">
          {(disponiveis?.length ?? 0) === 0
            ? 'Nenhuma etiqueta cadastrada. Crie em Configurações → Etiquetas.'
            : 'Nenhuma etiqueta neste atendimento.'}
        </p>
      )}

      {(marcadas?.length ?? 0) > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {(marcadas ?? []).map((m) =>
            m.tag ? (
              <button
                key={m.tag_id}
                type="button"
                title={m.by_ai ? 'Sugerida pela IA — clique para remover' : 'Clique para remover'}
                onClick={async () => {
                  setErro(null)
                  try {
                    await alternar.mutateAsync({
                      conversationId,
                      tagId: m.tag_id,
                      marcada: true,
                    })
                  } catch (err) {
                    setErro((err as Error).message)
                  }
                }}
                className="transition-opacity hover:opacity-70"
              >
                <Badge tone={toneDaEtiqueta(m.tag.color)} dot>
                  {m.by_ai && <Bot className="size-3" />}
                  {m.tag.name}
                </Badge>
              </button>
            ) : null,
          )}
        </div>
      )}

      {abrindo && naoMarcadas.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5 border-t border-line pt-2.5">
          {naoMarcadas.map((tag) => (
            <button
              key={tag.id}
              type="button"
              onClick={async () => {
                setErro(null)
                try {
                  await alternar.mutateAsync({
                    conversationId,
                    tagId: tag.id,
                    marcada: false,
                  })
                } catch (err) {
                  setErro((err as Error).message)
                }
              }}
              className={cn(
                'inline-flex items-center gap-1 rounded-md border border-dashed border-line-strong px-1.5 py-0.5',
                'text-2xs font-medium text-ink/60 transition-colors hover:border-muted hover:text-ink',
              )}
            >
              <Tag className="size-3" />
              {tag.name}
            </button>
          ))}
        </div>
      )}

      {abrindo && naoMarcadas.length === 0 && (disponiveis?.length ?? 0) > 0 && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
          <Check className="size-3.5" />
          Todas as etiquetas já estão neste atendimento.
        </p>
      )}
    </section>
  )
}
