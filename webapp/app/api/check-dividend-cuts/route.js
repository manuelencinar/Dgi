import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { DICT } from '@/data/dict'
import { dividendTrend } from '@/lib/helpers'
import { sendEmail, emailShell, emailButton, APP_URL } from '@/lib/email'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Detector de recortes de dividendo: el evento que rompe la tesis DGI. Notifica a
// quien TIENE la empresa (positions) o la SIGUE (watchlist) cuando el último año
// completo registrado recorta el dividendo. In-app siempre; email solo premium.
// Dedup: una sola notificación por usuario+ticker al año (los recortes son anuales).

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
}
const NAME_OF = Object.fromEntries(DICT.map(d => [d[1], d[0]]))

async function fundamentalsFor(client, tickers) {
  const out = []
  for (let i = 0; i < tickers.length; i += 300) {
    const batch = tickers.slice(i, i + 300)
    const { data } = await client.from('company_fundamentals')
      .select('ticker, div_history, dps').in('ticker', batch)
    if (data) out.push(...data)
  }
  return out
}

export async function GET(request) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const client = sb()
  const nowYear = new Date().getFullYear()

  // 1. Tickers que alguien tiene o sigue (universo reducido → sin paginar fundamentals enteros).
  const [{ data: positions }, { data: watch }] = await Promise.all([
    client.from('positions').select('ticker, user_id, asset_type'),
    client.from('watchlist').select('ticker, user_id'),
  ])
  const holders = {}   // ticker -> Set(user_id)
  for (const p of positions || []) {
    if ((p.asset_type || 'stock') !== 'stock') continue   // ETFs/fondos no aplican
    ;(holders[p.ticker] ||= new Set()).add(p.user_id)
  }
  for (const w of watch || []) (holders[w.ticker] ||= new Set()).add(w.user_id)

  const tickers = Object.keys(holders)
  if (!tickers.length) return NextResponse.json({ checked: 0, cuts: 0, fired: 0, message: 'Sin posiciones ni watchlist' })

  // 2. ¿Qué tickers han recortado en el último año completo?
  const funds = await fundamentalsFor(client, tickers)
  const cutTickers = {}   // ticker -> { year, down }
  for (const f of funds) {
    const trend = dividendTrend(f.div_history)
    if (trend && trend.down >= 1 && trend.lastYear >= nowYear - 2) {
      cutTickers[f.ticker] = { year: trend.lastYear, down: trend.down }
    }
  }
  const affected = Object.keys(cutTickers)
  if (!affected.length) return NextResponse.json({ checked: tickers.length, cuts: 0, fired: 0 })

  // 3. Usuarios afectados + sus planes + notificaciones previas (dedup anual).
  const userIds = [...new Set(affected.flatMap(t => [...holders[t]]))]
  const since = new Date(Date.now() - 365 * 86400000).toISOString()
  const [{ data: settings }, { data: prior }] = await Promise.all([
    client.from('user_settings').select('user_id, plan, premium_until').in('user_id', userIds),
    client.from('notifications').select('user_id, ticker').eq('type', 'dividend_cut').in('ticker', affected).gte('created_at', since),
  ])
  const premiumOf = {}
  for (const s of settings || []) premiumOf[s.user_id] = s.plan === 'premium' && (!s.premium_until || new Date(s.premium_until) >= new Date())
  const alreadyNotified = new Set((prior || []).map(n => `${n.user_id}|${n.ticker}`))

  let fired = 0
  for (const ticker of affected) {
    const { year, down } = cutTickers[ticker]
    const name = NAME_OF[ticker] || ticker
    for (const userId of holders[ticker]) {
      if (alreadyNotified.has(`${userId}|${ticker}`)) continue
      const message = down >= 2
        ? `${name} lleva ${down} años recortando el dividendo (último: ${year}). Revisa la tesis.`
        : `${name} ha recortado su dividendo en ${year}. Revisa la tesis.`
      await client.from('notifications').insert({ user_id: userId, type: 'dividend_cut', ticker, message })
      fired++
      if (premiumOf[userId]) { try { await emailCut(client, userId, ticker, name, year, down) } catch {} }
    }
  }

  try {
    await client.from('admin_logs').insert({
      event_type: 'dividend_cuts',
      description: `Recortes de dividendo: ${affected.length} empresas · ${fired} avisos`,
      details: { checked: tickers.length, cuts: affected.length, fired }, status: 'ok',
    })
  } catch {}

  return NextResponse.json({ checked: tickers.length, cuts: affected.length, fired })
}

async function emailCut(client, userId, ticker, name, year, down) {
  const { data: u } = await client.auth.admin.getUserById(userId)
  const email = u?.user?.email
  if (!email) return
  const lead = down >= 2
    ? `<strong style="color:#e0e8f0">${name}</strong> lleva <strong style="color:#f87171">${down} años</strong> recortando su dividendo (último ejercicio: ${year}).`
    : `<strong style="color:#e0e8f0">${name}</strong> ha <strong style="color:#f87171">recortado su dividendo</strong> en ${year}.`
  const body = `
    <p style="color:#c8d0e0;font-size:15px;margin:0 0 16px">${lead}</p>
    <p style="color:#8090a8;font-size:14px;margin:0 0 16px;line-height:1.55">Un recorte de dividendo suele señalar deterioro del negocio o presión financiera. Es buen momento para revisar tu tesis: salud financiera, payout y por qué lo mantienes en cartera.</p>
    ${emailButton(`${APP_URL}/empresa/${encodeURIComponent(ticker)}`, 'Revisar la empresa')}
    <p style="color:#4a5270;font-size:12px;margin:16px 0 0">Recibes este aviso porque tienes o sigues ${name}.</p>`
  await sendEmail(email, `⚠️ ${ticker} ha recortado su dividendo`, emailShell('Recorte de dividendo', body))
}
