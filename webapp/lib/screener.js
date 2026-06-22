// Lógica de cálculo del screener. project10y, netYield y calcDivQuality son
// portados del HTML original (project/js/helpers.js) manteniendo la fórmula exacta.

import { SECTORS, WHT_DEFAULTS } from '@/lib/sectors'

// Retención en origen del país. `overrides` (opcional) es el mapa personalizado del
// usuario por código de país (Ajustes) — su bróker puede aplicar tipos distintos.
export function getWHT(country, overrides = null) {
  const c = (country || '').toUpperCase()
  const o = overrides && overrides[c]
  if (o != null && o !== '' && !isNaN(o)) return Number(o)
  return WHT_DEFAULTS[c] ?? WHT_DEFAULTS.OTHER ?? 0
}

// ROIC para ranking/display: SIEMPRE el más conservador (menor) de reported y
// tangible. Si la BD trae roic_display lo usa; si no, lo deriva al vuelo.
// NO usa el campo roic legacy (cálculos disparados por equity casi nulo).
export function resolveRoic(f) {
  if (f == null) return null
  if (num(f.roic_display) != null) return num(f.roic_display)
  const vals = [num(f.roic_reported), num(f.roic_tangible)].filter(v => v != null)
  return vals.length ? Math.min(...vals) : null
}

function num(v) { return v != null && !isNaN(v) ? parseFloat(v) : null }

// Margen bruto "limpio": en financieras sin coste de ventas explícito el dato
// sale como ~100% y no es representativo → devolver null (se mostrará N/A).
export function cleanGrossMargin(f) {
  const gm = num(f?.gross_margin)
  if (gm == null) return null
  const sec = (f.sector || '').toLowerCase(), ind = (f.industry || '').toLowerCase()
  const isFin = sec.includes('financ') || ind.includes('financ') || ind.includes('bank') ||
    ind.includes('insur') || ind.includes('capital market') || ind.includes('credit') || ind.includes('asset manage')
  if (isFin && gm >= 99) return null
  return gm
}

// Retención en origen máxima ACREDITABLE en España por doble imposición (convenio).
// La ley solo permite deducir hasta este % del bruto; el exceso de retención en
// origen NO es deducible (habría que reclamarlo al país de origen).
export const FOREIGN_CREDIT_CAP = 15

// Tipo impositivo TOTAL efectivo sobre el dividendo (en %), tras la deducción por
// doble imposición con el tope del 15%:
//   total = retención_origen + impuesto_español − min(origen, 15%, español)
// Para una acción NACIONAL (país = residencia) no hay doble imposición: el tipo es
// solo el impuesto español (la retención en origen ES el impuesto español).
export function effectiveDivTax(originWHT, destWHT, isDomestic = false) {
  const d = Math.max(0, destWHT || 0)
  if (isDomestic) return d
  const o = Math.max(0, originWHT || 0)
  const credit = Math.min(o, FOREIGN_CREDIT_CAP, d)
  return Math.min(100, o + d - credit)
}

// Dividendo neto tras doble imposición (origen acreditado contra destino, máx 15%).
export function netYield(grossYield, originWHT, destWHT, isDomestic = false) {
  return parseFloat((grossYield * (1 - effectiveDivTax(originWHT, destWHT, isDomestic) / 100)).toFixed(4))
}

// Crecimiento del dividendo con fade lineal: el CAGR inicial se capa a CAGR_CAP
// y decae año a año hasta CAGR_TERMINAL. Más realista que un CAGR constante:
// ninguna empresa crece a doble dígito indefinidamente.
const CAGR_CAP      = 12   // tope del CAGR inicial (%)
const CAGR_TERMINAL = 3    // crecimiento terminal sostenible (%)
const FADE_YEARS    = 10   // años hasta converger a la terminal

// Umbrales de "dato no fiable" usados en el scoring:
//  - CAGR de dividendo por encima del 50% suele venir de una base de comparación
//    ínfima o de un dato atípico → no puntúa como excelente, se neutraliza.
//  - Margen de seguridad >80% NO es "una ganga brutal": casi siempre es el DCF
//    aplicado a un sector donde no debería sin ajustes (financieras, REITs con
//    FFO en vez de FCF, utilities muy apalancadas) → valor intrínseco disparado.
//    Por encima del cap se marca "valoración no fiable", no señal verde.
//    (Banorte +120%, Brookfield Infrastructure +401%… eran artefactos del modelo.)
export const CAGR_UNRELIABLE = 50
export const MOS_UNRELIABLE   = 80

// Yield mínimo para tratar a una empresa como candidata DGI evaluable. Por
// debajo (p.ej. NVDA ~0,02%) el dividendo es testimonial: no es DGI y no debe
// puntuar ni rankear como calidad aunque el negocio sea excelente.
export const MIN_DGI_YIELD = 0.3

// Factor acumulado de crecimiento del dividendo hasta el inicio del año `i` (0-based).
function divGrowthFactor(growthPct, i) {
  const g0 = Math.min(growthPct, CAGR_CAP)
  let factor = 1
  for (let k = 0; k < i; k++) {
    // g del año k (decae linealmente de g0 a la terminal a lo largo de FADE_YEARS)
    const g = g0 - (g0 - CAGR_TERMINAL) * (k / (FADE_YEARS - 1))
    factor *= 1 + Math.max(g, CAGR_TERMINAL) / 100
  }
  return factor
}

// Proyección a 10 años. El dividendo crece con CAGR decreciente (fade lineal).
// Devuelve [{year, gross, net, cum}].
export function project10y(investAmt, yieldPct, growthPct, originWHT, destWHT, isDomestic = false) {
  if (!investAmt || !yieldPct) return null
  const y = yieldPct / 100
  const effective = effectiveDivTax(originWHT, destWHT, isDomestic) / 100
  const rows = []; let cumNet = 0
  for (let i = 0; i < 10; i++) {
    const gross = investAmt * y * divGrowthFactor(growthPct || 0, i)
    const net = gross * (1 - effective)
    cumNet += net
    rows.push({ year: i + 1, gross: round2(gross), net: round2(net), cum: round2(cumNet) })
  }
  return rows
}

// Año en que la suma de dividendos netos iguala la inversión inicial (payback).
export function paybackYear(investAmt, yieldPct, growthPct, originWHT, destWHT, isDomestic = false) {
  if (!investAmt || !yieldPct) return null
  const y = yieldPct / 100
  const effective = effectiveDivTax(originWHT, destWHT, isDomestic) / 100
  let cum = 0
  for (let i = 0; i < 100; i++) {
    cum += investAmt * y * divGrowthFactor(growthPct || 0, i) * (1 - effective)
    if (cum >= investAmt) return i + 1
  }
  return null
}

function round2(v) { return parseFloat(v.toFixed(2)) }

// Margen de seguridad DCF en % a partir del valor intrínseco precalculado.
export function marginSafety(f) {
  const iv = num(f?.intrinsic_value), px = num(f?.current_price)
  if (iv == null || px == null || px <= 0) return null
  return Math.round((iv - px) / px * 1000) / 10
}

// Yield en % (dps / precio).
export function yieldPct(f) {
  const dps = num(f?.dps), px = num(f?.current_price)
  if (dps == null || px == null || px <= 0) return null
  return Math.round(dps / px * 10000) / 100
}

// Foso económico aproximado a partir de ROIC y margen bruto (rápido, para 2000 empresas).
// Foso sector-aware (espejo de computeMoat en lib/company-detail.js): banca/seguros
// por ROE+escala+racha y REITs por escala+rentas+margen+racha (el ROIC/márgenes no
// aplican ahí). El resto, por ROIC + margen bruto.
export function deriveMoat(f) {
  if (!f) return 'none'
  const sec = (f.sector || '').toLowerCase(), ind = (f.industry || '').toLowerCase()
  const streak = num(f.div_streak) || 0
  const isBankIns = sec.includes('financ') || ind.includes('bank') || ind.includes('insur') || ind.includes('capital market') || ind.includes('asset manage')
  const isReit = ind.includes('reit') || ind.includes('real estate investment') || sec.includes('real estate')

  if (isBankIns) {
    const roe = num(f.roe), mcap = num(f.market_cap_m); let s = 0
    if (roe != null) { if (roe > 18) s += 40; else if (roe > 13) s += 28; else if (roe > 10) s += 15 }
    if (streak >= 20) s += 20; else if (streak >= 10) s += 10
    if (mcap != null) { if (mcap > 50000) s += 20; else if (mcap > 10000) s += 10 }
    return s >= 60 ? 'wide' : s >= 35 ? 'narrow' : 'none'
  }
  if (isReit) {
    const mcap = num(f.market_cap_m), revCagr = num(f.revenue_cagr5), opM = num(f.operating_margin); let s = 0
    if (mcap != null) { if (mcap > 20000) s += 30; else if (mcap > 5000) s += 18 }
    if (revCagr != null) { if (revCagr > 6) s += 25; else if (revCagr > 3) s += 15; else if (revCagr > 0) s += 6 }
    if (opM != null) { if (opM > 55) s += 20; else if (opM > 40) s += 10 }
    if (streak >= 15) s += 20; else if (streak >= 10) s += 12; else if (streak >= 5) s += 6
    return s >= 60 ? 'wide' : s >= 35 ? 'narrow' : 'none'
  }

  const roic = resolveRoic(f), gm = num(f?.gross_margin)
  let score = 0
  if (roic != null) { if (roic > 20) score += 2; else if (roic > 12) score += 1 }
  if (gm != null)   { if (gm > 50) score += 2; else if (gm > 35) score += 1 }
  return score >= 3 ? 'wide' : score >= 2 ? 'narrow' : 'none'
}

// Señal de erosión del foso: ingresos en declive o márgenes débiles con ROIC bajo.
export function moatErosion(f) {
  const rev = num(f?.revenue_cagr5), roic = resolveRoic(f), om = num(f?.operating_margin)
  if (rev != null && rev < -2) return true
  if (roic != null && roic < 8 && om != null && om < 10) return true
  return false
}

// Score DGI 0-10 usando las métricas sector-aware (mismo enfoque que el HTML original).
const SECTOR_KEY = { banco: 'banco', aseguradora: 'aseguradora', reit: 'reit', bdc: 'bdc' }

// Farmacéutica/biotec: sector salud + industria de medicamentos/biotecnología
// (excluye dispositivos médicos, donde la intensidad de I+D no es la misma señal).
// Las 5 reglas de oro (Pat Dorsey): solo negocios con foso real y estable, capital
// bien asignado, finanzas sólidas y precio razonable. Mapeo a los datos del screener.
// Devuelve { pass, moat, stable, capital, finances, price } (cada regla true/false).
export function goldenRules(co) {
  if (!co) return { pass: false }
  // Banca/seguros/REIT/BDC: no se valoran con ROIC ni con deuda/EBITDA (sus depósitos
  // o apalancamiento regulado no son "deuda" comparable) → se usa el ROE.
  const fin = !!co.roicNA
  // 1. ¿Foso económico real? (ancho o estrecho, no "sin foso")
  const moat = co.moat === 'wide' || co.moat === 'narrow'
  // 2. ¿Foso estable, no erosionándose?
  const stable = !co.ero
  // 3. Dirección / asignación de capital: payout contenido (en REITs el reparto alto
  //    es obligatorio, no penaliza) y, fuera de financieras, deuda no excesiva.
  const payoutOk = co.tp === 'reit' ? true : (co.payout == null || co.payout < 85)
  const debtOk   = fin ? true : (co.debt == null || co.debt < 3.5)
  const capital  = payoutOk && debtOk
  // 4. Finanzas sólidas: rentabilidad alta y sostenida. ROIC ≥12% en negocios
  //    normales; ROE en financieras (≥10%) y REITs (≥6%, estructuralmente menor),
  //    más deuda manejable donde aplica.
  const profit = fin
    ? (co.roe != null && co.roe >= (co.tp === 'reit' ? 6 : 10))
    : (co.roic != null && co.roic >= 12)
  const finances = profit && (fin ? true : (co.debt == null || co.debt < 3))
  // 5. Precio razonable con margen de seguridad (no ganga extrema, pero sin sobrepagar)
  const price = co.mos != null && co.mos > 0 && !co.mosUnreliable
  // Suelo de calidad DGI: el Score agrega señales que las 5 reglas no capturan
  // (recortes/congelación del dividendo, ingresos en declive). Evita que cuele un
  // negocio que cumple las reglas pero arrastra una bandera roja DGI.
  const quality = co.sc != null && co.sc >= 6.5
  const pass = moat && stable && capital && finances && price && quality && co.pays !== false
  return { pass, moat, stable, capital, finances, price }
}

export function isPharmaCo(sector, industry) {
  if ((sector || '') !== 'Healthcare') return false
  return /drug manufacturers|biotech|pharmaceutical|therapeut/i.test(industry || '')
}

// Métrica de I+D/ingresos para el scoring de farmacéuticas en el screener.
// Mismos tramos que la ficha (buildQuality pharma): ≥25→10, ≥18→8, ≥12→6, ≥5→3.
const RD_METRIC = {
  id: 'rd_intensity', label: 'I+D / Ingresos', short: 'I+D', unit: '%',
  score: v => { const n = parseFloat(v); if (isNaN(n)) return null; if (n >= 25) return 10; if (n >= 18) return 8; if (n >= 12) return 6; if (n >= 8) return 5; if (n >= 5) return 3; if (n > 0) return 2; return 1 },
}

export function computeScore(f, type) {
  if (!f) return null
  // Sin dividendo (o testimonial, < MIN_DGI_YIELD) no es una empresa DGI
  // evaluable → sin Score DGI. Evita que negocios excelentes con yield ínfimo
  // (p.ej. NVDA) suban al top de "Calidad DGI".
  const yld = yieldPct(f)
  if (yld == null || yld < MIN_DGI_YIELD) return null
  const key = SECTOR_KEY[type] || 'general'
  let metrics = (SECTORS[key] || SECTORS.general).metrics
  // Farmacéuticas: añadir la intensidad de I+D como métrica de calidad extra.
  if (isPharmaCo(f.sector, f.industry) && f.rd_intensity != null) metrics = [...metrics, RD_METRIC]
  const vals = mapValues(f)
  let tot = 0, cnt = 0
  for (const m of metrics) {
    // La VALORACIÓN (margen de seguridad / MoS) NO entra en la nota de Calidad:
    // "barata ahora" es un eje distinto de "negocio de calidad" y, mezclado al
    // mismo peso, distorsionaba el ranking (MarketAxess, con MoS alto, superaba a
    // aristócratas de mayor calidad; y nombres excelentes pero caros como JNJ
    // quedaban hundidos por un MoS negativo). La valoración vive en su propio
    // orden "🎯 Baratas", en la columna MoS y en la señal de zona de compra.
    if (m.id === 'margin_safety') continue
    // Métricas especializadas que el screener no calcula (cet1, npl, p_affo…) no
    // cuentan: si no, hundirían a bancos/REITs. Solo cuentan las que mapValues
    // sí sabe derivar (presentes como clave, aunque su valor sea null).
    if (!(m.id in vals)) continue
    const v = vals[m.id]
    let s = m.score(v)
    // CAGR del dividendo capeado/atípico (>50%): dato no fiable → puntuación neutra.
    if (m.id === 'div_cagr5' && v != null && v > CAGR_UNRELIABLE && s != null) s = 5
    // Dato no disponible → vale 0 (no se omite): evita notas infladas cuando
    // faltan los financieros (p.ej. un ADR con solo precio y dividendo).
    if (s == null) s = 0
    tot += s; cnt++
  }
  return cnt > 0 ? Math.round(tot / cnt * 10) / 10 : null
}

// Mapea company_fundamentals a los ids de métricas de SECTORS.
function mapValues(f) {
  const roic = resolveRoic(f)
  // Un payout de 0 significa que no reparte, no que sea excelente → se ignora.
  // payout_fcf saneado (evita artefactos como Infosys 5422% que hundirían la nota).
  const payoutEps = num(f.payout_eps)
  return {
    yield_pct:    yieldPct(f),
    div_years:    num(f.div_streak),
    div_cagr5:    num(f.div_cagr5),
    payout_fcf:   sanePayout(f),
    payout_earn:  payoutEps != null && payoutEps > 0 ? payoutEps : null,
    fcf_cagr5:    num(f.fcf_cagr5),
    debt_ebitda:  num(f.net_debt_ebitda) ?? num(f.debt_ebitda),
    interest_cov: num(f.interest_coverage),
    roic:         roic,
    roe:          num(f.roe),
    eps_cagr5:    num(f.eps_cagr5),
    margin_safety: marginSafety(f),
    rd_intensity: num(f.rd_intensity),
  }
}

// Calidad del dividendo 💎 — portado de calcDivQuality del HTML original.
export function calcDivQuality(f, type, country, destWHT = 19) {
  // Sin dividendo (o testimonial, < MIN_DGI_YIELD) no hay calidad que medir
  const yldGate = yieldPct(f)
  if (yldGate == null || yldGate < MIN_DGI_YIELD) return null

  let score = 0, weight = 0
  const isReitLike = type === 'reit' || type === 'bdc'
  // Un payout de 0 = no reparte → no puntúa como excelente
  const payout = num(f.payout_fcf) ?? num(f.payout_eps)
  if (payout != null && payout > 0) {
    const [t1, t2, t3, t4, t5] = isReitLike ? [70, 80, 90, 100, 110] : [40, 50, 60, 70, 80]
    const s = payout < t1 ? 10 : payout < t2 ? 9 : payout < t3 ? 7 : payout < t4 ? 5 : payout < t5 ? 3 : 1
    score += s * 1.5; weight += 1.5
  }
  const debt = num(f.net_debt_ebitda) ?? num(f.debt_ebitda)
  if (debt != null && debt >= 0) {
    const s = debt < 1 ? 10 : debt < 2 ? 8 : debt < 3 ? 6 : debt < 4 ? 4 : 2
    score += s; weight += 1
  }
  const cagr = num(f.div_cagr5)
  if (cagr != null && cagr > 0) {
    // CAGR > 50% es casi siempre un dato no fiable → puntuación neutra (5).
    const s = cagr > CAGR_UNRELIABLE ? 5
      : cagr > 12 ? 10 : cagr > 9 ? 9 : cagr > 7 ? 8 : cagr > 5 ? 6 : cagr > 3 ? 4 : 2
    score += s * 1.5; weight += 1.5
  }
  const streak = num(f.div_streak) || 0
  if (streak > 0) {
    const s = streak >= 35 ? 10 : streak >= 25 ? 9 : streak >= 15 ? 7 : streak >= 10 ? 6 : streak >= 5 ? 4 : 2
    score += s; weight += 1
  }
  const yld = yieldPct(f)
  if (yld != null && yld > 0) {
    const ny = netYield(yld, getWHT(country), destWHT, country === 'ES')
    const s = ny > 5 ? 10 : ny > 3.5 ? 8 : ny > 2.5 ? 6 : ny > 1.5 ? 4 : 2
    score += s; weight += 1
  }
  if (weight === 0) return null
  return Math.round(score / weight * 10) / 10
}

// Regla 10/10: yield + CAGR dividendo ≥ 10
export function rule1010(f) {
  const y = yieldPct(f), c = num(f.div_cagr5)
  if (y == null || c == null) return false
  return (y + c) >= 10
}

// MoS no fiable: valor intrínseco disparado (MoS > 80%, cap de cordura — casi
// siempre el DCF aplicado a un sector que no encaja) o DCF roto cuando el valor
// intrínseco es una fracción ínfima del precio (MoS < −85%, p.ej. Infosys con iv
// en unidades/divisa erróneas). Por encima del cap NO es señal de compra.
export function mosUnreliable(f) {
  const m = marginSafety(f)
  return m != null && (m > MOS_UNRELIABLE || m < -85)
}

// Payout "saneado": evita artefactos cuando la base de FCF es ínfima y el payout
// sale absurdo (p.ej. Infosys 5422%). Prefiere FCF si es razonable; si no, EPS;
// null si ambos lo son. Un payout >300% no es real.
export function sanePayout(f) {
  const sane = v => (v != null && !isNaN(v) && v > 0 && v <= 300) ? Number(v) : null
  return sane(f?.payout_fcf) ?? sane(f?.payout_eps)
}

// Explicación accionable de POR QUÉ una empresa está en zona de compra.
// Recibe el shape `co` ya construido (no la fila cruda). Devuelve un string
// corto (1-2 razones) o null si no hay señal de valoración. Se apoya solo en
// datos del screener (MoS vs valor intrínseco, rango 52 sem, PER forward, 10/10)
// para ser coherente con los insights de la ficha (lib/company-detail.js).
// Umbrales EXIGENTES: solo se marca "zona de compra" ante oportunidades claras.
// Las señales de valoración por separado son comunes (~10% cada una); la
// selectividad real viene del gate de CALIDAD: "barata Y buena" es lo raro.
const BZ_MIN_SCORE   = 6.5   // calidad clara — barato + flojo es trampa de valor, no oportunidad
const BZ_YIELD_OVER  = 25    // yield ≥25% sobre su media histórica
const BZ_MOS_STRONG  = 35    // descuento amplio sobre el valor intrínseco
const BZ_MOS_MIN     = 25    // margen de seguridad mínimo para contar
const BZ_LOW_DIST    = 6     // a <6% de su mínimo de 52 semanas

export function buyZoneReason(co) {
  if (!co || co.mosUnreliable) return null
  // Calidad clara: evita trampas de valor (barato pero flojo no es oportunidad).
  if (co.sc == null || co.sc < BZ_MIN_SCORE) return null
  // Foso erosionándose → no es una oportunidad clara aunque esté barata.
  if (co.ero) return null

  const reasons = []
  const mos = co.mos
  let strong = false   // ¿hay al menos una señal de infravaloración CLARA?

  // 1. Yield muy por encima de su propia media histórica (precio deprimido).
  if (co.y != null && co.yieldAvg != null && co.yieldAvg > 0 && (co.yieldAvgYears ?? 0) >= 3) {
    const pct = (co.y / co.yieldAvg - 1) * 100
    if (pct >= BZ_YIELD_OVER) { reasons.push(`yield un ${pct.toFixed(0)}% sobre su media de ${co.yieldAvgYears} años`); strong = true }
  }
  // 2. Descuento claro sobre el valor intrínseco (margen de seguridad ≥20%).
  if (mos != null) {
    if (mos >= BZ_MOS_STRONG)   { reasons.push(`${mos.toFixed(0)}% por debajo de su valor intrínseco`); strong = true }
    else if (mos >= BZ_MOS_MIN) { reasons.push(`${mos.toFixed(0)}% de margen de seguridad`); strong = true }
  }
  // 3. Muy cerca de su mínimo de 52 semanas.
  if (co.lo52 != null && co.px != null && co.lo52 > 0) {
    const distLow = (co.px - co.lo52) / co.px * 100
    if (distLow >= 0 && distLow < BZ_LOW_DIST) { reasons.push(`a ${distLow.toFixed(0)}% de su mínimo anual`); strong = true }
  }

  // Sin al menos UNA señal fuerte de infravaloración → no es zona de compra.
  if (!strong) return null

  // Razones secundarias (solo acompañan a una señal fuerte; nunca disparan solas).
  // MM200: el precio por debajo de la media de 200 sesiones confirma la entrada.
  if (reasons.length < 2 && co.ma200 != null && co.px != null && co.ma200 > 0 && co.px < co.ma200) {
    const below = (co.ma200 - co.px) / co.ma200 * 100
    if (below >= 5) reasons.push(`${below.toFixed(0)}% por debajo de su MM200`)
  }
  if (reasons.length < 2 && co.peFwd != null && co.pe != null && co.peFwd > 0 && co.pe > 0 && co.peFwd < co.pe * 0.85) {
    reasons.push(`PER previsto ${co.peFwd.toFixed(0)} < actual ${co.pe.toFixed(0)}`)
  }
  if (reasons.length < 2 && co.r1010) reasons.push('cumple la regla 10/10')

  const text = reasons.slice(0, 2).join(' · ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

// La clasificación DGI por racha (Reyes/Aristócratas/Aspirantes) vive en
// lib/helpers.js como fuente única: dividendTier / dividendTierInfo / streakBadge.

// ── Ranking "Renta DGI" ──────────────────────────────────────────────────────
// Pondera el yield neto (tras retención) y la rapidez de recuperación de la
// inversión. Pensado para el inversor que busca renta, no calidad pura: un yield
// alto con recuperación rápida manda, aunque el Score DGI sea modesto.
function ynScore(ny) {
  if (ny == null) return null
  if (ny >= 6) return 10; if (ny >= 5) return 9; if (ny >= 4) return 8
  if (ny >= 3.25) return 7; if (ny >= 2.5) return 6; if (ny >= 1.75) return 5
  if (ny >= 1) return 4; if (ny >= 0.5) return 3; if (ny > 0) return 2; return 0
}
function pbScore(pb) {
  if (pb == null) return 1   // no recupera en el horizonte → penaliza
  if (pb <= 12) return 10; if (pb <= 16) return 9; if (pb <= 20) return 8
  if (pb <= 25) return 6; if (pb <= 30) return 4; if (pb <= 40) return 2; return 1
}

// Yield neto (tras doble imposición) de una empresa ya construida (shape `co`).
// `overrides`: mapa de retención en origen personalizado por país (Ajustes).
export function netYieldOf(co, destWHT, overrides = null) {
  if (co?.y == null || co.y <= 0) return null
  return netYield(co.y, getWHT(co.c, overrides), destWHT, co.c === 'ES')
}

// Nota de renta 0-10: 60% yield neto, 40% rapidez de recuperación.
export function rentaScore(co, destWHT, overrides = null) {
  const ny = netYieldOf(co, destWHT, overrides)
  if (ny == null) return null
  const pb = paybackYear(1000, co.y, co.cagr || 0, getWHT(co.c, overrides), destWHT, co.c === 'ES')
  return Math.round((ynScore(ny) * 0.6 + pbScore(pb) * 0.4) * 10) / 10
}

// ── Radar del comparador ─────────────────────────────────────────────────────
// Métricas y scoring 0-10 (mismas escalas que el scoring DGI). Conjunto general
// para que el radar funcione también con empresas de sectores mixtos.
const G = SECTORS.general.metrics
const scoreOf = id => (G.find(m => m.id === id) || {}).score || (() => null)

export const RADAR_METRICS = [
  { id: 'yield',     short: 'Yield',     get: f => yieldPct(f),                                   score: v => scoreOf('yield_pct')(v) },
  { id: 'streak',    short: 'Racha',     get: f => num(f.div_streak),                             score: v => scoreOf('div_years')(v) },
  { id: 'cagr',      short: 'CAGR Div',  get: f => num(f.div_cagr5),                              score: v => scoreOf('div_cagr5')(v) },
  { id: 'payout',    short: 'Payout',    get: f => { const p = num(f.payout_fcf); return p > 0 ? p : null }, score: v => scoreOf('payout_fcf')(v) },
  { id: 'roic',      short: 'ROIC',      get: f => resolveRoic(f),                                score: v => scoreOf('roic')(v) },
  { id: 'gmargin',   short: 'M.Bruto',   get: f => cleanGrossMargin(f),                           score: marginScore },
  { id: 'omargin',   short: 'M.Op.',     get: f => num(f.operating_margin),                       score: marginScore },
  { id: 'debt',      short: 'Deuda',     get: f => num(f.net_debt_ebitda) ?? num(f.debt_ebitda),  score: v => scoreOf('debt_ebitda')(v) },
  { id: 'icov',      short: 'Cobertura', get: f => num(f.interest_coverage),                      score: v => scoreOf('interest_cov')(v) },
]

function marginScore(v) {
  const n = parseFloat(v); if (isNaN(n)) return null
  if (n > 50) return 10; if (n > 40) return 9; if (n > 30) return 8; if (n > 22) return 7
  if (n > 16) return 6; if (n > 11) return 5; if (n > 7) return 4; if (n > 4) return 3; if (n > 0) return 2; return 1
}

// Devuelve { metricId: score 0-10 } para el radar.
export function scoreRadar(f) {
  const out = {}
  for (const m of RADAR_METRICS) {
    const v = m.get(f)
    out[m.id] = v != null ? m.score(v) : null
  }
  return out
}
