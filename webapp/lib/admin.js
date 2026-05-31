import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'

export const ADMIN_EMAIL = 'vayaebookk@gmail.com'

// Service-role client — ignora RLS. Solo en server.
export function serviceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  )
}

// Verifica el usuario actual y si es admin. Usa cookies de sesión.
export async function getAdminContext() {
  try {
    const supabase = await createAuthClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { user: null, isAdmin: false }

    if (user.email === ADMIN_EMAIL) return { user, isAdmin: true }

    const { data } = await supabase
      .from('user_settings')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle()

    return { user, isAdmin: data?.role === 'admin' }
  } catch {
    return { user: null, isAdmin: false }
  }
}

// Para API routes: devuelve el user si es admin, null en caso contrario.
export async function requireAdmin() {
  const { user, isAdmin } = await getAdminContext()
  return isAdmin ? user : null
}
