// Conversión y formateo de divisas — usa la tabla exchange_rates de Supabase.
// Todos los pares están almacenados como X→EUR (base_currency=X, quote_currency=EUR).

/**
 * Devuelve el tipo de cambio más reciente en o antes de `date`.
 * Busca hasta 7 días hacia atrás para cubrir fines de semana y festivos.
 * @param {object} supabase  Cliente Supabase (client o server)
 * @param {string} fromCurrency
 * @param {string} toCurrency
 * @param {string} date  YYYY-MM-DD
 * @returns {Promise<{rate:number, rateDate:string}|null>}
 */
export async function getExchangeRate(supabase, fromCurrency, toCurrency, date) {
  if (fromCurrency === toCurrency) return { rate: 1, rateDate: date }

  const lookback = new Date(date)
  lookback.setDate(lookback.getDate() - 7)
  const startDate = lookback.toISOString().slice(0, 10)

  async function query(base, quote) {
    const { data } = await supabase
      .from('exchange_rates')
      .select('rate, date')
      .eq('base_currency', base)
      .eq('quote_currency', quote)
      .lte('date', date)
      .gte('date', startDate)
      .order('date', { ascending: false })
      .limit(1)
    return data?.[0] || null
  }

  // La tabla almacena X→EUR. Tres casos posibles:
  if (toCurrency === 'EUR') {
    const row = await query(fromCurrency, 'EUR')
    if (!row) { console.warn(`Sin tipo de cambio ${fromCurrency}/EUR en ${date}`); return null }
    return { rate: Number(row.rate), rateDate: row.date }
  }

  if (fromCurrency === 'EUR') {
    const row = await query(toCurrency, 'EUR')
    if (!row) { console.warn(`Sin tipo de cambio ${toCurrency}/EUR en ${date}`); return null }
    return { rate: 1 / Number(row.rate), rateDate: row.date }
  }

  // Cruzado: from→EUR dividido entre to→EUR
  const [rowFrom, rowTo] = await Promise.all([query(fromCurrency, 'EUR'), query(toCurrency, 'EUR')])
  if (!rowFrom || !rowTo) { console.warn(`Sin tipo de cambio cruzado ${fromCurrency}/${toCurrency} en ${date}`); return null }
  return {
    rate: Number(rowFrom.rate) / Number(rowTo.rate),
    rateDate: rowFrom.date > rowTo.date ? rowFrom.date : rowTo.date,
  }
}

/**
 * Convierte un importe aplicando tipo de cambio y comisión de cambio.
 * @returns {Promise<{amountOriginal,amountConverted,rate,rateDate,fxCommissionPct,fxCommissionAmount,totalCost}|null>}
 */
export async function convertAmount(supabase, amount, fromCurrency, toCurrency, date, fxCommissionPct = 0) {
  const fx = await getExchangeRate(supabase, fromCurrency, toCurrency, date)
  if (!fx) return null

  const amountConverted    = amount * fx.rate
  const fxCommissionAmount = amountConverted * fxCommissionPct / 100
  const totalCost          = amountConverted + fxCommissionAmount

  return {
    amountOriginal: amount,
    amountConverted,
    rate: fx.rate,
    rateDate: fx.rateDate,
    fxCommissionPct,
    fxCommissionAmount,
    totalCost,
  }
}

const FMT = {
  EUR: { symbol: '€', after: true,  locale: 'es-ES', dec: 2 },
  USD: { symbol: '$', after: false, locale: 'en-US', dec: 2 },
  GBP: { symbol: '£', after: false, locale: 'en-GB', dec: 2 },
  JPY: { symbol: '¥', after: false, locale: 'ja-JP', dec: 0 },
  CHF: { symbol: 'Fr', after: false, locale: 'de-CH', dec: 2 },
  CAD: { symbol: 'C$', after: false, locale: 'en-CA', dec: 2 },
  AUD: { symbol: 'A$', after: false, locale: 'en-AU', dec: 2 },
  SEK: { symbol: 'kr', after: true,  locale: 'sv-SE', dec: 2 },
  DKK: { symbol: 'kr', after: true,  locale: 'da-DK', dec: 2 },
  NOK: { symbol: 'kr', after: true,  locale: 'nb-NO', dec: 2 },
}

/**
 * Formatea un importe con símbolo y separadores locales correctos.
 */
export function formatCurrency(amount, currency) {
  if (amount == null || isNaN(amount)) return '—'
  const f = FMT[currency]
  if (!f) {
    return amount.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + currency
  }
  const num = amount.toLocaleString(f.locale, { minimumFractionDigits: f.dec, maximumFractionDigits: f.dec })
  return f.after ? `${num} ${f.symbol}` : `${f.symbol}${num}`
}
