import type { ReactNode } from 'react'
import { Bot, MessagesSquare, ShieldCheck } from 'lucide-react'
import { Logo } from '@/components/Logo'

const HIGHLIGHTS = [
  { icon: MessagesSquare, title: 'Atendimento em tempo real', text: 'WhatsApp oficial integrado ao CRM.' },
  { icon: Bot, title: 'Inteligência artificial', text: 'Classificação, resumo e triagem automática.' },
  { icon: ShieldCheck, title: 'Histórico permanente', text: 'Cada cliente com memória completa.' },
]

export function AuthShell({
  title,
  description,
  children,
  footer,
}: {
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className="flex min-h-screen bg-canvas">
      {/* Painel institucional */}
      <div className="relative hidden w-[46%] max-w-[560px] flex-col justify-between overflow-hidden bg-navy-900 p-10 lg:flex">
        <div
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            background:
              'radial-gradient(60% 50% at 15% 0%, rgba(0,175,239,0.20) 0%, transparent 60%), radial-gradient(50% 45% at 95% 100%, rgba(255,102,0,0.16) 0%, transparent 60%)',
          }}
        />
        <div className="relative">
          <Logo variant="dark" className="w-[188px]" />
        </div>

        <div className="relative">
          <h2 className="max-w-sm text-balance text-3xl font-semibold leading-snug text-white">
            CRM de atendimento WhatsApp com inteligência artificial
          </h2>
          <ul className="mt-8 space-y-5">
            {HIGHLIGHTS.map((item) => (
              <li key={item.title} className="flex gap-3.5">
                <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.07] text-cyan-400">
                  <item.icon className="size-[18px]" />
                </span>
                <span>
                  <span className="block text-sm font-medium text-white/90">{item.title}</span>
                  <span className="block text-xs text-white/45">{item.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-2xs text-white/30">
          © {new Date().getFullYear()} Tecnoar Freios · Sistema interno de atendimento
        </p>
      </div>

      {/* Formulário */}
      <div className="flex min-w-0 flex-1 items-center justify-center px-5 py-10 sm:px-8">
        <div className="animate-in-rise w-full max-w-[400px]">
          <div className="mb-8 lg:hidden">
            <Logo className="w-[150px]" />
          </div>

          <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
          {description && <p className="mt-1.5 text-sm text-muted">{description}</p>}

          <div className="mt-7">{children}</div>

          {footer && <div className="mt-6 text-center text-sm text-muted">{footer}</div>}
        </div>
      </div>
    </div>
  )
}
