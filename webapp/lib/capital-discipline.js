// Capital Discipline Ratio (CDR) — lógica ÚNICA compartida por el gráfico de
// Capital Allocation, el scoring DGI, el semáforo de salud y los insights.
// CDR = (dividendos + recompras + adquisiciones) / FCF × 100
// El FCF ya tiene el capex descontado — el capex NO entra en el cálculo.
// Puro (server + cliente): recibe los jsonb {columns,data} de cashflow y balance.

function row(stmt, ...labels) {
  const d = stmt?.data, cols = stmt?.columns
  if (!d || !Array.isArray(cols)) return {}
  let arr = null
  for (const l of labels) { if (Array.isArray(d[l])) { arr = d[l]; break } }
  if (!arr) return {}
  const out = {}
  cols.forEach((c, i) => {
    const y = parseInt(String(c).slice(0, 4), 10)
    const v = arr[i]
    if (!isNaN(y) && v != null && !isNaN(v)) out[y] = Number(v)
  })
  return out
}

export function computeCapitalFlows(cashflow, balance) {
  const fcf = row(cashflow, 'Flujo de Caja Libre', 'Free Cash Flow')
  const dividends = row(cashflow, 'Dividendos Pagados', 'Dividends Paid', 'Cash Dividends Paid', 'Common Stock Dividend Paid')
  const buybacks = row(cashflow, 'Recompra de Acciones', 'Repurchase Of Capital Stock', 'Common Stock Repurchased')
  const acquisitions = row(cashflow, 'Adquisición de Negocios', 'Purchase Of Business', 'Net Business Purchase And Sale')
  const totalDebt = row(balance, 'Deuda Total', 'Total Debt')
  const cash = row(balance, 'Caja y Equivalentes', 'Cash And Cash Equivalents', 'Cash Cash Equivalents And Short Term Investments')
  const netDebt = {}
  for (const y of Object.keys(totalDebt)) if (cash[y] != null) netDebt[y] = totalDebt[y] - cash[y]
  return { fcf, dividends, buybacks, acquisitions, netDebt }
}

// Devuelve null si no hay datos suficientes.
export function computeCDR(cashflow, balance) {
  const f = computeCapitalFlows(cashflow, balance)
  const allYears = [...new Set([
    ...Object.keys(f.fcf), ...Object.keys(f.dividends), ...Object.keys(f.buybacks),
  ])].map(Number).filter(y => !isNaN(y)).sort((a, b) => a - b)
  if (!allYears.length) return null

  const byYear = allYears.map(y => {
    const fcf = f.fcf[y] ?? null
    const div = Math.abs(f.dividends[y] ?? 0)
    const buy = Math.abs(f.buybacks[y] ?? 0)
    const acq = Math.abs(f.acquisitions[y] ?? 0)
    // FCF ≤ 0 → CDR no calculable ese año (N/A)
    const cdr = (fcf != null && fcf > 0) ? (div + buy + acq) / fcf * 100 : null
    const resto = fcf != null ? fcf - div - buy - acq : null
    return { year: y, fcf, div, buy, acq, cdr, resto }
  })

  const last4 = byYear.slice(-4)
  const cdrs4 = last4.map(r => r.cdr).filter(v => v != null)
  const avg4y = cdrs4.length ? cdrs4.reduce((s, v) => s + v, 0) / cdrs4.length : null
  const yearsAbove100 = last4.filter(r => r.cdr != null && r.cdr > 100).length
  let consec2 = false
  for (let i = 1; i < last4.length; i++) {
    if (last4[i].cdr != null && last4[i].cdr > 100 && last4[i - 1].cdr != null && last4[i - 1].cdr > 100) consec2 = true
  }
  const lastYear = byYear[byYear.length - 1] || null
  const cdrLastYear = lastYear?.cdr ?? null

  // Variación de deuda neta en ~4 años
  const ndYears = Object.keys(f.netDebt).map(Number).sort((a, b) => a - b)
  let netDebtChange = null, netDebtChangePct = null, netDebtEnd = null
  if (ndYears.length >= 2) {
    const yE = ndYears[ndYears.length - 1], yS = ndYears[Math.max(0, ndYears.length - 5)]
    const nE = f.netDebt[yE], nS = f.netDebt[yS]
    netDebtEnd = nE
    netDebtChange = nE - nS
    netDebtChangePct = nS !== 0 ? (nE - nS) / Math.abs(nS) * 100 : null
  }

  // ¿La distribución se está financiando REALMENTE con deuda? Solo si la deuda
  // neta termina en positivo (deuda real, no caja neta), ha crecido y de forma
  // significativa. Evita el falso positivo de empresas que recompran con caja
  // (p.ej. Munich Re): distribución > FCF pero sin aumentar deuda → NO es problema.
  const debtRising = netDebtEnd != null && netDebtEnd > 0 &&
    netDebtChange != null && netDebtChange > 0 &&
    netDebtChangePct != null && netDebtChangePct > 15

  // Flag de disciplina de capital
  const allCdr = byYear.map(r => r.cdr).filter(v => v != null)
  const allAbove = allCdr.length > 0 && allCdr.every(v => v > 100)
  let flag = null
  if (avg4y != null) {
    if (allAbove && netDebtChangePct != null && netDebtChangePct > 30) flag = 'critical'
    else if (avg4y > 110 || yearsAbove100 >= 3) flag = 'concern'
    else if ((avg4y >= 90 && avg4y <= 110) || yearsAbove100 >= 1) flag = 'watch'
    else if (avg4y < 60) flag = 'excellent'
    else flag = 'good'
  }

  return { byYear, last4, avg4y, yearsAbove100, consec2, cdrLastYear, lastYear, netDebtChange, netDebtChangePct, netDebtEnd, debtRising, flag }
}
