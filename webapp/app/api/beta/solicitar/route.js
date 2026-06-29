// Registro de una solicitud de la oferta beta fundadores (el usuario dice que ha
// hecho el Bizum). Se guarda para que el admin active Premium a mano.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function svc() { return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY) }

export async function POST(request) {
  let body
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Body inválido' }, { status: 400 }) }
  const email = String(body?.email || '').trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ error: 'Introduce un email válido' }, { status: 400 })
  const name = body?.name ? String(body.name).slice(0, 120) : null
  const bizum_ref = body?.bizum_ref ? String(body.bizum_ref).slice(0, 120) : null

  const sb = svc()
  // Evita duplicar una solicitud pendiente del mismo email.
  try {
    const { data: existing } = await sb.from('beta_requests').select('id, status').eq('email', email).order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (existing && existing.status === 'pending') return NextResponse.json({ ok: true, already: true })
  } catch {}

  const { error } = await sb.from('beta_requests').insert({ email, name, bizum_ref })
  if (error) return NextResponse.json({ error: error.message }, { status: 200 })
  return NextResponse.json({ ok: true })
}
