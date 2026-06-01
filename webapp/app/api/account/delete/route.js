import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as adminClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const admin = adminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  )

  // Eliminar todos los datos del usuario
  await Promise.all([
    admin.from('positions').delete().eq('user_id', user.id),
    admin.from('transactions').delete().eq('user_id', user.id),
    admin.from('dividends_received').delete().eq('user_id', user.id),
    admin.from('recurring_contributions').delete().eq('user_id', user.id),
    admin.from('user_settings').delete().eq('user_id', user.id),
  ])

  // Eliminar el usuario de auth
  const { error } = await admin.auth.admin.deleteUser(user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
