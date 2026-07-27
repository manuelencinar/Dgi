// Modelo normalizado para la infografía PDF (comparador y ficha). FUENTE ÚNICA:
// reutiliza buildComparadorCompanies (mismos scores/sub-scores/yield que la app) y lo
// enriquece con la seguridad del dividendo, el yield medio histórico y la política de
// recompra. TODO sale de nuestra base — nada inventado ni hardcodeado.
//
// Fiscalidad: asumimos SIEMPRE inversor de España (destWHT = 19%). El yield neto
// descuenta el 19% de destino + la retención en origen del país (con el tope de doble
// imposición del 15%), vía netYield/effectiveDivTax. Se muestran bruto y neto.
import { createClient } from '@supabase/supabase-js'
import { DICT } from '@/data/dict'
import { buildComparadorCompanies } from '@/lib/comparador'
import { dividendSafety } from '@/lib/dividend-safety'
import { detectSectorType } from '@/lib/dgi-score'
import { sectorInfo } from '@/lib/supersectors'
import { SUPERSECTORS } from '@/lib/supersectors'

// España fija para la infografía (decisión de producto).
export const ES_DEST_WHT = 19

// Colores de columna por POSICIÓN (garantiza dos columnas distinguibles aunque las dos
// empresas sean del mismo sector). El sector se muestra como chip en su color de supersector.
export const COLUMN_COLORS = ['#818cf8', '#2dd4bf', '#fbbf24', '#f472b6', '#60a5fa']

const num = v => (v != null && !isNaN(v)) ? parseFloat(v) : null
const clampStar = n => Math.max(1, Math.min(5, Math.round(n)))

// ── estrellas (1–5), todas derivadas de datos ────────────────────────────────
function starsYield(netYld) {
  if (netYld == null) return null
  return netYld < 1 ? 1 : netYld < 2 ? 2 : netYld < 3.5 ? 3 : netYld < 5 ? 4 : 5
}
function starsSafety(score) {
  if (score == null) return null
  return score < 30 ? 1 : score < 50 ? 2 : score < 70 ? 3 : score < 85 ? 4 : 5
}
function starsGrowth(streak, cagr) {
  const sStreak = streak == null ? null : streak < 3 ? 1 : streak < 10 ? 2 : streak < 20 ? 3 : streak < 35 ? 4 : 5
  const sCagr = cagr == null ? null : cagr < 2 ? 1 : cagr < 4 ? 2 : cagr < 7 ? 3 : cagr < 11 ? 4 : 5
  const vals = [sStreak, sCagr].filter(v => v != null)
  return vals.length ? clampStar(vals.reduce((a, b) => a + b, 0) / vals.length) : null
}
// Probabilidad de seguir aumentando: holgura del payout (cuanto menor, más margen) +
// que haya racha viva. Sin racha se limita a 3 estrellas.
function starsIncrease(payout, streak, safetyScore) {
  if (payout == null && safetyScore == null) return null
  let base = payout == null ? 3
    : payout < 40 ? 5 : payout < 55 ? 4 : payout < 70 ? 3 : payout < 85 ? 2 : 1
  if (safetyScore != null) base = (base + starsSafety(safetyScore)) / 2
  if (!streak || streak < 1) base = Math.min(base, 3)
  return clampStar(base)
}

// Enriquecimiento extra (no está en el modelo del comparador): seguridad del dividendo,
// yield medio histórico y % de reducción de acciones (política de recompra).
const EXTRA_FIELDS = 'ticker, sector, industry, div_history, div_streak, payout_fcf, payout_eps, net_debt_ebitda, debt_ebitda, interest_coverage, yield_avg, yield_avg_years, shares_reduced_pct, revenue_cagr5, fcf_cagr5'

async function fetchExtra(tickers) {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  const out = {}
  try {
    const { data } = await sb.from('company_fundamentals').select(EXTRA_FIELDS).in('ticker', tickers)
    for (const r of (data || [])) out[r.ticker] = r
  } catch {}
  return out
}

// Construye el modelo de la infografía para 1..N tickers (orden preservado).
export async function buildInfographicModels(tickers) {
  const list = [...new Set((tickers || []).map(t => t.trim().toUpperCase()).filter(Boolean))].slice(0, 5)
  if (!list.length) return []

  const [base, extra] = await Promise.all([
    buildComparadorCompanies(list, ES_DEST_WHT),
    fetchExtra(list),
  ])
  const dictMap = Object.fromEntries(DICT.map(d => [d[1], d]))

  return base.map((c, i) => {
    const ex = extra[c.ticker] || {}
    const d = dictMap[c.ticker]
    const rawSector = ex.sector || (d?.[5]) || c.superSector
    const info = sectorInfo(rawSector) || {}
    const superKey = info.sup || 'otros'
    const superMeta = SUPERSECTORS[superKey] || SUPERSECTORS.otros

    const sectorType = detectSectorType(c.type, ex.sector, ex.industry)
    const safety = dividendSafety(ex, sectorType)
    const safetyScore = safety?.available ? safety.score : null

    const yieldGross = c.yield != null ? c.yield * 100 : null   // c.yield viene en fracción (0.035)
    const yieldNet = c.yieldNet != null ? c.yieldNet : null      // ya en %

    // Yield actual vs su media histórica (barata si el yield está por encima de su media).
    const yAvg = num(ex.yield_avg)
    const yieldVsAvg = (yAvg != null && yAvg > 0 && yieldGross != null)
      ? Math.round((yieldGross - yAvg) / yAvg * 1000) / 10 : null

    const payout = num(ex.payout_fcf) ?? num(ex.payout_eps)
    const sharesRed = num(ex.shares_reduced_pct)

    const stars = {
      rentabilidad: starsYield(yieldNet),
      seguridad: starsSafety(safetyScore),
      crecimiento: starsGrowth(c.streak, c.cagr),
      incremento: starsIncrease(payout, c.streak, safetyScore),
    }

    const scores = {
      calidad: c.subCalidad, dividendo: c.subDividendo,
      solidez: c.subSolidez, valoracion: c.subValoracion,
      total: c.score,
    }

    // Filas de la tabla comparativa (icono + etiqueta + valor por empresa).
    const metrics = [
      { icon: '💰', label: 'Yield bruto',        value: yieldGross != null ? `${yieldGross.toFixed(2)}%` : '—' },
      { icon: '🇪🇸', label: 'Yield neto (ES)',     value: yieldNet != null ? `${yieldNet.toFixed(2)}%` : '—' },
      { icon: '📅', label: 'Años consecutivos',   value: c.streak != null ? `${c.streak}` : '—' },
      { icon: '📈', label: 'CAGR dividendo 5a',   value: c.cagr != null ? `${c.cagr.toFixed(1)}%` : '—' },
      { icon: '🧾', label: 'Payout',              value: payout != null ? `${payout.toFixed(0)}%` : '—' },
      { icon: '⚙️', label: 'ROIC',                value: c.roic != null ? `${c.roic.toFixed(1)}%` : '—' },
      { icon: '📊', label: 'Margen operativo',    value: c.opMargin != null ? `${c.opMargin.toFixed(1)}%` : '—' },
      { icon: '🏦', label: 'Deuda neta / EBITDA', value: c.debt != null ? `${c.debt.toFixed(1)}×` : '—' },
      { icon: '🔁', label: 'Recompra (acciones)', value: sharesRed != null ? (sharesRed > 0.5 ? `−${sharesRed.toFixed(1)}%` : (sharesRed < -0.5 ? `+${Math.abs(sharesRed).toFixed(1)}% (dilución)` : '≈0%')) : '—' },
      { icon: '🌱', label: 'Crecim. ingresos 5a', value: c.revCagr != null ? `${c.revCagr.toFixed(1)}%` : '—' },
    ]

    return {
      ticker: c.ticker,
      name: c.name,
      country: c.country,
      currency: c.currency,
      sectorLabel: info.es || c.superSector || '—',
      superKey, superLabel: superMeta.label, superColor: superMeta.color,
      columnColor: COLUMN_COLORS[i % COLUMN_COLORS.length],
      moat: c.moat,
      yieldGross, yieldNet, yieldVsAvg,
      safety: safety?.available ? { score: safety.score, grade: safety.grade, color: safety.color } : null,
      mos: c.mos,
      pe: c.pe,
      stars, scores, metrics,
      // Para el veredicto (solo datos):
      _score: c.score, _mos: c.mos, _yieldVsAvg: yieldVsAvg, _safety: safetyScore,
    }
  })
}

// Veredicto "¿cuál compraría hoy?" — SOLO derivado de datos, sin frases subjetivas.
export function buildVerdict(models) {
  if (!models || models.length < 2) return null
  const withScore = models.filter(m => m._score != null)
  if (withScore.length < 2) return null
  const byScore = [...withScore].sort((a, b) => b._score - a._score)
  const top = byScore[0], second = byScore[1]

  const lines = []
  if (top._score !== second._score) {
    lines.push(`Por puntuación DGI global, ${top.name} (${top._score.toFixed(1)}/10) supera a ${second.name} (${second._score.toFixed(1)}/10).`)
  } else {
    lines.push(`${top.name} y ${second.name} empatan en puntuación DGI global (${top._score.toFixed(1)}/10).`)
  }

  // Valoración hoy: mejor margen de seguridad y/o yield por encima de su media histórica.
  const byMos = models.filter(m => m._mos != null).sort((a, b) => b._mos - a._mos)
  if (byMos.length) {
    const cheap = byMos[0]
    const bits = [`margen del ${cheap._mos.toFixed(0)}% sobre su valor intrínseco`]
    if (cheap._yieldVsAvg != null && cheap._yieldVsAvg > 0) bits.push(`yield ${cheap._yieldVsAvg.toFixed(0)}% por encima de su media histórica`)
    lines.push(`Por valoración actual, ${cheap.name} es la más atractiva: ${bits.join(' y ')}.`)
  }

  // Seguridad del dividendo.
  const bySafe = models.filter(m => m._safety != null).sort((a, b) => b._safety - a._safety)
  if (bySafe.length >= 2 && bySafe[0]._safety !== bySafe[1]._safety) {
    lines.push(`En seguridad del dividendo puntúa más alto ${bySafe[0].name} (${bySafe[0]._safety}/100 vs ${bySafe[1]._safety}/100).`)
  }

  return { winner: top.name, lines }
}

// Veredicto de una sola empresa (ficha) — banda de puntuación + valoración vs intrínseco/media.
export function buildSingleVerdict(m) {
  if (!m) return null
  const lines = []
  if (m._score != null) {
    const band = m._score >= 8 ? 'excelente' : m._score >= 6.5 ? 'sólida' : m._score >= 5 ? 'aceptable' : 'débil'
    lines.push(`Puntuación DGI ${m._score.toFixed(1)}/10 — calidad ${band}.`)
  }
  if (m.safety) lines.push(`Seguridad del dividendo: ${m.safety.grade} (${m.safety.score}/100).`)
  if (m._mos != null) {
    lines.push(m._mos > 0
      ? `Cotiza con un margen del ${m._mos.toFixed(0)}% por debajo de su valor intrínseco estimado.`
      : `Cotiza un ${Math.abs(m._mos).toFixed(0)}% por encima de su valor intrínseco estimado.`)
  }
  if (m._yieldVsAvg != null) {
    lines.push(m._yieldVsAvg > 0
      ? `Su yield está un ${m._yieldVsAvg.toFixed(0)}% por encima de su media histórica.`
      : `Su yield está un ${Math.abs(m._yieldVsAvg).toFixed(0)}% por debajo de su media histórica.`)
  }
  return { lines }
}
