// DGI Scoring System v2 — lógica completa sector-aware
import { roicForScoring } from '@/lib/metrics'
import { computeBonuses } from '@/lib/bonuses'
import { dividendTrend, fmtDebtEbitda } from '@/lib/helpers'
import { computeBankMetrics, effectiveBankMetrics } from '@/lib/bank-metrics'
import { computeInsurerMetrics, effectiveInsurerMetrics } from '@/lib/insurer-metrics'
import { buildReitMetrics } from '@/lib/reit-metrics'
import { computeOilBreakeven } from '@/lib/energy-breakeven'

// ── helpers ────────────────────────────────────────────────────────────────

function n(v) { return v != null && !isNaN(v) ? parseFloat(v) : null }

// Ascending breakpoint scorer: "higher is better"
// thresholds: [[min, score], ...] sorted ascending — returns last matched score
function bs(v, thresholds, def = 0) {
  if (v == null) return null
  let s = def
  for (const [min, score] of thresholds) {
    if (v >= min) s = score
    else break
  }
  return s
}

// Descending breakpoint scorer: "lower is better"
// thresholds: [[max_exclusive, score], ...] sorted ascending — returns first bracket where v < max
function bsRev(v, thresholds, def = 0) {
  if (v == null) return null
  for (const [max, score] of thresholds) {
    if (v < max) return score
  }
  return def
}

function fmtPct(v, d = 1) { return v == null ? '—' : v.toFixed(d) + '%' }
function fmtX(v, d = 1)   { return v == null ? '—' : v.toFixed(d) + '×' }
function fmtN(v, d = 2)   { return v == null ? '—' : v.toFixed(d) }

function sRow(data, ...keys) {
  if (!data) return null
  for (const k of keys) { if (data[k] != null) return data[k] }
  return null
}

function cagrFromHist(hist, years = 5) {
  if (!hist) return null
  const sorted = Object.keys(hist).sort()
  if (sorted.length < 2) return null
  const yrs = Math.min(sorted.length - 1, years)
  const v0 = parseFloat(hist[sorted[sorted.length - 1 - yrs]])
  const vn = parseFloat(hist[sorted[sorted.length - 1]])
  if (!v0 || v0 === 0 || !vn) return null
  return ((vn / v0) ** (1 / yrs) - 1) * 100
}

function mk(key, name, value, score, weight, tooltip) {
  return { key, name, value, score, weight, tooltip, available: score != null }
}

// Weighted category score — redistribuye peso de métricas sin datos
function catScore(metrics, minRequired = 3) {
  const avail = metrics.filter(m => m.score != null)
  if (avail.length < Math.min(minRequired, metrics.length)) return null
  if (avail.length === 0) return null
  const totalW = avail.reduce((s, m) => s + m.weight, 0)
  if (totalW === 0) return null
  return Math.round(avail.reduce((s, m) => s + m.score * m.weight, 0) / totalW * 10) / 10
}

// ── Sector / Industry detection ────────────────────────────────────────────

// ¿Tiene riesgo de crédito en balance (presta dinero propio / garantiza deuda)?
// → se le aplica la lógica bancaria (CET1, ROE/ROA, NPL, NIM…) en vez de DCF/FCF.
// Curado como 'banco' o industria financiera de crédito (banca, crédito,
// hipotecas, financiación al consumo). Excluye gestión de activos, brokers,
// mercados de capitales, bolsas, etc. (sin riesgo de crédito → DCF estándar).
export function isCreditRiskFinancial(type, sector, industry) {
  if ((type || '').toLowerCase() === 'banco') return true
  const s = (sector || '').toLowerCase()
  if (s !== 'financial services' && s !== 'servicios financieros') return false
  const i = (industry || '').toLowerCase()
  // Solo prestamistas claros por industria: banca e hipotecas. "Credit Services"
  // se EXCLUYE a propósito (mezcla prestamistas como Amex con redes de pago sin
  // riesgo de crédito como Visa/Mastercard) → esos se marcan a mano como 'banco'.
  return /bank|banca|mortgage|hipotec/.test(i)
}

export function detectSectorType(type, sector, industry) {
  const t = (type || '').toLowerCase()
  const s = (sector || '').toLowerCase()
  const i = (industry || '').toLowerCase()

  if (isCreditRiskFinancial(type, sector, industry)) return 'bank'
  if (t === 'reit' || t === 'bdc') return 'reit'
  if (t === 'aseguradora') return 'insurer'
  if (t === 'utilities' || s === 'utilities') return 'utilities'
  if (i.includes('telecom')) return 'telecom'
  if (s === 'energy' || s === 'basic materials') return 'energy'
  if (i.includes('drug') || i.includes('biotech') || i.includes('pharma') ||
      i.includes('diagnos') || i.includes('medical device') ||
      (s === 'healthcare' && !i.includes('plan'))) return 'pharma'
  if (i.includes('luxury') || i.includes('apparel') || i.includes('footwear') ||
      i.includes('personal luxury') || i.includes('personal product')) return 'luxury'
  return 'general'
}

function detectIndustryType(sector, industry) {
  const i = (industry || '').toLowerCase()
  const s = (sector || '').toLowerCase()
  if (i.includes('software') || i.includes('saas') || i.includes('internet') ||
      i.includes('cloud') || i.includes('application') || i.includes('infraestructura de ti')) return 'software'
  if (i.includes('semiconductor') || i.includes('hardware') || i.includes('electronic') ||
      i.includes('network') || i.includes('computing')) return 'hardware'
  if (i.includes('drug') || i.includes('pharma') || i.includes('biotech')) return 'pharma'
  if (i.includes('luxury') || i.includes('apparel') || i.includes('footwear') ||
      i.includes('personal product')) return 'luxury'
  if (i.includes('grocery') || i.includes('supermarket') || i.includes('food retail') ||
      i.includes('food dist')) return 'grocery'
  if (s === 'energy' || s === 'basic materials' || i.includes('oil') ||
      i.includes('gas') || i.includes('mining') || i.includes('metal')) return 'energy'
  if (s === 'industrials' || i.includes('industrial') || i.includes('machinery') ||
      i.includes('aerospace')) return 'industrial'
  if (i.includes('consult') || i.includes('communicat') || i.includes('media') ||
      i.includes('telecom') || i.includes('broadcasting')) return 'services'
  return 'consumer'
}

// Umbrales de margen POR SECTOR, en orden ASCENDENTE (los exige así `bs`, que
// devuelve el último tramo alcanzado). [[min_aceptable,4],[bueno,7],[excelente,10]].
// Un supermercado con 4% de margen neto es excelente; una software necesita ~22%.
function gmBreaks(ind) {
  const M = { software: [[50,4],[65,7],[75,10]], hardware: [[25,4],[40,7],[55,10]],
    pharma: [[45,4],[60,7],[72,10]], luxury: [[40,4],[55,7],[68,10]],
    grocery: [[8,4],[18,7],[26,10]], energy: [[12,4],[25,7],[40,10]],
    industrial: [[15,4],[30,7],[45,10]], services: [[20,4],[38,7],[55,10]],
    consumer: [[20,4],[35,7],[50,10]] }
  return M[ind] || M.consumer
}
function omBreaks(ind) {
  const M = { software: [[8,4],[18,7],[28,10]], hardware: [[6,4],[13,7],[22,10]],
    pharma: [[8,4],[18,7],[28,10]], luxury: [[12,4],[22,7],[32,10]],
    grocery: [[1.5,4],[3.5,7],[6,10]], energy: [[8,4],[18,7],[28,10]],
    industrial: [[4,4],[10,7],[18,10]], services: [[6,4],[13,7],[22,10]],
    consumer: [[6,4],[12,7],[20,10]] }
  return M[ind] || M.consumer
}
function nmBreaks(ind) {
  const M = { software: [[4,4],[12,7],[22,10]], hardware: [[4,4],[10,7],[18,10]],
    pharma: [[6,4],[16,7],[26,10]], luxury: [[8,4],[18,7],[28,10]],
    grocery: [[0.8,4],[2.5,7],[4.5,10]], energy: [[4,4],[10,7],[18,10]],
    industrial: [[2,4],[7,7],[13,10]], services: [[4,4],[10,7],[18,10]],
    consumer: [[3,4],[8,7],[15,10]] }
  return M[ind] || M.consumer
}

// ── Data extractors ────────────────────────────────────────────────────────

function exGoodwillPct(data) {
  const d = data.balance_sheet_annual?.data
  if (!d) return null
  const gw = sRow(d,'Fondo de Comercio','Goodwill','Fondo de Comercio e Intangibles','Goodwill And Other Intangible Assets')?.[0]
  const at = sRow(d,'Activos Totales','Total Assets')?.[0]
  return (gw != null && at && at > 0) ? (gw / at) * 100 : null
}

function exCashOnDebt(data) {
  const d = data.balance_sheet_annual?.data
  if (!d) return null
  const cash = sRow(d,'Caja y Equivalentes','Cash And Cash Equivalents','Cash Cash Equivalents And Short Term Investments')?.[0]
  const debt = sRow(d,'Deuda Total','Total Debt')?.[0]
  return (cash != null && debt && debt > 0) ? (cash / debt) * 100 : null
}

function exMarginTrend(data) {
  const d = data.income_statement_annual?.data
  if (!d) return null
  const op  = sRow(d,'EBIT / Bº Operativo','Operating Income','Ebit')
  const rev = sRow(d,'Ingresos Totales','Total Revenue')
  if (!op || !rev) return null
  const cur = (op[0] != null && rev[0] > 0) ? op[0] / rev[0] * 100 : null
  const old = (op[3] != null && rev[3] > 0) ? op[3] / rev[3] * 100
            : (op[1] != null && rev[1] > 0) ? op[1] / rev[1] * 100 : null
  return (cur != null && old != null) ? cur - old : null
}

function exFcfConversion(data) {
  if (n(data.fcf_per_share) != null && n(data.eps_trailing) > 0)
    return (data.fcf_per_share / data.eps_trailing) * 100
  const fh = data.fcf_history, nh = data.net_income_history
  if (fh && nh) {
    for (const y of Object.keys(fh).sort().reverse()) {
      if (fh[y] != null && nh[y] != null && nh[y] > 0) return (fh[y] / nh[y]) * 100
    }
  }
  return null
}

function exDebtTrendScore(data) {
  const d = data.balance_sheet_annual?.data
  if (!d) return null
  const td   = sRow(d,'Deuda Total','Total Debt')
  const cash = sRow(d,'Caja y Equivalentes','Cash And Cash Equivalents','Cash Cash Equivalents And Short Term Investments')
  if (!td || !cash) return null
  const nd  = td.map((v,i) => (v != null && cash[i] != null) ? v - cash[i] : null)
  const cur = nd[0], old = nd[Math.min(3, nd.length-1)]
  if (cur == null) return null
  // Caja neta o deuda neta insignificante → no hay apalancamiento del que preocuparse:
  // la "tendencia" no aplica y debe puntuar alto (p.ej. Adobe, deuda neta ~0, 0,01×EBITDA).
  // Además el % de cambio sobre una base negativa/casi cero no tiene sentido.
  const nde = n(data.net_debt_ebitda)
  if (cur <= 0 || (nde != null && nde <= 1)) return 10
  // Pasó de caja neta a deuda neta real (>1×) → deterioro; el nivel ya lo mide la
  // métrica de deuda/EBITDA, aquí marcamos la dirección.
  if (old == null || old <= 0) return 4
  const pct = (cur - old) / old * 100
  if (pct < -20) return 10
  if (pct < 0)   return 7
  if (pct <= 10) return 5
  if (pct <= 30) return 3
  return 0
}

// CAGR anual del nº de acciones (desde shares_reduced_pct, total desde el año base).
// Devuelve %/año: POSITIVO = dilución (emite acciones), NEGATIVO = recompra neta.
function exSharesAnnual(data) {
  const red = n(data.shares_reduced_pct)   // % de acciones REDUCIDAS desde el año base
  if (red == null) return null
  const base = n(data.shares_base_year)
  const years = (base != null && base > 2000) ? Math.max(1, new Date().getFullYear() - base) : 4
  const factor = 1 - red / 100             // acciones actuales / base
  if (!(factor > 0)) return null
  return (Math.pow(factor, 1 / years) - 1) * 100
}

// Puntuación de disciplina de acciones (dilución/recompra), SECTOR-AWARE:
//  · General/tech/industrial: recompra premia; dilución (SBC desbocada) penaliza.
//  · REIT: emitir es el modelo del sector → se juzga por si el FFO/acción crece
//    pese a la emisión (acretiva), no por el nº de acciones en bruto.
//  · Banca/seguros: la emisión suele ser recapitalización forzada → alarma.
function dilutionScore(annual, sectorType, ffoCagr5 = null) {
  if (annual == null) return null
  if (sectorType === 'reit') {
    if (ffoCagr5 != null) {
      if (ffoCagr5 >= 3)  return 10
      if (ffoCagr5 >= 1)  return 8
      if (ffoCagr5 >= 0)  return 6
      if (ffoCagr5 >= -2) return 4
      return 2
    }
    return annual <= 0 ? 9 : annual <= 4 ? 7 : annual <= 8 ? 4 : 2
  }
  if (sectorType === 'bank' || sectorType === 'insurer') {
    if (annual <= -1)  return 10
    if (annual <= 0.5) return 8
    if (annual <= 1.5) return 5
    if (annual <= 3)   return 3
    return 1
  }
  if (annual <= -3)   return 10
  if (annual <= -0.5) return 9
  if (annual <= 1)    return 7
  if (annual <= 2)    return 5
  if (annual <= 4)    return 3
  return 1
}

// Señal forense de inventario: crecimiento del INVENTARIO vs crecimiento de VENTAS
// a 3 años (suaviza el interanual y la acumulación estratégica de cíclicas). Si el
// inventario crece bastante más rápido que las ventas → alerta (demanda débil,
// exceso de stock, obsolescencia) que anticipa caídas de margen. Solo aplica si la
// empresa tiene inventario MATERIAL (excluye software/servicios/banca/REIT/utilities
// automáticamente: ahí no hay inventario, no se penaliza con 0/N/A).
function exInventorySignal(data, sectorType) {
  if (['bank', 'insurer', 'reit', 'utilities', 'telecom'].includes(sectorType)) return null
  const bs = data.balance_sheet_annual?.data, is = data.income_statement_annual?.data
  if (!bs || !is) return null
  const inv = sRow(bs, 'Inventory', 'Inventario')
  const rev = sRow(is, 'Total Revenue', 'Ingresos Totales', 'Total Revenues')
  if (!Array.isArray(inv) || !Array.isArray(rev)) return null
  const i0 = n(inv[0]), r0 = n(rev[0])
  if (!(i0 > 0) || !(r0 > 0) || i0 / r0 < 0.02) return null   // inventario no material → excluir
  const yrs = Math.min(inv.length, rev.length, 4)
  if (yrs < 3) return null
  const iOld = n(inv[yrs - 1]), rOld = n(rev[yrs - 1])
  if (!(iOld > 0) || !(rOld > 0)) return null
  const span = yrs - 1
  const invCagr = (Math.pow(i0 / iOld, 1 / span) - 1) * 100
  const revCagr = (Math.pow(r0 / rOld, 1 / span) - 1) * 100
  return { gap: invCagr - revCagr, invCagr, revCagr, turnover: r0 / i0 }
}
// Puntuación del gap inventario−ventas (el propio gap ya es comparable entre sectores:
// un súper rota 15× y una relojería 1×, pero ambos con gap ~0 si el stock sigue a las
// ventas). + = inventario crece más rápido que ventas (malo).
function inventoryScore(gap) {
  if (gap == null) return null
  if (gap <= -3) return 10
  if (gap <= 0)  return 8
  if (gap <= 3)  return 6
  if (gap <= 8)  return 4
  if (gap <= 15) return 2
  return 1
}

function exCfoDivCoverage(data) {
  const d = data.cashflow_annual?.data
  if (!d) return null
  const cfo = sRow(d,'Cash Flow Operativo','Operating Cash Flow','Flujo de Caja Operativo','Cash Flow From Continuing Operating Activities','Total Cash From Operating Activities')?.[0]
  const div = sRow(d,'Dividendos Pagados','Dividends Paid','Cash Dividends Paid','Common Stock Dividend Paid','Dividendos Pagados a Accionistas')?.[0]
  if (cfo == null || div == null) return null
  return cfo / Math.abs(div)
}

function exRdRatio(data) {
  const d = data.income_statement_annual?.data
  if (!d) return null
  const rd  = sRow(d,'I+D','Research And Development')?.[0]
  const rev = sRow(d,'Ingresos Totales','Total Revenue')?.[0]
  return (rd != null && rev && rev > 0) ? Math.abs(rd) / rev * 100 : null
}

function exDivCut(divHistory) {
  if (!Array.isArray(divHistory) || divHistory.length === 0) return 10
  const curYear = new Date().getFullYear()
  const full = divHistory.filter(h => !h.isPartial && h.year >= curYear - 10)
  const cuts = full.filter(h => h.growth != null && h.growth < 0)
  if (cuts.length === 0) return 10
  const nonCovidCuts = cuts.filter(h => h.year !== 2020)
  if (nonCovidCuts.length === 0 && cuts.length > 0) return 5
  return 0
}

function fmtTrend(delta) {
  return delta != null ? (delta > 0 ? '+' : '') + delta.toFixed(1) + 'pp' : '—'
}

function marginTrendScore(delta) {
  if (delta == null) return null
  if (delta < -5) return 0
  if (delta < -2) return 3
  if (delta <= 2) return 6
  if (delta <= 5) return 8
  return 10
}

// ── CATEGORY 1: Calidad del negocio ───────────────────────────────────────

function buildQuality(data, sectorType, industryType, bm = null) {
  const v = {
    roic: roicForScoring(data) ?? n(data.roic), gm: n(data.gross_margin), om: n(data.operating_margin),
    nm: n(data.net_margin), roe: n(data.roe), roa: n(data.roa),
    revCagr: n(data.revenue_cagr5), fcfCagr: n(data.fcf_cagr5),
    debtEbitda: n(data.debt_ebitda),
    niCagr: cagrFromHist(data.net_income_history),
    fcfConv: exFcfConversion(data),
    marginTrend: exMarginTrend(data),
  }

  // Señal de inventario (eficiencia operativa) — solo si la empresa tiene inventario
  // material; si no, NO se añade la métrica (no se muestra "—" ni penaliza).
  const invSig = exInventorySignal(data, sectorType)
  const invMk = invSig ? mk('inventory', 'Inventario vs ventas (3a)',
    (invSig.gap > 0 ? '+' : '') + invSig.gap.toFixed(0) + ' pp',
    inventoryScore(invSig.gap), 0.10,
    `Inventario al ${invSig.invCagr.toFixed(0)}%/año vs ventas al ${invSig.revCagr.toFixed(0)}%/año (3 años). Si el inventario crece bastante más rápido que las ventas es señal de alerta —demanda débil, exceso de stock u obsolescencia— que suele anticipar caídas de margen. Rotación ~${invSig.turnover.toFixed(1)}×.`) : null

  const ROIC_G = [[0,2],[5,4],[8,6],[12,8],[18,10]]
  const ROE_G  = [[0,2],[8,5],[12,7],[18,9],[25,10]]
  const REV_G  = [[-5,2],[0,4],[3,6],[7,8],[12,10]]
  const NI_G   = [[-5,2],[0,4],[5,6],[10,8],[15,10]]
  const FCF_C  = [[30,3],[50,5],[70,7],[90,9],[110,10]]

  if (sectorType === 'reit') {
    return [
      mk('roic','ROIC',fmtPct(v.roic),bs(v.roic,[[3,4],[5,7],[8,10]]),0.15,'En REITs el ROIC es más bajo por la naturaleza capital-intensiva. Por encima del 8% es excelente.'),
      mk('revCagr','Crecimiento ingresos CAGR 5a',fmtPct(v.revCagr),bs(v.revCagr,REV_G),0.20,'Crecimiento de rentas. Refleja capacidad del REIT de aumentar activos y rentas.'),
      mk('om','Margen operativo',fmtPct(v.om),bs(v.om,[[20,4],[30,7],[45,10]]),0.20,'En REITs refleja eficiencia en gestión del portfolio. Por encima del 45% es excelente.'),
      mk('roe','ROE',fmtPct(v.roe),bs(v.roe,[[3,4],[6,7],[10,10]]),0.20,'En REITs es estructuralmente más bajo por apalancamiento y distribución obligatoria del 90%.'),
      mk('fcfConv','Conversión FCF (OCF)',fmtPct(v.fcfConv),bs(v.fcfConv,[[50,5],[75,7],[90,10]]),0.15,'En REITs se usa el flujo operativo porque el capex incluye nuevas inversiones.'),
      mk('marginTrend','Tendencia márgenes',fmtTrend(v.marginTrend),marginTrendScore(v.marginTrend),0.10,'Evolución del margen operativo del REIT en los últimos 4 años.'),
    ]
  }

  if (sectorType === 'bank') {
    // Banca: NO se usan EBITDA/FCF/ROIC. Rentabilidad por ROTE + NIM, crecimiento
    // por BPA diluido. (Eficiencia y NPL van en la categoría financiera.)
    const b = bm || {}
    return [
      mk('rote','ROTE',fmtPct(b.rote),bs(b.rote,[[5,3],[8,6],[12,8],[16,10]]),0.35,'Retorno sobre capital tangible (Beneficio neto / patrimonio tangible) — la métrica de rentabilidad clave en banca. >12% bueno, >16% excelente.'),
      mk('nim','NIM (aprox.)',fmtPct(b.nim),bs(b.nim,[[0.8,3],[1.5,6],[2.5,8],[3.5,10]]),0.25,'Margen neto de intereses (proxy: ingresos netos por intereses / activos totales). Comparable entre bancos y útil su evolución.'),
      mk('epsCagr','CAGR BPA diluido 5a',fmtPct(b.epsCagr5),bs(b.epsCagr5,NI_G),0.25,'Crecimiento del beneficio por acción diluido — refleja la creación de valor por acción del banco.'),
      mk('roe','ROE',fmtPct(v.roe),bs(v.roe,[[5,3],[8,6],[12,8],[16,10]]),0.15,'Rentabilidad sobre fondos propios. Complementa al ROTE.'),
    ]
  }

  if (sectorType === 'insurer') {
    // Aseguradoras: NO se usan margen sobre ingresos, EBITDA, FCF ni ROIC.
    // Combined ratio (manual, crítico, solo puntúa si está) + ROTE + crecimiento
    // de primas (GWP) + ROE.
    const im = bm || {}
    return [
      mk('combined','Combined ratio',im.combined != null ? fmtPct(im.combined) : '—',bsRev(im.combined,[[90,10],[95,8],[100,6],[105,3]]),0.30,'Siniestralidad + gastos / primas. Por debajo del 100% el negocio técnico gana dinero; por debajo del 95% es excelente. Manual; si no está, no puntúa.'),
      mk('rote','ROTE',fmtPct(im.rote),bs(im.rote,[[6,3],[10,6],[14,8],[18,10]]),0.35,'Retorno sobre capital tangible — rentabilidad clave combinando negocio técnico e inversión.'),
      mk('gwpCagr','Crecimiento primas (GWP) CAGR 5a',fmtPct(im.gwpCagr5),bs(im.gwpCagr5,REV_G),0.20,'Crecimiento de las primas brutas emitidas. Refleja capacidad de crecer cartera.'),
      mk('roe','ROE',fmtPct(v.roe),bs(v.roe,[[6,3],[10,6],[14,8],[18,10]]),0.15,'Rentabilidad sobre fondos propios. Complementa al ROTE.'),
    ]
  }

  if (sectorType === 'utilities') {
    return [
      mk('om','Margen operativo',fmtPct(v.om),bs(v.om,[[12,4],[18,7],[25,10]]),0.25,'El margen operativo refleja eficiencia en gestión de activos regulados.'),
      mk('revCagr','Crecimiento ingresos CAGR 5a',fmtPct(v.revCagr),bs(v.revCagr,[[-2,3],[0,5],[3,7],[6,10]]),0.25,'En utilities un 4-5% sostenido es muy bueno. El crecimiento regulado es más importante que el absoluto.'),
      mk('roe','ROE',fmtPct(v.roe),bs(v.roe,[[5,4],[8,7],[12,10]]),0.20,'En utilities el ROE es estructuralmente más bajo por el apalancamiento y la naturaleza regulada.'),
      mk('fcfConv','Conversión CFO',fmtPct(v.fcfConv),bs(v.fcfConv,[[100,5],[150,8],[200,10]]),0.20,'El flujo operativo es mucho mayor que el beneficio por la amortización. Una conversión alta indica buen negocio regulado.'),
      mk('marginTrend','Tendencia márgenes',fmtTrend(v.marginTrend),marginTrendScore(v.marginTrend),0.10,'En utilities una tendencia estable o ligeramente positiva es buena señal dado el entorno regulado.'),
    ]
  }

  if (sectorType === 'pharma') {
    const gwPct   = exGoodwillPct(data)
    const roicAdj = (v.roic != null && gwPct != null && gwPct > 30) ? v.roic * 1.3 : v.roic
    const rdRatio = exRdRatio(data)
    return [
      mk('roic','ROIC ajust. goodwill',fmtPct(roicAdj),bs(roicAdj,[[6,3],[10,6],[16,8],[22,10]]),0.20,'En farmacéuticas el ROIC ajustado excluye el goodwill para reflejar mejor la rentabilidad operativa real.'),
      mk('gm','Margen bruto',fmtPct(v.gm),bs(v.gm,[[45,4],[58,7],[70,10]]),0.18,'El margen bruto refleja el valor de las patentes. Por encima del 65% indica protección alta.'),
      mk('om','Margen operativo',fmtPct(v.om),bs(v.om,[[8,4],[16,7],[26,10]]),0.15,'Incluyendo gasto en I+D. Un margen alto con I+D alto es la combinación ideal.'),
      mk('rdRatio','Ratio I+D / Ingresos',fmtPct(rdRatio),bs(rdRatio,[[5,3],[10,6],[18,8],[25,10]]),0.18,'Por encima del 15% indica compromiso con innovación y pipeline futuro.'),
      mk('revCagr','Crecimiento ingresos CAGR 5a',fmtPct(v.revCagr),bs(v.revCagr,REV_G),0.12,'Crecimiento ajustado por vencimiento de patentes. Indica reposición del portfolio.'),
      mk('roe','ROE',fmtPct(v.roe),bs(v.roe,ROE_G),0.12,'Puede estar elevado por intangibles — interpretar junto al ROIC ajustado.'),
      mk('fcfConv','Conversión FCF',fmtPct(v.fcfConv),bs(v.fcfConv,FCF_C),0.05,'Una alta conversión FCF indica que los ingresos por patentes se traducen en caja real.'),
      ...(invMk ? [invMk] : []),
    ]
  }

  if (sectorType === 'energy') {
    return [
      mk('roic','ROIC (ciclo)',fmtPct(v.roic),bs(v.roic,[[4,3],[7,6],[11,8],[15,10]]),0.22,'En sectores cíclicos se usa la media de 4 años. Un ROIC medio por encima del 10% es excelente.'),
      mk('om','Margen operativo (ciclo)',fmtPct(v.om),bs(v.om,[[6,4],[14,7],[22,10]]),0.20,'Media del margen operativo. Suaviza el efecto del precio del commodity.'),
      mk('revCagr','Crecimiento ingresos (ciclo)',fmtPct(v.revCagr),bs(v.revCagr,[[-3,3],[0,5],[4,7],[8,10]]),0.18,'Promediado para eliminar el ciclo. Refleja si la empresa crece su base de producción.'),
      mk('nm','Margen neto (ciclo)',fmtPct(v.nm),bs(v.nm,[[3,4],[8,7],[14,10]]),0.15,'Margen neto promedio del ciclo. Incluye impacto de deuda e impuestos.'),
      mk('roe','ROE (ciclo)',fmtPct(v.roe),bs(v.roe,[[4,3],[8,6],[13,8],[18,10]]),0.15,'ROE medio del ciclo. En energía es muy variable año a año.'),
      mk('fcfConv','Conversión FCF (ciclo)',fmtPct(v.fcfConv),bs(v.fcfConv,FCF_C),0.10,'En energía puede ser negativa en años de inversión y muy positiva en años de precios altos.'),
      ...(invMk ? [invMk] : []),
    ]
  }

  if (sectorType === 'luxury') {
    return [
      mk('gm','Margen bruto',fmtPct(v.gm),bs(v.gm,[[42,4],[55,7],[67,10]]),0.25,'El margen bruto es el indicador más importante en lujo. Por encima del 65% indica pricing power excepcional.'),
      mk('roic','ROIC',fmtPct(v.roic),bs(v.roic,[[8,3],[14,6],[20,8],[28,10]]),0.22,'El ROIC mide la eficiencia con que la marca convierte capital en beneficio.'),
      mk('revCagr','Crecimiento orgánico',fmtPct(v.revCagr),bs(v.revCagr,[[-2,2],[0,4],[5,7],[10,9],[15,10]]),0.20,'Crecimiento de ventas. En lujo refleja la salud de la demanda y capacidad de subir precios.'),
      mk('om','Margen operativo',fmtPct(v.om),bs(v.om,[[10,4],[20,7],[30,10]]),0.18,'El margen operativo refleja el apalancamiento operativo de la marca.'),
      mk('marginTrend','Tendencia márgenes',fmtTrend(v.marginTrend),marginTrendScore(v.marginTrend),0.10,'La expansión de márgenes es señal muy positiva de fortaleza de marca.'),
      mk('roe','ROE',fmtPct(v.roe),bs(v.roe,ROE_G),0.05,'Puede estar elevado por activos intangibles de marca no reflejados en balance.'),
      ...(invMk ? [invMk] : []),
    ]
  }

  if (sectorType === 'telecom') {
    // Telecos: capital-intensivas, crecimiento bajo. Lo clave es cuánto del
    // beneficio llega a CAJA tras el alto capex de red (5G/fibra).
    return [
      mk('fcfConv','Conversión FCF',fmtPct(v.fcfConv),bs(v.fcfConv,[[25,4],[40,6],[55,8],[70,10]]),0.30,'Cuánto del beneficio se convierte en caja real tras el capex de mantenimiento de red. La métrica más importante en telecos.'),
      mk('om','Margen operativo',fmtPct(v.om),bs(v.om,[[10,4],[16,7],[22,10]]),0.25,'Eficiencia operativa de la red.'),
      mk('roic','ROIC',fmtPct(v.roic),bs(v.roic,[[4,4],[7,7],[10,9],[13,10]]),0.25,'En telecos el ROIC es estructuralmente bajo por la intensidad de capital. Por encima del 8% ya es bueno.'),
      mk('revCagr','Crecimiento ingresos 5a',fmtPct(v.revCagr),bs(v.revCagr,[[-3,3],[0,5],[2,7],[4,10]]),0.20,'En telecos el crecimiento es bajo; mantener ingresos estables ya es positivo.'),
    ]
  }

  // GENERAL (industrial, consumer, tech, etc.)
  const ind = detectIndustryType(data.sector, data.industry)
  let roeScore = bs(v.roe, ROE_G)
  if (roeScore != null && v.roe > 20 && v.debtEbitda != null && v.debtEbitda > 4) roeScore = Math.max(0, roeScore - 2)

  return [
    mk('roic','ROIC',fmtPct(v.roic),bs(v.roic,ROIC_G),0.20,'Mide cuánto beneficio genera la empresa por cada euro invertido. Por encima del 15% indica ventaja competitiva. Por encima del 20% es excepcional.'),
    mk('gm','Margen bruto',fmtPct(v.gm),bs(v.gm,gmBreaks(ind)),0.12,'Porcentaje que queda tras el coste de producción. El umbral varía por sector — un supermercado con 20% es excelente, una empresa de software con 20% es preocupante.'),
    mk('om','Margen operativo',fmtPct(v.om),bs(v.om,omBreaks(ind)),0.12,'Refleja la eficiencia operativa real tras descontar todos los gastos excepto intereses e impuestos.'),
    mk('nm','Margen neto',fmtPct(v.nm),bs(v.nm,nmBreaks(ind)),0.10,'El margen definitivo del negocio tras todos los gastos incluidos intereses e impuestos.'),
    mk('roe','ROE',fmtPct(v.roe),roeScore,0.10,'Rentabilidad sobre el patrimonio. ROE elevado por deuda excesiva (>4×EBITDA) no es sostenible.'),
    mk('fcfConv','Conversión FCF',fmtPct(v.fcfConv),bs(v.fcfConv,FCF_C),0.12,'Por encima del 90% indica alta calidad del beneficio. Por encima del 100% genera más caja que beneficio contable.'),
    mk('revCagr','Crecimiento ingresos CAGR 5a',fmtPct(v.revCagr),bs(v.revCagr,REV_G),0.12,'Tasa de crecimiento anual compuesta de los ingresos en los últimos 5 años.'),
    mk('niCagr','Crecimiento beneficio CAGR 5a',fmtPct(v.niCagr),bs(v.niCagr,NI_G),0.10,'Si crece más rápido que los ingresos indica mejora de márgenes. Si más lento puede indicar presión en costes.'),
    mk('marginTrend','Tendencia márgenes',fmtTrend(v.marginTrend),marginTrendScore(v.marginTrend),0.12,'Evalúa si los márgenes mejoran o deterioran en los últimos 4 años.'),
    ...(invMk ? [invMk] : []),
  ]
}

// ── CATEGORY 2: Dividendo ─────────────────────────────────────────────────

function buildDividend(data, streak, cagr, sectorType, divHistory, secM = null) {
  const price  = n(data.current_price)
  const dps    = n(data.dps)
  const yld    = (price > 0 && dps != null) ? dps / price * 100 : null
  const pfcf   = n(data.payout_fcf)
  const isReit = sectorType === 'reit' || sectorType === 'utilities'
  const isBank = sectorType === 'bank' || sectorType === 'insurer'
  // En banca/seguros el payout se mide sobre el beneficio NORMALIZADO a 5 años
  // (el EPS de un año fluctúa por provisiones/catástrofes). En energía, sobre el
  // beneficio normalizado a CICLO (el crudo distorsiona el EPS anual). Si no es
  // calculable, se cae al payout sobre EPS estándar.
  let peps = (isBank && n(secM?.payoutNorm) != null) ? n(secM.payoutNorm) : n(data.payout_eps)
  let payoutNormalized = isBank && n(secM?.payoutNorm) != null
  if (sectorType === 'energy') {
    const nh = data.net_income_history
    const base = n(data.payout_eps)
    if (nh && base != null) {
      const ys = Object.keys(nh).sort()
      const cur = parseFloat(nh[ys[ys.length - 1]])
      const win = ys.slice(-5).map(y => parseFloat(nh[y])).filter(v => !isNaN(v))
      const avg = win.length >= 3 ? win.reduce((a, b) => a + b, 0) / win.length : null
      if (avg > 0 && cur) { peps = base * cur / avg; payoutNormalized = true }
    }
  }
  // Sectores cuyo payout se mide sobre BENEFICIO (no FCF): banca, seguros, energía.
  const useEarnings = isBank || (sectorType === 'energy' && payoutNormalized)

  const cagrPct = cagr != null ? cagr * 100 : null

  // Yield: 0 si no paga, 2 si <1.5%, 4 si 1.5-2.5%, 6 si 2.5-3.5%, 8 si 3.5-5%, 10 si >5%
  let yldScore = bs(yld, [[0.001,2],[1.5,4],[2.5,6],[3.5,8],[5,10]])
  if (yldScore != null && pfcf != null && pfcf > 90) yldScore = Math.max(0, yldScore - 2)

  const streakScore = streak >= 35 ? 10 : streak >= 25 ? 9 : streak >= 10 ? 7 : streak >= 5 ? 5 : streak >= 2 ? 3 : 0

  // En REITs el payout sobre EPS engaña (la amortización hunde el beneficio) →
  // se usa el payout sobre AFFO (saludable <85%). Si no es calculable, OCF/FCF.
  const reitAffo = sectorType === 'reit' && n(secM?.payoutAffo) != null ? n(secM.payoutAffo) : null

  // Payout FCF: lower is better
  const pfcfFinal = reitAffo != null
    ? bsRev(reitAffo, [[70,10],[85,8],[95,5],[110,2]])
    : isReit
    ? bsRev(pfcf, [[70,10],[85,7],[100,4]])
    : useEarnings
    ? (peps == null ? null : peps > 150 ? 0 : peps > 120 ? 2 : peps > 100 ? 4 : peps > 70 ? 6 : peps > 40 ? 8 : 10)
    : bsRev(pfcf, [[40,10],[60,9],[80,7],[100,5],[120,2]])

  // Payout EPS: lower is better
  const payoutEpsScore = peps == null ? null
    : peps > 150 ? 0 : peps > 120 ? 2 : peps > 100 ? 4 : peps > 70 ? 6 : peps > 40 ? 8 : 10

  const divCutScore = exDivCut(divHistory)

  const payoutFfoVal = sectorType === 'reit' ? n(secM?.payoutFfo) : null
  const payoutTooltip = reitAffo != null
    ? 'En REITs el payout sobre EPS engaña: la amortización de inmuebles hunde el beneficio contable. Se mide sobre el AFFO — por debajo del 85% es saludable.'
    : isReit
    ? 'En REITs se usa el flujo operativo. Por encima del 85% merece vigilancia.'
    : payoutNormalized
    ? 'Se mide sobre el beneficio NORMALIZADO de 5 años (ciclo) — el beneficio de un solo año fluctúa por provisiones, catástrofes o el precio del crudo.'
    : isBank
    ? 'En bancos y aseguradoras se usa el payout sobre beneficio neto.'
    : 'Por encima del 90% el dividendo es vulnerable. Por debajo del 60% hay margen para seguir creciendo.'

  const payoutLabel = reitAffo != null ? 'Payout AFFO' : useEarnings ? (payoutNormalized ? 'Payout (norm.)' : 'Payout BPA') : isReit ? 'Payout OCF' : 'Payout FCF'
  const payout2Score = reitAffo != null ? (payoutFfoVal == null ? null : bsRev(payoutFfoVal, [[70,10],[80,8],[90,6],[100,4]])) : payoutEpsScore

  return [
    mk('yield','Yield actual',yld != null ? fmtPct(yld) : '—',yldScore,0.20,'Rentabilidad por dividendo al precio actual. Se calcula sobre el dividendo del año anterior — no incluye el año en curso.'),
    mk('streak','Racha consecutiva',streak > 0 ? `${streak} años` : '—',streakScore,0.25,'Una racha larga es la mejor evidencia de compromiso con el dividendo y estabilidad del negocio.'),
    mk('divCagr','CAGR dividendo 5a',cagrPct != null ? fmtPct(cagrPct) : '—',bs(cagrPct,[[0,2],[2,4],[5,6],[8,8],[12,10]]),0.25,'Un CAGR alto compensa un yield inicial bajo. Una empresa con yield 2% y CAGR 12% puede superar en renta a otra con yield 5% y CAGR 2%.'),
    mk('payoutFcf',payoutLabel,fmtPct(reitAffo != null ? reitAffo : (useEarnings ? peps : pfcf)),pfcfFinal,0.15,payoutTooltip),
    mk('payoutEps',reitAffo != null ? 'Payout FFO' : (useEarnings && payoutNormalized ? 'Payout (norm.)' : 'Payout BPA'),fmtPct(reitAffo != null ? payoutFfoVal : peps),payout2Score,0.10,reitAffo != null ? 'Payout sobre FFO — complementa al AFFO.' : payoutNormalized ? 'Payout sobre el beneficio medio de 5 años (ciclo).' : 'Complementa al payout FCF. Si ambos son altos el dividendo es claramente exigente.'),
    mk('consistency','Consistencia histórica','—',divCutScore,0.05,'Penaliza si la empresa ha recortado el dividendo en los últimos 10 años. Un recorte en 2020 se trata con más benevolencia.'),
  ]
}

// ── CATEGORY 3: Solidez financiera ───────────────────────────────────────

function buildFinancial(data, sectorType, bm = null) {
  const v = {
    nd:       n(data.net_debt_ebitda) ?? n(data.debt_ebitda),
    ic:       n(data.interest_coverage),
    cr:       n(data.current_ratio),
    fcfCagr:  n(data.fcf_cagr5),
    gw:       exGoodwillPct(data),
    cod:      exCashOnDebt(data),
    debtTrend: exDebtTrendScore(data),
  }

  const IC_G     = [[2,3],[3,5],[5,7],[8,9],[15,10]]
  const FCF_CAG  = [[-10,2],[0,5],[5,7],[10,9],[15,10]]
  const COD_G    = [[5,3],[15,6],[30,8],[60,10]]
  const CR_G     = [[0.5,3],[0.8,5],[1.2,7],[2,9],[3,10]]
  const REV_G    = [[-5,2],[0,4],[3,6],[7,8],[12,10]]

  // Disciplina de acciones (dilución vs recompra) — métrica de solidez sector-aware.
  const sharesAnnual = exSharesAnnual(data)
  const sharesScore  = dilutionScore(sharesAnnual, sectorType, sectorType === 'reit' ? n(bm?.ffoCagr5) : null)
  const sharesVal    = sharesAnnual == null ? '—' : (sharesAnnual > 0 ? '+' : '') + sharesAnnual.toFixed(1) + '%/año'
  const sharesTip    = sectorType === 'reit'
    ? 'CAGR del nº de acciones. En REITs emitir acciones es el modelo del sector (no retienen beneficios): solo penaliza si el FFO por acción no crece pese a la emisión.'
    : (sectorType === 'bank' || sectorType === 'insurer')
    ? 'CAGR del nº de acciones. En banca/seguros la emisión suele ser una recapitalización forzada (alarma de solvencia); recompra o estabilidad puntúa mejor.'
    : 'CAGR del nº de acciones diluidas. Negativo = recompras netas (premia); positivo = dilución, normalmente por stock-based compensation, que perjudica al accionista existente.'
  const sharesMk = (w) => mk('shares', 'Disciplina de acciones', sharesVal, sharesScore, w, sharesTip)

  if (sectorType === 'reit') {
    return [
      mk('nd','Deuda neta / EBITDA',fmtDebtEbitda(v.nd),bsRev(v.nd,[[3,10],[4,8],[5,6],[6,4],[7,1]]),0.30,'En REITs la deuda es estructuralmente más alta. Hasta 6× es aceptable si los activos son de calidad.'),
      mk('ic','Cobertura intereses',fmtX(v.ic),bs(v.ic,[[1.5,3],[2,6],[3,8],[4,10]]),0.25,'En REITs la cobertura puede ser más baja. Por encima de 2× es aceptable si los ingresos son predecibles.'),
      mk('debtTrend','Tendencia deuda neta','—',v.debtTrend,0.20,'En REITs el crecimiento de deuda acompañado de crecimiento de activos puede ser positivo.'),
      mk('fcfCagr','FCF CAGR 5a (OCF)',fmtPct(v.fcfCagr),bs(v.fcfCagr,FCF_CAG),0.15,'En REITs es más relevante que el FCF por el alto capex.'),
      mk('gw','Goodwill / Activos',fmtPct(v.gw),bsRev(v.gw,[[5,10],[15,7],[25,4]]),0.10,'En REITs el goodwill debería ser mínimo — los activos son inmuebles físicos.'),
      sharesMk(0.10),
    ]
  }

  if (sectorType === 'bank') {
    // Solidez bancaria: eficiencia + morosidad (NPL, manual) + crecimiento + ROA.
    // Sin FCF/EBITDA. El NPL solo puntúa cuando está relleno (si no, se excluye).
    const b = bm || {}
    return [
      mk('cet1','CET1 (capital)',b.cet1 != null ? fmtPct(b.cet1) : '—',bs(b.cet1,[[8,2],[10,4],[12,7],[14,9],[16,10]]),0.25,'Capital de máxima calidad / activos ponderados por riesgo. Mínimo saludable >12%. Manual; si no está, no puntúa.'),
      mk('efficiency','Ratio de eficiencia',b.efficiency != null ? fmtPct(b.efficiency) : '—',bsRev(b.efficiency,[[45,10],[55,8],[65,6],[70,3]]),0.25,'Costes operativos / ingresos netos bancarios. Por debajo del 50% es excelente — un banco eficiente absorbe mejor las pérdidas.'),
      mk('npl','Morosidad (NPL)',b.npl != null ? fmtPct(b.npl) : '—',bsRev(b.npl,[[3,10],[5,8],[8,5],[12,2]]),0.20,'% de préstamos dudosos. Manual por trimestre; si no está, no puntúa. Por debajo del 3% es sólido.'),
      mk('revCagr','Crecimiento ingresos CAGR 5a',fmtPct(n(data.revenue_cagr5)),bs(n(data.revenue_cagr5),REV_G),0.15,'Crecimiento del margen de intereses y comisiones — más capacidad de absorber morosidad.'),
      mk('roa','ROA',fmtPct(n(data.roa)),bs(n(data.roa),[[0.3,4],[0.6,6],[1,8],[1.5,10]]),0.15,'Rentabilidad sobre activos. Un ROA alto indica que los activos del banco generan rentabilidad suficiente.'),
      sharesMk(0.15),
    ]
  }

  if (sectorType === 'insurer') {
    // Solvencia + loss/expense ratio (manuales) + yield de inversión + crecimiento.
    // Sin FCF/EBITDA/cobertura de intereses. Los manuales solo puntúan si están.
    const im = bm || {}
    return [
      mk('solvency','Solvencia (II / RBC)',im.solvency != null ? fmtPct(im.solvency) : '—',bs(im.solvency,[[120,3],[150,6],[180,8],[220,10]]),0.25,'Capital disponible / requerido. Mínimo regulatorio 100%; por encima del 180% es sólido. Manual.'),
      mk('loss','Loss ratio',im.loss != null ? fmtPct(im.loss) : '—',bsRev(im.loss,[[60,10],[70,8],[80,6],[90,3]]),0.15,'Siniestros / primas. Menor es mejor. Manual.'),
      mk('expense','Expense ratio',im.expense != null ? fmtPct(im.expense) : '—',bsRev(im.expense,[[25,10],[30,8],[35,6],[40,3]]),0.10,'Gastos / primas. Menor es mejor. Manual.'),
      mk('iy','Investment yield',fmtPct(im.investmentYield),bs(im.investmentYield,[[1.5,3],[2.5,6],[3.5,8],[4.5,10]]),0.20,'Ingresos por inversiones / inversiones financieras.'),
      mk('revCagr','Crecimiento primas CAGR 5a',fmtPct(n(data.revenue_cagr5)),bs(n(data.revenue_cagr5),REV_G),0.15,'Crecimiento de primas — más diversificación del riesgo.'),
      mk('roa','ROA',fmtPct(n(data.roa)),bs(n(data.roa),[[1,5],[3,8],[5,10]]),0.15,'En aseguradoras refleja la calidad de la cartera de inversiones.'),
      sharesMk(0.15),
    ]
  }

  if (sectorType === 'telecom') {
    // Telecos: deuda hasta ~3× es normal y sostenible (ingresos recurrentes).
    // Lo relevante es el FCF tras el alto capex de red.
    return [
      mk('nd','Deuda neta / EBITDA',fmtDebtEbitda(v.nd),bsRev(v.nd,[[2,10],[2.5,8],[3,6],[3.5,4],[4.5,2]]),0.30,'En telecos hasta 3× es normal y sostenible por la estabilidad de los ingresos; por encima de 4× hay riesgo.'),
      mk('ic','Cobertura intereses',fmtX(v.ic),bs(v.ic,IC_G),0.25,'Capacidad de pagar los intereses de la deuda de red con el resultado operativo.'),
      mk('fcfCagr','FCF CAGR 5a',fmtPct(v.fcfCagr),bs(v.fcfCagr,FCF_CAG),0.25,'Evolución del FCF tras el capex de red — lo que de verdad sostiene el dividendo.'),
      mk('cod','Caja / deuda total',fmtPct(v.cod),bs(v.cod,COD_G),0.20,'Colchón de liquidez frente a la deuda de red.'),
      sharesMk(0.12),
    ]
  }

  if (sectorType === 'utilities') {
    const cfoDivCov = exCfoDivCoverage(data)
    return [
      mk('nd','Deuda neta / EBITDA',fmtDebtEbitda(v.nd),bsRev(v.nd,[[4,10],[5,8],[6,6],[7,4],[8,2]]),0.30,'En utilities hasta 6-7× es normal y sostenible: ingresos regulados a 20-30 años. Penalizar deuda alta aquí sería un error.'),
      mk('ic','Cobertura intereses',fmtX(v.ic),bs(v.ic,[[1.5,3],[2,5],[2.8,7],[4,9],[6,10]]),0.25,'En utilities una cobertura de 2.5× es aceptable dado que los ingresos son muy predecibles. Es la métrica clave de solidez, no el nivel de deuda.'),
      mk('cfoDivCov','CFO / dividendo pagado',cfoDivCov != null ? fmtX(cfoDivCov) : '—',
        cfoDivCov == null ? null : cfoDivCov < 1 ? 0 : cfoDivCov < 1.2 ? 3 : cfoDivCov < 1.6 ? 6 : cfoDivCov < 2 ? 8 : 10,
        0.25,'En utilities el FCF puede ser negativo por el capex. La cobertura del dividendo con el flujo operativo es la métrica correcta.'),
      mk('debtTrend','Tendencia deuda neta','—',v.debtTrend,0.10,'En utilities el crecimiento de deuda acompañado de activos regulados puede ser positivo.'),
      mk('fcfCagr','FCF CAGR 5a',fmtPct(v.fcfCagr),v.fcfCagr == null ? null : v.fcfCagr < 0 ? 5 : bs(v.fcfCagr,[[0,5],[5,7],[10,9],[15,10]]),0.10,'En utilities el FCF puede ser negativo por la inversión en activos regulados.'),
      sharesMk(0.10),
    ]
  }

  if (sectorType === 'energy') {
    return [
      mk('nd','Deuda neta / EBITDA (ciclo)',fmtDebtEbitda(v.nd),bsRev(v.nd,[[0.8,10],[1.3,7],[2,5],[2.8,2]]),0.30,'En energía la ciclicidad exige un balance conservador. Por encima de 2.5× hay riesgo en el punto bajo del ciclo.'),
      mk('ic','Cobertura intereses (ciclo)',fmtX(v.ic),bs(v.ic,[[3,3],[5,6],[8,8],[12,10]]),0.25,'En energía debe ser alta en el promedio del ciclo para garantizar el dividendo en años de precios bajos.'),
      mk('cr','Ratio corriente',fmtX(v.cr),bs(v.cr,CR_G),0.20,'En energía es importante mantener liquidez suficiente para sobrevivir períodos de precios bajos.'),
      mk('cod','Caja / deuda total',fmtPct(v.cod),bs(v.cod,COD_G),0.15,'En energía una posición de caja sólida permite mantener dividendo e inversión durante el ciclo bajo.'),
      mk('fcfCagr','FCF CAGR (ciclo)',fmtPct(v.fcfCagr),bs(v.fcfCagr,FCF_CAG),0.10,'En energía el FCF es muy volátil — la media del ciclo refleja mejor la capacidad estructural.'),
      sharesMk(0.12),
    ]
  }

  // GENERAL (and pharma/luxury/consumer)
  const isPharmOrLux = sectorType === 'pharma' || sectorType === 'luxury'
  const gwThresh = isPharmOrLux
    ? [[20,10],[40,7],[55,5],[65,2]]
    : [[10,10],[25,7],[40,5],[55,2]]

  return [
    mk('nd','Deuda neta / EBITDA',fmtDebtEbitda(v.nd),bsRev(v.nd,[[0.5,10],[1.5,8],[2.5,6],[3.5,4],[4.5,1]]),0.25,'Por debajo de 1.5× muy conservadora. Por encima de 4× la deuda es un riesgo relevante para el dividendo.'),
    mk('ic','Cobertura intereses',fmtX(v.ic),bs(v.ic,IC_G),0.20,'Por debajo de 3× poco margen ante una caída del negocio. Por encima de 10× no es un riesgo relevante.'),
    mk('cr','Ratio corriente',fmtX(v.cr),bs(v.cr,CR_G),0.15,'Capacidad de pagar obligaciones a corto plazo. Por encima de 1.5× es cómoda.'),
    mk('debtTrend','Tendencia deuda neta','—',v.debtTrend,0.15,'Una empresa que reduce deuda consistentemente está en mejor posición financiera.'),
    mk('gw','Goodwill / Activos',fmtPct(v.gw),bsRev(v.gw,gwThresh),0.10,'Un goodwill muy alto indica primas pagadas por adquisiciones. Si el negocio decepciona puede eliminar beneficios de golpe.'),
    mk('fcfCagr','FCF CAGR 5a',fmtPct(v.fcfCagr),bs(v.fcfCagr,FCF_CAG),0.10,'Un FCF creciente es la mejor garantía de sostenibilidad del dividendo a largo plazo.'),
    mk('cod','Caja / deuda total',fmtPct(v.cod),bs(v.cod,COD_G),0.05,'Por encima del 50% la empresa podría pagar la mitad de su deuda inmediatamente.'),
    sharesMk(0.12),
  ]
}

// ── CATEGORY 4: Valoración ────────────────────────────────────────────────

function buildValuation(data, dcf, sectorType, secM = null) {
  const mos  = dcf?.mos != null ? dcf.mos * 100 : null
  // PER trailing: si Yahoo no lo da (suele omitirlo con beneficio negativo) pero hay
  // BPA positivo, se calcula precio/BPA. Con BPA negativo no hay PER significativo
  // (pérdidas) → se marcará "n.s." en vez de un hueco. peLoss distingue ambos casos.
  const epsT = n(data.eps_trailing), px = n(data.current_price)
  const pe   = n(data.pe_trailing) ?? (epsT != null && epsT > 0 && px != null ? px / epsT : null)
  const peLoss = pe == null && epsT != null && epsT < 0
  const pef  = n(data.pe_forward)
  const eveb = n(data.ev_ebitda)
  const pb   = n(data.price_to_book)

  // P/B: lower is better
  const pbScore = sectorType === 'bank'
    ? bsRev(pb, [[0.8,10],[1.2,9],[1.8,7],[2.5,4]])
    : bsRev(pb, [[1,10],[2,8],[5,6],[8,3]])

  // EV/EBITDA: lower is better
  const evScore = sectorType === 'utilities'
    ? bsRev(eveb, [[11,10],[15,7],[20,4]])
    : bsRev(eveb, [[6,10],[10,9],[15,7],[22,5],[30,3]])

  // REIT: el PER engaña — la amortización inmobiliaria hunde el beneficio GAAP y
  // dispara el PER (Realty Income ~50× beneficio pero ~14× FFO). Se valora con
  // P/FFO y P/AFFO, el equivalente correcto del PER para el sector.
  if (sectorType === 'reit') {
    const pFfo  = n(secM?.pFfo)
    const pAffo = n(secM?.pAffo)
    const pFfoScore  = pFfo  == null ? null : pFfo  <= 0 ? null : bsRev(pFfo,  [[12,10],[15,8],[18,6],[22,4],[28,2]])
    const pAffoScore = pAffo == null ? null : pAffo <= 0 ? null : bsRev(pAffo, [[14,10],[17,8],[20,6],[24,4],[30,2]])
    return [
      mk('mos','Margen seguridad DCF',mos != null ? (mos > 0 ? '+' : '') + fmtPct(mos) : '—',bs(mos,[[-25,2],[-10,4],[0,6],[10,8],[25,10]]),0.30,'Diferencia entre precio actual y valor intrínseco (DCF sobre AFFO). Por encima del 20% existe margen de seguridad significativo.'),
      mk('pffo','P/FFO',pFfo != null ? fmtN(pFfo,1) + '×' : '—',pFfoScore,0.25,'Precio sobre Funds From Operations — el equivalente al PER en REITs (suma la amortización inmobiliaria al beneficio). Más bajo es más barato; el sector suele cotizar 13-18×.'),
      mk('paffo','P/AFFO',pAffo != null ? fmtN(pAffo,1) + '×' : '—',pAffoScore,0.20,'Precio sobre AFFO (FFO menos capex de mantenimiento) — la medida de caja realmente repartible. Es el múltiplo de valoración más exigente para un REIT.'),
      mk('eveb','EV/EBITDA',eveb != null ? fmtN(eveb,1) + '×' : '—',evScore,0.15,'Valor de empresa dividido entre EBITDA. Independiente de la estructura de capital.'),
      mk('pb','Precio / Valor contable',pb != null ? fmtN(pb,1) + '×' : '—',pbScore,0.10,'En REITs aproxima el precio sobre el valor neto de los activos (NAV). Por debajo de 1× puede indicar infravaloración.'),
    ]
  }

  // PER: lower is better, but negative = 0
  const peScore  = pe  == null ? (peLoss ? 0 : null) : pe  <= 0 || pe  > 55 ? 0 : bsRev(pe,  [[10,10],[18,8],[28,6],[40,4],[56,2]])
  const pefScore = pef == null ? null : pef <= 0 || pef > 55 ? 0 : bsRev(pef, [[10,10],[18,8],[28,6],[40,4],[56,2]])
  const peVal = pe != null ? fmtN(pe,1) + '×' : (peLoss ? 'n.s. (pérdidas)' : '—')

  return [
    mk('mos','Margen seguridad DCF',mos != null ? (mos > 0 ? '+' : '') + fmtPct(mos) : '—',bs(mos,[[-25,2],[-10,4],[0,6],[10,8],[25,10]]),0.35,'Diferencia entre precio actual y valor intrínseco DCF. Por encima del 20% existe margen de seguridad significativo.'),
    mk('pe','PER trailing',peVal,peScore,0.20,'Precio dividido entre beneficio de los últimos 12 meses. Si la empresa tiene pérdidas no es significativo (n.s.) — usar el PER forward.'),
    mk('pef','PER forward',pef != null ? fmtN(pef,1) + '×' : '—',pefScore,0.20,'Precio dividido entre beneficio estimado próximos 12 meses. Más relevante para empresas en crecimiento.'),
    mk('eveb','EV/EBITDA',eveb != null ? fmtN(eveb,1) + '×' : '—',evScore,0.15,'Valor de empresa dividido entre EBITDA. Independiente de la estructura de capital.'),
    mk('pb','Precio / Valor contable',pb != null ? fmtN(pb,1) + '×' : '—',pbScore,0.10,
      sectorType === 'bank'
        ? 'En bancos el precio sobre valor contable es una métrica central. Por debajo de 1× puede indicar infravaloración.'
        : 'Por debajo de 1× la empresa cotiza por debajo de su valor en libros.'),
  ]
}

// ── Penalties ─────────────────────────────────────────────────────────────

function buildPenalties(data, sectorType, paysDividend = true) {
  const penalties = []
  const pfcf = n(data.payout_fcf)
  const nd   = n(data.net_debt_ebitda) ?? n(data.debt_ebitda)
  const gw   = exGoodwillPct(data)

  if (data._acqDetected) penalties.push({ reason: 'Crecimiento basado principalmente en adquisiciones', amount: 0.5 })

  // Las penalizaciones del dividendo (payout insostenible, recorte/congelación) solo
  // aplican si la empresa REPARTE dividendo. Un no-pagador (p.ej. Adobe) ya puntúa 0
  // en la categoría Dividendo; penalizarlo además por un recorte de hace 20 años sería
  // doble castigo y, sobre todo, falso (su div_history tiene repartos antiguos).
  if (paysDividend) {
    if (pfcf != null && pfcf > 110) penalties.push({ reason: 'Payout insostenible sobre el flujo de caja libre', amount: 1.0 })

    // Fiabilidad del dividendo para DGI: caída/congelación reciente o historial de
    // recortes. Escalado y con tope (no acumula): recortar/caer pesa más que congelar.
    const tr = dividendTrend(data.divHistory)
    if (tr) {
      if (tr.down > 0)         penalties.push({ reason: `Dividendo en caída — ${tr.down} ${tr.down === 1 ? 'año' : 'años'} consecutivos recortándolo`, amount: 1.0 })
      else if (tr.cuts10 >= 3) penalties.push({ reason: `Historial de recortes — ${tr.cuts10} recortes del dividendo en 10 años`, amount: 1.0 })
      else if (tr.noRaise >= 2) penalties.push({ reason: `Dividendo congelado ${tr.noRaise} años — sin crecimiento`, amount: 0.4 })
    }
  }

  const debtLimits = { reit: 7, utilities: 7.5, energy: 2.8, telecom: 4, bank: null, insurer: null, general: 4.5 }
  const lim = debtLimits[sectorType] ?? debtLimits.general
  if (nd != null && lim != null && nd > lim) penalties.push({ reason: 'Endeudamiento por encima del umbral del sector', amount: 0.5 })

  if (gw != null && gw > 60 && sectorType === 'general') penalties.push({ reason: 'Goodwill muy elevado — riesgo de deterioro', amount: 0.5 })

  // Energía: rentabilidad atada al precio del crudo. Si el modelo de breakeven
  // (regresión margen vs WTI) es FIABLE, se usa el precio de crudo a partir del
  // cual gana dinero. Si no, se cae al payout sobre beneficio de ciclo medio.
  if (sectorType === 'energy') {
    const be = computeOilBreakeven(data)
    const cb = be?.cashflow
    if (cb?.reliable) {
      if (cb.breakeven > 85) penalties.push({ reason: `No cubre capex + dividendo salvo con el crudo muy alto (~$${cb.breakeven.toFixed(0)}/barril WTI) — dividendo en riesgo en el ciclo bajo`, amount: 1.0 })
      else if (cb.breakeven > 70) penalties.push({ reason: `Cubrir capex + dividendo exige un crudo elevado (~$${cb.breakeven.toFixed(0)}/barril WTI)`, amount: 0.5 })
    } else {
      const nh = data.net_income_history
      const base = n(data.payout_eps)
      if (nh && base != null) {
        const ys = Object.keys(nh).sort()
        const cur = parseFloat(nh[ys[ys.length - 1]])
        const win = ys.slice(-5).map(y => parseFloat(nh[y])).filter(v => !isNaN(v))
        const avg = win.length >= 3 ? win.reduce((a, b) => a + b, 0) / win.length : null
        if (avg > 0 && cur) {
          const pnorm = base * cur / avg
          if (pnorm > 100) penalties.push({ reason: 'Dividendo no cubierto por el beneficio de ciclo medio — solo sostenible con el crudo alto', amount: pnorm > 130 ? 1.0 : 0.5 })
        }
      }
    }
  }

  const mt = exMarginTrend(data)
  if (mt != null && mt < -5) penalties.push({ reason: 'Deterioro sostenido de márgenes (>5pp en 4 años)', amount: 0.3 })

  // Disciplina de capital (CDR = distribución total / FCF): NO penaliza la nota.
  // Que la distribución supere el FCF suele venir de RECOMPRAS; mientras no se
  // financie con deuda no compromete el dividendo. Se explica en los insights
  // (lib/company-detail.js), no en el score. (Decisión explícita del usuario.)

  return penalties
}

// ── Main export ────────────────────────────────────────────────────────────

export function computeDGIScore(data, streak, cagr, dcf, type, paysDividend, bankOverride = null, insurerOverride = null, reitOverride = null) {
  if (!data) return null

  const noDividend = paysDividend === false
  const sectorType = detectSectorType(type, data.sector, data.industry)

  // Métricas sectoriales (banca/seguros/REIT) para el scoring: las pasa la ficha
  // (con manuales/overrides) o se calculan desde los estados (snapshot → select('*')).
  const secM = sectorType === 'bank'
    ? (bankOverride || effectiveBankMetrics(computeBankMetrics(data), []))
    : sectorType === 'insurer'
    ? (insurerOverride || effectiveInsurerMetrics(computeInsurerMetrics(data), []))
    : sectorType === 'reit'
    ? (reitOverride || buildReitMetrics(data, null))
    : null

  const WEIGHTS = {
    general:  { quality: 0.35, dividend: 0.30, financial: 0.20, valuation: 0.15 },
    reit:     { quality: 0.20, dividend: 0.40, financial: 0.25, valuation: 0.15 },
    bank:     { quality: 0.35, dividend: 0.30, financial: 0.20, valuation: 0.15 },
    insurer:  { quality: 0.35, dividend: 0.30, financial: 0.20, valuation: 0.15 },
    utilities:{ quality: 0.20, dividend: 0.35, financial: 0.30, valuation: 0.15 },
    pharma:   { quality: 0.35, dividend: 0.25, financial: 0.25, valuation: 0.15 },
    energy:   { quality: 0.30, dividend: 0.25, financial: 0.30, valuation: 0.15 },
    luxury:   { quality: 0.40, dividend: 0.25, financial: 0.20, valuation: 0.15 },
    telecom:  { quality: 0.25, dividend: 0.30, financial: 0.30, valuation: 0.15 },
  }
  const w = WEIGHTS[sectorType] || WEIGHTS.general

  const sectorLabels = {
    general:  'Empresa general',
    bank:     'Banco',
    reit:     'REIT inmobiliario',
    insurer:  'Aseguradora',
    utilities:'Utility regulada',
    pharma:   'Farmacéutica / Salud',
    energy:   'Energía / Materias primas',
    luxury:   'Lujo / Consumo premium',
    telecom:  'Telecomunicaciones',
  }
  const cat1Labels = {
    general:  'Calidad del negocio',
    bank:     'Calidad bancaria',
    reit:     'Calidad inmobiliaria',
    insurer:  'Calidad aseguradora',
    utilities:'Calidad regulada',
    pharma:   'Calidad del negocio',
    energy:   'Calidad del negocio',
    luxury:   'Calidad del negocio',
    telecom:  'Calidad del negocio',
  }

  const ind = detectIndustryType(data.sector, data.industry)

  const qualityM   = buildQuality(data, sectorType, ind, secM)
  const dividendM  = buildDividend(data, streak, cagr, sectorType, data.divHistory || [], secM)
  const financialM = buildFinancial(data, sectorType, secM)
  const valuationM = buildValuation(data, dcf, sectorType, secM)

  const qS = catScore(qualityM,  Math.min(3, qualityM.length))
  // Si la empresa NO reparte dividendo, la categoría Dividendo puntúa 0 (no se
  // redistribuye su peso — lastra la nota, como debe ser para un inversor DGI).
  const dS = noDividend ? 0 : catScore(dividendM, 3)
  const fS = catScore(financialM, 3)
  const vS = catScore(valuationM, 2)

  const hasData = [qS, dS, fS, vS].filter(x => x != null).length >= 2

  if (!hasData) return {
    total: null, sectorType, sectorLabel: sectorLabels[sectorType],
    categories: [], penalties: [], hasData: false,
    methodology: `Metodología de scoring adaptada para ${sectorLabels[sectorType]}`,
  }

  let totalW = 0, totalS = 0
  if (qS != null) { totalS += qS * w.quality;   totalW += w.quality }
  if (dS != null) { totalS += dS * w.dividend;  totalW += w.dividend }
  if (fS != null) { totalS += fS * w.financial; totalW += w.financial }
  if (vS != null) { totalS += vS * w.valuation; totalW += w.valuation }
  const prepenalty = totalW > 0 ? Math.round(totalS / totalW * 10) / 10 : null

  // "Reparte de verdad": no marcado como no-pagador Y con DPS vigente. Cubre los
  // casos pays_dividend=null + dps=null (Amazon, Berkshire) además de los false.
  const reallyPays   = paysDividend !== false && n(data.dps) > 0
  const penalties    = buildPenalties({ ...data, divHistory: data.divHistory || [] }, sectorType, reallyPays)
  const penaltyTotal = penalties.reduce((s, p) => s + p.amount, 0)
  // Bonificaciones por tendencia positiva (adicionales, cap +1.0). No tocan los
  // umbrales ni las penalizaciones: se suman a la nota final tras penalizaciones.
  const bonus        = computeBonuses({ ...data, divHistory: data.divHistory || [] }, sectorType)
  const total        = prepenalty != null ? Math.min(10, Math.max(1, Math.round((prepenalty - penaltyTotal + bonus.total) * 10) / 10)) : null

  return {
    total,
    prepenalty,
    sectorType,
    sectorLabel: sectorLabels[sectorType],
    noDividend,
    categories: [
      { key: 'quality',   name: cat1Labels[sectorType], weight: w.quality,   score: qS, metrics: qualityM },
      { key: 'dividend',  name: 'Dividendo',             weight: w.dividend,  score: dS, metrics: dividendM, noDividend },
      { key: 'financial', name: 'Solidez financiera',    weight: w.financial, score: fS, metrics: financialM },
      { key: 'valuation', name: 'Valoración',            weight: w.valuation, score: vS, metrics: valuationM },
    ],
    penalties,
    bonuses: bonus.applied,
    bonusTotal: bonus.total,
    hasData: true,
    methodology: `Metodología de scoring adaptada para ${sectorLabels[sectorType]}`,
  }
}
