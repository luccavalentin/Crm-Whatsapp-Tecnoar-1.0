import { json, preflight } from '../_shared/cors.ts'
import { adminClient, requireUser } from '../_shared/supabase.ts'

type Action = 'create' | 'invite' | 'reset-password'

/**
 * Criação de contas da equipe.
 * Só gestores com permissão `equipe.gerenciar` podem chamar.
 */
Deno.serve(async (req) => {
  const pre = preflight(req)
  if (pre) return pre
  if (req.method !== 'POST') return json({ error: 'Metodo nao permitido' }, 405)

  const auth = await requireUser(req)
  if (!auth) return json({ error: 'Nao autorizado' }, 401)

  const admin = adminClient()

  const { data: allowed } = await admin.rpc('effective_permissions', { p_user_id: auth.userId })
  const permissions = (allowed ?? {}) as Record<string, boolean>
  if (!(permissions['*'] || permissions['equipe.gerenciar'])) {
    return json({ error: 'Sem permissao para gerenciar a equipe' }, 403)
  }

  let body: {
    action?: Action
    email?: string
    password?: string
    fullName?: string
    userId?: string
    role?: 'admin' | 'manager' | 'agent'
    permissions?: Record<string, boolean>
  }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Corpo invalido' }, 400)
  }

  const email = (body.email ?? '').trim().toLowerCase()
  const role = body.role ?? 'agent'
  if (!['admin', 'manager', 'agent'].includes(role)) {
    return json({ error: 'Papel invalido' }, 400)
  }

  switch (body.action) {
    case 'create': {
      if (!email) return json({ error: 'Informe o e-mail' }, 400)
      if (!body.password || body.password.length < 8) {
        return json({ error: 'A senha deve ter no minimo 8 caracteres.' }, 400)
      }

      const { data: created, error } = await admin.auth.admin.createUser({
        email,
        password: body.password,
        email_confirm: true,
        user_metadata: {
          full_name: body.fullName ?? '',
          company_id: auth.companyId,
          role,
        },
      })

      if (error) {
        const message = /already been registered|already exists/i.test(error.message)
          ? 'Ja existe uma conta com este e-mail.'
          : error.message
        return json({ error: message }, 400)
      }

      // O gatilho do banco cria o perfil; garantimos papel e permissoes
      await admin
        .from('profiles')
        .update({
          company_id: auth.companyId,
          role,
          full_name: body.fullName ?? '',
          permissions: body.permissions ?? {},
        })
        .eq('id', created.user!.id)

      return json({ ok: true, userId: created.user!.id })
    }

    case 'invite': {
      if (!email) return json({ error: 'Informe o e-mail' }, 400)
      const { data: invited, error } = await admin.auth.admin.inviteUserByEmail(email, {
        data: { full_name: body.fullName ?? '', company_id: auth.companyId, role },
      })

      if (error) {
        return json(
          {
            error:
              'Nao foi possivel enviar o convite por e-mail: ' +
              error.message +
              '. Voce pode criar a conta definindo uma senha inicial.',
          },
          400,
        )
      }

      await admin
        .from('profiles')
        .update({
          company_id: auth.companyId,
          role,
          full_name: body.fullName ?? '',
          permissions: body.permissions ?? {},
        })
        .eq('id', invited.user!.id)

      return json({ ok: true, userId: invited.user!.id, invited: true })
    }

    case 'reset-password': {
      if (!body.userId) return json({ error: 'Informe o usuario' }, 400)
      if (!body.password || body.password.length < 8) {
        return json({ error: 'A senha deve ter no minimo 8 caracteres.' }, 400)
      }

      const { data: target } = await admin
        .from('profiles')
        .select('id, company_id')
        .eq('id', body.userId)
        .maybeSingle()

      if (!target || target.company_id !== auth.companyId) {
        return json({ error: 'Usuario nao encontrado' }, 404)
      }

      const { error } = await admin.auth.admin.updateUserById(target.id, {
        password: body.password,
      })
      if (error) return json({ error: error.message }, 400)

      return json({ ok: true })
    }

    default:
      return json({ error: 'Acao invalida' }, 400)
  }
})
