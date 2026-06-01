import { createClient } from '@supabase/supabase-js'

// El gráfico se sirve desde daily_prices (archivo propio). La primera vez que se
// pide un ticker sin histórico, se descargan 5 años de Yahoo de una vez: se
// archivan en daily_prices (best-effort) y se sirven directamente. Después
// update_prices.py mantiene el borde diario y ya no se llama a Yahoo.

const UA           = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
const RANGE_DAYS   = { '1M': 35, '3M': 95, '6M': 190, '1A': 370, '3A': 1100, '5A': 1830 }
const WEEKLY       = new Set(['3A', '5A'])   // submuestreo a ~semanal en rangos largos
const FRESH_DAYS   = 4                         // margen para fines de semana / festivos
const BACKFILL_TTL = 25 * 24 * 3600 * 1000     // no re-backfillear más de 1 vez/mes por ticker

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  )
}

const todayStr = () => new Date().toISOString().slice(0, 10)
function daysBetween(a, b) { return Math.round((new Date(b) - new Date(a)) / 86400000) }

// Descarga 5 años de cierres diarios de Yahoo. Devuelve [{ date, close_price }].
async function fetchYahooHistory(ticker) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}` +
    `?range=5y&interval=1d&includePrePost=false`
  const res = await fetch(url, { headers: { 'User-Agent': UA }, cache: 'no-store' })
  if (!res.ok) throw new Error(`Yahoo chart ${res.status}`)

  const json   = await res.json()
  const result = json?.chart?.result?.[0]
  if (!result) throw new Error('sin datos')

  const ts = result.timestamp || []
  const cl = result.indicators?.quote?.[0]?.close || []

  const rows = []
  for (let i = 0; i < ts.length; i++) {
    const c = cl[i]
    if (c == null || c <= 0) continue
    rows.push({ date: new Date(ts[i] * 1000).toISOString().slice(0, 10), close_price: Math.round(c * 10000) / 10000 })
  }
  if (!rows.length) throw new Error('sin filas válidas')
  return rows
}

// Archiva en daily_prices (best-effort: si la tabla no existe o falla, no rompe).
async function archive(client, ticker, rows) {
  try {
    const now  = new Date().toISOString()
    const recs = rows.map(r => ({ ticker, date: r.date, close_price: r.close_price, updated_at: now }))
    for (let i = 0; i < recs.length; i += 1000) {
      await client.from('daily_prices').upsert(recs.slice(i, i + 1000), { onConflict: 'ticker,date' })
    }
    await client.from('market_charts').upsert({
      symbol: ticker, range: 'backfill', data: { count: recs.length }, fetched_at: now,
    })
  } catch { /* el archivado es opcional; los datos ya se sirven igualmente */ }
}

// Devuelve { timestamps, closes } para el rango pedido.
export async function getCompanyChartData(ticker, range = '1A') {
  const client   = sb()
  const days     = RANGE_DAYS[range] || 370
  const start    = new Date(); start.setDate(start.getDate() - days)
  const startStr = start.toISOString().slice(0, 10)

  // Lee daily_prices en la ventana. Devuelve [] si la tabla no existe o está vacía.
  async function read() {
    try {
      const { data } = await client
        .from('daily_prices')
        .select('date, close_price')
        .eq('ticker', ticker)
        .gte('date', startStr)
        .order('date', { ascending: true })
      return data || []
    } catch { return [] }
  }

  let rows        = await read()
  const fresh     = rows.length > 0 && daysBetween(rows[rows.length - 1].date, todayStr()) <= FRESH_DAYS
  const coversAll = rows.length > 0 && daysBetween(startStr, rows[0].date) <= 10

  let needBackfill = !rows.length || !fresh
  if (!needBackfill && !coversAll) {
    let age = Infinity
    try {
      const { data: mk } = await client
        .from('market_charts')
        .select('fetched_at')
        .eq('symbol', ticker).eq('range', 'backfill')
        .maybeSingle()
      if (mk) age = Date.now() - new Date(mk.fetched_at).getTime()
    } catch {}
    if (age > BACKFILL_TTL) needBackfill = true
  }

  if (needBackfill) {
    try {
      const fetched = await fetchYahooHistory(ticker)   // datos frescos de Yahoo
      await archive(client, ticker, fetched)            // archivar (best-effort)
      rows = fetched.filter(r => r.date >= startStr)     // servir directamente la ventana
    } catch {
      /* si Yahoo falla, nos quedamos con lo que hubiera en daily_prices */
    }
  }

  if (!rows.length) return { timestamps: [], closes: [] }

  // Submuestreo a ~semanal en rangos largos para aligerar el SVG
  let series = rows
  if (WEEKLY.has(range) && rows.length > 60) {
    series = rows.filter((_, i) => i % 5 === 0)
    if (series[series.length - 1] !== rows[rows.length - 1]) series.push(rows[rows.length - 1])
  }

  return {
    timestamps: series.map(r => Math.floor(Date.parse(r.date + 'T00:00:00Z') / 1000)),
    closes:     series.map(r => Number(r.close_price)),
  }
}
