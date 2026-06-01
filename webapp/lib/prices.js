// Acceso a la tabla daily_prices de Supabase.
// Todas las funciones aceptan un cliente Supabase (server o client).

const LOOKBACK_DAYS = 7  // días hacia atrás para cubrir fines de semana y festivos

function sinceDate(days) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

function ageInDays(dateStr) {
  return Math.floor((new Date(today()) - new Date(dateStr)) / (1000 * 60 * 60 * 24))
}

/**
 * Devuelve el precio de cierre más reciente de un ticker.
 * @returns {{ price, date, isToday, ageInDays, updatedAt } | null}
 */
export async function getLatestPrice(supabase, ticker) {
  const { data } = await supabase
    .from('daily_prices')
    .select('close_price, date, updated_at')
    .eq('ticker', ticker)
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!data) return null

  const age = ageInDays(data.date)
  return {
    price:     Number(data.close_price),
    date:      data.date,
    isToday:   data.date === today(),
    ageInDays: age,
    updatedAt: data.updated_at,
  }
}

/**
 * Devuelve el historial de precios de los últimos N días (ordenado ASC).
 * @returns {{ date: string, price: number }[]}
 */
export async function getPriceHistory(supabase, ticker, days) {
  const { data } = await supabase
    .from('daily_prices')
    .select('date, close_price')
    .eq('ticker', ticker)
    .gte('date', sinceDate(days))
    .order('date', { ascending: true })

  return (data || []).map(r => ({ date: r.date, price: Number(r.close_price) }))
}

/**
 * Devuelve el último precio con variación respecto al día anterior.
 * @returns {{ price, date, change, changePct, direction } | null}
 */
export async function getPriceChange(supabase, ticker) {
  const { data } = await supabase
    .from('daily_prices')
    .select('close_price, date')
    .eq('ticker', ticker)
    .order('date', { ascending: false })
    .limit(2)

  if (!data?.length) return null

  const latest = data[0]
  const prev   = data[1]

  const price     = Number(latest.close_price)
  const prevPrice = prev ? Number(prev.close_price) : null
  const change    = prevPrice != null ? price - prevPrice : null
  const changePct = prevPrice ? change / prevPrice * 100 : null
  const direction = changePct == null ? 'flat' : changePct > 0.01 ? 'up' : changePct < -0.01 ? 'down' : 'flat'

  return { price, date: latest.date, change, changePct, direction }
}

/**
 * Obtiene el precio más reciente de varios tickers en una sola query.
 * @returns {{ [ticker]: { price, date, isToday, ageInDays } }}
 */
export async function getMultiplePrices(supabase, tickers) {
  if (!tickers?.length) return {}

  const { data } = await supabase
    .from('daily_prices')
    .select('ticker, close_price, date')
    .in('ticker', tickers)
    .gte('date', sinceDate(LOOKBACK_DAYS))
    .order('date', { ascending: false })

  const result = {}
  const td = today()

  for (const row of (data || [])) {
    if (!result[row.ticker]) {
      result[row.ticker] = {
        price:     Number(row.close_price),
        date:      row.date,
        isToday:   row.date === td,
        ageInDays: ageInDays(row.date),
      }
    }
  }

  return result
}

/**
 * Devuelve la fecha y hora de la última actualización de precios.
 * @returns {{ date: string, updatedAt: string, ageInDays: number } | null}
 */
export async function getLastUpdateInfo(supabase) {
  const { data } = await supabase
    .from('daily_prices')
    .select('date, updated_at')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!data) return null

  return {
    date:      data.date,
    updatedAt: data.updated_at,
    ageInDays: ageInDays(data.date),
  }
}
