import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { DICT } from '@/data/dict'
import { dividendTrend } from '@/lib/helpers'
import { sendEmail, emailShell, emailButton, APP_URL } from '@/lib/email'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Detector de CAMBIOS de dividendo: recortes (rompen la tesis DGI) y subidas (el
// evento que celebra el DGI). Notifica a quien TIENE la empresa (positions) o la
// SIGUE (watchlist) según el último año completo registrado. In-app siempre;
// email solo premium. Dedup: una notificación por usuario+ticker+tipo al año.

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
}
const NAME_OF = Object.fromEntries(DICT.map(d => [d[1], d[0]]))
const pct = g => `${Number(g).toFixed(1).replace('.', ',')}%`

// Último año COMPLETO de div_history con su crecimiento (magnitud del cambio).
function lastFullYear(history) {
  const full = (history || []).filter(h => h && !h.isPartial && h.growth != null).sort((a, b) => a.year - b.year)
  const last = full[full.length - 1]
  return last ? { year: last.year, growth: Number(last.growth) } : null
}

async function fundamentalsFor(client, tickers) {
  const out = []
  for (let i = 0; i < tickers.length; i += 300) {
    const batch = tickers.slice(i, i + 300)
    const { data } = await client.from('company_fundamentals')
      .select('ticker, div_history').in('ticker', batch)
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
  if (!tickers.length) return NextResponse.json({ checked: 0, cuts: 0, raises: 0, fired: 0, message: 'Sin posiciones ni watchlist' })

  // 2. Clasificar cada ticker: recorte o subida en el último año completo.
  //    Recorte: crecimiento < 0 (lastYear >= nowYear-2, algo más laxo).
  //    Subida:  crecimiento > 0,5% (lastYear >= nowYear-1, solo subidas recientes).
  const funds = await fundamentalsFor(client, tickers)
  const events = {}   // ticker -> { type, year, growth, streak }
  for (const f of funds) {
    const lf = lastFullYear(f.div_history)
    if (!lf) continue
    const trend = dividendTrend(f.div_history)
    if (lf.growth < 0 && lf.year >= nowYear - 2) {
      events[f.ticker] = { type: 'dividend_cut', year: lf.year, growth: lf.growth, streak: trend?.down ?? 1 }
    } else if (lf.growth > 0.5 && lf.year >= nowYear - 1) {
      events[f.ticker] = { type: 'dividend_increase', year: lf.year, growth: lf.growth, streak: trend?.pos ?? 1 }
    }
  }
  const affected = Object.keys(events)
  if (!affected.length) return NextResponse.json({ checked: tickers.length, cuts: 0, raises: 0, fired: 0 })

  // 3. Usuarios afectados + planes + notificaciones previas (dedup anual por tipo).
  const userIds = [...new Set(affected.flatMap(t => [...holders[t]]))]
  const since = new Date(Date.now() - 365 * 86400000).toISOString()
  const [{ data: settings }, { data: prior }] = await Promise.all([
    client.from('user_settings').select('user_id, plan, premium_until').in('user_id', userIds),
    client.from('notifications').select('user_id, ticker, type').in('type', ['dividend_cut', 'dividend_increase']).in('ticker', affected).gte('created_at', since),
  ])
  const premiumOf = {}
  for (const s of settings || []) premiumOf[s.user_id] = s.plan === 'premium' && (!s.premium_until || new Date(s.premium_until) >= new Date())
  const alreadyNotified = new Set((prior || []).map(n => `${n.type}|${n.user_id}|${n.ticker}`))

  let cuts = 0, raises = 0, fired = 0
  for (const ticker of affected) {
    const ev = events[ticker]
    const name = NAME_OF[ticker] || ticker
    if (ev.type === 'dividend_cut') cuts++; else raises++
    for (const userId of holders[ticker]) {
      if (alreadyNotified.has(`${ev.type}|${userId}|${ticker}`)) continue
      const message = ev.type === 'dividend_cut'
        ? (ev.streak >= 2
            ? `${name} lleva ${ev.streak} años recortando el dividendo (último: ${ev.year}). Revisa la tesis.`
            : `${name} ha recortado su dividendo en ${ev.year}. Revisa la tesis.`)
        : (ev.streak >= 2
            ? `${name} ha vuelto a subir el dividendo (+${pct(ev.growth)} en ${ev.year}, ${ev.streak} años seguidos). Tu yield on cost sube.`
            : `${name} ha subido el dividendo un ${pct(ev.growth)} en ${ev.year}. Tu yield on cost sube.`)
      await client.from('notifications').insert({ user_id: userId, type: ev.type, ticker, message })
      fired++
      if (premiumOf[userId]) { try { await emailEvent(client, userId, ticker, name, ev) } catch {} }
    }
  }

  try {
    await client.from('admin_logs').insert({
      event_type: 'dividend_changes',
      description: `Cambios de dividendo: ${cuts} recortes · ${raises} subidas · ${fired} avisos`,
      details: { checked: tickers.length, cuts, raises, fired }, status: 'ok',
    })
  } catch {}

  return NextResponse.json({ checked: tickers.length, cuts, raises, fired })
}

async function emailEvent(client, userId, ticker, name, ev) {
  const { data: u } = await client.auth.admin.getUserById(userId)
  const email = u?.user?.email
  if (!email) return

  if (ev.type === 'dividend_cut') {
    const lead = ev.streak >= 2
      ? `<strong style="color:#e0e8f0">${name}</strong> lleva <strong style="color:#f87171">${ev.streak} años</strong> recortando su dividendo (último ejercicio: ${ev.year}).`
      : `<strong style="color:#e0e8f0">${name}</strong> ha <strong style="color:#f87171">recortado su dividendo</strong> en ${ev.year}.`
    const body = `
      <p style="color:#c8d0e0;font-size:15px;margin:0 0 16px">${lead}</p>
      <p style="color:#8090a8;font-size:14px;margin:0 0 16px;line-height:1.55">Un recorte suele señalar deterioro del negocio o presión financiera. Buen momento para revisar tu tesis: salud financiera, payout y por qué lo mantienes.</p>
      ${emailButton(`${APP_URL}/empresa/${encodeURIComponent(ticker)}`, 'Revisar la empresa')}
      <p style="color:#4a5270;font-size:12px;margin:16px 0 0">Recibes este aviso porque tienes o sigues ${name}.</p>`
    await sendEmail(email, `⚠️ ${ticker} ha recortado su dividendo`, emailShell('Recorte de dividendo', body))
    return
  }

  // Subida de dividendo
  const lead = ev.streak >= 2
    ? `<strong style="color:#e0e8f0">${name}</strong> ha vuelto a <strong style="color:#34d399">subir su dividendo un ${pct(ev.growth)}</strong> en ${ev.year} (${ev.streak} años seguidos).`
    : `<strong style="color:#e0e8f0">${name}</strong> ha <strong style="color:#34d399">subido su dividendo un ${pct(ev.growth)}</strong> en ${ev.year}.`
  const body = `
    <p style="color:#c8d0e0;font-size:15px;margin:0 0 16px">${lead}</p>
    <p style="color:#8090a8;font-size:14px;margin:0 0 16px;line-height:1.55">Esto es exactamente lo que busca un inversor de dividendos crecientes: tu <strong style="color:#c8d0e0">yield on cost</strong> sube sin mover un dedo. La renta que te genera esta posición acaba de crecer.</p>
    ${emailButton(`${APP_URL}/empresa/${encodeURIComponent(ticker)}`, 'Ver la empresa')}
    <p style="color:#4a5270;font-size:12px;margin:16px 0 0">Recibes este aviso porque tienes o sigues ${name}.</p>`
  await sendEmail(email, `📈 ${ticker} ha subido su dividendo un ${pct(ev.growth)}`, emailShell('Subida de dividendo', body))
}
