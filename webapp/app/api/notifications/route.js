import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

async function getUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return { supabase, user }
}

// GET — últimas notificaciones del usuario (?limit=N, por defecto 20) + nº no leídas.
export async function GET(request) {
  const { supabase, user } = await getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const limit = Math.min(Number(new URL(request.url).searchParams.get('limit')) || 20, 100)
  const [{ data }, { count }] = await Promise.all([
    supabase.from('notifications').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(limit),
    supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('read', false),
  ])
  return NextResponse.json({ items: data || [], unread: count || 0 })
}

// POST — marca como leídas. { all: true } o { id: '...' }.
export async function POST(request) {
  const { supabase, user } = await getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const body = await request.json().catch(() => ({}))
  let q = supabase.from('notifications').update({ read: true }).eq('user_id', user.id)
  if (body.id) q = q.eq('id', body.id)
  else q = q.eq('read', false)
  const { error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
