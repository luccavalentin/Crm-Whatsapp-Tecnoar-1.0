import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'

export function adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}

export interface AuthContext {
  userId: string
  companyId: string
  role: string
  fullName: string
}

/** Valida o JWT do usuário e devolve o contexto de empresa. */
export async function requireUser(req: Request): Promise<AuthContext | null> {
  const authorization = req.headers.get('Authorization')
  if (!authorization) return null

  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } },
  )

  const { data, error } = await userClient.auth.getUser()
  if (error || !data.user) return null

  const admin = adminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('id, company_id, role, status, full_name')
    .eq('id', data.user.id)
    .maybeSingle()

  if (!profile || !profile.company_id || profile.status !== 'active') return null

  return {
    userId: profile.id,
    companyId: profile.company_id,
    role: profile.role,
    fullName: profile.full_name ?? '',
  }
}
