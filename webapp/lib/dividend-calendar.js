// Calendario de dividendos de la cartera basado en DATOS REALES.
// A diferencia de buildCalendar (estimación genérica por país, usado por el email
// mensual), esta función usa el historial real de cada empresa:
//   · dividend_events  → frecuencia real y meses/días exactos de pago
//   · next_ex_date / next_pay_date → pagos ya confirmados por la empresa
//   · div_history      → DPS del año anterior (para importe y comparativa YoY)
//   · distribution_history (fondos) → meses reales de reparto
// Importes convertidos a EUR con tipos reales (exchange_rates) pasados en fxToEUR.

import { getWHT, effectiveDivTax } from '@/lib/screener'

export const MONTHS_ES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
export const MONTHS_ES_LONG = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

// Calendario del UNIVERSO: meses (1-12) en los que una empresa suele repartir,
// derivados de las fechas ex-dividendo recientes (~últimos 30 meses). [] si no hay.
export function payMonthsFromEvents(events) {
  if (!Array.isArray(events) || !events.length) return []
  const cutoff = new Date(); cutoff.setMonth(cutoff.getMonth() - 30)
  const months = new Set()
  for (const e of events) {
    if (!e?.ex_date) continue
    const d = new Date(e.ex_date)
    if (!isNaN(d) && d >= cutoff) months.add(d.getMonth() + 1)
  }
  if (!months.size) {  // sin eventos recientes → últimos 4 registrados (patrón histórico)
    for (const e of events.slice(-4)) {
      if (!e?.ex_date) continue
      const d = new Date(e.ex_date)
      if (!isNaN(d)) months.add(d.getMonth() + 1)
    }
  }
  return [...months].sort((a, b) => a - b)
}

// ── fechas ──────────────────────────────────────────────────────────────────
function addBusinessDays(date, n) {
  const d = new Date(date); let c = 0
  while (c < n) { d.setDate(d.getDate() + 1); const wd = d.getDay(); if (wd !== 0 && wd !== 6) c++ }
  return d
}
function addCalendarDays(date, n) { const d = new Date(date); d.setDate(d.getDate() + n); return d }

// Offset ex-dividendo → pago según el mercado (Mejora 2 del spec).
function payOffset(date, code) {
  const c = (code || '').toUpperCase()
  if (c === 'ES') return addBusinessDays(date, 3)
  if (['FR','DE','NL','BE','CH','AT','IT','PT','LU','IE','SE','DK','NO','FI'].includes(c)) return addBusinessDays(date, 2)
  if (c === 'GB' || c === 'US' || c === 'JP') return addCalendarDays(date, 28)
  return addCalendarDays(date, 21)
}

function parseDate(s) {
  if (!s) return null
  const d = new Date(String(s).slice(0, 10) + 'T12:00:00')
  return isNaN(d.getTime()) ? null : d
}

// ── frecuencia real (dividend_events / distribution_history) ────────────────
function nearestFreq(n) {
  return [1, 2, 4, 12].reduce((p, c) => Math.abs(c - n) < Math.abs(p - n) ? c : p, 1)
}

function freqFromDates(dates) {
  const ds = dates.map(parseDate).filter(Boolean).sort((a, b) => a - b)
  if (!ds.length) return null
  const today = new Date()
  const cutoff = new Date(today); cutoff.setDate(cutoff.getDate() - 400)
  const recent = ds.filter(d => d >= cutoff)
  if (recent.length >= 1) return nearestFreq(recent.length)
  // Sin pagos recientes: deducir del espaciado de los últimos 4 eventos
  if (ds.length < 2) return null
  const tail = ds.slice(-4)
  const gapMonths = ((tail[tail.length - 1] - tail[0]) / (1000 * 3600 * 24 * 30.4)) / (tail.length - 1)
  return nearestFreq(Math.round(12 / Math.max(gapMonths, 1)))
}

// ── DPS anual del año natural anterior ──────────────────────────────────────
function priorYearDPS(divHistory, year) {
  if (!Array.isArray(divHistory)) return null
  const row = divHistory.find(h => Number(h.year) === year - 1)
  return row && row.dps != null ? Number(row.dps) : null
}
function lastFullYearDPS(divHistory, year) {
  if (!Array.isArray(divHistory)) return null
  const full = divHistory.filter(h => Number(h.year) < year && h.dps != null).sort((a, b) => a.year - b.year)
  return full.length ? Number(full[full.length - 1].dps) : null
}

// Ocurrencias de pago en el año `year` a partir de un ciclo de fechas ex base.
// noOffset=true para fondos: la fecha de reparto ya es la fecha de pago.
function placementsFromCycle(cycleDates, code, year, noOffset = false) {
  const out = []
  for (const base of cycleDates) {
    for (const yr of [year - 1, year, year + 1]) {
      const ex  = new Date(yr, base.getMonth(), base.getDate(), 12)
      const pay = noOffset ? ex : payOffset(ex, code)
      if (pay.getFullYear() === year) out.push({ payDate: pay, exDate: ex })
    }
  }
  // dedup por mes
  const seen = new Set(), uniq = []
  for (const p of out.sort((a, b) => a.payDate - b.payDate)) {
    if (seen.has(p.payDate.getMonth())) continue
    seen.add(p.payDate.getMonth()); uniq.push(p)
  }
  return uniq
}

// ── núcleo ──────────────────────────────────────────────────────────────────
// enriched: posiciones ya enriquecidas (name, ticker, shares, currency, countryCode,
//   type, isFund, dps, distributionHistory). fundamentalsMap: ticker → fila cruda
//   de company_fundamentals (dividend_events, next_ex_date, next_pay_date, div_history).
// fxToEUR: { CUR: tasa X→EUR }. destWHT: retención de destino del usuario (%).
export function buildDividendCalendar(enriched, fundamentalsMap, fxToEUR, destWHT = 19, opts = {}) {
  const year  = opts.year || new Date().getFullYear()
  const whtOverrides = opts.whtOverrides || null
  const today = new Date()
  const fx    = c => (c === 'EUR' ? 1 : (fxToEUR?.[c] ?? null))

  const months = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1, monthName: MONTHS_ES[i], year,
    entries: [], total: 0, confirmedTotal: 0, estimatedTotal: 0, count: 0, priorTotal: 0,
  }))

  enriched.forEach(pos => {
    const shares = Number(pos.shares) || 0
    if (shares <= 0) return
    const currency = pos.currency || 'EUR'
    const rate = fx(currency)
    if (rate == null) return                 // sin tipo de cambio real → no inventamos
    const code = (pos.countryCode || '').toUpperCase()
    const fund = fundamentalsMap?.[pos.ticker] || {}

    // Frecuencia + ciclo de fechas + DPS actual y previo
    let freq = null, cycleDates = [], curAnnual = null, priorAnnual = null
    let distFlag = false

    if (pos.isFund) {
      const hist = (pos.distributionHistory || []).filter(d => d.date)
      freq = freqFromDates(hist.map(d => d.date))
      if (!freq) return
      cycleDates = hist.map(d => parseDate(d.date)).filter(Boolean).sort((a, b) => a - b).slice(-freq)
      curAnnual = Number(pos.dps) || 0       // distribución anual estimada
      const pj = hist.filter(d => parseDate(d.date) && parseDate(d.date).getFullYear() === year - 1)
      priorAnnual = pj.length ? pj.reduce((s, d) => s + (Number(d.amount) || 0), 0) : null
      distFlag = true
    } else {
      const events = Array.isArray(fund.dividend_events) ? fund.dividend_events : []
      const divHist = Array.isArray(fund.div_history) ? fund.div_history : []
      const dpsTTM = Number(pos.dps) || 0
      if (events.length >= 1) {
        freq = freqFromDates(events.map(e => e.ex_date))
        if (freq) cycleDates = events.map(e => parseDate(e.ex_date)).filter(Boolean).sort((a, b) => a - b).slice(-freq)
      }
      if (!freq && divHist.length >= 2 && dpsTTM > 0) {
        // hay historial anual pero no fechas ex → patrón por país, día 15
        freq = countryFreq(code)
        cycleDates = countryMonths(code).map(m => new Date(year, m - 1, 15, 12))
      }
      if (!freq || !cycleDates.length) return
      // div_history viene crudo de Yahoo: las .L están en peniques → a libras (÷100)
      // para casar con pos.dps (ya normalizado) y el FX GBP→EUR. pos.dps NO se reescala.
      const penceAdj = (currency === 'GBP' && /\.L$/i.test(pos.ticker)) ? 0.01 : 1
      curAnnual   = dpsTTM > 0 ? dpsTTM : (lastFullYearDPS(divHist, year) ?? 0) * penceAdj
      const prior = priorYearDPS(divHist, year) ?? lastFullYearDPS(divHist, year)
      priorAnnual = prior != null ? prior * penceAdj : null
      if (!curAnnual || curAnnual <= 0) return
    }

    const placements = placementsFromCycle(cycleDates, code, year, distFlag)
    if (!placements.length) return

    const perLocal   = curAnnual / freq
    const grossEUR   = perLocal * shares * rate
    const priorPer   = priorAnnual != null ? (priorAnnual / freq) * shares * rate : null
    const originPct  = pos.isFund ? 0 : getWHT(code, whtOverrides)
    // Retención efectiva con tope del 15% al crédito por doble imposición (ley ES).
    const effPct     = effectiveDivTax(originPct, destWHT || 0, code === 'ES')

    // Pago confirmado de la empresa
    let confirmedDate = null
    if (!pos.isFund) {
      const np = parseDate(fund.next_pay_date)
      const nx = parseDate(fund.next_ex_date)
      if (np && np >= addCalendarDays(today, -3)) confirmedDate = np
      else if (nx && nx >= addCalendarDays(today, -3)) confirmedDate = payOffset(nx, code)
    }

    placements.forEach(pl => {
      let status = 'estimated', date = pl.payDate
      if (confirmedDate && confirmedDate.getFullYear() === year &&
          Math.abs(confirmedDate.getMonth() - pl.payDate.getMonth()) === 0) {
        status = 'confirmed'; date = confirmedDate; confirmedDate = null
      }
      const mi = date.getMonth()
      const entry = {
        ticker: pos.ticker, name: pos.name, type: pos.assetType || (pos.isFund ? 'fund' : 'stock'),
        shares, dps: curAnnual, perLocal, currency,
        grossEUR, netEUR: grossEUR * (1 - effPct / 100), retEUR: grossEUR * (effPct / 100), retPct: effPct,
        date, day: date.getDate(), status, confirmed: status === 'confirmed',
      }
      months[mi].entries.push(entry)
      months[mi].total += grossEUR
      months[mi].count += 1
      if (status === 'confirmed') months[mi].confirmedTotal += grossEUR
      else months[mi].estimatedTotal += grossEUR
      if (priorPer != null) months[mi].priorTotal += priorPer
    })

    // Si quedó un pago confirmado sin emparejar, añadirlo como entrada propia
    if (confirmedDate && confirmedDate.getFullYear() === year && !pos.isFund) {
      const mi = confirmedDate.getMonth()
      const entry = {
        ticker: pos.ticker, name: pos.name, type: pos.assetType || 'stock',
        shares, dps: curAnnual, perLocal, currency,
        grossEUR, netEUR: grossEUR * (1 - effPct / 100), retEUR: grossEUR * (effPct / 100), retPct: effPct,
        date: confirmedDate, day: confirmedDate.getDate(), status: 'confirmed', confirmed: true,
      }
      months[mi].entries.push(entry)
      months[mi].total += grossEUR; months[mi].count += 1; months[mi].confirmedTotal += grossEUR
      if (priorPer != null) months[mi].priorTotal += priorPer
    }
  })

  // Orden interno y redondeos
  months.forEach(m => {
    m.entries.sort((a, b) => a.date - b.date)
  })

  const allEntries = months.flatMap(m => m.entries)
  const upcoming   = allEntries.filter(e => e.date >= addCalendarDays(today, -0.5)).sort((a, b) => a.date - b.date)

  const totalYear     = months.reduce((s, m) => s + m.total, 0)
  const confirmedYear = months.reduce((s, m) => s + m.confirmedTotal, 0)
  const priorYear     = months.reduce((s, m) => s + m.priorTotal, 0)
  const estimatedToDate = allEntries.filter(e => e.date <= today).reduce((s, e) => s + e.grossEUR, 0)

  return {
    months, allEntries, upcoming,
    nextPayment: upcoming[0] || null,
    priorMonths: months.map(m => m.priorTotal),
    totals: { totalYear, confirmedYear, priorYear, avgMonthly: totalYear / 12, estimatedToDate },
  }
}

// ── patrón de meses por país (fallback cuando no hay fechas ex) ─────────────
function countryMonths(code) {
  const c = (code || '').toUpperCase()
  if (c === 'US' || c === 'CA') return [3, 6, 9, 12]
  if (c === 'GB') return [4, 10]
  if (c === 'JP' || c === 'AU' || c === 'NZ') return [3, 9]
  if (['ES', 'IT', 'PT'].includes(c)) return [6, 12]
  if (['DE', 'AT', 'CH', 'NL', 'BE', 'SE', 'DK', 'NO', 'FI'].includes(c)) return [4]
  if (['FR', 'LU'].includes(c)) return [5]
  return [5]
}
function countryFreq(code) { return countryMonths(code).length }
