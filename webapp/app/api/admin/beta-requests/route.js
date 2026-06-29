// Solicitudes de la oferta beta fundadores (admin): listar, activar (concede Premium
// 1 año al email) o rechazar.
import { NextResponse } from 'next/server'
import { requireAdmin, serviceClient } from '@/lib/admin'

export const dynamic = 'force-dynamic'

export async function GET() {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  const sb = serviceClient()
  const { data, error } = await sb.from('beta_requests').select('*').order('created_at', { ascending: false }).limit(500)
  if (error) return NextResponse.json({ requests: [], error: error.message })
  return NextResponse.json({ requests: data || [] })
}

async function findUserId(sb, email) {
  let page = 1
  for (;;) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 })
    if (error || !data?.users?.length) return null
    const found = data.users.find(u => (u.email || '').toLowerCase() === email)
    if (found) return found.id
    if (data.users.length < 1000) return null
    page++
  }
}

export async function POST(request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  let body
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Body inválido' }, { status: 400 }) }
  const id = body?.id
  const action = body?.action
  if (!id || !['activate', 'reject', 'pending'].includes(action)) return NextResponse.json({ error: 'Acción inválida' }, { status: 400 })

  const sb = serviceClient()
  const { data: req } = await sb.from('beta_requests').select('*').eq('id', id).maybeSingle()
  if (!req) return NextResponse.json({ error: 'Solicitud no encontrada' }, { status: 404 })

  if (action === 'reject') {
    await sb.from('beta_requests').update({ status: 'rejected' }).eq('id', id)
    return NextResponse.json({ ok: true })
  }
  if (action === 'pending') {
    await sb.from('beta_requests').update({ status: 'pending', activated_at: null }).eq('id', id)
    return NextResponse.json({ ok: true })
  }

  // activate → concede Premium 1 año al email de la solicitud
  const email = (req.email || '').toLowerCase()
  const userId = await findUserId(sb, email)
  if (!userId) return NextResponse.json({ error: 'No hay cuenta registrada con ese email. Pídele que se registre primero.' }, { status: 404 })

  const until = new Date(); until.setFullYear(until.getFullYear() + 1)
  const patch = { plan: 'premium', premium_until: until.toISOString() }
  const { data: existing } = await sb.from('user_settings').select('user_id').eq('user_id', userId).maybeSingle()
  if (existing) await sb.from('user_settings').update(patch).eq('user_id', userId)
  else await sb.from('user_settings').insert({ user_id: userId, dest_wht: 19, ...patch })

  await sb.from('beta_requests').update({ status: 'activated', activated_at: new Date().toISOString() }).eq('id', id)
  try { await sb.from('admin_logs').insert({ event_type: 'beta_activate', description: `Premium fundador activado: ${email} (hasta ${patch.premium_until.slice(0, 10)})`, status: 'ok' }) } catch {}
  return NextResponse.json({ ok: true, premium_until: patch.premium_until })
}
