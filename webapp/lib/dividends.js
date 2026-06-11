// Lógica de la sección Dividendos. Fuente de verdad: dividends_received.
import { DICT } from '@/data/dict'
import { fiscalWHT, countryCodeOf, nameOf } from '@/lib/fiscalidad'

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

// Dividendos automáticos esperados: año en curso ya transcurrido + próximos 3 meses.
export function computeAutoDividends({ positions, transactions, fundamentals, config = {}, destWHT = 19, today = new Date() }) {
  const txByTicker = {}
  ;(transactions || []).forEach(t => { (txByTicker[t.ticker] ||= []).push(t) })
  const yearStart = new Date(today.getFullYear(), 0, 1)
  const windowEnd = new Date(today); windowEnd.setMonth(windowEnd.getMonth() + 3)
  const out = []

  for (const pos of (positions || [])) {
    if ((pos.asset_type || 'stock') !== 'stock' || Number(pos.shares) <= 0) continue
    const cfg = config[pos.ticker]
    if (cfg?.excluded) continue
    const f = fundamentals[pos.ticker] || {}
    const dh = parseDivHistory(f.div_history)
    const dhYears = Object.keys(dh).map(Number).sort((a, b) => b - a)
    const annualDPS = dhYears.length ? dh[dhYears[0]] : (f.dps != null ? Number(f.dps) : null)
    if (!annualDPS || annualDPS <= 0) continue

    const code = countryCodeOf(pos.ticker, f.country)
    const whtPct = fiscalWHT(code)
    let { freq, months, exDay } = detectFreqMonths(f, pos.currency)
    if (cfg?.frequency) freq = Number(cfg.frequency)
    if (Array.isArray(cfg?.months) && cfg.months.length) months = cfg.months.map(Number)
    const perDps = annualDPS / freq
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
        const shares = sharesBefore(txs, exDate)
        if (shares <= 1e-9) continue
        const amount = shares * perDps
        // Retención en origen (país de la empresa) + retención en destino (la del
        // usuario, p.ej. 19% en España). En empresas españolas la retención de
        // origen ya ES la española → no se aplica destino adicional.
        const destPct = code === 'ES' ? 0 : (destWHT || 0)
        const originW = amount * whtPct / 100
        const destW = (amount - originW) * destPct / 100
        out.push({
          ticker: pos.ticker, name: nameOf(pos.ticker), country: code,
          shares: Math.round(shares * 10000) / 10000, dps: Math.round(perDps * 10000) / 10000,
          amount: Math.round(amount * 100) / 100,
          withholding_origin_pct: whtPct, withholding_origin: Math.round(originW * 100) / 100,
          withholding_dest_pct: destPct, withholding_dest: Math.round(destW * 100) / 100,
          amount_net: Math.round((amount - originW - destW) * 100) / 100,
          ex_dividend_date: iso(exDate), payment_date_estimated: iso(payDate),
          period: `${y}-${String(m).padStart(2, '0')}`,
        })
      }
    }
  }
  return out
}
