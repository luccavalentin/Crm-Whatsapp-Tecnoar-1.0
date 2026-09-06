import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ShieldAlert } from 'lucide-react'
import { Card, EmptyState, FullPageLoader } from '@/components/ui'
import { usePermissions } from '@/features/permissions'

/** Bloqueia a área quando o usuário não tem a permissão exigida. */
export function RequirePermission({
  permission,
  children,
}: {
  permission: string
  children: ReactNode
}) {
  const { can, isLoading } = usePermissions()

  if (isLoading) return <FullPageLoader label="Verificando permissões…" />

  if (!can(permission)) {
    return (
      <div className="animate-in-fade px-4 py-8 sm:px-6">
        <Card>
          <EmptyState
            icon={ShieldAlert}
            title="Você não tem acesso a esta área"
            description="Peça ao gestor da empresa para liberar esta permissão."
            action={
              <Link
                to="/dashboard"
                className="text-sm font-medium text-orange-500 hover:text-orange-600"
              >
                Voltar ao dashboard
              </Link>
            }
          />
        </Card>
      </div>
    )
  }

  return <>{children}</>
}
