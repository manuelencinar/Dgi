// Webhook de Paddle Billing: concede/renueva/revoca Premium según la suscripción.
// Verifica la firma HMAC (Paddle-Signature) con PADDLE_WEBHOOK_SECRET.
import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function svc() { return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY) }
const GRACE_MS = 3 * 24 * 3600 * 1000   // margen para que un fallo de cobro no corte el acceso al instante

// Verifica la firma de Paddle: header "ts=...;h1=<hmac_sha256(secret, `${ts}:${body}`)>".
function verify(sigHeader, rawBody, secret) {
  if (!sigHeader || !secret) return false
  const parts = Object.fromEntries(sigHeader.split(';').map(p => p.split('=')))
  const ts = parts.ts, h1 = parts.h1
  if (!ts || !h1) return false
  const digest = crypto.createHmac('sha256', secret).update(`${ts}:${rawBody}`).digest('hex')
  try { return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(h1)) } catch { return false }
}

async function findUserId(sb, data) {
  const fromCustom = data?.custom_data?.user_id
  if (fromCustom) return fromCustom
  // Renovaciones: buscar por el customer de Paddle ya guardado.
  const cust = data?.customer_id || data?.customer?.id
  if (cust) {
    const { data: row } = await sb.from('user_settings').select('user_id').eq('paddle_customer_id', cust).maybeSingle()
    if (row) return row.user_id
  }
  return null
}

async function setPremium(sb, userId, patch) {
  const { data: existing } = await sb.from('user_settings').select('user_id').eq('user_id', userId).maybeSingle()
  if (existing) await sb.from('user_settings').update(patch).eq('user_id', userId)
  else await sb.from('user_settings').insert({ user_id: userId, dest_wht: 19, ...patch })
}

export async function POST(request) {
  const raw = await request.text()
  const secret = process.env.PADDLE_WEBHOOK_SECRET
  if (secret && !verify(request.headers.get('paddle-signature'), raw, secret)) {
    return NextResponse.json({ error: 'firma inválida' }, { status: 400 })
  }

  let evt
  try { evt = JSON.parse(raw) } catch { return NextResponse.json({ error: 'body inválido' }, { status: 400 }) }
  const type = evt?.event_type || ''
  const data = evt?.data || {}

  const sb = svc()
  const userId = await findUserId(sb, data)
  if (!userId) return NextResponse.json({ ok: true, note: 'sin user_id' })   // 200: no reintentar

  try {
    if (type.startsWith('subscription.')) {
      const status = data.status
      const subId = data.id || null
      const custId = data.customer_id || null
      const endsAt = data?.current_billing_period?.ends_at || data?.next_billed_at || null

      if (status === 'active' || status === 'trialing') {
        const until = endsAt ? new Date(new Date(endsAt).getTime() + GRACE_MS).toISOString() : null
        await setPremium(sb, userId, { plan: 'premium', premium_until: until, paddle_subscription_id: subId, paddle_customer_id: custId })
      } else if (status === 'canceled' || status === 'paused' || status === 'past_due') {
        // Mantener el acceso hasta el fin del periodo ya pagado; luego expira solo.
        const until = endsAt ? new Date(endsAt).toISOString() : new Date().toISOString()
        await setPremium(sb, userId, { premium_until: until })
      }
    } else if (type === 'transaction.completed') {
      // Primer pago / pago puntual: asegura Premium aunque el evento de suscripción llegue después.
      const custId = data.customer_id || null
      const subId = data.subscription_id || null
      await setPremium(sb, userId, { plan: 'premium', paddle_customer_id: custId, ...(subId ? { paddle_subscription_id: subId } : {}) })
    }

    try { await sb.from('admin_logs').insert({ event_type: 'paddle', description: `${type} · user ${userId}`, status: 'ok' }) } catch {}
  } catch (e) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 200 })   // 200: evita reintentos en bucle
  }

  return NextResponse.json({ ok: true })
}
