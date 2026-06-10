// Evolución del patrimonio: valor de mercado, capital invertido y dividendos por
// mes del ejercicio. Todo en EUR (exchange_rates). Cachea en portfolio_snapshots.
import { NextResponse } from 'next/server'
import { createClient as sessionClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { FX } from '@/lib/portfolio'

export const dynamic = 'force-dynamic'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
}
const n = v => { const x = Number(v); return isNaN(x) ? 0 : x }
const ymd = d => d.toISOString().slice(0, 10)

// último valor de un array asc [{date, v}] con date <= target
function lastBefore(arr, target) {
  if (!arr || !arr.length) return null
  let res = null
  for (const r of arr) { if (r.date <= target) res = r.v; else break }
  return res
}

// EUR invertido en una compra (precio + comisión broker, convertido + comisión FX)
function buyEUR(t) {
  const rate = n(t.exchange_rate) || 1
  return (n(t.shares) * n(t.price) + n(t.commission)) * rate + n(t.fx_commission_eur)
}

export async function GET(req) {
  try {
    const url = new URL(req.url)
    const year = Number(url.searchParams.get('year')) || new Date().getFullYear()

    const ss = await sessionClient()
    const { data: { user } } = await ss.auth.getUser()
    if (!user) return NextResponse.json({ error: 'no auth' }, { status: 401 })

    const sb = svc()
    const [{ data: txs }, { data: divs }, { data: positions }] = await Promise.all([
      sb.from('transactions').select('*').eq('user_id', user.id),
      sb.from('dividends_received').select('ticker, amount, date').eq('user_id', user.id),
      sb.from('positions').select('ticker, currency, shares, asset_type').eq('user_id', user.id),
    ])
    const transactions = txs || []
    const dividends = divs || []

    // Años disponibles
    const txYears = transactions.filter(t => t.date).map(t => new Date(t.date).getFullYear())
    const firstYear = txYears.length ? Math.min(...txYears) : year
    const nowYear = new Date().getFullYear()
    const years = []
    for (let y = firstYear; y <= nowYear; y++) years.push(y)

    if (!transactions.length) {
      return NextResponse.json({ months: [], kpis: null, flags: { hasDividends: false, usedFallback: false, empty: true }, years })
    }

    // Tickers + divisas (de transacciones y posiciones)
    const currByTicker = {}
    ;[...transactions, ...(positions || [])].forEach(r => { if (r.ticker && r.currency) currByTicker[r.ticker] = r.currency })
    const tickers = [...new Set(transactions.map(t => t.ticker))]
    const currencies = [...new Set(Object.values(currByTicker).filter(c => c && c !== 'EUR'))]

    const yearStart = `${year}-01-01`
    const today = new Date()
    const todayStr = ymd(today)
    const rangeEnd = year < nowYear ? `${year}-12-31` : todayStr

    // daily_prices de los tickers + ^GSPC, en el rango
    const priceTickers = [...tickers, '^GSPC']
    const priceMap = {}   // ticker -> [{date, v}] asc
    {
      const { data } = await sb.from('daily_prices').select('ticker, date, close_price')
        .in('ticker', priceTickers).gte('date', `${firstYear}-01-01`).lte('date', rangeEnd)
        .order('date', { ascending: true })
      ;(data || []).forEach(r => { (priceMap[r.ticker] ||= []).push({ date: r.date, v: n(r.close_price) }) })
    }
    // exchange_rates X->EUR
    const rateMap = {}
    if (currencies.length) {
      const { data } = await sb.from('exchange_rates').select('base_currency, date, rate')
        .in('base_currency', currencies).eq('quote_currency', 'EUR')
        .gte('date', `${firstYear}-01-01`).lte('date', rangeEnd).order('date', { ascending: true })
      ;(data || []).forEach(r => { (rateMap[r.base_currency] ||= []).push({ date: r.date, v: n(r.rate) }) })
    }
    // precio actual (fallback) de company_fundamentals + funds
    const curPrice = {}
    {
      const [{ data: cf }, { data: fn }] = await Promise.all([
        sb.from('company_fundamentals').select('ticker, current_price').in('ticker', tickers),
        sb.from('funds').select('ticker, current_price').in('ticker', tickers),
      ])
      ;(cf || []).forEach(r => { if (r.current_price != null) curPrice[r.ticker] = n(r.current_price) })
      ;(fn || []).forEach(r => { if (r.current_price != null) curPrice[r.ticker] = n(r.current_price) })
    }

    // Tipo de cambio X→EUR a la fecha; si no hay dato real, usa el FX aproximado de la app (no 1)
    const rateAt = (cur, dateStr) => cur === 'EUR' ? 1 : (lastBefore(rateMap[cur], dateStr) ?? (rateMap[cur]?.length ? rateMap[cur][rateMap[cur].length - 1].v : (FX[cur] || 1)))
    const avgBuyPrice = (ticker, dateStr) => {
      const buys = transactions.filter(t => t.ticker === ticker && t.type !== 'sell' && t.date <= dateStr)
      const sh = buys.reduce((s, t) => s + n(t.shares), 0)
      return sh > 0 ? buys.reduce((s, t) => s + n(t.shares) * n(t.price), 0) / sh : 0
    }
    const sharesAt = (ticker, dateStr) => transactions
      .filter(t => t.ticker === ticker && t.date <= dateStr)
      .reduce((s, t) => s + (t.type === 'sell' ? -1 : 1) * n(t.shares), 0)

    let usedFallback = false
    const maxMonth = year < nowYear ? 12 : today.getMonth() + 1
    const months = []
    const snapshots = []

    for (let m = 1; m <= 12; m++) {
      if (m > maxMonth) { months.push({ m, marketValue: null, investedCapital: null, dividendsMonth: 0, dividendsAccum: 0, noData: true }); continue }
      const isCurrent = year === nowYear && m === maxMonth
      const monthEnd = isCurrent ? todayStr : ymd(new Date(year, m, 0))

      let marketValue = 0, anyPos = false
      for (const ticker of tickers) {
        const shares = sharesAt(ticker, monthEnd)
        if (shares <= 1e-9) continue
        anyPos = true
        const cur = currByTicker[ticker] || 'EUR'
        // Precio de cierre del mes (daily_prices). Solo para el mes en curso, si no
        // hay cierre del día usamos current_price; nunca current_price para meses pasados.
        let price = lastBefore(priceMap[ticker], monthEnd)
        if (price == null && isCurrent) price = curPrice[ticker] ?? null
        if (price == null) { price = avgBuyPrice(ticker, monthEnd); usedFallback = true }
        marketValue += shares * price * rateAt(cur, monthEnd)
      }
      const investedCapital = transactions
        .filter(t => t.type !== 'sell' && t.date <= monthEnd)
        .reduce((s, t) => s + buyEUR(t), 0)
      const dividendsAccum = dividends
        .filter(d => d.date && new Date(d.date).getFullYear() === year && d.date <= monthEnd)
        .reduce((s, d) => s + n(d.amount), 0)
      const dividendsMonth = dividends
        .filter(d => d.date && new Date(d.date).getFullYear() === year && new Date(d.date).getMonth() + 1 === m)
        .reduce((s, d) => s + n(d.amount), 0)

      months.push({ m, marketValue: anyPos ? Math.round(marketValue) : 0, investedCapital: Math.round(investedCapital), dividendsMonth: Math.round(dividendsMonth * 100) / 100, dividendsAccum: Math.round(dividendsAccum * 100) / 100, noData: !anyPos && investedCapital === 0 })
      snapshots.push({ user_id: user.id, year, month: m, market_value: anyPos ? marketValue : 0, invested_capital: investedCapital, dividends_received_month: dividendsMonth, dividends_accumulated: dividendsAccum, calculated_at: new Date().toISOString() })
    }

    // upsert snapshots (best-effort)
    try { await sb.from('portfolio_snapshots').upsert(snapshots, { onConflict: 'user_id,year,month' }) } catch {}

    // ── KPIs (a día de hoy) ──
    let currentValue = 0
    for (const p of (positions || [])) {
      const sh = n(p.shares); if (sh <= 0) continue
      const cur = p.currency || 'EUR'
      let price = lastBefore(priceMap[p.ticker], todayStr) ?? curPrice[p.ticker]
      if (price == null) { price = avgBuyPrice(p.ticker, todayStr); usedFallback = true }
      currentValue += sh * price * rateAt(cur, todayStr)
    }
    const investedTotal = transactions.filter(t => t.type !== 'sell').reduce((s, t) => s + buyEUR(t), 0)
    const dividendsAllTime = dividends.reduce((s, d) => s + n(d.amount), 0)
    const latentGain = currentValue - investedTotal
    const latentPct = investedTotal > 0 ? latentGain / investedTotal * 100 : null
    const totalReturnPct = investedTotal > 0 ? (latentGain + dividendsAllTime) / investedTotal * 100 : null

    const firstWithVal = months.find(mo => mo.marketValue != null && mo.marketValue > 0)
    const startVal = firstWithVal ? firstWithVal.marketValue : null
    const valueChangeEUR = startVal != null ? currentValue - startVal : null
    const valueChangePct = startVal ? valueChangeEUR / startVal * 100 : null

    // ── S&P 500 en el período del ejercicio ──
    let sp500Pct = null, beatsSP500 = false
    const sp = priceMap['^GSPC']
    if (sp && sp.length) {
      const startSp = lastBefore(sp, yearStart) ?? sp[0].v
      const endSp = sp[sp.length - 1].v
      if (startSp > 0) { sp500Pct = (endSp - startSp) / startSp * 100; if (totalReturnPct != null) beatsSP500 = totalReturnPct > sp500Pct }
    }

    return NextResponse.json({
      months, years,
      kpis: { currentValue: Math.round(currentValue), investedTotal: Math.round(investedTotal), latentGain: Math.round(latentGain), latentPct, totalReturnPct, dividendsAllTime: Math.round(dividendsAllTime), valueChangeEUR: valueChangeEUR != null ? Math.round(valueChangeEUR) : null, valueChangePct, beatsSP500, sp500Pct },
      flags: { hasDividends: dividends.length > 0, usedFallback, empty: false },
    })
  } catch (e) {
    return NextResponse.json({ error: String(e?.message || e), months: [], kpis: null, flags: {} }, { status: 200 })
  }
}
