// Lógica de la sección Dividendos. Fuente de verdad: dividends_received.
import { DICT } from '@/data/dict'
import { countryCodeOf, nameOf } from '@/lib/fiscalidad'
// Mismas fuentes que la cartera para que los importes cuadren con "Renta anual neta":
// FX y normalización de peniques (.L) de portfolio, WHT de origen + doble imposición
// (tope crédito 15%) del screener.
import { toEUR, normalizeGbp } from '@/lib/portfolio'
import { getWHT, effectiveDivTax } from '@/lib/screener'

const MONTH_ES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
export const monthLabel = m => MONTH_ES[m - 1] || ''

function pdate(s) { if (!s) return null; const d = new Date(String(s).slice(0, 10) + 'T12:00:00'); return isNaN(d.getTime()) ? null : d }
function iso(d) { return d ? d.toISOString().slice(0, 10) : null }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x }

function parseDivHistory(dh) {
  const out = {}
  if (Array.isArray(dh)) dh.forEach(h => { if (h && h.year != null && h.dps != null) out[h.year] = Number(h.dps) })
  else if (dh && typeof dh === 'object') for (const [y, v] of Object.entries(dh)) { const n = Number(v); if (!isNaN(n)) out[y] = n }
  return out
}

function nearestFreq(n) { return [1, 2, 4, 12].reduce((p, c) => Math.abs(c - n) < Math.abs(p - n) ? c : p, 1) }

// Frecuencia y meses de pago de una empresa, desde dividend_events (reales) o,
// si no hay, desde el patrón por frecuencia.
export function detectFreqMonths(fund, currency) {
  const events = Array.isArray(fund?.dividend_events) ? fund.dividend_events : []
  const exDates = events.map(e => e.ex_date).filter(Boolean).map(pdate).filter(Boolean).sort((a, b) => a - b)
  let freq = null
  if (exDates.length >= 1) {
    const last = exDates[exDates.length - 1]
    const yearAgo = new Date(last); yearAgo.setFullYear(yearAgo.getFullYear() - 1)
    const n = exDates.filter(d => d > yearAgo).length
    if (n >= 1) freq = nearestFreq(n)
  }
  const exMonths = [...new Set(exDates.map(d => d.getMonth() + 1))].sort((a, b) => a - b)
  if (!freq) freq = exMonths.length ? nearestFreq(exMonths.length) : (currency === 'USD' || currency === 'CAD' ? 4 : currency === 'GBP' ? 2 : 1)
  const months = exMonths.length ? exMonths : defaultMonths(freq)
  // día del mes típico (mediana) para estimar la fecha ex
  const days = exDates.map(d => d.getDate()).sort((a, b) => a - b)
  const exDay = days.length ? days[Math.floor(days.length / 2)] : 15
  return { freq, months, exDay }
}
function defaultMonths(freq) {
  if (freq >= 12) return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
  if (freq === 4) return [3, 6, 9, 12]
  if (freq === 2) return [6, 12]
  return [12]
}

function sharesBefore(txs, ref) {
  let s = 0
  for (const t of (txs || [])) { const d = pdate(t.date); if (d && d <= ref) s += (t.type === 'sell' ? -1 : 1) * (Number(t.shares) || 0) }
  return s
}

// Dividendos automáticos esperados: año en curso completo (transcurrido + resto
// del año) y, si caen más allá, los próximos 3 meses. Importes en EUR (misma
// conversión que la cartera) para cuadrar con la "Renta anual neta" del resumen.
export function computeAutoDividends({ positions, transactions, fundamentals, config = {}, destWHT = 19, whtOverrides = null, today = new Date() }) {
  const txByTicker = {}
  ;(transactions || []).forEach(t => { (txByTicker[t.ticker] ||= []).push(t) })
  const yearStart = new Date(today.getFullYear(), 0, 1)
  const next3mo   = new Date(today); next3mo.setMonth(next3mo.getMonth() + 3)
  const yearEnd   = new Date(today.getFullYear(), 11, 31, 23, 59)
  // Cubre todo el año en curso (para que "Esperado resto del año" sea real) y, si
  // los 3 próximos meses se salen del año, también enero–marzo del siguiente.
  const windowEnd = next3mo > yearEnd ? next3mo : yearEnd
  const out = []

  for (const pos of (positions || [])) {
    if ((pos.asset_type || 'stock') !== 'stock' || Number(pos.shares) <= 0) continue
    const cfg = config[pos.ticker]
    if (cfg?.excluded) continue
    const f = fundamentals[pos.ticker] || {}
    const currency = pos.currency || 'USD'
    // DPS anual: el MISMO que usa la cartera (f.dps = último año COMPLETO ya saneado),
    // normalizado de peniques a libras en las .L. Respaldo: último año de div_history.
    const dh = parseDivHistory(f.div_history)
    const dhYears = Object.keys(dh).map(Number).sort((a, b) => b - a)
    let annualDPS = (f.dps != null && Number(f.dps) > 0) ? Number(f.dps) : (dhYears.length ? dh[dhYears[0]] : null)
    annualDPS = normalizeGbp(annualDPS, pos.ticker, currency)
    if (!annualDPS || annualDPS <= 0) continue

    const posShares = Number(pos.shares) || 0
    const code = countryCodeOf(pos.ticker, f.country)
    const isDomestic = code === 'ES'
    // Origen + doble imposición igual que la cartera (getWHT + tope crédito 15%).
    const whtPct = getWHT(code, whtOverrides)
    const effTotalPct = effectiveDivTax(whtPct, destPctFor(code, destWHT), isDomestic)
    let { freq, months, exDay } = detectFreqMonths(f, currency)
    if (cfg?.frequency) freq = Number(cfg.frequency)
    if (Array.isArray(cfg?.months) && cfg.months.length) months = cfg.months.map(Number)
    const perDpsEur = toEUR(annualDPS / freq, currency)   // EUR por acción y pago
    const realEx = pdate(f.next_ex_date)
    const realPay = pdate(f.next_pay_date)
    const txs = txByTicker[pos.ticker] || []

    for (let y = yearStart.getFullYear(); y <= windowEnd.getFullYear(); y++) {
      for (const m of months) {
        let exDate = new Date(y, m - 1, Math.min(exDay, 28), 12)
        if (exDate < yearStart || exDate > windowEnd) continue
        let payDate = addDays(exDate, 14)
        // Fechas reales de yfinance si caen en este mes
        if (realEx && realEx.getFullYear() === y && realEx.getMonth() === m - 1) {
          exDate = realEx
          payDate = realPay && realPay >= realEx ? realPay : addDays(realEx, 14)
        }
        // Acciones: la posición ACTUAL para pagos FUTUROS (igual que la cartera);
        // reconstrucción por transacciones para meses ya PASADOS. No se estima un
        // pago anterior a la compra: si la reconstrucción da 0 en una fecha pasada,
        // el dividendo se cobró antes de tener las acciones → se omite.
        const shares = exDate > today ? posShares : sharesBefore(txs, exDate)
        if (shares <= 1e-9) continue
        const amount = Math.round(shares * perDpsEur * 100) / 100
        // Retención de origen + impuesto de España residual tras el crédito (el
        // total = effTotalPct, igual que calcFiscal de la cartera).
        const originW = Math.round(amount * whtPct / 100 * 100) / 100
        const destW = Math.round(amount * Math.max(0, effTotalPct - whtPct) / 100 * 100) / 100
        out.push({
          ticker: pos.ticker, name: nameOf(pos.ticker), country: code,
          shares: Math.round(shares * 10000) / 10000, dps: Math.round(perDpsEur * 100000) / 100000,
          amount,
          withholding_origin_pct: Math.round(whtPct * 100) / 100, withholding_origin: originW,
          withholding_dest_pct: Math.round(Math.max(0, effTotalPct - whtPct) * 100) / 100, withholding_dest: destW,
          amount_net: Math.round((amount - originW - destW) * 100) / 100,
          ex_dividend_date: iso(exDate), payment_date_estimated: iso(payDate),
          period: `${y}-${String(m).padStart(2, '0')}`,
        })
      }
    }
  }
  return out
}

// Retención de destino aplicable: 0 en acciones nacionales (en España la retención
// de origen ya es la española), el tipo del usuario en el resto.
function destPctFor(code, destWHT) { return code === 'ES' ? 0 : Math.max(0, Number(destWHT) || 0) }
