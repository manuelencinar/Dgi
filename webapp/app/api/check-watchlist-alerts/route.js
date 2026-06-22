import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { DICT } from '@/data/dict'
import { sendEmail, emailShell, emailButton, APP_URL } from '@/lib/email'
import { priceForYield } from '@/lib/watchlist'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const ADMIN_EMAIL = 'vayaebookk@gmail.com'
// Umbrales de la alerta "zona de compra" (alineados con el gate de buyZoneReason).
const BUYZONE_MIN_SCORE = 6.5
const BUYZONE_MIN_MOS = 0.20

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
}

const NAME_OF = Object.fromEntries(DICT.map(d => [d[1], d[0]]))
const CUR_SYM = { EUR: '€', USD: '$', GBP: '£', GBp: 'p', JPY: '¥', CHF: 'Fr', CAD: 'C$', AUD: 'A$' }
function fmtPx(v, cur) {
  if (v == null) return '—'
  const s = CUR_SYM[cur] || ''
  const n = Number(v).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return cur === 'EUR' ? `${n} ${s}` : `${s}${n}`
}

export async function GET(request) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const client = sb()

  // 1. Entradas con alguna alerta activa.
  const { data: rows } = await client.from('watchlist').select('*')
    .or('alert_price_active.eq.true,alert_yield_active.eq.true,alert_buyzone_active.eq.true')
  if (!rows?.length) return NextResponse.json({ checked: 0, fired: 0, message: 'Sin alertas activas' })

  const tickers = [...new Set(rows.map(r => r.ticker))]

  // 2. Precio actual (último cierre de daily_prices) + fundamentales (dps, valor intrínseco)
  //    + último Score DGI (score_history) para la alerta "zona de compra".
  const cutoff = new Date(Date.now() - 10 * 86400000).toISOString().slice(0, 10)
  const [{ data: priceRows }, { data: funds }, { data: scoreRows }] = await Promise.all([
    client.from('daily_prices').select('ticker, close_price, date').in('ticker', tickers).gte('date', cutoff).order('date', { ascending: false }),
    client.from('company_fundamentals').select('ticker, dps, current_price, intrinsic_value').in('ticker', tickers),
    client.from('score_history').select('ticker, score, date').in('ticker', tickers).order('date', { ascending: false }),
  ])
  const priceMap = {}
  for (const p of priceRows || []) if (!(p.ticker in priceMap)) priceMap[p.ticker] = Number(p.close_price)
  const fundMap = Object.fromEntries((funds || []).map(f => [f.ticker, f]))
  const scoreMap = {}
  for (const s of scoreRows || []) if (!(s.ticker in scoreMap)) scoreMap[s.ticker] = Number(s.score)

  // 3. Plan de cada usuario (para decidir si se envía email).
  const userIds = [...new Set(rows.map(r => r.user_id))]
  const { data: settings } = await client.from('user_settings').select('user_id, plan, premium_until').in('user_id', userIds)
  const premiumOf = {}
  for (const s of settings || []) {
    premiumOf[s.user_id] = s.plan === 'premium' && (!s.premium_until || new Date(s.premium_until) >= new Date())
  }

  const currencyOf = Object.fromEntries(DICT.map(d => [d[1], d[3]]))
  let checked = 0, fired = 0
  const updates = []

  for (const r of rows) {
    checked++
    const f = fundMap[r.ticker]
    const price = priceMap[r.ticker] ?? (f?.current_price != null ? Number(f.current_price) : null)
    if (price == null) continue
    const currency = currencyOf[r.ticker] || 'EUR'
    const dps = f?.dps != null ? Number(f.dps) : null
    const yld = dps != null && price > 0 ? (dps / price) * 100 : null
    const patch = {}

    // ── Alerta de precio ──
    if (r.alert_price_active && r.target_price != null) {
      const inZone = price <= Number(r.target_price)
      if (inZone && !r.alert_price_triggered) {
        await fireAlert(client, r, 'watchlist_price', {
          price, currency, target: Number(r.target_price), intrinsic: f?.intrinsic_value,
          isPremium: !!premiumOf[r.user_id],
        })
        patch.alert_price_triggered = true; fired++
      } else if (!inZone && r.alert_price_triggered) {
        patch.alert_price_triggered = false
      }
    }

    // ── Alerta de yield ──
    if (r.alert_yield_active && r.target_yield != null && yld != null) {
      const inZone = yld >= Number(r.target_yield)
      if (inZone && !r.alert_yield_triggered) {
        await fireAlert(client, r, 'watchlist_yield', {
          price, currency, yld, target: Number(r.target_yield),
          neededPrice: priceForYield(dps, Number(r.target_yield)),
          isPremium: !!premiumOf[r.user_id],
        })
        patch.alert_yield_triggered = true; fired++
      } else if (!inZone && r.alert_yield_triggered) {
        patch.alert_yield_triggered = false
      }
    }

    // ── Alerta "zona de compra" (por valoración, sin precio objetivo manual) ──
    // Entra en zona cuando el Score DGI es bueno Y hay margen de seguridad: el
    // usuario no tiene que adivinar a qué precio está barata.
    if (r.alert_buyzone_active) {
      const score = scoreMap[r.ticker]
      const iv = f?.intrinsic_value != null ? Number(f.intrinsic_value) : null
      const mos = iv != null && price > 0 ? (iv - price) / price : null
      const inZone = score != null && score >= BUYZONE_MIN_SCORE && mos != null && mos >= BUYZONE_MIN_MOS
      if (inZone && !r.alert_buyzone_triggered) {
        await fireAlert(client, r, 'watchlist_buyzone', {
          price, currency, score, mos: mos * 100, intrinsic: iv,
          isPremium: !!premiumOf[r.user_id],
        })
        patch.alert_buyzone_triggered = true; fired++
      } else if (!inZone && r.alert_buyzone_triggered) {
        patch.alert_buyzone_triggered = false
      }
    }

    if (Object.keys(patch).length) updates.push(client.from('watchlist').update(patch).eq('id', r.id))
  }

  await Promise.all(updates).catch(() => {})

  try {
    await client.from('admin_logs').insert({
      event_type: 'watchlist_alerts',
      description: `Alertas watchlist: ${checked} comprobadas · ${fired} disparadas`,
      details: { checked, fired },
      status: 'ok',
    })
  } catch {}

  return NextResponse.json({ checked, fired })
}

// Crea la notificación in-app y, si el usuario es premium, envía el email.
async function fireAlert(client, row, type, info) {
  const name = NAME_OF[row.ticker] || row.ticker
  const isPrice = type === 'watchlist_price'
  const isBuyzone = type === 'watchlist_buyzone'
  const message = isBuyzone
    ? `${name} está en zona de compra: Score DGI ${info.score.toFixed(1)} y margen de seguridad +${info.mos.toFixed(0)}%`
    : isPrice
    ? `${name} ha llegado a tu precio objetivo (${fmtPx(info.price, info.currency)}, objetivo ${fmtPx(info.target, info.currency)})`
    : `${name} ha alcanzado tu yield objetivo (${info.yld.toFixed(2)}%, objetivo ${Number(info.target).toFixed(2)}%)`

  await client.from('notifications').insert({
    user_id: row.user_id, type, ticker: row.ticker, message,
  })

  if (!info.isPremium) return // alertas por email solo premium

  if (isBuyzone) {
    try {
      const { data: u } = await client.auth.admin.getUserById(row.user_id)
      const email = u?.user?.email
      if (!email) return
      const body = `
        <p style="color:#c8d0e0;font-size:15px;margin:0 0 16px"><strong style="color:#e0e8f0">${name}</strong> ha entrado en <strong style="color:#34d399">zona de compra</strong>.</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;color:#c8d0e0">
          <tr><td style="padding:4px 0;color:#4a5270">Precio actual</td><td align="right" style="padding:4px 0;font-weight:bold">${fmtPx(info.price, info.currency)}</td></tr>
          <tr><td style="padding:4px 0;color:#4a5270">Score DGI</td><td align="right" style="padding:4px 0;color:#34d399;font-weight:bold">${info.score.toFixed(1)}/10</td></tr>
          <tr><td style="padding:4px 0;color:#4a5270">Margen de seguridad</td><td align="right" style="padding:4px 0;color:#34d399;font-weight:bold">+${info.mos.toFixed(0)}%</td></tr>
        </table>
        ${emailButton(`${APP_URL}/empresa/${encodeURIComponent(row.ticker)}`, 'Ver empresa')}
        <p style="color:#4a5270;font-size:12px;margin:16px 0 0">Recibes este aviso porque pediste que te avisáramos cuando ${name} fuera una compra. Puedes desactivarlo en tu watchlist.</p>`
      await sendEmail(email, `🟢 ${row.ticker} está en zona de compra`, emailShell('Zona de compra', body))
    } catch {}
    return
  }

  try {
    const { data: u } = await client.auth.admin.getUserById(row.user_id)
    const email = u?.user?.email
    if (!email) return

    let mos = null
    if (info.intrinsic != null && info.price > 0) mos = ((Number(info.intrinsic) - info.price) / info.price) * 100

    const subject = isPrice
      ? `🎯 ${row.ticker} ha llegado a tu precio objetivo`
      : `🎯 ${row.ticker} ha alcanzado tu yield objetivo`

    const body = `
      <p style="color:#c8d0e0;font-size:15px;margin:0 0 16px"><strong style="color:#e0e8f0">${name}</strong></p>
      <table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;color:#c8d0e0">
        <tr><td style="padding:4px 0;color:#4a5270">Precio actual</td><td align="right" style="padding:4px 0;font-weight:bold">${fmtPx(info.price, info.currency)}</td></tr>
        ${isPrice
          ? `<tr><td style="padding:4px 0;color:#4a5270">Precio objetivo</td><td align="right" style="padding:4px 0">${fmtPx(info.target, info.currency)}</td></tr>`
          : `<tr><td style="padding:4px 0;color:#4a5270">Yield actual</td><td align="right" style="padding:4px 0;color:#34d399;font-weight:bold">${info.yld.toFixed(2)}%</td></tr>
             <tr><td style="padding:4px 0;color:#4a5270">Yield objetivo</td><td align="right" style="padding:4px 0">${Number(info.target).toFixed(2)}%</td></tr>`}
        ${mos != null ? `<tr><td style="padding:4px 0;color:#4a5270">Margen de seguridad</td><td align="right" style="padding:4px 0;color:${mos >= 0 ? '#34d399' : '#f87171'};font-weight:bold">${mos >= 0 ? '+' : ''}${mos.toFixed(0)}%</td></tr>` : ''}
      </table>
      ${emailButton(`${APP_URL}/empresa/${encodeURIComponent(row.ticker)}`, 'Ver empresa')}
      <p style="color:#4a5270;font-size:12px;margin:16px 0 0">Recibes este aviso porque sigues ${name} en tu watchlist. Puedes desactivar las alertas desde la página de watchlist.</p>`

    await sendEmail(email, subject, emailShell(isPrice ? 'Alerta de precio' : 'Alerta de yield', body))
  } catch {}
}
