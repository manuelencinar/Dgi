import { NextResponse } from 'next/server'
import { requireAdmin, serviceClient } from '@/lib/admin'

export const dynamic     = 'force-dynamic'
export const maxDuration = 60

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'

// Descarga 6 años de cierres diarios de Yahoo para un ticker y los archiva en daily_prices.
async function backfillToDaily(sb, ticker) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=6y&interval=1d`
  const res = await fetch(url, { headers: { 'User-Agent': UA }, cache: 'no-store' })
  if (!res.ok) return false
  const json = await res.json()
  const r = json?.chart?.result?.[0]
  if (!r) return false
  const ts = r.timestamp || [], cl = r.indicators?.quote?.[0]?.close || []
  const now = new Date().toISOString()
  const rows = []
  for (let i = 0; i < ts.length; i++) {
    const c = cl[i]
    if (c == null || c <= 0) continue
    rows.push({ ticker, date: new Date(ts[i] * 1000).toISOString().slice(0, 10), close_price: Math.round(c * 10000) / 10000, updated_at: now })
  }
  if (!rows.length) return false
  for (let i = 0; i < rows.length; i += 1000) await sb.from('daily_prices').upsert(rows.slice(i, i + 1000), { onConflict: 'ticker,date' })
  return true
}

// Precio más cercano (en o antes) a una fecha objetivo, dentro de una ventana.
function priceNear(rows, targetStr, windowDays = 14) {
  const target = new Date(targetStr).getTime()
  let best = null, bestDiff = Infinity
  for (const r of rows) {
    const d = new Date(r.date).getTime()
    if (d > target + 3 * 86400000) continue // no usar precios muy posteriores
    const diff = Math.abs(d - target)
    if (diff < bestDiff) { bestDiff = diff; best = r }
  }
  if (!best || bestDiff > windowDays * 86400000) return null
  return Number(best.close_price)
}

// Devuelve { ytd, y1, y3, y5 } en % a partir de los precios diarios de un ticker.
async function returnsFor(sb, ticker, allowBackfill) {
  let { data: rows } = await sb.from('daily_prices').select('date, close_price').eq('ticker', ticker).order('date', { ascending: false })
  if ((!rows || rows.length < 30) && allowBackfill) {
    const ok = await backfillToDaily(sb, ticker)
    if (ok) ({ data: rows } = await sb.from('daily_prices').select('date, close_price').eq('ticker', ticker).order('date', { ascending: false }))
  }
  if (!rows || !rows.length) return null

  const current = Number(rows[0].close_price)
  const today = new Date(rows[0].date)
  const minus = days => { const d = new Date(today); d.setDate(d.getDate() - days); return d.toISOString().slice(0, 10) }
  const jan1 = `${today.getFullYear()}-01-01`

  const pct = base => (base != null && base > 0) ? Math.round((current - base) / base * 1000) / 10 : null
  return {
    ytd: pct(priceNear(rows, jan1, 21)),
    y1:  pct(priceNear(rows, minus(365))),
    y3:  pct(priceNear(rows, minus(1095))),
    y5:  pct(priceNear(rows, minus(1825))),
  }
}

export async function POST(request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  let body = {}
  try { body = await request.json() } catch {}
  const all = body.all === true
  const sb = serviceClient()

  // Lista de fondos a procesar
  let funds = []
  if (all) {
    const { data } = await sb.from('funds').select('ticker, benchmark_ticker')
    funds = data || []
  } else if (body.ticker) {
    const { data } = await sb.from('funds').select('ticker, benchmark_ticker').eq('ticker', body.ticker).maybeSingle()
    if (data) funds = [data]
    if (body.benchmark_ticker !== undefined) funds = [{ ticker: body.ticker, benchmark_ticker: body.benchmark_ticker }]
  }
  if (!funds.length) return NextResponse.json({ error: 'Sin fondos para procesar' }, { status: 400 })

  // Cachear returns de benchmarks (se repiten entre fondos)
  const benchCache = {}
  let ok = 0
  for (const f of funds) {
    try {
      const fundRet = await returnsFor(sb, f.ticker, true)
      const update = {
        return_ytd: fundRet?.ytd ?? null, return_1y: fundRet?.y1 ?? null,
        return_3y: fundRet?.y3 ?? null, return_5y: fundRet?.y5 ?? null,
        updated_at: new Date().toISOString(),
      }
      if (f.benchmark_ticker) {
        if (!(f.benchmark_ticker in benchCache)) benchCache[f.benchmark_ticker] = await returnsFor(sb, f.benchmark_ticker, true)
        const b = benchCache[f.benchmark_ticker]
        update.benchmark_return_ytd = b?.ytd ?? null
        update.benchmark_return_1y  = b?.y1 ?? null
        update.benchmark_return_3y  = b?.y3 ?? null
        update.benchmark_return_5y  = b?.y5 ?? null
      }
      await sb.from('funds').update(update).eq('ticker', f.ticker)
      ok++
    } catch {}
  }

  return NextResponse.json({ ok: true, processed: ok, total: funds.length })
}
