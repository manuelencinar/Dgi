// Análisis trimestral + TTM (últimos 12 meses) + YoY (mismo trimestre del año anterior).
// CAPA ADICIONAL: no toca la valoración/ROIC/score canónicos (que siguen sobre datos
// anuales). Lee las filas de financial_history_quarterly (histórico permanente acumulativo)
// o, en su defecto, del JSON vivo income/cashflow/balance_quarterly de company_fundamentals.
// Todo puro y testeable.

const num = v => (v != null && !isNaN(v)) ? Number(v) : null

// Normaliza filas de financial_history_quarterly → serie ascendente por fecha.
export function fromHistoryRows(rows) {
  const qs = (rows || [])
    .filter(r => r && r.period)
    .map(r => {
      const ocf = num(r.operating_cash_flow), capex = num(r.capex)
      const fcf = num(r.free_cash_flow) ?? (ocf != null && capex != null ? ocf - Math.abs(capex) : null)
      return {
        period: String(r.period).slice(0, 10),
        revenue: num(r.revenue), netIncome: num(r.net_income), operatingIncome: num(r.operating_income),
        grossProfit: num(r.gross_profit), eps: num(r.eps_diluted) ?? num(r.eps_basic),
        ocf, capex, fcf,
      }
    })
  return dedupSort(qs)
}

// Normaliza el JSON vivo {columns, data} (income/cashflow trimestral) → misma serie.
export function fromLiveStatements(incomeQ, cashflowQ) {
  const cols = incomeQ?.columns || cashflowQ?.columns || []
  const pick = (stmt, ...labels) => {
    const d = stmt?.data
    if (!d) return null
    for (const l of labels) if (Array.isArray(d[l])) return d[l]
    return null
  }
  const rev = pick(incomeQ, 'Total Revenue', 'Total Revenues', 'Ingresos Totales', 'Operating Revenue')
  const ni = pick(incomeQ, 'Net Income', 'Beneficio Neto', 'Net Income Common Stockholders')
  const oi = pick(incomeQ, 'Operating Income', 'Beneficio Operativo')
  const gp = pick(incomeQ, 'Gross Profit', 'Beneficio Bruto')
  const eps = pick(incomeQ, 'Diluted EPS', 'BPA Diluido', 'Basic EPS')
  const ocf = pick(cashflowQ, 'Operating Cash Flow', 'Cash Flow Operativo')
  const capex = pick(cashflowQ, 'Capital Expenditure')
  const fcf = pick(cashflowQ, 'Free Cash Flow', 'Flujo de Caja Libre')
  const at = (arr, i) => (Array.isArray(arr) && arr[i] != null && !isNaN(arr[i])) ? Number(arr[i]) : null
  const qs = cols.map((c, i) => {
    const o = at(ocf, i), cx = at(capex, i)
    return {
      period: String(c).slice(0, 10),
      revenue: at(rev, i), netIncome: at(ni, i), operatingIncome: at(oi, i), grossProfit: at(gp, i),
      eps: at(eps, i), ocf: o, capex: cx,
      fcf: at(fcf, i) ?? (o != null && cx != null ? o - Math.abs(cx) : null),
    }
  })
  return dedupSort(qs)
}

function dedupSort(qs) {
  const byPeriod = {}
  for (const q of qs) if (q.period && (q.revenue != null || q.netIncome != null || q.fcf != null)) byPeriod[q.period] = q
  return Object.values(byPeriod).sort((a, b) => a.period.localeCompare(b.period))   // ascendente
}

// Índice del trimestre ~1 año antes de `i` (mismo trimestre del año anterior), robusto a
// cadencias irregulares: busca el más cercano a la fecha −1 año, tolerancia 50 días.
function priorYearIdx(qs, i) {
  const target = new Date(qs[i].period); target.setFullYear(target.getFullYear() - 1)
  let best = -1, bestDiff = Infinity
  for (let j = 0; j < i; j++) {
    const diff = Math.abs(new Date(qs[j].period) - target)
    if (diff < bestDiff) { bestDiff = diff; best = j }
  }
  return (best >= 0 && bestDiff / 86400000 <= 50) ? best : -1
}

const pctChange = (cur, prev) => (cur == null || prev == null || prev === 0) ? null : (cur - prev) / Math.abs(prev) * 100

// Margen (%) protegido.
const margin = (part, rev) => (part != null && rev != null && rev > 0) ? part / rev * 100 : null

// Modelo completo para los gráficos: serie por trimestre (con YoY y márgenes), TTM rodante,
// TTM actual vs anterior y resumen del último trimestre.
export function buildQuarterlyModel(qs) {
  if (!qs || qs.length < 2) return { available: false, quarters: [], ttmSeries: [], ttm: null, latest: null }

  const quarters = qs.map((q, i) => {
    const pj = priorYearIdx(qs, i)
    const prev = pj >= 0 ? qs[pj] : null
    return {
      ...q,
      label: labelOf(q.period),
      opMargin: margin(q.operatingIncome, q.revenue),
      netMargin: margin(q.netIncome, q.revenue),
      revenueYoY: prev ? pctChange(q.revenue, prev.revenue) : null,
      netIncomeYoY: prev ? pctChange(q.netIncome, prev.netIncome) : null,
      epsYoY: prev ? pctChange(q.eps, prev.eps) : null,
    }
  })

  // TTM rodante: suma de los 4 trimestres que terminan en cada trimestre (i-3..i).
  const sum4 = (i, key) => {
    if (i < 3) return null
    let s = 0
    for (let k = i - 3; k <= i; k++) { if (qs[k][key] == null) return null; s += qs[k][key] }
    return s
  }
  const ttmSeries = quarters.map((q, i) => ({
    period: q.period, label: q.label,
    revenueTTM: sum4(i, 'revenue'), fcfTTM: sum4(i, 'fcf'), netIncomeTTM: sum4(i, 'netIncome'), epsTTM: sum4(i, 'eps'),
  }))

  // TTM actual (últimos 4) vs TTM anterior (los 4 previos) → YoY del TTM.
  const n = qs.length
  const ttmSum = (from, key) => {
    if (from < 0) return null
    let s = 0
    for (let k = from; k < from + 4; k++) { if (!qs[k] || qs[k][key] == null) return null; s += qs[k][key] }
    return s
  }
  const cur = k => ttmSum(n - 4, k), prevT = k => ttmSum(n - 8, k)
  const ttm = {
    revenue: cur('revenue'), netIncome: cur('netIncome'), fcf: cur('fcf'), eps: cur('eps'),
    revenueYoY: pctChange(cur('revenue'), prevT('revenue')),
    netIncomeYoY: pctChange(cur('netIncome'), prevT('netIncome')),
    fcfYoY: pctChange(cur('fcf'), prevT('fcf')),
    epsYoY: pctChange(cur('eps'), prevT('eps')),
  }

  const last = quarters[n - 1]
  const latest = {
    period: last.period, label: last.label,
    revenue: last.revenue, revenueYoY: last.revenueYoY,
    netIncome: last.netIncome, netIncomeYoY: last.netIncomeYoY,
    eps: last.eps, epsYoY: last.epsYoY,
    fcf: last.fcf,
  }

  return { available: true, quarters, ttmSeries, ttm, latest }
}

// 'YYYY-MM-DD' → etiqueta corta tipo "Q1'26" aproximando por mes de cierre.
export function labelOf(period) {
  const d = new Date(period)
  if (isNaN(d)) return String(period)
  const q = Math.floor(d.getMonth() / 3) + 1
  return `Q${q}'${String(d.getFullYear()).slice(2)}`
}
