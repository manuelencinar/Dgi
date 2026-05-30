import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

const ADMIN_EMAIL = 'vayaebookk@gmail.com'

export async function POST(request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.email !== ADMIN_EMAIL) {
    return Response.json({ error: 'No autorizado' }, { status: 403 })
  }

  const { email, revoke, premiumUntil } = await request.json()
  if (!email) return Response.json({ error: 'Email requerido' }, { status: 400 })

  const serviceSupabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  // Find user by email
  let targetId = null
  let page = 1
  while (!targetId) {
    const { data: { users }, error } = await serviceSupabase.auth.admin.listUsers({ page, perPage: 1000 })
    if (error || !users?.length) break
    const found = users.find(u => u.email === email)
    if (found) { targetId = found.id; break }
    if (users.length < 1000) break
    page++
  }
  if (!targetId) return Response.json({ error: 'Usuario no encontrado' }, { status: 404 })

  const patch = revoke
    ? { plan: 'free', premium_until: null }
    : { plan: 'premium', premium_until: premiumUntil || null }

  const { data: existing } = await serviceSupabase
    .from('user_settings').select('user_id').eq('user_id', targetId).single()

  if (existing) {
    await serviceSupabase.from('user_settings').update(patch).eq('user_id', targetId)
  } else {
    await serviceSupabase.from('user_settings').insert({ user_id: targetId, dest_wht: 19, github_url: '', ...patch })
  }

  return Response.json({ ok: true, email, ...patch })
}
