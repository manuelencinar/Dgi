// DGI Scoring System v2 — lógica completa sector-aware
import { roicForScoring } from '@/lib/metrics'
import { computeBonuses } from '@/lib/bonuses'

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

export function detectSectorType(type, sector, industry) {
  const t = (type || '').toLowerCase()
  const s = (sector || '').toLowerCase()
  const i = (industry || '').toLowerCase()

  if (t === 'banco') return 'bank'
  if (t === 'reit' || t === 'bdc') return 'reit'
  if (t === 'aseguradora') return 'insurer'
  if (t === 'utilities' || s === 'utilities') return 'utilities'
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

function gmBreaks(ind) {
  const M = { software: [[75,10],[65,7],[50,4]], hardware: [[55,10],[40,7],[25,4]],
    pharma: [[72,10],[60,7],[45,4]], luxury: [[68,10],[55,7],[40,4]],
    grocery: [[26,10],[18,7],[8,4]], energy: [[40,10],[25,7],[12,4]],
    industrial: [[45,10],[30,7],[15,4]], services: [[55,10],[38,7],[20,4]],
    consumer: [[50,10],[35,7],[20,4]] }
  return M[ind] || M.consumer
}
function omBreaks(ind) {
  const M = { software: [[28,10],[18,7],[8,4]], hardware: [[22,10],[13,7],[6,4]],
    pharma: [[28,10],[18,7],[8,4]], luxury: [[32,10],[22,7],[12,4]],
    grocery: [[6,10],[3.5,7],[1.5,4]], energy: [[28,10],[18,7],[8,4]],
    industrial: [[18,10],[10,7],[4,4]], services: [[22,10],[13,7],[6,4]],
    consumer: [[20,10],[12,7],[6,4]] }
  return M[ind] || M.consumer
}
function nmBreaks(ind) {
  const M = { software: [[22,10],[12,7],[4,4]], hardware: [[18,10],[10,7],[4,4]],
    pharma: [[26,10],[16,7],[6,4]], luxury: [[28,10],[18,7],[8,4]],
    grocery: [[4.5,10],[2.5,7],[0.8,4]], energy: [[18,10],[10,7],[4,4]],
    industrial: [[13,10],[7,7],[2,4]], services: [[18,10],[10,7],[4,4]],
    consumer: [[15,10],[8,7],[3,4]] }
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
  if (cur == null || old == null || old === 0) return null
  const pct = (cur - old) / Math.abs(old) * 100
  if (pct < -20) return 10
  if (pct < 0)   return 7
  if (pct <= 10) return 5
  if (pct <= 30) return 3
  return 0
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

function buildQuality(data, sectorType, industryType) {
  const v = {
    roic: roicForScoring(data) ?? n(data.roic), gm: n(data.gross_margin), om: n(data.operating_margin),
    nm: n(data.net_margin), roe: n(data.roe), roa: n(data.roa),
    revCagr: n(data.revenue_cagr5), fcfCagr: n(data.fcf_cagr5),
    debtEbitda: n(data.debt_ebitda),
    niCagr: cagrFromHist(data.net_income_history),
    fcfConv: exFcfConversion(data),
    marginTrend: exMarginTrend(data),
  }

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
    // Efficiency ratio: lower is better — 0 si >70%, 3 si 65-70%, 6 si 55-65%, 8 si 45-55%, 10 si <45%
    const eff = v.om != null ? 100 - v.om : null
    return [
      mk('roe','ROE',fmtPct(v.roe),bs(v.roe,[[5,3],[8,6],[12,8],[16,10]]),0.25,'El ROE es la métrica más importante para un banco. Por encima del 12% es bueno, por encima del 15% excelente.'),
      mk('roa','ROA',fmtPct(v.roa),bs(v.roa,[[0.3,4],[0.6,6],[1,8],[1.5,10]]),0.20,'En bancos por encima del 1% es bueno. ROA bajo con ROE alto indica apalancamiento excesivo.'),
      mk('efficiency','Ratio de eficiencia',fmtPct(eff),bsRev(eff,[[45,10],[55,8],[65,6],[70,3]]),0.20,'Por debajo del 50% excelente — cada 100€ de ingreso solo 50€ en costes.'),
      mk('revCagr','Crecimiento ingresos CAGR 5a',fmtPct(v.revCagr),bs(v.revCagr,REV_G),0.15,'Crecimiento del margen de intereses y comisiones. Refleja capacidad de crecer el negocio.'),
      mk('nm','Margen neto',fmtPct(v.nm),bs(v.nm,[[10,4],[18,7],[26,10]]),0.10,'Por encima del 20% es bueno para un banco.'),
      mk('fcfConv','Conversión FCF',fmtPct(v.fcfConv),bs(v.fcfConv,FCF_C),0.05,'En bancos la conversión FCF tiene menos relevancia que en otros sectores.'),
      mk('roeTrend','Tendencia ROE',fmtTrend(v.marginTrend),marginTrendScore(v.marginTrend),0.05,'Evalúa si la rentabilidad del banco mejora o se deteriora en el tiempo.'),
    ]
  }

  if (sectorType === 'insurer') {
    // Combined ratio aproximado: 100 - operating_margin. Lower is better.
    const combined = v.om != null ? 100 - v.om : null
    const cS = combined == null ? null
      : combined > 105 ? 0 : combined > 100 ? 3 : combined > 95 ? 6 : combined > 90 ? 8 : 10
    return [
      mk('roe','ROE',fmtPct(v.roe),bs(v.roe,[[6,3],[10,6],[14,8],[18,10]]),0.30,'ROE central para aseguradoras. Combina rentabilidad técnica y de inversión.'),
      mk('combined','Combined ratio (aprox.)',fmtPct(combined),cS,0.25,'Por debajo del 100% gana dinero con el negocio técnico. Por debajo del 95% es excelente.'),
      mk('nm','Margen neto',fmtPct(v.nm),bs(v.nm,[[5,4],[12,7],[20,10]]),0.20,'Beneficio neto sobre ingresos incluyendo primas e ingresos de inversión.'),
      mk('revCagr','Crecimiento ingresos CAGR 5a',fmtPct(v.revCagr),bs(v.revCagr,REV_G),0.15,'Crecimiento de primas emitidas. Refleja capacidad de crecer cartera de clientes.'),
      mk('roa','ROA',fmtPct(v.roa),bs(v.roa,[[1,5],[3,8],[5,10]]),0.05,'En aseguradoras el ROA refleja calidad de la cartera de inversiones.'),
      mk('marginTrend','Tendencia márgenes',fmtTrend(v.marginTrend),marginTrendScore(v.marginTrend),0.05,'Evolución del combined ratio en los últimos 4 años.'),
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
  ]
}

// ── CATEGORY 2: Dividendo ─────────────────────────────────────────────────

function buildDividend(data, streak, cagr, sectorType, divHistory) {
  const price  = n(data.current_price)
  const dps    = n(data.dps)
  const yld    = (price > 0 && dps != null) ? dps / price * 100 : null
  const pfcf   = n(data.payout_fcf)
  const peps   = n(data.payout_eps)
  const isReit = sectorType === 'reit' || sectorType === 'utilities'
  const isBank = sectorType === 'bank' || sectorType === 'insurer'

  const cagrPct = cagr != null ? cagr * 100 : null

  // Yield: 0 si no paga, 2 si <1.5%, 4 si 1.5-2.5%, 6 si 2.5-3.5%, 8 si 3.5-5%, 10 si >5%
  let yldScore = bs(yld, [[0.001,2],[1.5,4],[2.5,6],[3.5,8],[5,10]])
  if (yldScore != null && pfcf != null && pfcf > 90) yldScore = Math.max(0, yldScore - 2)

  const streakScore = streak >= 35 ? 10 : streak >= 25 ? 9 : streak >= 10 ? 7 : streak >= 5 ? 5 : streak >= 2 ? 3 : 0

  // Payout FCF: lower is better
  const pfcfFinal = isReit
    ? bsRev(pfcf, [[70,10],[85,7],[100,4]])
    : isBank
    ? (peps == null ? null : peps > 150 ? 0 : peps > 120 ? 2 : peps > 100 ? 4 : peps > 70 ? 6 : peps > 40 ? 8 : 10)
    : bsRev(pfcf, [[40,10],[60,9],[80,7],[100,5],[120,2]])

  // Payout EPS: lower is better
  const payoutEpsScore = peps == null ? null
    : peps > 150 ? 0 : peps > 120 ? 2 : peps > 100 ? 4 : peps > 70 ? 6 : peps > 40 ? 8 : 10

  const divCutScore = exDivCut(divHistory)

  const payoutTooltip = isReit
    ? 'En REITs se usa el flujo operativo. Por encima del 85% merece vigilancia.'
    : isBank
    ? 'En bancos y aseguradoras se usa el payout sobre beneficio neto.'
    : 'Por encima del 90% el dividendo es vulnerable. Por debajo del 60% hay margen para seguir creciendo.'

  return [
    mk('yield','Yield actual',yld != null ? fmtPct(yld) : '—',yldScore,0.20,'Rentabilidad por dividendo al precio actual. Se calcula sobre el dividendo del año anterior — no incluye el año en curso.'),
    mk('streak','Racha consecutiva',streak > 0 ? `${streak} años` : '—',streakScore,0.25,'Una racha larga es la mejor evidencia de compromiso con el dividendo y estabilidad del negocio.'),
    mk('divCagr','CAGR dividendo 5a',cagrPct != null ? fmtPct(cagrPct) : '—',bs(cagrPct,[[0,2],[2,4],[5,6],[8,8],[12,10]]),0.25,'Un CAGR alto compensa un yield inicial bajo. Una empresa con yield 2% y CAGR 12% puede superar en renta a otra con yield 5% y CAGR 2%.'),
    mk('payoutFcf',isBank ? 'Payout BPA' : isReit ? 'Payout OCF' : 'Payout FCF',fmtPct(isBank ? peps : pfcf),pfcfFinal,0.15,payoutTooltip),
    mk('payoutEps','Payout BPA',fmtPct(peps),payoutEpsScore,0.10,'Complementa al payout FCF. Si ambos son altos el dividendo es claramente exigente.'),
    mk('consistency','Consistencia histórica','—',divCutScore,0.05,'Penaliza si la empresa ha recortado el dividendo en los últimos 10 años. Un recorte en 2020 se trata con más benevolencia.'),
  ]
}

// ── CATEGORY 3: Solidez financiera ───────────────────────────────────────

function buildFinancial(data, sectorType) {
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

  if (sectorType === 'reit') {
    return [
      mk('nd','Deuda neta / EBITDA',fmtX(v.nd),bsRev(v.nd,[[3,10],[4,8],[5,6],[6,4],[7,1]]),0.30,'En REITs la deuda es estructuralmente más alta. Hasta 6× es aceptable si los activos son de calidad.'),
      mk('ic','Cobertura intereses',fmtX(v.ic),bs(v.ic,[[1.5,3],[2,6],[3,8],[4,10]]),0.25,'En REITs la cobertura puede ser más baja. Por encima de 2× es aceptable si los ingresos son predecibles.'),
      mk('debtTrend','Tendencia deuda neta','—',v.debtTrend,0.20,'En REITs el crecimiento de deuda acompañado de crecimiento de activos puede ser positivo.'),
      mk('fcfCagr','FCF CAGR 5a (OCF)',fmtPct(v.fcfCagr),bs(v.fcfCagr,FCF_CAG),0.15,'En REITs es más relevante que el FCF por el alto capex.'),
      mk('gw','Goodwill / Activos',fmtPct(v.gw),bsRev(v.gw,[[5,10],[15,7],[25,4]]),0.10,'En REITs el goodwill debería ser mínimo — los activos son inmuebles físicos.'),
    ]
  }

  if (sectorType === 'bank') {
    const eff = n(data.operating_margin)
    const effScore = eff != null ? (() => { const e = 100 - eff; return e > 70 ? 0 : e > 65 ? 3 : e > 55 ? 6 : e > 45 ? 8 : 10 })() : null
    return [
      mk('efficiency','Ratio de eficiencia',eff != null ? fmtPct(100 - eff) : '—',effScore,0.30,'En bancos es tanto métrica de calidad como de solidez — un banco ineficiente tiene menos margen para absorber pérdidas.'),
      mk('revCagr','Crecimiento ingresos CAGR 5a',fmtPct(n(data.revenue_cagr5)),bs(n(data.revenue_cagr5),REV_G),0.25,'Un banco que crece sus ingresos tiene más capacidad de absorber pérdidas por morosidad.'),
      mk('ic','Cobertura intereses',fmtX(v.ic),bs(v.ic,IC_G),0.20,'Capacidad de pagar el coste de los depósitos con los ingresos por intereses.'),
      mk('fcfCagr','FCF CAGR 5a',fmtPct(v.fcfCagr),bs(v.fcfCagr,FCF_CAG),0.15,'Tendencia del flujo de caja en los últimos 5 años.'),
      mk('roa','ROA',fmtPct(n(data.roa)),bs(n(data.roa),[[0.3,4],[0.6,6],[1,8],[1.5,10]]),0.10,'Un ROA alto indica que los activos del banco generan rentabilidad suficiente.'),
    ]
  }

  if (sectorType === 'insurer') {
    return [
      mk('ic','Cobertura intereses',fmtX(v.ic),bs(v.ic,IC_G),0.30,'Capacidad de la aseguradora de pagar intereses de su deuda con el resultado operativo.'),
      mk('revCagr','Crecimiento ingresos CAGR 5a',fmtPct(n(data.revenue_cagr5)),bs(n(data.revenue_cagr5),REV_G),0.25,'Una aseguradora que crece primas tiene más diversificación del riesgo.'),
      mk('fcfCagr','FCF CAGR 5a',fmtPct(v.fcfCagr),bs(v.fcfCagr,FCF_CAG),0.25,'Tendencia del flujo de caja. Refleja generación de caja del negocio técnico y de inversión.'),
      mk('gw','Goodwill / Activos',fmtPct(v.gw),bsRev(v.gw,[[10,10],[25,7],[40,5],[55,2]]),0.20,'El goodwill elevado puede ocultar la rentabilidad real del negocio técnico.'),
    ]
  }

  if (sectorType === 'utilities') {
    const cfoDivCov = exCfoDivCoverage(data)
    return [
      mk('nd','Deuda neta / EBITDA',fmtX(v.nd),bsRev(v.nd,[[2.5,10],[3.5,7],[4.5,5],[5.5,3],[6.5,1]]),0.30,'En utilities hasta 5.5× es aceptable con ingresos regulados y predecibles.'),
      mk('ic','Cobertura intereses',fmtX(v.ic),bs(v.ic,[[1.5,3],[2,5],[2.8,7],[4,9],[6,10]]),0.25,'En utilities una cobertura de 2× es aceptable dado que los ingresos son muy predecibles.'),
      mk('cfoDivCov','CFO / dividendo pagado',cfoDivCov != null ? fmtX(cfoDivCov) : '—',
        cfoDivCov == null ? null : cfoDivCov < 1 ? 0 : cfoDivCov < 1.2 ? 3 : cfoDivCov < 1.6 ? 6 : cfoDivCov < 2 ? 8 : 10,
        0.25,'En utilities el FCF puede ser negativo por el capex. La cobertura del dividendo con el flujo operativo es la métrica correcta.'),
      mk('debtTrend','Tendencia deuda neta','—',v.debtTrend,0.10,'En utilities el crecimiento de deuda acompañado de activos regulados puede ser positivo.'),
      mk('fcfCagr','FCF CAGR 5a',fmtPct(v.fcfCagr),v.fcfCagr == null ? null : v.fcfCagr < 0 ? 5 : bs(v.fcfCagr,[[0,5],[5,7],[10,9],[15,10]]),0.10,'En utilities el FCF puede ser negativo por la inversión en activos regulados.'),
    ]
  }

  if (sectorType === 'energy') {
    return [
      mk('nd','Deuda neta / EBITDA (ciclo)',fmtX(v.nd),bsRev(v.nd,[[0.8,10],[1.3,7],[2,5],[2.8,2]]),0.30,'En energía la ciclicidad exige un balance conservador. Por encima de 2.5× hay riesgo en el punto bajo del ciclo.'),
      mk('ic','Cobertura intereses (ciclo)',fmtX(v.ic),bs(v.ic,[[3,3],[5,6],[8,8],[12,10]]),0.25,'En energía debe ser alta en el promedio del ciclo para garantizar el dividendo en años de precios bajos.'),
      mk('cr','Ratio corriente',fmtX(v.cr),bs(v.cr,CR_G),0.20,'En energía es importante mantener liquidez suficiente para sobrevivir períodos de precios bajos.'),
      mk('cod','Caja / deuda total',fmtPct(v.cod),bs(v.cod,COD_G),0.15,'En energía una posición de caja sólida permite mantener dividendo e inversión durante el ciclo bajo.'),
      mk('fcfCagr','FCF CAGR (ciclo)',fmtPct(v.fcfCagr),bs(v.fcfCagr,FCF_CAG),0.10,'En energía el FCF es muy volátil — la media del ciclo refleja mejor la capacidad estructural.'),
    ]
  }

  // GENERAL (and pharma/luxury/consumer)
  const isPharmOrLux = sectorType === 'pharma' || sectorType === 'luxury'
  const gwThresh = isPharmOrLux
    ? [[20,10],[40,7],[55,5],[65,2]]
    : [[10,10],[25,7],[40,5],[55,2]]

  return [
    mk('nd','Deuda neta / EBITDA',fmtX(v.nd),bsRev(v.nd,[[0.5,10],[1.5,8],[2.5,6],[3.5,4],[4.5,1]]),0.25,'Por debajo de 1.5× muy conservadora. Por encima de 4× la deuda es un riesgo relevante para el dividendo.'),
    mk('ic','Cobertura intereses',fmtX(v.ic),bs(v.ic,IC_G),0.20,'Por debajo de 3× poco margen ante una caída del negocio. Por encima de 10× no es un riesgo relevante.'),
    mk('cr','Ratio corriente',fmtX(v.cr),bs(v.cr,CR_G),0.15,'Capacidad de pagar obligaciones a corto plazo. Por encima de 1.5× es cómoda.'),
    mk('debtTrend','Tendencia deuda neta','—',v.debtTrend,0.15,'Una empresa que reduce deuda consistentemente está en mejor posición financiera.'),
    mk('gw','Goodwill / Activos',fmtPct(v.gw),bsRev(v.gw,gwThresh),0.10,'Un goodwill muy alto indica primas pagadas por adquisiciones. Si el negocio decepciona puede eliminar beneficios de golpe.'),
    mk('fcfCagr','FCF CAGR 5a',fmtPct(v.fcfCagr),bs(v.fcfCagr,FCF_CAG),0.10,'Un FCF creciente es la mejor garantía de sostenibilidad del dividendo a largo plazo.'),
    mk('cod','Caja / deuda total',fmtPct(v.cod),bs(v.cod,COD_G),0.05,'Por encima del 50% la empresa podría pagar la mitad de su deuda inmediatamente.'),
  ]
}

// ── CATEGORY 4: Valoración ────────────────────────────────────────────────

function buildValuation(data, dcf, sectorType) {
  const mos  = dcf?.mos != null ? dcf.mos * 100 : null
  const pe   = n(data.pe_trailing)
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

  // PER: lower is better, but negative = 0
  const peScore  = pe  == null ? null : pe  <= 0 || pe  > 55 ? 0 : bsRev(pe,  [[10,10],[18,8],[28,6],[40,4],[56,2]])
  const pefScore = pef == null ? null : pef <= 0 || pef > 55 ? 0 : bsRev(pef, [[10,10],[18,8],[28,6],[40,4],[56,2]])

  return [
    mk('mos','Margen seguridad DCF',mos != null ? (mos > 0 ? '+' : '') + fmtPct(mos) : '—',bs(mos,[[-25,2],[-10,4],[0,6],[10,8],[25,10]]),0.35,'Diferencia entre precio actual y valor intrínseco DCF. Por encima del 20% existe margen de seguridad significativo.'),
    mk('pe','PER trailing',pe != null ? fmtN(pe,1) + '×' : '—',peScore,0.20,'Precio dividido entre beneficio de los últimos 12 meses. En sectores de crecimiento complementar con PER forward.'),
    mk('pef','PER forward',pef != null ? fmtN(pef,1) + '×' : '—',pefScore,0.20,'Precio dividido entre beneficio estimado próximos 12 meses. Más relevante para empresas en crecimiento.'),
    mk('eveb','EV/EBITDA',eveb != null ? fmtN(eveb,1) + '×' : '—',evScore,0.15,'Valor de empresa dividido entre EBITDA. Independiente de la estructura de capital.'),
    mk('pb','Precio / Valor contable',pb != null ? fmtN(pb,1) + '×' : '—',pbScore,0.10,
      sectorType === 'bank'
        ? 'En bancos el precio sobre valor contable es una métrica central. Por debajo de 1× puede indicar infravaloración.'
        : 'Por debajo de 1× la empresa cotiza por debajo de su valor en libros.'),
  ]
}

// ── Penalties ─────────────────────────────────────────────────────────────

function buildPenalties(data, sectorType) {
  const penalties = []
  const pfcf = n(data.payout_fcf)
  const nd   = n(data.net_debt_ebitda) ?? n(data.debt_ebitda)
  const gw   = exGoodwillPct(data)

  if (data._acqDetected) penalties.push({ reason: 'Crecimiento basado principalmente en adquisiciones', amount: 0.5 })

  if (pfcf != null && pfcf > 110) penalties.push({ reason: 'Payout insostenible sobre el flujo de caja libre', amount: 1.0 })

  if (Array.isArray(data.divHistory)) {
    const curY = new Date().getFullYear()
    const recentCuts = data.divHistory.filter(h => !h.isPartial && h.year >= curY - 5 && h.year !== 2020 && h.growth != null && h.growth < 0)
    if (recentCuts.length > 0) penalties.push({ reason: 'Recorte de dividendo reciente (últimos 5 años)', amount: 0.5 })
  }

  const debtLimits = { reit: 7, utilities: 6.5, energy: 2.8, bank: null, insurer: null, general: 4.5 }
  const lim = debtLimits[sectorType] ?? debtLimits.general
  if (nd != null && lim != null && nd > lim) penalties.push({ reason: 'Endeudamiento por encima del umbral del sector', amount: 0.5 })

  if (gw != null && gw > 60 && sectorType === 'general') penalties.push({ reason: 'Goodwill muy elevado — riesgo de deterioro', amount: 0.5 })

  const mt = exMarginTrend(data)
  if (mt != null && mt < -5) penalties.push({ reason: 'Deterioro sostenido de márgenes (>5pp en 4 años)', amount: 0.3 })

  // Disciplina de capital (CDR = distribución total / FCF): NO penaliza la nota.
  // Que la distribución supere el FCF suele venir de RECOMPRAS; mientras no se
  // financie con deuda no compromete el dividendo. Se explica en los insights
  // (lib/company-detail.js), no en el score. (Decisión explícita del usuario.)

  return penalties
}

// ── Main export ────────────────────────────────────────────────────────────

export function computeDGIScore(data, streak, cagr, dcf, type, paysDividend) {
  if (!data) return null

  const noDividend = paysDividend === false
  const sectorType = detectSectorType(type, data.sector, data.industry)

  const WEIGHTS = {
    general:  { quality: 0.35, dividend: 0.30, financial: 0.20, valuation: 0.15 },
    reit:     { quality: 0.20, dividend: 0.40, financial: 0.25, valuation: 0.15 },
    bank:     { quality: 0.35, dividend: 0.30, financial: 0.20, valuation: 0.15 },
    insurer:  { quality: 0.35, dividend: 0.30, financial: 0.20, valuation: 0.15 },
    utilities:{ quality: 0.20, dividend: 0.35, financial: 0.30, valuation: 0.15 },
    pharma:   { quality: 0.35, dividend: 0.25, financial: 0.25, valuation: 0.15 },
    energy:   { quality: 0.30, dividend: 0.25, financial: 0.30, valuation: 0.15 },
    luxury:   { quality: 0.40, dividend: 0.25, financial: 0.20, valuation: 0.15 },
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
  }

  const ind = detectIndustryType(data.sector, data.industry)

  const qualityM   = buildQuality(data, sectorType, ind)
  const dividendM  = buildDividend(data, streak, cagr, sectorType, data.divHistory || [])
  const financialM = buildFinancial(data, sectorType)
  const valuationM = buildValuation(data, dcf, sectorType)

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

  const penalties    = buildPenalties({ ...data, divHistory: data.divHistory || [] }, sectorType)
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
