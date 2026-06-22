// Construcción de la lista de empresas del screener (shape `co`) desde
// company_fundamentals + el DICT. Fuente única reutilizada por el screener
// (`/screener`) y el wizard "construir cartera" (`/construir-cartera`).
import { createClient } from '@supabase/supabase-js'
import { getContinent } from '@/lib/helpers'
import { computeScore, resolveRoic, marginSafety, yieldPct, deriveMoat, moatErosion, calcDivQuality, rule1010, sanePayout, mosUnreliable, isPharmaCo } from '@/lib/screener'
import { isSecondary } from '@/lib/listings'
import { getIndexConstituents } from '@/lib/index-constituents'

// Lee company_fundamentals (campos escalares) paginado — PostgREST limita a 1000 filas.
async function fetchFundamentals() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  const FIELDS_BASE = 'ticker, current_price, dps, pays_dividend, div_streak, div_cagr5, payout_fcf, payout_eps, fcf_cagr5, debt_ebitda, net_debt_ebitda, interest_coverage, roic, roic_reported, roic_tangible, roe, operating_margin, gross_margin, revenue_cagr5, pe_trailing, pe_forward, eps_trailing, ev_ebitda, market_cap_m, intrinsic_value, week52_high, week52_low, yield_avg, yield_avg_years, ma200, sector, industry, country, bonus_total, improving_flag, bonus_roic_trend, bonus_margin_trend, bonus_debt_reduction, bonus_fcf_growth'
  // rd_intensity puede no existir aún (SQL pendiente) → fallback sin esa columna.
  let fields = FIELDS_BASE + ', rd_intensity'
  const all = []
  try {
    for (let from = 0; ; from += 1000) {
      let { data, error } = await sb.from('company_fundamentals').select(fields).range(from, from + 999)
      if (error && fields !== FIELDS_BASE) {   // columna nueva no existe → reintenta sin ella
        fields = FIELDS_BASE
        ;({ data, error } = await sb.from('company_fundamentals').select(fields).range(from, from + 999))
      }
      if (error || !data?.length) break
      all.push(...data)
      if (data.length < 1000) break
    }
  } catch {}
  return Object.fromEntries(all.map(f => [f.ticker, f]))
}

const EXCLUDED = new Set(['^VIX', '^VVIX'])   // índices de volatilidad, no invertibles
const ROIC_NA_TYPES = new Set(['banco', 'aseguradora', 'reit', 'bdc'])

export async function buildScreenerCompanies(destWHT, baseDict) {
  const fundMap = await fetchFundamentals()

  // Deduplicar y excluir tickers no invertibles (VIX, etc.)
  const seen = new Set()
  // Excluye no invertibles, duplicados y cotizaciones SECUNDARIAS (solo la matriz).
  const dict = baseDict.filter(d => { if (EXCLUDED.has(d[1]) || seen.has(d[1]) || isSecondary(d[1])) return false; seen.add(d[1]); return true })

  return dict.map(([name, ticker, country, currency, sector, , type]) => {
    const f = fundMap[ticker] || null
    // Empresas sin precio válido (sin dato) o penny stocks (<0,01 → se ven
    // "0,00" e inflan el yield, p.ej. Urbas 0,0021) no se muestran al usuario.
    if (!f || f.current_price == null || Number(f.current_price) < 0.01) return null
    const t = type || 'general'
    const rawCagr = f.div_cagr5 != null ? Number(f.div_cagr5) : null
    const roicVal = ROIC_NA_TYPES.has(t) ? null : resolveRoic(f)
    // Erosión del foso: ya no es solo decorativa, resta 1,0 a la nota final.
    const rawSc = computeScore(f, t)
    const ero = moatErosion(f)
    const rawMos = marginSafety(f)
    return {
      n: name, t: ticker, c: country, cont: getContinent(country), s: sector, cur: currency, tp: t,
      px:   f.current_price != null ? Number(f.current_price) : null,
      y:    yieldPct(f),
      sc:   rawSc != null && ero ? Math.max(1, Math.round((rawSc - 1) * 10) / 10) : rawSc,
      mos:  rawMos,
      mosUnreliable: mosUnreliable(f),
      roic: roicVal,
      roicNA: ROIC_NA_TYPES.has(t),
      roicWarn: roicVal != null && roicVal > 60,
      streak: f.div_streak != null ? Number(f.div_streak) : null,
      cagr:   rawCagr != null ? Math.min(rawCagr, 50) : null,
      cagrWarn: rawCagr != null && rawCagr > 50,
      payout: sanePayout(f),
      debt:   f.net_debt_ebitda != null ? Number(f.net_debt_ebitda) : (f.debt_ebitda != null ? Number(f.debt_ebitda) : null),
      icov:   f.interest_coverage != null ? Number(f.interest_coverage) : null,
      opm:    f.operating_margin != null ? Number(f.operating_margin) : null,
      rev:    f.revenue_cagr5 != null ? Number(f.revenue_cagr5) : null,
      // PER trailing: si Yahoo no lo da pero hay BPA positivo, precio/BPA (fallback).
      pe:     f.pe_trailing != null ? Number(f.pe_trailing)
              : (f.eps_trailing != null && Number(f.eps_trailing) > 0 && f.current_price != null ? Number(f.current_price) / Number(f.eps_trailing) : null),
      peFwd:  f.pe_forward != null ? Number(f.pe_forward) : null,
      ev:     f.ev_ebitda != null ? Number(f.ev_ebitda) : null,
      mcap:   f.market_cap_m != null ? Number(f.market_cap_m) : null,
      // Rango 52 sem reconciliado con el precio actual (el almacenado es del scrape
      // semanal; si el precio ha roto el máximo/mínimo, se ajusta para no quedar stale).
      hi52:   f.week52_high != null ? Math.max(Number(f.week52_high), Number(f.current_price)) : null,
      lo52:   f.week52_low  != null ? Math.min(Number(f.week52_low),  Number(f.current_price)) : null,
      yieldAvg:      f.yield_avg != null ? Number(f.yield_avg) : null,
      yieldAvgYears: f.yield_avg_years != null ? Number(f.yield_avg_years) : null,
      ma200:  f.ma200 != null ? Number(f.ma200) : null,
      moat:   deriveMoat(f),
      ero,
      dq:     calcDivQuality(f, t, country, destWHT),
      r1010:  rule1010(f),
      pays:   f.pays_dividend ?? null,
      rd:     f.rd_intensity != null ? Number(f.rd_intensity) : null,
      isPharma: isPharmaCo(f.sector, f.industry),
      bonus:  f.bonus_total != null ? Number(f.bonus_total) : 0,
      bRoic:  f.bonus_roic_trend != null ? Number(f.bonus_roic_trend) : 0,
      bMargin: f.bonus_margin_trend != null ? Number(f.bonus_margin_trend) : 0,
      bDebt:  f.bonus_debt_reduction != null ? Number(f.bonus_debt_reduction) : 0,
      bFcf:   f.bonus_fcf_growth != null ? Number(f.bonus_fcf_growth) : 0,
    }
  }).filter(Boolean)
}

// ── Muestra freemium del screener ──────────────────────────────────────────
// El usuario free solo recibe 50 empresas (con TODOS sus datos y filtros); el
// resto NO se le envía. Selección DETERMINISTA (siempre las mismas 50) con
// reparto por índice: 1 IBEX 35, 1 DAX, 1 CAC 40, 1 FTSE 100, 5 S&P 500 y el
// resto (41) del resto del mundo. "Al azar" pero estable vía hash del ticker.
export const FREE_SCREENER_SAMPLE = 50

function hashTicker(s) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}
// Orden pseudo-aleatorio pero estable (mismo resultado en cada carga).
function stableOrder(pool) {
  return [...pool].sort((a, b) => (hashTicker(a.t) - hashTicker(b.t)) || (a.t < b.t ? -1 : 1))
}

export function selectFreeSample(companies, n = FREE_SCREENER_SAMPLE) {
  const setOf = sym => new Set(getIndexConstituents(sym).map(c => c.ticker))
  const ibex = setOf('^IBEX'), dax = setOf('^GDAXI'), cac = setOf('^FCHI'), ftse = setOf('^FTSE'), sp = setOf('^GSPC')
  const named = new Set([...ibex, ...dax, ...cac, ...ftse, ...sp])

  const chosen = new Map()
  const take = (pool, k) => {
    for (const co of stableOrder(pool)) {
      if (k <= 0 || chosen.size >= n) break
      if (!chosen.has(co.t)) { chosen.set(co.t, co); k-- }
    }
  }
  const inSet = set => companies.filter(c => set.has(c.t))

  take(inSet(ibex), 1)
  take(inSet(dax), 1)
  take(inSet(cac), 1)
  take(inSet(ftse), 1)
  take(inSet(sp), 5)
  // Resto del mundo: empresas fuera de esos cinco índices.
  take(companies.filter(c => !named.has(c.t)), n - chosen.size)
  // Respaldo: si algún índice no tuvo candidatos, completar hasta n con cualquiera.
  if (chosen.size < n) take(companies, n - chosen.size)

  return [...chosen.values()]
}
