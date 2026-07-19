// Salud financiera — semáforo (nivel 1) + tarjetas detalladas (nivel 2).
// Módulo PURO (server + cliente): no toca la lógica de cálculo existente,
// solo consume los campos ya calculados de company_fundamentals.
import { detectSectorType, detectIndustryType, omBreaks, exCfoDivCoverage } from '@/lib/dgi-score'

// Umbrales de margen operativo por INDUSTRIA (reutiliza omBreaks del scoring → salud y
// score coherentes). omBreaks devuelve [[t1,4],[t2,7],[t3,10]]; el semáforo usa 2 cortes:
// rojo < t1, ámbar t1–t2, verde > t2. Solo para sectores con margen "de industria"
// (no REIT/utilities/banca/seguros, cuyo margen es estructural y tiene su propia tabla).
function omThresholds(sectorKey, detail) {
  if (['reit', 'utilities', 'bank', 'insurer'].includes(sectorKey)) return null
  const br = omBreaks(detectIndustryType(detail?.sector, detail?.industry))
  return br ? [br[0][0], br[1][0]] : null
}
import { resolveRoic } from '@/lib/screener'
import { computeCDR } from '@/lib/capital-discipline'
import { debtEbitdaIsArtifact } from '@/lib/helpers'

// ── helpers ────────────────────────────────────────────────────────────────

const COL = { green: '#34d399', yellow: '#fbbf24', red: '#f87171', gray: '#4a5270' }

function num(v) { return v != null && !isNaN(v) ? parseFloat(v) : null }

// Rentabilidad real de los activos de un REIT = caja operativa / activos totales.
// Es la rentabilidad que el REIT le saca a TODOS sus inmuebles combinados, en caja
// real (no beneficio contable, hundido por la amortización). La referencia es su
// propio yield: si esta rentabilidad supera al dividendo, lo financia con su caja;
// si no, depende de deuda/ampliaciones externas.
function realAssetReturn(detail) {
  const ocf = firstVal(detail.cashflow_annual, 'Cash Flow Operativo', 'Operating Cash Flow', 'Cash Flow From Continuing Operating Activities')
  const at  = firstVal(detail.balance_sheet_annual, 'Activos Totales', 'Total Assets')
  return (ocf != null && at && at > 0) ? ocf / at * 100 : null
}
// Yield del dividendo (referencia para la rentabilidad real de activos).
function divYield(detail) {
  const dps = num(detail.dps), px = num(detail.current_price)
  return (dps != null && px && px > 0) ? dps / px * 100 : null
}

// Fila de un estado financiero (arrays más reciente primero)
function sRow(stmt, ...keys) {
  const d = stmt?.data
  if (!d) return null
  for (const k of keys) { if (Array.isArray(d[k])) return d[k] }
  return null
}
function firstVal(stmt, ...keys) {
  const r = sRow(stmt, ...keys)
  if (!r) return null
  for (const v of r) { if (v != null && !isNaN(v)) return parseFloat(v) }
  return null
}

// Clasifica un valor en green/yellow/red según dos umbrales.
// higher=true → verde si v≥t2, amarillo si v≥t1, rojo si no.
// higher=false → verde si v≤t1, amarillo si v≤t2, rojo si no.
function classify(v, t1, t2, higher) {
  if (v == null) return 'gray'
  if (higher) return v >= t2 ? 'green' : v >= t1 ? 'yellow' : 'red'
  return v <= t1 ? 'green' : v <= t2 ? 'yellow' : 'red'
}

function fmtVal(v, unit) {
  if (v == null || isNaN(v)) return '—'
  const n = parseFloat(v)
  if (unit === '%') return `${n.toFixed(1)}%`
  if (unit === 'x') return `${n.toFixed(1)}×`
  return n.toFixed(1)
}

export const HEALTH_SECTOR_LABELS = {
  general: 'General', bank: 'Banco', insurer: 'Aseguradora', reit: 'REIT',
  utilities: 'Utilities', pharma: 'Farmacéutica', energy: 'Energía / Materias primas',
  luxury: 'Lujo',
}

// Reutiliza la detección de sector del scoring (incluye industry).
export function detectHealthSector(type, sector, industry) {
  return detectSectorType(type, sector, industry)
}

// ── NIVEL 1 — SEMÁFORO ──────────────────────────────────────────────────────
// 5 categorías: Rentabilidad · Deuda/Solidez · Dividendo · Márgenes · Crecimiento

const DIAG = {
  rentabilidad: { green: 'Excelente', yellow: 'Aceptable', red: 'Débil', gray: 'Sin datos' },
  deuda:        { green: 'Sana',      yellow: 'Aceptable', red: 'Elevada', gray: 'Sin datos' },
  solidez:      { green: 'Sólida',    yellow: 'Aceptable', red: 'Débil', gray: 'Sin datos' },
  dividendo:    { green: 'Sostenible',yellow: 'Aceptable', red: 'Exigente', gray: 'Sin datos' },
  margenes:     { green: 'Excelente', yellow: 'Aceptable', red: 'Ajustada', gray: 'Sin datos' },
  crecimiento:  { green: 'Fuerte',    yellow: 'Moderado',  red: 'Débil', gray: 'Sin datos' },
}

// Umbrales de margen operativo por sector [t1(ok), t2(bueno)]
const OM_T = {
  general: [10, 20], luxury: [15, 25], pharma: [15, 25], energy: [8, 15],
  reit: [20, 35], utilities: [14, 22], bank: [20, 35], insurer: [6, 12],
}
// Umbrales de deuda neta/EBITDA por sector [t1(verde<), t2(amarillo<)]. Deben
// coincidir con los de las tarjetas (cardSpec 'net_debt_ebitda') para que el
// semáforo y el detalle den el mismo color (energía alineada a 2,5×).
const DEBT_T = {
  general: [1.5, 3], luxury: [1.5, 3], pharma: [1.5, 3], energy: [1.5, 2.5],
  reit: [5, 6], utilities: [3, 5],
}
// Umbrales de ROIC por sector [t1(ok), t2(bueno)]
const ROIC_T = {
  general: [8, 15], pharma: [8, 15], energy: [8, 15], luxury: [12, 20],
  reit: [4, 8], utilities: [4, 8],
}

function row(key, name, color, diagSet, valueStr, note) {
  return { key, name, color: COL[color], diagnosis: DIAG[diagSet][color], value: valueStr, note: note || null }
}

export function buildSemaforo(detail, sectorKey, paysDividend) {
  const roic = resolveRoic(detail)
  const roe = num(detail.roe), roa = num(detail.roa)
  const nde = num(detail.net_debt_ebitda) ?? num(detail.debt_ebitda)
  const payoutFcf = num(detail.payout_fcf), payoutEps = num(detail.payout_eps)
  const opM = num(detail.operating_margin)
  const fcfC = num(detail.fcf_cagr5), revC = num(detail.revenue_cagr5)
  const isBankish = sectorKey === 'bank' || sectorKey === 'insurer'

  const rows = []

  // 1 · Rentabilidad
  if (isBankish) {
    const c = classify(roe, 8, 15, true)
    rows.push(row('rentabilidad', 'Rentabilidad (ROE)', c, 'rentabilidad', fmtVal(roe, '%')))
  } else if (sectorKey === 'reit') {
    // En REITs el ROIC no es representativo (la amortización inmobiliaria lo
    // distorsiona): se usa la rentabilidad real de los activos (caja operativa /
    // activos) comparada con el propio yield del dividendo.
    const rar = realAssetReturn(detail), y = divYield(detail)
    const ref = (y != null && y > 0) ? y : 5
    const c = classify(rar, ref * 0.85, ref, true)
    const note = (rar != null && y != null)
      ? (rar >= y ? `Su caja por activos (${rar.toFixed(1)}%) cubre el dividendo (${y.toFixed(1)}%) — se autofinancia`
                  : `Su caja por activos (${rar.toFixed(1)}%) no llega al dividendo (${y.toFixed(1)}%) — depende de deuda o ampliaciones`)
      : null
    rows.push(row('rentabilidad', 'Rentabilidad real de activos', c, 'rentabilidad', fmtVal(rar, '%'), note))
  } else {
    const [t1, t2] = ROIC_T[sectorKey] || ROIC_T.general
    const c = classify(roic, t1, t2, true)
    rows.push(row('rentabilidad', 'Rentabilidad (ROIC)', c, 'rentabilidad', fmtVal(roic, '%')))
  }

  // 2 · Deuda (o Solidez/ROA en bancos)
  if (isBankish) {
    const c = classify(roa, 0.5, 1, true)
    rows.push(row('deuda', 'Solidez (ROA)', c, 'solidez', fmtVal(roa, '%')))
  } else if (debtEbitdaIsArtifact(nde)) {
    // Múltiplo disparado (>30x) = EBITDA cercano a cero, no apalancamiento real:
    // se marca como riesgo elevado con nota, sin mostrar el número crudo.
    rows.push(row('deuda', 'Deuda', 'red', 'deuda', 'EBITDA≈0',
      'El múltiplo deuda/EBITDA se dispara porque el EBITDA es casi nulo (no es apalancamiento de 200×). Ratio no representativo; vigilar la capacidad de cubrir la deuda.'))
  } else {
    const [t1, t2] = DEBT_T[sectorKey] || DEBT_T.general
    const c = classify(nde, t1, t2, false)
    rows.push(row('deuda', 'Deuda', c, 'deuda', fmtVal(nde, 'x')))
  }

  // 3 · Dividendo (payout) — ajustado por disciplina de capital (CDR).
  // Si la empresa no reparte dividendo, la categoría se excluye del gauge
  // (su peso se redistribuye entre las demás al haber una fila menos).
  if (paysDividend !== false) {
    const payout = isBankish ? payoutEps : (payoutFcf ?? payoutEps)
    const permissive = sectorKey === 'reit' || sectorKey === 'utilities'
    const [t1, t2] = permissive ? [80, 95] : [60, 80]
    let c = classify(payout, t1, t2, false)
    let note = null
    // Disciplina de capital (CDR = distribución total / FCF). NO penaliza el color
    // del dividendo (eso depende del payout): que la distribución supere el FCF por
    // RECOMPRAS no compromete el dividendo si no se financia con deuda. Solo añade
    // una nota. Se OMITE en banca/seguros/REITs: ahí el FCF y "deuda neta = deuda −
    // caja" no son representativos (balance lleno de inversiones/pasivos técnicos),
    // así que el CDR sería ruido (p.ej. Munich Re).
    if (!isBankish && sectorKey !== 'reit') {
      const cdr = computeCDR(detail.cashflow_annual, detail.balance_sheet_annual)
      if (cdr?.avg4y != null && cdr.avg4y > 100) {
        note = cdr.debtRising
          ? 'El payout del dividendo es cómodo, pero la deuda neta crece: las recompras/adquisiciones superan el FCF (ver insights)'
          : 'Distribuye por encima del FCF vía recompras, sin aumentar la deuda neta (se financia con caja) — no compromete el dividendo'
      }
    }
    rows.push(row('dividendo', 'Dividendo', c, 'dividendo', fmtVal(payout, '%'), note))
  }

  // 4 · Márgenes (margen operativo) — umbrales por INDUSTRIA (omBreaks) cuando aplica.
  {
    const [t1, t2] = omThresholds(sectorKey, detail) || OM_T[sectorKey] || OM_T.general
    const c = classify(opM, t1, t2, true)
    rows.push(row('margenes', 'Márgenes', c, 'margenes', fmtVal(opM, '%')))
  }

  // 5 · Crecimiento (FCF CAGR → revenue CAGR). Etiqueta explícita de QUÉ mide y la
  // ventana, para no confundir con el crecimiento de ingresos/beneficios de las fortalezas.
  {
    const g = fcfC ?? revC
    const c = classify(g, 2, 8, true)
    const label = fcfC != null ? 'Crecimiento del FCF (5 años)' : 'Crecimiento de ingresos (5 años)'
    rows.push(row('crecimiento', label, c, 'crecimiento', fmtVal(g, '%')))
  }

  return rows
}

// ── NIVEL 2 — TARJETAS DETALLADAS ────────────────────────────────────────────

// Listado de tarjetas por sector
const CARDS_BY_SECTOR = {
  general:   ['roic', 'gross_margin', 'op_margin', 'net_margin', 'net_debt_ebitda', 'interest_cov', 'payout_fcf', 'fcf_cagr5', 'current_ratio'],
  luxury:    ['roic', 'gross_margin', 'op_margin', 'net_margin', 'net_debt_ebitda', 'interest_cov', 'payout_fcf', 'fcf_cagr5', 'current_ratio'],
  pharma:    ['roic', 'gross_margin', 'op_margin', 'rd_ratio', 'net_debt_ebitda', 'payout_fcf', 'goodwill_assets'],
  energy:    ['roic', 'op_margin', 'net_debt_ebitda', 'interest_cov', 'payout_fcf', 'revenue_cagr5', 'cash_debt'],
  bank:      ['roe', 'roa', 'efficiency', 'net_margin', 'payout_eps', 'revenue_cagr5', 'fcf_cagr5'],
  insurer:   ['roe', 'combined_ratio', 'net_margin', 'payout_eps', 'revenue_cagr5', 'roa'],
  reit:      ['real_asset_return', 'op_margin', 'net_debt_ebitda', 'interest_cov', 'payout_fcf', 'revenue_cagr5', 'roe'],
  utilities: ['op_margin', 'net_debt_ebitda', 'interest_cov', 'payout_fcf', 'revenue_cagr5', 'roe', 'fcf_cagr5'],
}

// Descriptor base de cada métrica, ajustado por sector cuando procede.
// { label, unit, higher, min, max, t1, t2, median, tooltip }
function cardSpec(id, sectorKey, detail) {
  switch (id) {
    case 'real_asset_return': {
      // Umbrales relativos al propio yield del REIT: verde si la caja por activos
      // cubre el dividendo, ámbar si se acerca, rojo si depende de financiación externa.
      const y = detail ? divYield(detail) : null
      const ref = (y != null && y > 0) ? y : 5     // sin yield → 5% típico del sector
      const max = Math.max(ref * 1.8, 10)
      return { label: 'Rentabilidad real de activos', unit: '%', higher: true, min: 0, max,
        t1: +(ref * 0.85).toFixed(1), t2: +ref.toFixed(1), median: +ref.toFixed(1),
        tooltip: `Caja operativa generada por cada euro de activos (Operating Cash Flow / Activos Totales). Es la rentabilidad real que el REIT le saca a todos sus inmuebles. Referencia: su yield del dividendo (${ref.toFixed(1)}%). Si la supera, genera caja suficiente para pagar el dividendo por sí mismo; si es menor, depende de deuda o ampliaciones de capital.` }
    }
    case 'roic': {
      const T = ROIC_T[sectorKey] || ROIC_T.general
      const med = { reit: 8, utilities: 6, luxury: 20, energy: 12 }[sectorKey] ?? 15
      const max = sectorKey === 'reit' || sectorKey === 'utilities' ? 20 : 40
      return { label: 'ROIC', unit: '%', higher: true, min: 0, max, t1: T[0], t2: T[1], median: med,
        tooltip: sectorKey === 'pharma'
          ? 'Ajustado por goodwill. Un ROIC alto en farmacéuticas puede reflejar patentes no capitalizadas — comparar con peers.'
          : 'Mide cuánto beneficio genera la empresa por cada euro invertido en el negocio. Por encima del 15% indica ventaja competitiva sostenible.' }
    }
    case 'gross_margin': {
      const farma = sectorKey === 'pharma'
      return { label: 'Margen bruto', unit: '%', higher: true, min: 0, max: 100,
        t1: farma ? 50 : 30, t2: farma ? 70 : 50, median: farma ? 65 : 45,
        tooltip: 'Porcentaje de ingresos que queda tras el coste de producción. Cuanto más alto, mayor poder de fijación de precios.' }
    }
    case 'op_margin': {
      const T = omThresholds(sectorKey, detail) || OM_T[sectorKey] || OM_T.general
      const med = { reit: 35, utilities: 22, energy: 12, luxury: 25, pharma: 22 }[sectorKey] ?? 18
      const max = sectorKey === 'reit' ? 80 : 60
      return { label: 'Margen operativo', unit: '%', higher: true, min: 0, max, t1: T[0], t2: T[1], median: med,
        tooltip: 'Beneficio operativo sobre ingresos. Refleja la eficiencia del negocio principal antes de impuestos e intereses.' }
    }
    case 'net_margin': {
      const bank = sectorKey === 'bank'
      return { label: 'Margen neto', unit: '%', higher: true, min: 0, max: bank ? 40 : 40,
        t1: bank ? 15 : 8, t2: bank ? 25 : 15, median: bank ? 20 : 12,
        tooltip: 'Beneficio neto sobre ingresos — cuánto del total de ventas se convierte en beneficio final.' }
    }
    case 'net_debt_ebitda': {
      const T = DEBT_T[sectorKey] || DEBT_T.general
      const max = sectorKey === 'reit' ? 10 : sectorKey === 'utilities' ? 8 : 6
      const med = { reit: 5.5, utilities: 5, energy: 1.8 }[sectorKey] ?? 1.5
      const t1 = sectorKey === 'energy' ? 1.5 : T[0]
      const t2 = sectorKey === 'energy' ? 2.5 : T[1]
      return { label: 'Deuda neta / EBITDA', unit: 'x', higher: false, min: 0, max, t1, t2, median: med,
        tooltip: sectorKey === 'utilities'
          ? 'En utilities la deuda alta es estructural por el capex regulado. Hasta 5.5x es aceptable si los ingresos son predecibles.'
          : sectorKey === 'reit'
          ? 'En REITs el apalancamiento es estructural por el modelo inmobiliario. Hasta 6-7x es habitual.'
          : 'Años de EBITDA necesarios para pagar la deuda. Por debajo de 1.5x es muy conservador. Por encima de 4x es un riesgo para el dividendo.' }
    }
    case 'interest_cov': {
      const util = sectorKey === 'utilities'
      return { label: 'Cobertura de intereses', unit: 'x', higher: true, min: 0, max: util ? 15 : 25,
        t1: util ? 2.5 : 4, t2: util ? 4 : 8, median: util ? 4 : 8,
        tooltip: 'Veces que el beneficio operativo cubre los gastos por intereses. Por debajo de 3x el servicio de la deuda aprieta.' }
    }
    case 'payout_fcf': {
      const perm = sectorKey === 'reit' || sectorKey === 'utilities'
      const label = sectorKey === 'reit' ? 'Payout OCF' : sectorKey === 'utilities' ? 'Payout CFO' : 'Payout FCF'
      return { label, unit: '%', higher: false, min: 0, max: 120,
        t1: perm ? 80 : 60, t2: perm ? 95 : 80, median: perm ? 80 : 50,
        tooltip: 'Porcentaje del flujo de caja destinado al dividendo. Por encima del 90% el dividendo es vulnerable. Por debajo del 60% hay margen de crecimiento.' }
    }
    case 'payout_eps':
      return { label: 'Payout EPS', unit: '%', higher: false, min: 0, max: 120, t1: 60, t2: 80, median: 45,
        tooltip: 'Porcentaje del beneficio por acción destinado al dividendo. En bancos por debajo del 70% deja colchón ante provisiones.' }
    case 'fcf_cagr5':
      return { label: 'FCF CAGR 5 años', unit: '%', higher: true, min: -10, max: 20, t1: 2, t2: 8, median: 6,
        tooltip: 'Crecimiento anual compuesto del flujo de caja libre por acción en los últimos 5 años.' }
    case 'revenue_cagr5':
      return { label: 'Crecimiento ingresos 5a', unit: '%', higher: true, min: -10, max: 20, t1: 2, t2: 8, median: 5,
        tooltip: 'Crecimiento anual compuesto de los ingresos en los últimos 5 años.' }
    case 'current_ratio':
      return { label: 'Ratio corriente', unit: 'x', higher: true, min: 0, max: 3, t1: 1, t2: 1.5, median: 1.5,
        tooltip: 'Activo corriente entre pasivo corriente. Por encima de 1 la empresa cubre sus obligaciones a corto plazo.' }
    case 'roe':
      return { label: 'ROE', unit: '%', higher: true, min: 0, max: 30, t1: 8, t2: 15, median: 12,
        tooltip: 'Rentabilidad sobre el patrimonio neto — beneficio por cada euro de capital de los accionistas.' }
    case 'roa':
      return { label: 'ROA', unit: '%', higher: true, min: 0, max: 3, t1: 0.5, t2: 1, median: 1,
        tooltip: 'Rentabilidad sobre activos — clave en bancos por su gran balance. Por encima del 1% es sólido.' }
    case 'efficiency':
      return { label: 'Ratio de eficiencia', unit: '%', higher: false, min: 0, max: 100, t1: 50, t2: 65, median: 55,
        tooltip: 'Porcentaje de ingresos consumido en gastos operativos. Por debajo del 50% es excelente.' }
    case 'combined_ratio':
      return { label: 'Combined ratio (aprox.)', unit: '%', higher: false, min: 80, max: 120, t1: 95, t2: 100, median: 96,
        tooltip: 'Por debajo de 100% la aseguradora gana dinero con su negocio técnico. Por debajo de 95% es excelente.' }
    case 'rd_ratio':
      return { label: 'Ratio I+D', unit: '%', higher: true, min: 0, max: 30, t1: 8, t2: 15, median: 12,
        tooltip: 'Porcentaje de ingresos reinvertido en investigación. Por encima del 15% indica compromiso con la innovación y el pipeline futuro.' }
    case 'goodwill_assets':
      return { label: 'Goodwill sobre activos', unit: '%', higher: false, min: 0, max: 100, t1: 25, t2: 50, median: 25,
        tooltip: 'Porcentaje del activo representado por goodwill. Por encima del 50% indica crecimiento basado en adquisiciones con riesgo de deterioro.' }
    case 'cash_debt':
      return { label: 'Caja sobre deuda', unit: '%', higher: true, min: 0, max: 100, t1: 20, t2: 50, median: 40,
        tooltip: 'Efectivo disponible frente a la deuda total. Un colchón alto da resistencia en la parte baja del ciclo.' }
    default:
      return null
  }
}

// Valor crudo de cada métrica a partir del detail.
function cardValue(id, detail, sectorKey) {
  switch (id) {
    case 'real_asset_return': return realAssetReturn(detail)
    case 'roic': return resolveRoic(detail)
    case 'gross_margin': return num(detail.gross_margin)
    case 'op_margin': return num(detail.operating_margin)
    case 'net_margin': return num(detail.net_margin)
    case 'net_debt_ebitda': return num(detail.net_debt_ebitda) ?? num(detail.debt_ebitda)
    case 'interest_cov': return num(detail.interest_coverage)
    case 'payout_fcf': {
      // REIT (OCF) y utilities (CFO): payout sobre el flujo de caja OPERATIVO real
      // (dividendos / CFO), no el payout_fcf almacenado. Respaldo a payout_fcf si no
      // hay datos de cashflow. payout% = 100 / (CFO ÷ dividendos).
      if (sectorKey === 'reit' || sectorKey === 'utilities') {
        const cov = exCfoDivCoverage(detail)
        if (cov != null && cov > 0) return Math.round(100 / cov * 10) / 10
      }
      return num(detail.payout_fcf)
    }
    case 'payout_eps': return num(detail.payout_eps)
    case 'fcf_cagr5': return num(detail.fcf_cagr5)
    case 'revenue_cagr5': return num(detail.revenue_cagr5)
    case 'current_ratio': return num(detail.current_ratio)
    case 'roe': return num(detail.roe)
    case 'roa': return num(detail.roa)
    case 'efficiency': {
      const om = num(detail.operating_margin)
      return om == null ? null : Math.max(0, Math.min(100, 100 - om))
    }
    case 'combined_ratio': {
      const om = num(detail.operating_margin)
      return om == null ? null : 100 - om
    }
    case 'rd_ratio': {
      const rd = firstVal(detail.income_statement_annual, 'I+D', 'Research And Development')
      const rev = firstVal(detail.income_statement_annual, 'Ingresos Totales', 'Total Revenue')
      return (rd != null && rev && rev > 0) ? Math.abs(rd) / rev * 100 : null
    }
    case 'goodwill_assets': {
      const gw = firstVal(detail.balance_sheet_annual, 'Fondo de Comercio', 'Goodwill', 'Fondo de Comercio e Intangibles')
      const at = firstVal(detail.balance_sheet_annual, 'Activos Totales', 'Total Assets')
      return (gw != null && at && at > 0) ? gw / at * 100 : null
    }
    case 'cash_debt': {
      const cash = firstVal(detail.balance_sheet_annual, 'Caja y Equivalentes', 'Cash And Cash Equivalents', 'Cash Cash Equivalents And Short Term Investments')
      const debt = firstVal(detail.balance_sheet_annual, 'Deuda Total', 'Total Debt')
      return (cash != null && debt && debt > 0) ? cash / debt * 100 : null
    }
    default: return null
  }
}

function pct(v, min, max) {
  if (v == null) return 0
  return Math.max(0, Math.min(100, (v - min) / (max - min) * 100))
}

function buildBar(spec, value) {
  const p1 = pct(spec.t1, spec.min, spec.max)
  const p2 = pct(spec.t2, spec.min, spec.max)
  const marker = value == null ? null : pct(value, spec.min, spec.max)
  // higher: rojo [0,p1] · amarillo [p1,p2] · verde [p2,100]
  // lower:  verde [0,p1] · amarillo [p1,p2] · rojo [p2,100]
  const segments = spec.higher
    ? [{ w: p1, color: COL.red }, { w: p2 - p1, color: COL.yellow }, { w: 100 - p2, color: COL.green }]
    : [{ w: p1, color: COL.green }, { w: p2 - p1, color: COL.yellow }, { w: 100 - p2, color: COL.red }]
  return { segments, marker }
}

export function buildHealthCards(detail, sectorKey) {
  const ids = CARDS_BY_SECTOR[sectorKey] || CARDS_BY_SECTOR.general
  return ids.map(id => {
    const spec = cardSpec(id, sectorKey, detail)
    if (!spec) return null
    const value = cardValue(id, detail, sectorKey)
    const color = classify(value, spec.t1, spec.t2, spec.higher)
    const beats = value == null ? null : (spec.higher ? value >= spec.median : value <= spec.median)
    // Deuda/EBITDA disparada (>30x) = EBITDA cercano a cero, no apalancamiento real:
    // se muestra "EBITDA≈0" en rojo (no el número crudo tipo 214×) con nota.
    const artifact = id === 'net_debt_ebitda' && debtEbitdaIsArtifact(value)
    return {
      id,
      label: spec.label,
      unit: spec.unit,
      hasData: value != null,
      valueStr: artifact ? 'EBITDA≈0' : fmtVal(value, spec.unit),
      color: artifact ? COL.red : COL[color],
      bar: buildBar(spec, value),
      medianStr: fmtVal(spec.median, spec.unit),
      beats: artifact ? false : beats,
      tooltip: artifact ? 'El múltiplo deuda/EBITDA se dispara porque el EBITDA es casi nulo — no es apalancamiento real de 200×, sino un ratio no representativo. Vigilar la capacidad de cubrir la deuda.' : spec.tooltip,
    }
  }).filter(Boolean)
}

// ── Panel completo (server-side) ─────────────────────────────────────────────

export function buildHealthPanel(detail, type, paysDividend) {
  if (!detail) return null
  const sectorKey = detectHealthSector(type, detail.sector, detail.industry)
  return {
    sectorKey,
    sectorLabel: HEALTH_SECTOR_LABELS[sectorKey] || 'General',
    semaforo: buildSemaforo(detail, sectorKey, paysDividend),
    cards: buildHealthCards(detail, sectorKey),
  }
}
