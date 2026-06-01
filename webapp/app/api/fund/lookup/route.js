import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
}

async function crumb() {
  const c = await fetch('https://fc.yahoo.com', { headers: { 'User-Agent': UA }, cache: 'no-store' })
  const a3 = (c.headers.get('set-cookie') || '').match(/A3=([^;]+)/)
  const cookie = a3 ? `A3=${a3[1]}` : ''
  const r = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', { headers: { 'User-Agent': UA, Cookie: cookie }, cache: 'no-store' })
  const cr = (await r.text()).trim()
  if (!cr || cr.includes('<')) throw new Error('crumb inválido')
  return { cr, cookie }
}

const raw = v => (v && typeof v === 'object' && 'raw' in v) ? v.raw : (typeof v === 'number' ? v : null)

const isISIN = s => /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(s)

// Resuelve un ISIN o nombre al símbolo real de Yahoo vía el endpoint de búsqueda
async function searchSymbol(query, cookie, preferType) {
  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=8&newsCount=0`
    const res = await fetch(url, { headers: { 'User-Agent': UA, Cookie: cookie }, cache: 'no-store' })
    if (!res.ok) return null
    const j = await res.json()
    const quotes = (j?.quotes || []).filter(q => q.symbol)
    if (!quotes.length) return null
    const want = preferType === 'fund' ? 'MUTUALFUND' : preferType === 'etf' ? 'ETF' : null
    const match = (want && quotes.find(q => q.quoteType === want)) || quotes[0]
    return match?.symbol || null
  } catch { return null }
}

async function fetchQuoteSummary(symbol, cr, cookie) {
  const modules = 'price,summaryDetail,fundProfile,defaultKeyStatistics'
  const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${modules}&crumb=${encodeURIComponent(cr)}`
  const res = await fetch(url, { headers: { 'User-Agent': UA, Cookie: cookie }, cache: 'no-store' })
  if (!res.ok) return null
  const j = await res.json()
  return j?.quoteSummary?.result?.[0] || null
}

export async function POST(request) {
  let ticker, assetType
  try { ({ ticker, assetType } = await request.json()) } catch { return NextResponse.json({ error: 'Body inválido' }, { status: 400 }) }
  if (!ticker) return NextResponse.json({ error: 'Falta el ticker' }, { status: 400 })
  ticker = ticker.trim().toUpperCase()
  const type = assetType === 'fund' ? 'fund' : 'etf'

  const client = sb()

  // Si ya existe y es reciente (<7d), devolver directamente
  try {
    const { data: existing } = await client.from('funds').select('*').eq('ticker', ticker).maybeSingle()
    if (existing && existing.current_price != null && existing.updated_at &&
        (Date.now() - new Date(existing.updated_at).getTime()) < 7 * 24 * 3600 * 1000) {
      return NextResponse.json({ fund: existing, source: 'cache' })
    }
  } catch {}

  try {
    const { cr, cookie } = await crumb()

    // Resolver símbolo: si es ISIN, buscar primero; si no, probar directo y luego buscar
    const inputIsIsin = isISIN(ticker)
    let symbol = ticker
    const isin = inputIsIsin ? ticker : null
    if (inputIsIsin) {
      const resolved = await searchSymbol(ticker, cookie, type)
      if (resolved) symbol = resolved
    }

    let r = await fetchQuoteSummary(symbol, cr, cookie)
    if (!r) {
      // Fallback: buscar el símbolo por nombre/ticker introducido
      const resolved = await searchSymbol(ticker, cookie, type)
      if (resolved && resolved !== symbol) {
        symbol = resolved
        r = await fetchQuoteSummary(symbol, cr, cookie)
      }
    }
    if (!r) return NextResponse.json({ error: 'No encontrado en Yahoo Finance — puedes introducir los datos manualmente' }, { status: 404 })

    const price = r.price || {}, sd = r.summaryDetail || {}, fp = r.fundProfile || {}, ks = r.defaultKeyStatistics || {}

    const currentPrice = raw(price.regularMarketPrice)
    const currency = price.currency || sd.currency || 'USD'
    const name = price.longName || price.shortName || symbol
    const ter = raw(fp.feesExpensesInvestment?.annualReportExpenseRatio) != null
      ? raw(fp.feesExpensesInvestment.annualReportExpenseRatio) * 100
      : (raw(ks.annualReportExpenseRatio) != null ? raw(ks.annualReportExpenseRatio) * 100 : null)
    const category = fp.categoryName || null
    const manager  = fp.family || null
    const benchmark = null

    // Distribuciones (chart con events=div, 5 años)
    let distHistory = []
    try {
      const chUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5y&interval=1d&events=div`
      const chRes = await fetch(chUrl, { headers: { 'User-Agent': UA, Cookie: cookie }, cache: 'no-store' })
      const ch = await chRes.json()
      const divs = ch?.chart?.result?.[0]?.events?.dividends || {}
      distHistory = Object.values(divs).map(d => ({
        date: new Date(d.date * 1000).toISOString().slice(0, 10),
        amount: d.amount,
      })).sort((a, b) => a.date.localeCompare(b.date))
    } catch {}

    // Yield TTM desde distribuciones últimos 12 meses
    let yieldTtm = null
    if (currentPrice && distHistory.length) {
      const cutoff = Date.now() - 365 * 24 * 3600 * 1000
      const ttm = distHistory.filter(d => new Date(d.date).getTime() >= cutoff).reduce((s, d) => s + d.amount, 0)
      if (ttm > 0) yieldTtm = Math.round(ttm / currentPrice * 1000) / 10
    }
    if (yieldTtm == null && raw(sd.yield) != null) yieldTtm = Math.round(raw(sd.yield) * 1000) / 10

    const record = {
      ticker: symbol, name, asset_type: type, currency,
      country: null,
      current_price: currentPrice,
      ter: ter != null ? Math.round(ter * 1000) / 1000 : null,
      yield_ttm: yieldTtm,
      distribution_history: distHistory,
      benchmark, category, manager, isin,
      updated_at: new Date().toISOString(),
    }

    await client.from('funds').upsert(record, { onConflict: 'ticker' })
    return NextResponse.json({ fund: record, source: 'yahoo' })
  } catch (e) {
    return NextResponse.json({ error: 'No encontrado en Yahoo Finance — puedes introducir los datos manualmente', detail: String(e.message || e) }, { status: 404 })
  }
}

// Guardar fondo manual
export async function PUT(request) {
  let body
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Body inválido' }, { status: 400 }) }
  const { ticker, name, currency, current_price, annual_distribution } = body
  if (!ticker || !name) return NextResponse.json({ error: 'Faltan datos obligatorios' }, { status: 400 })

  const record = {
    ticker: ticker.trim().toUpperCase(), name, asset_type: 'fund',
    currency: currency || 'EUR', current_price: current_price != null ? parseFloat(current_price) : null,
    yield_ttm: (annual_distribution && current_price) ? Math.round(parseFloat(annual_distribution) / parseFloat(current_price) * 1000) / 10 : null,
    distribution_history: annual_distribution ? [{ date: new Date().toISOString().slice(0, 10), amount: parseFloat(annual_distribution) }] : [],
    extra_data: { manual: true, annual_distribution: annual_distribution ? parseFloat(annual_distribution) : null },
    updated_at: new Date().toISOString(),
  }
  try {
    await sb().from('funds').upsert(record, { onConflict: 'ticker' })
    return NextResponse.json({ fund: record, source: 'manual' })
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 500 })
  }
}
