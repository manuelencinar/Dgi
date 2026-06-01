// Fuente única de verdad para tipos de cambio y formateo de divisas.
// Lee de la tabla exchange_rates de Supabase. Ningún componente debe consultar
// exchange_rates directamente: todo pasa por aquí.
// Los pares se almacenan como X→EUR (base_currency=X, quote_currency=EUR).

import { createClient } from '@/lib/supabase/client'

let _sb = null
function sb() { return (_sb ??= createClient()) }

// Resta n días hábiles (sin contar fines de semana) a una fecha YYYY-MM-DD.
function businessDaysBack(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z')
  let count = 0
  while (count < n) {
    d.setUTCDate(d.getUTCDate() - 1)
    const wd = d.getUTCDay()
    if (wd !== 0 && wd !== 6) count++
  }
  return d.toISOString().slice(0, 10)
}

// Lee el tipo X→EUR más reciente dentro de [minDate, date]. null si no hay.
async function queryRate(base, quote, date, minDate) {
  let q = sb()
    .from('exchange_rates')
    .select('rate, date')
    .eq('base_currency', base)
    .eq('quote_currency', quote)
    .order('date', { ascending: false })
    .limit(1)
  if (date)    q = q.lte('date', date)
  if (minDate) q = q.gte('date', minDate)
  const { data } = await q
  return data?.[0] || null
}

/**
 * Tipo de cambio más cercano a `date` (máximo 5 días hábiles hacia atrás).
 * Devuelve { rate, rateDate } o null si no hay dato — nunca inventa un tipo.
 */
export async function getExchangeRate(fromCurrency, toCurrency, date) {
  if (fromCurrency === toCurrency) return { rate: 1, rateDate: date }
  const minDate = businessDaysBack(date, 5)

  if (toCurrency === 'EUR') {
    const row = await queryRate(fromCurrency, 'EUR', date, minDate)
    return row ? { rate: Number(row.rate), rateDate: row.date } : null
  }
  if (fromCurrency === 'EUR') {
    const row = await queryRate(toCurrency, 'EUR', date, minDate)
    return row ? { rate: 1 / Number(row.rate), rateDate: row.date } : null
  }
  // Cruzado: from→EUR dividido entre to→EUR
  const [a, b] = await Promise.all([
    queryRate(fromCurrency, 'EUR', date, minDate),
    queryRate(toCurrency, 'EUR', date, minDate),
  ])
  if (!a || !b) return null
  return { rate: Number(a.rate) / Number(b.rate), rateDate: a.date > b.date ? a.date : b.date }
}

/**
 * Tipo de cambio más reciente disponible (sin especificar fecha), para la UI.
 * Devuelve { rate, rateDate } o null.
 */
export async function getLatestExchangeRate(fromCurrency, toCurrency) {
  if (fromCurrency === toCurrency) return { rate: 1, rateDate: null }

  if (toCurrency === 'EUR') {
    const row = await queryRate(fromCurrency, 'EUR', null, null)
    return row ? { rate: Number(row.rate), rateDate: row.date } : null
  }
  if (fromCurrency === 'EUR') {
    const row = await queryRate(toCurrency, 'EUR', null, null)
    return row ? { rate: 1 / Number(row.rate), rateDate: row.date } : null
  }
  const [a, b] = await Promise.all([
    queryRate(fromCurrency, 'EUR', null, null),
    queryRate(toCurrency, 'EUR', null, null),
  ])
  if (!a || !b) return null
  return { rate: Number(a.rate) / Number(b.rate), rateDate: a.date > b.date ? a.date : b.date }
}

/**
 * Tipo actual de un par + variación frente al dato anterior (para el widget).
 * Devuelve { rate, rateDate, change, changePct } o null.
 */
export async function getExchangeRateChange(fromCurrency, toCurrency = 'EUR') {
  if (fromCurrency === toCurrency) return null

  // Caso directo X→EUR (el que usa el widget): comparamos los 2 más recientes
  if (toCurrency === 'EUR') {
    const { data } = await sb()
      .from('exchange_rates')
      .select('rate, date')
      .eq('base_currency', fromCurrency)
      .eq('quote_currency', 'EUR')
      .order('date', { ascending: false })
      .limit(2)
    if (!data?.length) return null
    const rate = Number(data[0].rate)
    const prev = data[1] ? Number(data[1].rate) : null
    const change    = prev != null ? rate - prev : null
    const changePct = prev ? change / prev * 100 : null
    return { rate, rateDate: data[0].date, change, changePct }
  }

  // Otros casos: tipo más reciente sin variación
  const latest = await getLatestExchangeRate(fromCurrency, toCurrency)
  return latest ? { ...latest, change: null, changePct: null } : null
}

/**
 * Convierte un importe aplicando tipo de cambio y comisión de cambio.
 * Devuelve null si no hay tipo disponible.
 */
export async function convertAmount(amount, fromCurrency, toCurrency, date, fxCommissionPct = 0) {
  const fx = await getExchangeRate(fromCurrency, toCurrency, date)
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
  EUR: { symbol: '€',  after: true,  locale: 'es-ES', dec: 2 },
  USD: { symbol: '$',  after: false, locale: 'en-US', dec: 2 },
  GBP: { symbol: '£',  after: false, locale: 'en-GB', dec: 2 },
  JPY: { symbol: '¥',  after: false, locale: 'ja-JP', dec: 0 },
  CHF: { symbol: 'Fr', after: false, locale: 'de-CH', dec: 2 },
  CAD: { symbol: 'C$', after: false, locale: 'en-CA', dec: 2 },
  AUD: { symbol: 'A$', after: false, locale: 'en-AU', dec: 2 },
  SEK: { symbol: 'kr', after: true,  locale: 'sv-SE', dec: 2 },
  DKK: { symbol: 'kr', after: true,  locale: 'da-DK', dec: 2 },
  NOK: { symbol: 'kr', after: true,  locale: 'nb-NO', dec: 2 },
}

/**
 * Formatea un importe con símbolo y separadores locales correctos.
 * Devuelve guión si el valor no es válido — nunca 0 ni NaN.
 */
export function formatCurrency(amount, currency) {
  if (amount == null || isNaN(amount)) return '—'
  const f = FMT[currency]
  if (!f) {
    return amount.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + currency
  }
  const num = amount.toLocaleString(f.locale, { minimumFractionDigits: f.dec, maximumFractionDigits: f.dec })
  return f.after ? `${num} ${f.symbol}` : `${f.symbol}${num}`
}
