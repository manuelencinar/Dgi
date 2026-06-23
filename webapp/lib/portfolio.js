// Portfolio utilities — pure functions, no React

import { DICT } from '@/data/dict'
import { SUPERSECTORS, SUPERSECTOR_ORDER, sectorInfo, INVESTOR_PROFILES, DEFAULT_PROFILE } from '@/lib/supersectors'
import { COUNTRY_INFO } from '@/lib/helpers'
import { FOREIGN_CREDIT_CAP, getWHT, effectiveDivTax } from '@/lib/screener'

// ── FX ────────────────────────────────────────────────────────────────────

export const FX = { EUR: 1, USD: 0.92, GBP: 1.17, JPY: 0.006 }
export function toEUR(amount, currency) {
  return amount * (FX[currency] || 1.0)
}

// ── Geography ─────────────────────────────────────────────────────────────

const ZONE = {
  ES:'Europa', DE:'Europa', FR:'Europa', IT:'Europa', NL:'Europa',
  GB:'Europa', CH:'Europa', BE:'Europa', SE:'Europa', DK:'Europa',
  NO:'Europa', FI:'Europa', AT:'Europa', PT:'Europa', IE:'Europa',
  LU:'Europa', PL:'Europa', GR:'Europa', HU:'Europa', CZ:'Europa',
  RO:'Europa', SK:'Europa', SI:'Europa', EE:'Europa', LV:'Europa',
  LT:'Europa', HR:'Europa', BG:'Europa', CY:'Europa', MT:'Europa', TR:'Europa',
  US:'Norteamérica', CA:'Norteamérica',
  MX:'Latinoamérica', BR:'Latinoamérica', CL:'Latinoamérica',
  CO:'Latinoamérica', PE:'Latinoamérica', AR:'Latinoamérica',
  JP:'Asia', CN:'Asia', HK:'Asia', SG:'Asia', KR:'Asia',
  TW:'Asia', IN:'Asia', TH:'Asia', MY:'Asia', ID:'Asia', PH:'Asia',
  AU:'Oceanía', NZ:'Oceanía',
  ZA:'África', NG:'África', KE:'África', EG:'África',
}
export function codeToZone(code) { return ZONE[(code || '').toUpperCase()] || 'Otros' }

// Nombre de país en español + bandera (fuente única: COUNTRY_INFO en helpers).
export function countryName(code) { return COUNTRY_INFO[(code || '').toUpperCase()]?.name || 'Otros' }
export function countryLabel(code) {
  const info = COUNTRY_INFO[(code || '').toUpperCase()]
  return info ? `${info.flag} ${info.name}` : '🌍 Otros'
}

const CONTINENT_COLOR = {
  'Europa': '#60a5fa', 'Norteamérica': '#818cf8', 'Latinoamérica': '#fbbf24',
  'Asia': '#34d399', 'Oceanía': '#f472b6', 'África': '#fb923c', 'Otros': '#8090a8',
}

// Umbral de alerta por país (% de la cartera). EE.UU. tiene excepción (mercado
// dominante natural en DGI): se permite más antes de avisar.
export const COUNTRY_ALERT_LIMIT = 30
export const COUNTRY_ALERT_LIMIT_US = 50

// ── Fiscal ────────────────────────────────────────────────────────────────

const WITHHOLDING = {
  'United States': 0.15, 'Germany': 0.26375, 'Switzerland': 0.35,
  'France': 0.128, 'United Kingdom': 0.00, 'Spain': 0.19,
  'Netherlands': 0.15, 'Belgium': 0.30, 'Sweden': 0.30,
  'Denmark': 0.27, 'Norway': 0.25, 'Finland': 0.25,
  'Australia': 0.30, 'Japan': 0.2042, 'Canada': 0.25,
}
const ES_RATE = 0.19

// ── Enrich positions ──────────────────────────────────────────────────────

// Distribución anual de un fondo (yield_ttm × precio, o suma últimos 12 meses)
function fundAnnualDist(fund) {
  if (fund.yield_ttm != null && fund.current_price != null) return fund.yield_ttm / 100 * fund.current_price
  const hist = Array.isArray(fund.distribution_history) ? fund.distribution_history : []
  const cutoff = Date.now() - 365 * 24 * 3600 * 1000
  const ttm = hist.filter(d => d.date && new Date(d.date).getTime() >= cutoff).reduce((s, d) => s + (d.amount || 0), 0)
  return ttm || 0
}

export function enrichPositions(rawPositions, fundamentalsMap, fundsMap = {}) {
  return rawPositions.map(pos => {
    const assetType = pos.asset_type || 'stock'

    // ── ETF / Fondo ──────────────────────────────────────────────────────
    if (assetType !== 'stock') {
      const f = fundsMap[pos.ticker] || {}
      const currency     = pos.currency || f.currency || 'USD'
      const currentPrice = f.current_price ?? null
      const annualDist   = fundAnnualDist(f)
      const valueEUR     = currentPrice != null ? toEUR(currentPrice * pos.shares, currency) : null
      const costEUR      = toEUR(pos.avg_cost * pos.shares, currency)
      const gainEUR      = valueEUR != null ? valueEUR - costEUR : null
      const gainPct      = costEUR > 0 && gainEUR != null ? gainEUR / costEUR * 100 : null
      const annualIncomeEUR = toEUR(annualDist * pos.shares, currency)
      const yieldOnCost  = pos.avg_cost > 0 ? annualDist / pos.avg_cost * 100 : null
      const currentYield = currentPrice ? annualDist / currentPrice * 100 : null
      return {
        ...pos, assetType,
        name: f.name || pos.ticker, countryCode: f.country ?? null,
        sector: 'ETFs y Fondos', currency, zone: codeToZone(f.country), type: 'fund',
        currentPrice, dps: annualDist,
        valueEUR, costEUR, gainEUR, gainPct,
        annualIncomeEUR, yieldOnCost, currentYield,
        ter: f.ter ?? null,
        distributionHistory: Array.isArray(f.distribution_history) ? f.distribution_history : [],
        companyCountry: f.country ?? null,
        payoutFCF: null, debtEbitda: null, interestCoverage: null, fcfCagr5: null,
        isFund: true,
      }
    }

    // ── Acción ───────────────────────────────────────────────────────────
    const fund = fundamentalsMap[pos.ticker] || {}
    const dictEntry = DICT.find(d => d[1] === pos.ticker)
    const name        = dictEntry?.[0] ?? pos.ticker
    const countryCode = dictEntry?.[2] ?? null
    const dictCurr    = dictEntry?.[3] ?? 'USD'
    const sector      = fund.sector    || dictEntry?.[4] || '—'
    const type        = dictEntry?.[6] ?? 'general'

    const currency      = pos.currency || dictCurr
    const currentPrice  = fund.current_price  ?? null
    const dps           = fund.dps             ?? 0

    const valueEUR      = currentPrice != null ? toEUR(currentPrice * pos.shares, currency) : null
    const costEUR       = toEUR(pos.avg_cost * pos.shares, currency)
    const gainEUR       = valueEUR != null ? valueEUR - costEUR : null
    const gainPct       = costEUR > 0 && gainEUR != null ? gainEUR / costEUR * 100 : null
    const annualIncomeEUR = toEUR(dps * pos.shares, currency)
    const yieldOnCost   = pos.avg_cost > 0 ? dps / pos.avg_cost * 100 : null
    const currentYield  = currentPrice ? dps / currentPrice * 100 : null
    const zone          = codeToZone(countryCode)

    return {
      ...pos, assetType: 'stock',
      name, countryCode, sector, industry: fund.industry ?? null, currency, zone, type,
      currentPrice, dps,
      valueEUR, costEUR, gainEUR, gainPct,
      annualIncomeEUR, yieldOnCost, currentYield,
      isFund: false,
      companyCountry: fund.country ?? null,
      payoutFCF:          fund.payout_fcf         ?? null,
      payoutEPS:          fund.payout_eps          ?? null,
      debtEbitda:         fund.debt_ebitda         ?? null,
      interestCoverage:   fund.interest_coverage   ?? null,
      fcfCagr5:           fund.fcf_cagr5           ?? null,
    }
  })
}

// ── Summary ───────────────────────────────────────────────────────────────

export function calcSummary(enriched) {
  const totalValueEUR  = enriched.reduce((s, p) => s + (p.valueEUR  ?? 0), 0)
  const totalCostEUR   = enriched.reduce((s, p) => s + (p.costEUR   ?? 0), 0)
  const totalIncomeEUR = enriched.reduce((s, p) => s + (p.annualIncomeEUR ?? 0), 0)
  const gainEUR        = totalValueEUR - totalCostEUR
  const gainPct        = totalCostEUR > 0 ? gainEUR / totalCostEUR * 100 : null
  const yieldOnCost    = totalCostEUR > 0 ? totalIncomeEUR / totalCostEUR * 100 : null
  return { totalValueEUR, totalCostEUR, totalIncomeEUR, gainEUR, gainPct, yieldOnCost }
}

// ── Concentration ─────────────────────────────────────────────────────────

export function calcConcentration(enriched) {
  const total = enriched.reduce((s, p) => s + (p.valueEUR ?? 0), 0)
  if (!total) return { bySector: [], byZone: [], byCurrency: [] }

  function group(key) {
    const map = {}
    enriched.forEach(p => {
      const k = p[key] || 'Sin clasificar'
      map[k] = (map[k] || 0) + (p.valueEUR ?? 0)
    })
    return Object.entries(map)
      .map(([name, v]) => ({ name, value: v / total * 100 }))
      .sort((a, b) => b.value - a.value)
  }

  return {
    bySector:   group('sector'),
    byZone:     group('zone'),
    byCurrency: group('currency'),
  }
}

// ── Diversificación por supersectores de Morningstar ────────────────────────
// Devuelve los 3 grandes supersectores (Cíclico/Sensible/Defensivo, + Otros) con
// su peso %, y dentro de cada uno el peso de cada sector particular.
export function calcSectorBreakdown(enriched) {
  const total = enriched.reduce((s, p) => s + (p.valueEUR ?? 0), 0)
  if (!total) return []

  const groups = {}   // supKey -> { value, sectors: { es -> value } }
  enriched.forEach(p => {
    const info = sectorInfo(p.sector)
    const g = groups[info.sup] || (groups[info.sup] = { value: 0, sectors: {} })
    const v = p.valueEUR ?? 0
    g.value += v
    g.sectors[info.es] = (g.sectors[info.es] || 0) + v
  })

  return SUPERSECTOR_ORDER
    .filter(k => groups[k])
    .map(k => {
      const g = groups[k]
      return {
        key:   k,
        label: SUPERSECTORS[k].label,
        color: SUPERSECTORS[k].color,
        desc:  SUPERSECTORS[k].desc,
        value: g.value / total * 100,
        sectors: Object.entries(g.sectors)
          .map(([name, v]) => ({ name, value: v / total * 100 }))
          .sort((a, b) => b.value - a.value),
      }
    })
    .sort((a, b) => b.value - a.value)
}

// ── Diversificación geográfica jerárquica (Continente → País) ───────────────
// Mismo formato que calcSectorBreakdown (key/label/color/value/sectors) para
// reutilizar el gráfico de dos anillos. `sectors` = países del continente.
export function calcGeoBreakdown(enriched) {
  const total = enriched.reduce((s, p) => s + (p.valueEUR ?? 0), 0)
  if (!total) return []

  const groups = {}   // continente -> { value, countries: { nombre -> value } }
  enriched.forEach(p => {
    const cont = codeToZone(p.countryCode)
    const g = groups[cont] || (groups[cont] = { value: 0, countries: {} })
    const v = p.valueEUR ?? 0
    g.value += v
    const cn = countryLabel(p.countryCode)
    g.countries[cn] = (g.countries[cn] || 0) + v
  })

  return Object.entries(groups)
    .map(([cont, g]) => ({
      key:   cont,
      label: cont,
      color: CONTINENT_COLOR[cont] || '#8090a8',
      value: g.value / total * 100,
      sectors: Object.entries(g.countries)
        .map(([name, v]) => ({ name, value: v / total * 100 }))
        .sort((a, b) => b.value - a.value),
    }))
    .sort((a, b) => b.value - a.value)
}

// ── Alerts ────────────────────────────────────────────────────────────────

export function calcAlerts(enriched, concentration) {
  const alerts = []
  const total       = enriched.reduce((s, p) => s + (p.valueEUR ?? 0), 0)
  const totalIncome = enriched.reduce((s, p) => s + (p.annualIncomeEUR ?? 0), 0)

  concentration.bySector.forEach(s => {
    if (s.value > 30) alerts.push(`Concentración elevada en ${s.name} — representa el ${s.value.toFixed(0)}% de la cartera`)
  })
  enriched.forEach(p => {
    if (total > 0 && (p.valueEUR ?? 0) / total > 0.20)
      alerts.push(`Alta dependencia de ${p.name} — ${((p.valueEUR ?? 0) / total * 100).toFixed(0)}% del valor total`)
  })
  enriched.forEach(p => {
    if (totalIncome > 0 && (p.annualIncomeEUR ?? 0) / totalIncome > 0.25)
      alerts.push(`${((p.annualIncomeEUR ?? 0) / totalIncome * 100).toFixed(0)}% de tus dividendos dependen de ${p.name}`)
  })
  concentration.byCurrency.forEach(c => {
    if (c.value > 60) alerts.push(`Exposición elevada a ${c.name} — representa el ${c.value.toFixed(0)}% de la cartera`)
  })
  // Concentración por país (EE.UU. con umbral más alto, mercado dominante en DGI)
  if (total > 0) {
    const byCountry = {}
    enriched.forEach(p => { const c = (p.countryCode || '').toUpperCase() || 'OTHER'; byCountry[c] = (byCountry[c] || 0) + (p.valueEUR ?? 0) })
    Object.entries(byCountry).forEach(([c, v]) => {
      const pct = v / total * 100
      const limit = c === 'US' ? COUNTRY_ALERT_LIMIT_US : COUNTRY_ALERT_LIMIT
      if (pct > limit) alerts.push(`Exposición elevada a ${countryName(c)} — ${pct.toFixed(0)}% de la cartera (umbral ${limit}%)`)
    })
  }
  // ETFs y fondos > 40% del total
  if (total > 0) {
    const fundsValue = enriched.filter(p => p.isFund).reduce((s, p) => s + (p.valueEUR ?? 0), 0)
    if (fundsValue / total > 0.40)
      alerts.push(`Más del 40% de la cartera está en vehículos diversificados — el análisis de concentración sectorial es parcial`)
  }
  return alerts
}

// ── Encaje con el perfil de inversor (supersectores) ────────────────────────
// Compara el reparto real entre los 3 supersectores con el OBJETIVO del perfil
// elegido. Los ETFs/fondos ("otros") se excluyen y los 3 supersectores se
// renormalizan sobre la parte clasificada de la cartera.
export function calcProfileFit(enriched, profileKey = DEFAULT_PROFILE) {
  if (!enriched.length) return null
  const total = enriched.reduce((s, p) => s + (p.valueEUR ?? 0), 0)
  if (!total) return null
  const profile = INVESTOR_PROFILES[profileKey] || INVESTOR_PROFILES[DEFAULT_PROFILE]

  const w = { ciclico: 0, sensible: 0, defensivo: 0, otros: 0 }
  enriched.forEach(p => { w[sectorInfo(p.sector).sup] += (p.valueEUR ?? 0) })
  const otrosPct = w.otros / total * 100
  const core = w.ciclico + w.sensible + w.defensivo
  const actual = {
    ciclico:   core > 0 ? w.ciclico / core * 100 : 0,
    sensible:  core > 0 ? w.sensible / core * 100 : 0,
    defensivo: core > 0 ? w.defensivo / core * 100 : 0,
  }
  const t = profile.targets
  // Distancia de variación total (0–100): mitad de la suma de desviaciones.
  const tvd = (Math.abs(actual.ciclico - t.ciclico) + Math.abs(actual.sensible - t.sensible) + Math.abs(actual.defensivo - t.defensivo)) / 2
  const fitScore = core > 0 ? Math.max(0, Math.round(10 * (1 - tvd / 100) * 10) / 10) : null

  const rows = ['defensivo', 'sensible', 'ciclico'].map(k => ({
    key: k, label: SUPERSECTORS[k].label, color: SUPERSECTORS[k].color,
    actual: actual[k], target: t[k], diff: actual[k] - t[k],
  }))
  const under = [...rows].sort((a, b) => a.diff - b.diff)[0]
  const over  = [...rows].sort((a, b) => b.diff - a.diff)[0]
  const recommendation = core === 0
    ? 'Tu cartera son solo ETFs/fondos: el reparto por supersectores no aplica.'
    : tvd > 10
      ? `Para tu perfil ${profile.label}: sobra peso en ${over.label} (${over.actual.toFixed(0)}% vs ${over.target}% objetivo) y falta en ${under.label} (${under.actual.toFixed(0)}% vs ${under.target}%).`
      : `Tu reparto por supersectores encaja bien con tu perfil ${profile.label}.`

  return { profileKey, profileLabel: profile.label, actual, targets: t, rows, tvd, fitScore, otrosPct, recommendation }
}

// ── Diversification score ─────────────────────────────────────────────────

export function calcDiversificationScore(enriched, profileKey = DEFAULT_PROFILE) {
  if (!enriched.length) return null
  const total = enriched.reduce((s, p) => s + (p.valueEUR ?? 0), 0)
  if (!total) return null

  // 1. Company concentration
  const maxComp = Math.max(...enriched.map(p => (p.valueEUR ?? 0) / total * 100))
  const scComp  = maxComp < 10 ? 10 : maxComp > 30 ? 0 : 10 - (maxComp - 10) / 20 * 10

  // 2. Sector concentration
  const sectors = {}
  enriched.forEach(p => { const k = p.sector || '—'; sectors[k] = (sectors[k] || 0) + (p.valueEUR ?? 0) })
  const maxSec = Math.max(...Object.values(sectors)) / total * 100
  const scSec  = maxSec < 20 ? 10 : maxSec > 40 ? 0 : 10 - (maxSec - 20) / 20 * 10

  // 3. Zone concentration
  const zones = new Set(enriched.map(p => p.zone || 'Otros'))
  const scZone = zones.size >= 3 ? 10 : zones.size === 2 ? 5 : 2

  // 4. Currency concentration
  const currs = {}
  enriched.forEach(p => { const k = p.currency || 'EUR'; currs[k] = (currs[k] || 0) + (p.valueEUR ?? 0) })
  const maxCurr = Math.max(...Object.values(currs)) / total * 100
  const scCurr  = maxCurr < 50 ? 10 : maxCurr > 80 ? 0 : 10 - (maxCurr - 50) / 30 * 10

  // 5. Number of positions
  const n     = enriched.length
  const scNum = n < 5 ? 0 : n <= 10 ? 5 : n <= 20 ? 8 : 10

  // 6. Encaje con el perfil de inversor elegido (supersectores)
  const fit = calcProfileFit(enriched, profileKey)
  const scProfile = fit?.fitScore

  const parts = [scComp, scSec, scZone, scCurr, scNum]
  if (scProfile != null) parts.push(scProfile)
  const score = Math.round(parts.reduce((s, v) => s + v, 0) / parts.length * 10) / 10

  const criteria = [
    { sc: scComp, rec: 'Reduce la concentración en posiciones individuales — ninguna debería superar el 10% del valor total.' },
    { sc: scSec,  rec: 'Diversifica por sector — ninguno debería superar el 20% del valor total.' },
    { sc: scZone, rec: 'Añade exposición internacional — tener empresas de al menos 3 zonas geográficas mejora la diversificación.' },
    { sc: scCurr, rec: 'Diversifica por divisa — la exposición a una sola divisa no debería superar el 50%.' },
    { sc: scNum,  rec: 'Añade más posiciones — una cartera diversificada tiene al menos 15–20 empresas.' },
  ]
  if (scProfile != null) criteria.push({ sc: scProfile, rec: fit.recommendation })
  const worst = [...criteria].sort((a, b) => a.sc - b.sc)[0]

  return { score, recommendation: worst.rec }
}

// ── Dividend risks ────────────────────────────────────────────────────────

// Clasificación de sector (coarse) para que las señales de riesgo sean sector-aware:
// el FCF, la deuda/EBITDA y la cobertura clásica NO aplican igual en banca/seguros,
// REITs/BDC (su caja no es FCF; se miden por AFFO/NII) ni en utilities (capex regulado).
function riskSector(p) {
  const t = (p.type || '').toLowerCase()
  const s = (p.sector || '').toLowerCase()
  const i = (p.industry || '').toLowerCase()
  if (t === 'bdc') return 'bdc'
  if (t === 'reit') return 'reit'
  if (t === 'aseguradora') return 'insurer'
  if (t === 'banco' || (/financial services|servicios financieros/.test(s) && /bank|banca|mortgage|hipotec/.test(i))) return 'bank'
  if (t === 'utilities' || s === 'utilities') return 'utilities'
  if (s === 'energy' || s === 'energía' || s === 'basic materials' || s === 'materiales básicos') return 'energy'
  return 'general'
}

export function calcDividendRisks(enriched, totalIncomeEUR) {
  return enriched
    .map(p => {
      const st = riskSector(p)
      const fin = st === 'bank' || st === 'insurer'   // FCF/deuda-EBITDA/cobertura clásica no aplican
      const reit = st === 'reit'                        // REIT: se mide por AFFO (no cargado) → payout no evaluado aquí
      const bdc = st === 'bdc'                           // BDC: se mide por cobertura del beneficio (≈NII)
      const noFcf = fin || reit || bdc                   // sectores donde el FCF no es la fuente del dividendo
      const risks = []

      // BDC: el dividendo sale del beneficio recurrente (≈NII), no del FCF. Usamos
      // payout sobre BPA como cobertura. Un BDC reparte casi todo su beneficio, así
      // que solo preocupa muy por encima del 100% (umbral alto para evitar ruido del
      // BPA, que en BDC incluye plusvalías valorativas).
      if (bdc && p.payoutEPS != null && p.payoutEPS > 100)
        risks.push({ label: 'Distribución por encima del beneficio', level: p.payoutEPS > 120 ? 'alto' : 'medio',
          value: `${p.payoutEPS.toFixed(0)}%`,
          detail: `Reparte el ${p.payoutEPS.toFixed(0)}% de su beneficio por acción (en un BDC, ≈ su capacidad de generación recurrente). Lo normal es repartir casi todo; de forma sostenida por encima del 100-120% la distribución no está cubierta.` })

      // Payout sobre FCF: solo sectores donde el FCF es la fuente real del dividendo.
      if (!noFcf && st !== 'utilities' && p.payoutFCF != null && p.payoutFCF > 90)
        risks.push({ label: 'Payout FCF elevado', level: p.payoutFCF > 110 ? 'alto' : 'medio',
          value: `${p.payoutFCF.toFixed(0)}%`,
          detail: `Reparte en dividendos el ${p.payoutFCF.toFixed(0)}% de su flujo de caja libre. Saludable por debajo del 70%; por encima del 90% deja poco margen y por encima del 110% se financia con deuda o caja.` })

      // Deuda neta / EBITDA: no aplica a banca/seguros/REIT/BDC. En utilities el umbral es más alto (deuda regulada).
      if (!noFcf && p.debtEbitda != null) {
        const [warn, high, comfort] = st === 'utilities' ? [6, 7, '5×'] : [4, 5, '2,5×']
        if (p.debtEbitda > warn)
          risks.push({ label: 'Deuda elevada', level: p.debtEbitda > high ? 'alto' : 'medio',
            value: `${p.debtEbitda.toFixed(1)}×`,
            detail: `Deuda neta de ${p.debtEbitda.toFixed(1)}× su EBITDA. Cómodo por debajo de ${comfort} para su sector; por encima de ${warn}× el dividendo compite con el pago de la deuda.` })
      }

      // Cobertura de intereses: aplica a casi todos salvo banca/seguros. REIT/BDC/utilities con umbral más laxo (apalancamiento estructural).
      if (!fin && p.interestCoverage != null) {
        const [warn, crit] = (reit || bdc || st === 'utilities') ? [2, 1.5] : [3, 2]
        if (p.interestCoverage < warn)
          risks.push({ label: 'Cobertura de intereses baja', level: p.interestCoverage < crit ? 'alto' : 'medio',
            value: `${p.interestCoverage.toFixed(1)}×`,
            detail: `El beneficio operativo cubre solo ${p.interestCoverage.toFixed(1)}× los intereses de la deuda. Por debajo de ${warn}× los acreedores van antes que el accionista.` })
      }

      // FCF en descenso: no aplica a banca/seguros/REIT/BDC. En cíclicas (energía/materiales) solo si es severo.
      if (!noFcf && p.fcfCagr5 != null) {
        const thr = st === 'energy' ? -25 : -5
        if (p.fcfCagr5 < thr)
          risks.push({ label: 'FCF en descenso', level: p.fcfCagr5 < (st === 'energy' ? -40 : -15) ? 'alto' : 'medio',
            value: `${p.fcfCagr5.toFixed(0)}%/a`,
            detail: `Su flujo de caja libre cae un ${Math.abs(p.fcfCagr5).toFixed(0)}% anual (media de 5 años). El dividendo se paga con esa caja: si sigue estrechándose, peligra.` })
      }

      const incPct = totalIncomeEUR > 0 ? (p.annualIncomeEUR ?? 0) / totalIncomeEUR * 100 : 0
      const worst = risks.some(r => r.level === 'alto') ? 'alto' : 'medio'
      return { ...p, risks, incPct, worst, sectorType: st }
    })
    .filter(p => p.risks.length > 0)
    .sort((a, b) => (a.worst === b.worst ? b.incPct - a.incPct : a.worst === 'alto' ? -1 : 1))
}

// ── Fiscal ────────────────────────────────────────────────────────────────

// destWHT es el tipo del ahorro de destino YA RESUELTO (puede ser 0 si el usuario
// está exento por ingresos, o el tipo medio progresivo según su renta del ahorro).
export function calcFiscal(enriched, whtOverrides = null, destWHT = 19) {
  const destPct = Math.max(0, Number(destWHT) || 0)
  return enriched
    .filter(p => (p.annualIncomeEUR ?? 0) > 0)
    .map(p => {
      const code            = (p.countryCode || '').toUpperCase()
      const isDomestic      = code === 'ES'
      // Retención en origen del país (con el override del usuario por bróker si lo hay).
      const sourceRate      = getWHT(code, whtOverrides) / 100
      const gross           = p.annualIncomeEUR
      const sourceWH        = gross * sourceRate
      // Tipo TOTAL efectivo (origen + España con crédito por doble imposición al 15%).
      // Si el usuario está exento (destPct=0), en acción nacional el tipo total es 0
      // → la retención en origen se DEVUELVE (additionalES negativo).
      const totalRate       = effectiveDivTax(sourceRate * 100, destPct, isDomestic) / 100
      const totalTax        = gross * totalRate
      // Lo que falta por liquidar en España (positivo) o que se devuelve (negativo).
      const additionalES    = totalTax - sourceWH
      const net             = gross - totalTax
      const effectiveRate   = gross > 0 ? totalRate * 100 : 0
      const creditCapped    = !isDomestic && sourceWH > gross * FOREIGN_CREDIT_CAP / 100
      return {
        ticker: p.ticker, name: p.name,
        gross, sourceRate: sourceRate * 100, sourceWH, additionalES, net, effectiveRate,
        creditCapped, companyCountry: p.companyCountry || '—',
      }
    })
}

// ── Crecimiento del dividendo de la cartera ─────────────────────────────────
// Ponderado por la renta que aporta cada posición (no por valor): mide cuánto
// crece la renta de la cartera. g5y = media ponderada del CAGR del dividendo a 5
// años; g1y = media ponderada del último crecimiento anual real (de div_history).
// Excluye ETFs/fondos (sin CAGR de dividendo por acción comparable).
export function calcDividendGrowth(enriched) {
  let w5 = 0, s5 = 0, w1 = 0, s1 = 0
  for (const p of enriched) {
    const inc = p.annualIncomeEUR ?? 0
    if (inc <= 0 || p.isFund || p.type === 'fund') continue
    if (p.div_cagr5 != null && !isNaN(p.div_cagr5)) { s5 += Number(p.div_cagr5) * inc; w5 += inc }
    if (p.divG1y != null && !isNaN(p.divG1y))       { s1 += Number(p.divG1y) * inc;   w1 += inc }
  }
  return { g5y: w5 > 0 ? s5 / w5 : null, g1y: w1 > 0 ? s1 / w1 : null }
}

// ── Weighted avg cost ─────────────────────────────────────────────────────

export function weightedAvgCost(existingShares, existingCost, newShares, newPrice) {
  const total = existingShares + newShares
  if (total <= 0) return 0
  return (existingShares * existingCost + newShares * newPrice) / total
}
