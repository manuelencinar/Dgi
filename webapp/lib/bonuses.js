// Bonificaciones por tendencia positiva — adicionales al scoring DGI base.
// No modifican umbrales ni penalizaciones existentes: solo suman puntos extra por
// tendencias positivas sostenidas. Cap total +1.0. Requieren ≥3 años de histórico.
// Lee de los jsonb anuales de company_fundamentals (income/balance/cashflow).
// La lógica está replicada en scripts/update_fundamentals.py (deben coincidir).

const TAX = 0.21

// Fila de un estado financiero como mapa { año: valor }.
function mapByYear(stmt, ...keys) {
  const d = stmt?.data, cols = stmt?.columns
  if (!d || !Array.isArray(cols)) return {}
  let arr = null
  for (const k of keys) { if (Array.isArray(d[k])) { arr = d[k]; break } }
  if (!arr) return {}
  const out = {}
  cols.forEach((c, i) => {
    const y = parseInt(String(c).slice(0, 4), 10)
    const v = arr[i]
    if (!isNaN(y) && v != null && !isNaN(v)) out[y] = parseFloat(v)
  })
  return out
}

const descYears = (...maps) => {
  const ys = new Set()
  maps.forEach(m => Object.keys(m).forEach(y => ys.add(+y)))
  return [...ys].sort((a, b) => b - a)
}

// Nivel de mejora sobre los valores líderes: 3 = mejora los 3 últimos (v0>v1>v2),
// 2 = mejora los 2 últimos (v0>v1), 0 = no. higher=false → "menor es mejor".
function improving(vals, higher = true) {
  if (!vals) return 0
  const v0 = vals[0], v1 = vals[1], v2 = vals[2]
  const b = (a, c) => higher ? a > c : a < c
  if (v0 != null && v1 != null && v2 != null && b(v0, v1) && b(v1, v2)) return 3
  if (v0 != null && v1 != null && b(v0, v1)) return 2
  return 0
}

function movingAvg3(vals) {
  const out = []
  for (let i = 0; i + 2 < vals.length; i++) {
    const a = vals[i], b = vals[i + 1], c = vals[i + 2]
    out.push((a != null && b != null && c != null) ? (a + b + c) / 3 : null)
  }
  return out
}

export function computeBonuses(data, sectorType) {
  const isa = data.income_statement_annual, bsa = data.balance_sheet_annual, cfa = data.cashflow_annual
  const cols = isa?.columns || bsa?.columns || cfa?.columns
  const empty = { applied: [], total: 0, byKey: {} }
  if (!Array.isArray(cols) || cols.length < 3) return empty

  const ebit     = mapByYear(isa, 'EBIT / Bº Operativo', 'Operating Income', 'Ebit')
  const rev      = mapByYear(isa, 'Ingresos Totales', 'Total Revenue')
  const interest = mapByYear(isa, 'Gastos por Intereses', 'Interest Expense')
  const equity   = mapByYear(bsa, 'Patrimonio Neto', 'Total Stockholder Equity', 'Stockholders Equity', 'Common Stock Equity')
  const debt     = mapByYear(bsa, 'Deuda Total', 'Total Debt')
  const assets   = mapByYear(bsa, 'Activos Totales', 'Total Assets')
  const cash     = mapByYear(bsa, 'Caja y Equivalentes', 'Cash And Cash Equivalents', 'Cash Cash Equivalents And Short Term Investments')
  const fcfM     = mapByYear(cfa, 'Flujo de Caja Libre', 'Free Cash Flow')
  const cfoM     = mapByYear(cfa, 'Cash Flow Operativo', 'Operating Cash Flow', 'Total Cash From Operating Activities')
  const depM     = mapByYear(cfa, 'Depreciación y Amortización', 'Depreciation And Amortization', 'Depreciation Amortization Depletion')

  const applied = [], byKey = {}
  const add = (key, amount, label, tooltip) => { byKey[key] = amount; if (amount > 0) applied.push({ key, amount, label, tooltip }) }
  const isCyclical = sectorType === 'energy'
  const isLeveraged = sectorType === 'utilities' || sectorType === 'reit'

  // ── 1. ROIC creciente (+0.3) ──
  const roicYrs = descYears(ebit, equity, debt)
  const roic = roicYrs.map(y => {
    const e = ebit[y], eq = equity[y], dt = debt[y]
    if (e == null || eq == null || dt == null) return null
    let cap = eq + dt
    const floor = assets[y] != null ? assets[y] * 0.10 : 0
    if (cap < floor) cap = floor
    return cap > 0 ? (e * (1 - TAX)) / cap * 100 : null
  })
  {
    const lvl = improving(roic, true)
    const amt = lvl === 3 ? 0.3 : lvl === 2 ? 0.15 : 0
    add('roic', amt, `ROIC creciente ${lvl} años consecutivos`, `ROIC creciente ${lvl} años consecutivos — señal de ampliación del foso económico`)
  }

  // ── 2. Márgenes en expansión (+0.2) ──
  const omYrs = descYears(ebit, rev)
  const opm = omYrs.map(y => (ebit[y] != null && rev[y] > 0) ? ebit[y] / rev[y] * 100 : null)
  {
    const lvl = isCyclical ? (improving(movingAvg3(opm), true) === 3 ? 3 : 0) : improving(opm, true)
    const amt = lvl === 3 ? 0.2 : lvl === 2 ? 0.1 : 0
    add('margin', amt, 'Márgenes en expansión', `Márgenes en expansión ${lvl} años — señal de mejora del pricing power o eficiencia operativa`)
  }

  // ── 3. Deuda (+0.2) ──
  const ndYrs = descYears(debt, cash)
  const netDebt = ndYrs.map(y => (debt[y] != null && cash[y] != null) ? debt[y] - cash[y] : null)
  const ndEbitda = ndYrs.map((y, i) => {
    const ebd = ebit[y] != null ? ebit[y] + (depM[y] || 0) : null
    return (netDebt[i] != null && ebd > 0) ? netDebt[i] / ebd : null
  })
  {
    if (isLeveraged) {
      const cy = descYears(ebit, interest)
      const cov = cy.map(y => (ebit[y] != null && interest[y] && interest[y] !== 0) ? ebit[y] / Math.abs(interest[y]) : null)
      const amt = improving(cov, true) === 3 ? 0.2 : 0
      add('debt', amt, 'Cobertura de intereses mejorando', 'Cobertura de intereses mejorando 3 años consecutivos — fortalecimiento del balance')
    } else {
      const lvl = improving(netDebt, false)
      let amt = lvl === 3 ? 0.2 : lvl === 2 ? 0.1 : 0
      let yrs = lvl
      if (amt === 0 && improving(ndEbitda, false) === 3) { amt = 0.1; yrs = 3 }
      add('debt', amt, 'Deuda neta reduciéndose', `Deuda neta reduciéndose ${yrs || 3} años consecutivos — fortalecimiento del balance`)
    }
  }

  // ── 4. FCF creciente (+0.2) ── (Utilities: CFO)
  {
    const m = sectorType === 'utilities' ? cfoM : fcfM
    const s = descYears(m).map(y => m[y])
    let amt = 0, lvl = 0
    const [v0, v1, v2] = s
    if (v0 != null && v1 != null && v2 != null && v0 > v1 && v1 > v2 && v0 > 0 && v1 > 0 && v2 > 0) { amt = 0.2; lvl = 3 }
    else if (v0 != null && v1 != null && v0 > v1 && v0 > 0 && v1 > 0) { amt = 0.1; lvl = 2 }
    add('fcf', amt, 'FCF creciente', `FCF creciente ${lvl} años consecutivos — capacidad creciente de generación de caja`)
  }

  // ── 5. Aceleración del dividendo (+0.1) ──
  {
    const hist = Array.isArray(data.divHistory) ? data.divHistory : (Array.isArray(data.div_history) ? data.div_history : [])
    const full = hist.filter(h => h && h.dps != null && !h.isPartial).sort((a, b) => a.year - b.year)
    let amt = 0
    if (full.length >= 5) {
      const last = full[full.length - 1], y3 = full[full.length - 4]
      if (y3?.dps > 0 && last?.dps > 0) {
        const cagr3 = Math.pow(last.dps / y3.dps, 1 / 3) - 1
        let cagr10 = data.div_cagr10 != null ? data.div_cagr10 / 100 : null
        if (cagr10 == null) {
          const base = full.length >= 11 ? full[full.length - 11] : full[0]
          const yrs = full.length >= 11 ? 10 : (full.length - 1)
          if (base?.dps > 0 && yrs > 0) cagr10 = Math.pow(last.dps / base.dps, 1 / yrs) - 1
        }
        if (cagr10 != null && cagr3 <= 0.30 && cagr3 > cagr10 * 1.1) amt = 0.1
      }
    }
    add('div', amt, 'Aceleración del dividendo', 'El dividendo crece más rápido en los últimos 3 años que en su media histórica — señal de confianza del management en el negocio')
  }

  // ── 6. Caja neta positiva y mejorando (+0.1) ──
  {
    const amt = (netDebt[0] != null && netDebt[1] != null && netDebt[0] < 0 && netDebt[0] < netDebt[1]) ? 0.1 : 0
    add('netcash', amt, 'Caja neta positiva y creciente', 'Posición de caja neta positiva y creciente — fortaleza financiera excepcional')
  }

  let total = applied.reduce((s, b) => s + b.amount, 0)
  total = Math.min(1.0, Math.round(total * 100) / 100)
  return { applied, total, byKey }
}
