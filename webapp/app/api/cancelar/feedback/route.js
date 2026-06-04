import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as serviceClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function sb() {
  return serviceClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
}

export async function POST(request) {
  const auth = await createClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  let content = '', type = 'cancellation'
  try { ({ content, type } = await request.json()) } catch {}
  if (!content || !content.trim()) return NextResponse.json({ error: 'Sin contenido' }, { status: 400 })

  const { error } = await sb().from('feedback').insert({
    user_id: user.id,
    type: type || 'cancellation',
    content: content.trim(),
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
