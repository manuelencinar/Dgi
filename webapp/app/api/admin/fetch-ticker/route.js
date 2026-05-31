import { NextResponse } from 'next/server'
import { requireAdmin, serviceClient } from '@/lib/admin'
import { DICT } from '@/data/dict'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'

async function yahooCrumb() {
  const cookieRes = await fetch('https://fc.yahoo.com', { headers: { 'User-Agent': UA }, cache: 'no-store' })
  const setCookie = cookieRes.headers.get('set-cookie') || ''
  const a3 = setCookie.match(/A3=([^;]+)/)
  const cookie = a3 ? `A3=${a3[1]}` : ''
  const crumbRes = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', { headers: { 'User-Agent': UA, Cookie: cookie }, cache: 'no-store' })
  const crumb = (await crumbRes.text()).trim()
  if (!crumb || crumb.includes('<')) throw new Error('No se pudo obtener crumb de Yahoo')
  return { crumb, cookie }
}

const raw = v => (v && typeof v === 'object' && 'raw' in v) ? v.raw : (typeof v === 'number' ? v : null)
const pct = v => { const r = raw(v); return r != null ? Math.round(r * 1000) / 10 : null }

export async function POST(request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  let ticker
  try { ({ ticker } = await request.json()) } catch { return NextResponse.json({ error: 'Body inválido' }, { status: 400 }) }
  if (!ticker) return NextResponse.json({ error: 'Falta el ticker' }, { status: 400 })
  ticker = ticker.trim().toUpperCase()

  try {
    const { crumb, cookie } = await yahooCrumb()
    const modules = 'price,summaryDetail,defaultKeyStatistics,financialData'
    const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=${modules}&crumb=${encodeURIComponent(crumb)}`
    const res = await fetch(url, { headers: { 'User-Agent': UA, Cookie: cookie }, cache: 'no-store' })
    if (!res.ok) return NextResponse.json({ error: `Yahoo devolvió ${res.status} — ticker no encontrado o sin datos` }, { status: 404 })

    const json = await res.json()
    const r = json?.quoteSummary?.result?.[0]
    if (!r) return NextResponse.json({ error: 'Sin datos para este ticker' }, { status: 404 })

    const { price = {}, summaryDetail: sd = {}, defaultKeyStatistics: ks = {}, financialData: fd = {} } = r

    const fields = {
      current_price:   raw(price.regularMarketPrice),
      dps:             raw(sd.dividendRate),
      week52_high:     raw(sd.fiftyTwoWeekHigh),
      week52_low:      raw(sd.fiftyTwoWeekLow),
      pe_trailing:     raw(sd.trailingPE),
      pe_forward:      raw(ks.forwardPE),
      payout_eps:      pct(sd.payoutRatio),
      gross_margin:    pct(fd.grossMargins),
      operating_margin: pct(fd.operatingMargins),
      net_margin:      pct(fd.profitMargins),
      roe:             pct(fd.returnOnEquity),
      roa:             pct(fd.returnOnAssets),
      revenue_growth_yoy: pct(fd.revenueGrowth),
      earnings_growth_yoy: pct(fd.earningsGrowth),
      price_to_book:   raw(ks.priceToBook),
      beta:            raw(sd.beta) ?? raw(ks.beta),
      market_cap_m:    raw(price.marketCap) != null ? raw(price.marketCap) / 1e6 : null,
      ev_ebitda:       raw(ks.enterpriseToEbitda),
      eps_trailing:    raw(ks.trailingEps),
      sector:          null,
      industry:        null,
    }

    const obtained = Object.entries(fields).filter(([, v]) => v != null).map(([k]) => k)
    const failed   = Object.entries(fields).filter(([, v]) => v == null).map(([k]) => k)

    const dictEntry = DICT.find(d => d[1] === ticker)
    const payload = {
      ticker,
      ...Object.fromEntries(Object.entries(fields).filter(([, v]) => v != null)),
      country: dictEntry?.[2] ?? null,
      updated_at: new Date().toISOString(),
    }

    const sb = serviceClient()
    const { error } = await sb.from('company_fundamentals').upsert(payload, { onConflict: 'ticker' })
    if (error) return NextResponse.json({ error: `Error al guardar: ${error.message}` }, { status: 500 })

    return NextResponse.json({
      ticker,
      name: dictEntry?.[0] ?? ticker,
      obtained, failed,
      note: 'Campos escalares actualizados. Los estados financieros completos requieren el run del script de yfinance.',
    })
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 500 })
  }
}
