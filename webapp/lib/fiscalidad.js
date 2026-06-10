// Cálculo fiscal para residentes en España (orientativo).
//   · Rendimientos del capital mobiliario (dividendos) → casillas 0029 / 0031
//   · Ganancias/pérdidas patrimoniales por transmisión (FIFO) → 0380 / 0382
//   · Deducción por doble imposición internacional → 0588
// Todo en EUR. Las conversiones de divisa usan el exchange_rate guardado en cada
// transacción (op→base). Los dividendos registrados se asumen ya en EUR.
import { DICT } from '@/data/dict'
import { getWHT } from '@/lib/screener'

export const COUNTRY_NAMES = {
  ES: 'España', US: 'Estados Unidos', DE: 'Alemania', FR: 'Francia', GB: 'Reino Unido',
  CH: 'Suiza', NL: 'Países Bajos', BE: 'Bélgica', IT: 'Italia', PT: 'Portugal',
  IE: 'Irlanda', AT: 'Austria', SE: 'Suecia', DK: 'Dinamarca', NO: 'Noruega',
  FI: 'Finlandia', AU: 'Australia', CA: 'Canadá', JP: 'Japón', HK: 'Hong Kong',
  SG: 'Singapur', CN: 'China', BR: 'Brasil', OTHER: 'Otro',
}

const NAME_TO_CODE = Object.fromEntries(Object.entries(COUNTRY_NAMES).map(([c, n]) => [n.toLowerCase(), c]))
NAME_TO_CODE['united states'] = 'US'; NAME_TO_CODE['united kingdom'] = 'GB'; NAME_TO_CODE['germany'] = 'DE'
NAME_TO_CODE['france'] = 'FR'; NAME_TO_CODE['spain'] = 'ES'; NAME_TO_CODE['switzerland'] = 'CH'
NAME_TO_CODE['netherlands'] = 'NL'; NAME_TO_CODE['japan'] = 'JP'; NAME_TO_CODE['canada'] = 'CA'

export function countryCodeOf(ticker, fallbackName) {
  const d = DICT.find(x => x[1] === ticker)
  if (d && d[2]) return d[2]
  if (fallbackName) return NAME_TO_CODE[String(fallbackName).toLowerCase()] || 'OTHER'
  return 'OTHER'
}

export function nameOf(ticker) {
  return DICT.find(x => x[1] === ticker)?.[0] ?? ticker
}

// ── Retención en origen para el prefill fiscal (tipos de convenio) ──────────
const WHT_FISCAL = { US: 15, DE: 26.375, CH: 35, FR: 12.8, GB: 0, NL: 15, ES: 19, BE: 30, JP: 15.315, AU: 15, CA: 15 }
export function fiscalWHT(code) { return WHT_FISCAL[code] ?? 15 }

function r2(v) { return Math.round(v * 100) / 100 }
function r4(v) { return Math.round(v * 10000) / 10000 }

// div_history puede venir como array [{year,dps}] u objeto {year:dps}
function parseDivHistory(dh) {
  const out = {}
  if (Array.isArray(dh)) dh.forEach(h => { if (h && h.year != null && h.dps != null) out[h.year] = Number(h.dps) })
  else if (dh && typeof dh === 'object') for (const [y, v] of Object.entries(dh)) { const n = Number(v); if (!isNaN(n)) out[y] = n }
  return out
}

// Acciones en cartera ANTES de una fecha (compras − ventas con fecha < ref).
function sharesBefore(txs, refDate) {
  const ref = new Date(refDate)
  let s = 0
  for (const t of txs) {
    if (new Date(t.date) < ref) s += (t.type === 'sell' ? -1 : 1) * (Number(t.shares) || 0)
  }
  return s
}

// Frecuencia anual estimada (12/4/2/1) desde dividend_events o la divisa.
function inferFreq(events, currency) {
  const ds = (events || []).map(e => e.ex_date).filter(Boolean).map(d => new Date(d)).filter(d => !isNaN(d)).sort((a, b) => a - b)
  if (ds.length >= 2) {
    const last = ds[ds.length - 1]
    const yearAgo = new Date(last); yearAgo.setFullYear(yearAgo.getFullYear() - 1)
    const n = ds.filter(d => d > yearAgo).length
    if (n >= 1) return [1, 2, 4, 12].reduce((p, c) => Math.abs(c - n) < Math.abs(p - n) ? c : p, 1)
  }
  return (currency === 'USD' || currency === 'CAD') ? 4 : (currency === 'GBP' || currency === 'CHF') ? 2 : 1
}

// Fechas ex-dividendo del ejercicio: reales si las hay en dividend_events, si no estimadas.
function paymentExDates(events, year, currency) {
  const inYear = (events || [])
    .map(e => e.ex_date).filter(Boolean)
    .filter(d => new Date(d).getFullYear() === year)
    .sort()
  if (inYear.length) return inYear
  const freq = inferFreq(events, currency)
  const iso = (m, d) => `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  if (freq >= 12) return Array.from({ length: 12 }, (_, i) => iso(i + 1, 15))
  if (freq === 4) return [iso(3, 15), iso(6, 15), iso(9, 15), iso(12, 15)]
  if (freq === 2) return [iso(6, 15), iso(12, 15)]
  return [iso(7, 1)]   // anual
}

// Calcula las entradas fiscales automáticas (dividendos + ganancias FIFO).
// Devuelve también los avisos: empresas sin div_history y ventas sin compra.
export function computeAutoEntries({ positions, transactions, fundamentals, exercise }) {
  const txByTicker = {}
  ;(transactions || []).forEach(t => { (txByTicker[t.ticker] ||= []).push(t) })
  for (const k in txByTicker) txByTicker[k].sort((a, b) => new Date(a.date) - new Date(b.date))

  // ── Dividendos ──
  const divEntries = []
  const missingDivHistory = []
  const stockPos = (positions || []).filter(p => (p.asset_type || 'stock') === 'stock' && Number(p.shares) > 0)
  for (const pos of stockPos) {
    const f = fundamentals[pos.ticker] || {}
    const dh = parseDivHistory(f.div_history)
    const annualDPS = dh[exercise]
    const code = countryCodeOf(pos.ticker, f.country)
    if (annualDPS == null || annualDPS <= 0) { missingDivHistory.push({ ticker: pos.ticker, name: nameOf(pos.ticker) }); continue }
    const exDates = paymentExDates(f.dividend_events, exercise, pos.currency)
    const freq = exDates.length || 1
    const dpsPer = annualDPS / freq
    const txs = txByTicker[pos.ticker] || []
    let totalGross = 0
    for (const ex of exDates) { const sh = sharesBefore(txs, ex); if (sh > 0) totalGross += sh * dpsPer }
    if (totalGross <= 0) continue
    const whtPct = fiscalWHT(code)
    const wh = totalGross * whtPct / 100
    divEntries.push({
      type: 'dividend', ticker: pos.ticker, company_name: nameOf(pos.ticker), country: code,
      shares: r4(totalGross / annualDPS), dps: annualDPS,
      gross_amount: r2(totalGross), withholding_origin_pct: whtPct,
      withholding_origin: r2(wh), net_amount: r2(totalGross - wh),
      ex_date: exDates[Math.floor((exDates.length - 1) / 2)] || null,
    })
  }

  // ── Ganancias / pérdidas (FIFO) ──
  const gainEntries = []
  const excludedSells = []
  for (const [ticker, txs] of Object.entries(txByTicker)) {
    const hasAnyBuy = txs.some(t => t.type !== 'sell')
    const lots = []
    for (const t of txs) {
      if (t.type === 'sell') {
        const e = txEur(t)
        const totalSellShares = e.shares
        const sellComm = e.commEUR + e.fxComm
        const inYear = new Date(t.date).getFullYear() === exercise
        let toSell = totalSellShares
        if (!hasAnyBuy) { if (inYear) excludedSells.push({ ticker, name: nameOf(ticker), shares: totalSellShares, sell_date: t.date }); continue }
        while (toSell > 1e-9 && lots.length) {
          const lot = lots[0]
          const take = Math.min(toSell, lot.shares)
          const costBasis = take * lot.costPerShare
          const proceeds = take * e.priceEUR - sellComm * (totalSellShares > 0 ? take / totalSellShares : 0)
          const gain = proceeds - costBasis
          if (inYear) gainEntries.push({
            type: gain >= 0 ? 'gain' : 'loss', ticker, company_name: nameOf(ticker),
            buy_date: lot.date, sell_date: t.date, shares: r4(take),
            buy_price_total: r2(costBasis), sell_price_total: r2(proceeds), gain_loss: r2(gain),
          })
          lot.shares -= take; toSell -= take
          if (lot.shares <= 1e-9) lots.shift()
        }
        if (toSell > 1e-9 && inYear) excludedSells.push({ ticker, name: nameOf(ticker), shares: r4(toSell), sell_date: t.date })
      } else {
        const e = txEur(t)
        if (e.shares > 0) lots.push({ date: t.date, shares: e.shares, costPerShare: (e.grossEUR + e.commEUR + e.fxComm) / e.shares })
      }
    }
  }

  return { divEntries, gainEntries, missingDivHistory, excludedSells }
}

// ── conversión a EUR de una transacción ─────────────────────────────────────
function txEur(t) {
  const rate   = Number(t.exchange_rate) || 1
  const shares = Number(t.shares) || 0
  const price  = Number(t.price) || 0
  const commission = Number(t.commission) || 0
  const fxComm = Number(t.fx_commission_eur) || 0
  return {
    shares, rate, price,
    priceEUR: price * rate,
    grossEUR: shares * price * rate,
    commEUR:  commission * rate,
    fxComm,
  }
}

// ── FIFO: empareja ventas con lotes de compra más antiguos ───────────────────
// Devuelve filas (una por lote consumido) cuyas ventas caen en `year`, más flags.
export function buildFifo(transactions, year) {
  const byTicker = {}
  transactions.forEach(t => { (byTicker[t.ticker] ||= []).push(t) })

  const rows = []
  let incompleteCost = false

  for (const [ticker, txs] of Object.entries(byTicker)) {
    const sorted = [...txs].sort((a, b) => new Date(a.date) - new Date(b.date))
    const lots = []  // { date, shares, costPerShare }  EUR, con comisiones de compra

    for (const t of sorted) {
      if (t.type === 'sell') {
        const e = txEur(t)
        const totalSellShares = e.shares
        const sellCommTotal = e.commEUR + e.fxComm
        const inYear = new Date(t.date).getFullYear() === year
        let toSell = totalSellShares

        while (toSell > 1e-9 && lots.length) {
          const lot = lots[0]
          const take = Math.min(toSell, lot.shares)
          const costBasis = take * lot.costPerShare
          const proceeds  = take * e.priceEUR - sellCommTotal * (totalSellShares > 0 ? take / totalSellShares : 0)
          if (inYear) rows.push({ ticker, buyDate: lot.date, sellDate: t.date, shares: take, costBasis, proceeds, gain: proceeds - costBasis })
          lot.shares -= take; toSell -= take
          if (lot.shares <= 1e-9) lots.shift()
        }
        if (toSell > 1e-9) {            // venta sin lote de compra registrado
          incompleteCost = true
          if (inYear) {
            const proceeds = toSell * e.priceEUR - sellCommTotal * (totalSellShares > 0 ? toSell / totalSellShares : 0)
            rows.push({ ticker, buyDate: null, sellDate: t.date, shares: toSell, costBasis: null, proceeds, gain: null, incomplete: true })
          }
          toSell = 0
        }
      } else {                          // buy / buy_recurring
        const e = txEur(t)
        if (e.shares > 0) {
          const costTotal = e.grossEUR + e.commEUR + e.fxComm
          lots.push({ date: t.date, shares: e.shares, costPerShare: costTotal / e.shares })
        }
      }
    }
  }
  return { rows, incompleteCost }
}

// Resultado neto (ganancias − pérdidas) por año, para compensación de pérdidas.
export function yearlyPL(transactions, fromYear, toYear) {
  const out = {}
  for (let y = fromYear; y <= toYear; y++) {
    const { rows } = buildFifo(transactions, y)
    out[y] = rows.reduce((s, r) => s + (r.gain || 0), 0)
  }
  return out
}

// ── Dividendos del ejercicio agrupados por empresa ───────────────────────────
export function buildDividends(dividends, year, countryFallback = {}) {
  const byTicker = {}
  dividends.filter(d => new Date(d.date).getFullYear() === year).forEach(d => {
    (byTicker[d.ticker] ||= { gross: 0 })
    byTicker[d.ticker].gross += Number(d.amount) || 0
  })
  return Object.entries(byTicker).map(([ticker, v]) => {
    const code = countryCodeOf(ticker, countryFallback[ticker])
    const whtPct = getWHT(code)
    const gross = v.gross
    const retention = gross * whtPct / 100
    return {
      ticker, name: nameOf(ticker), code, country: COUNTRY_NAMES[code] || code,
      whtPct, gross, retention, net: gross - retention, isSpanish: code === 'ES',
    }
  }).sort((a, b) => b.gross - a.gross)
}

// ── Resumen fiscal completo ──────────────────────────────────────────────────
export function buildFiscalSummary(transactions, dividends, year, countryFallback = {}) {
  const divRows = buildDividends(dividends, year, countryFallback)
  const { rows: fifoRows, incompleteCost } = buildFifo(transactions, year)

  const grossDiv   = divRows.reduce((s, r) => s + r.gross, 0)
  const retSpain   = divRows.filter(r => r.isSpanish).reduce((s, r) => s + r.retention, 0)
  const retForeign = divRows.filter(r => !r.isSpanish).reduce((s, r) => s + r.retention, 0)
  const retTotal   = retSpain + retForeign
  const netDiv     = grossDiv - retTotal

  const gains  = fifoRows.filter(r => r.gain != null && r.gain > 0).reduce((s, r) => s + r.gain, 0)
  const losses = fifoRows.filter(r => r.gain != null && r.gain < 0).reduce((s, r) => s + Math.abs(r.gain), 0)
  const netCG  = gains - losses

  // Doble imposición: extranjeras, deducible = mín(retención origen, 15% bruto)
  const foreignRows = divRows.filter(r => !r.isSpanish && r.gross > 0).map(r => {
    const limit = r.gross * 0.15
    const deductible = Math.min(r.retention, limit)
    return { ...r, limit, deductible }
  })
  const deductibleTotal = foreignRows.reduce((s, r) => s + r.deductible, 0)

  // Base imponible del ahorro estimada (RCM neto + ganancias netas)
  const taxBase = netDiv + netCG

  return {
    year,
    divRows, fifoRows, foreignRows,
    grossDiv, retSpain, retForeign, retTotal, netDiv,
    gains, losses, netCG,
    deductibleTotal,
    taxBase,
    incompleteCost,
    hasSells: fifoRows.length > 0,
    hasForeign: foreignRows.length > 0,
    boxes: {
      '0029': grossDiv,
      '0031': retSpain,
      '0380': gains,
      '0382': losses,
      '0588': deductibleTotal,
    },
  }
}
