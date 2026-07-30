import { notFound, redirect } from 'next/navigation'
import { primaryOf, otherListings } from '@/lib/listings'
import { createClient as authClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { extendStatements } from '@/lib/financial-history-merge'
import PublicNav from '@/components/PublicNav'
import CompanyDetailPage from '@/components/CompanyDetailPage'
import { DICT } from '@/data/dict'
import { findDictEntry } from '@/lib/dict'
import { getCompanyQuote } from '@/lib/company-quote'
import { calculateROIC } from '@/lib/metrics'
import { buildHealthPanel } from '@/lib/health'
import { netYield, getWHT, resolveRoic, effectiveDivTax } from '@/lib/screener'
import { payLagDays } from '@/lib/sectors'
import { sectorInfo, SUPERSECTORS } from '@/lib/supersectors'
import { industryEs } from '@/lib/taxonomy'
import { getProfile } from '@/data/profiles'
import { resolveDestWHT } from '@/lib/fiscal-es'
import { yieldReversionValue, twoStageDDM, peRelativeValue, pAffoRelativeValue, epvValue, impliedGrowth } from '@/lib/valuation-methods'
import { computeBankMetrics, effectiveBankMetrics } from '@/lib/bank-metrics'
import { computeInsurerMetrics, effectiveInsurerMetrics } from '@/lib/insurer-metrics'
import { isCreditRiskFinancial, detectSectorType } from '@/lib/dgi-score'
import { computeBuyPrice } from '@/lib/buy-price'
import { buildQualityTrend } from '@/lib/quality-trend'
import { buildSectorPositioning } from '@/lib/sector-percentiles'
import { fromHistoryRows, buildQuarterlyModel } from '@/lib/quarterly'
import { dividendSafety } from '@/lib/dividend-safety'
import { buildReitMetrics } from '@/lib/reit-metrics'
import { computeOilBreakeven } from '@/lib/energy-breakeven'
import {
  getCompanyDetail,
  computeMoat,
  computeValuation,
  computeProjection,
  computeDGIScore,
  buildInsights,
  computeBadges,
  computeBuybacks,
  computeRDIntensity,
  isHealthcare,
} from '@/lib/company-detail'

export const dynamic = 'force-dynamic'

const ADMIN_EMAIL = 'vayaebookk@gmail.com'

// CAGR del dividendo a N años a partir del histórico (años completos).
function divCagr(divHistory, years) {
  const full = (divHistory || []).filter(h => !h.isPartial && h.dps != null).sort((a, b) => a.year - b.year)
  if (full.length < 2) return null
  const last = full[full.length - 1]
  const yrs  = Math.min(years, full.length - 1)
  const base = full[full.length - 1 - yrs]
  if (!base?.dps || base.dps <= 0 || !last?.dps) return null
  return Math.pow(last.dps / base.dps, 1 / yrs) - 1
}

// Estima los próximos pagos a partir del DPS previsto y la frecuencia típica por divisa.
const ML = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

function fmtFullEs(d) {
  if (!d || isNaN(d.getTime())) return null
  return `${d.getDate()} ${ML[d.getMonth()]} ${d.getFullYear()}`
}
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x }
function addMonths(d, n) { const x = new Date(d); x.setMonth(x.getMonth() + n); return x }

// Próximos pagos con fecha de pago real e importe bruto/neto.
//   Fecha de pago: si la empresa confirmó next_pay_date se usa tal cual; si solo
//   hay next_ex_date, se le suman los días que tarda en pagar ese mercado
//   (payLagDays). Importe neto = bruto × (1 − retención efectiva), donde la
//   retención efectiva = máx(origen, destino) (origen acreditado contra destino).
function buildUpcomingPayments(events, nextPay, nextEx, dpsPrev, cagr, currency, country, originWHT, destWHT) {
  // Frecuencia: nº de pagos en los últimos 12 meses del evento más reciente
  let freq = null
  if (Array.isArray(events) && events.length >= 2) {
    const dates = events.map(e => e.ex_date).filter(Boolean).sort()
    const last = new Date(dates[dates.length - 1] + 'T12:00:00')
    const yearAgo = new Date(last); yearAgo.setFullYear(yearAgo.getFullYear() - 1)
    const count = events.filter(e => e.ex_date && new Date(e.ex_date + 'T12:00:00') > yearAgo).length
    if (count >= 1) freq = [1, 2, 4, 12].reduce((p, c) => Math.abs(c - count) < Math.abs(p - count) ? c : p, 1)
  }
  if (!freq) freq = (currency === 'USD' || currency === 'CAD') ? 4 : (currency === 'GBP' || currency === 'CHF') ? 2 : 1
  const annual = (dpsPrev != null && dpsPrev > 0) ? dpsPrev * (1 + (cagr ?? 0)) : null
  const per = annual != null ? annual / freq : null
  const stepMonths = 12 / freq
  const lag  = payLagDays(country)
  const effWHT = effectiveDivTax(originWHT, destWHT, country === 'ES') / 100

  // Ancla de fecha de pago (y de ex), por orden de preferencia.
  let payAnchor = null, exAnchor = null, firstConfirmed = false
  if (nextPay) {
    payAnchor = new Date(nextPay + 'T12:00:00')
    exAnchor  = nextEx ? new Date(nextEx + 'T12:00:00') : addDays(payAnchor, -lag)
    firstConfirmed = true
  } else if (nextEx) {
    exAnchor  = new Date(nextEx + 'T12:00:00')
    payAnchor = addDays(exAnchor, lag)         // ex + días de pago del mercado
  } else if (Array.isArray(events) && events.length) {
    const lastEx = new Date(events[events.length - 1].ex_date + 'T12:00:00')
    exAnchor  = addMonths(lastEx, stepMonths)  // próxima ex estimada
    payAnchor = addDays(exAnchor, lag)
  }
  if (!payAnchor || isNaN(payAnchor.getTime())) return []

  // Si las fechas de yfinance ya pasaron (next_ex/next_pay obsoletos), avanzar las
  // anclas hacia el futuro en pasos de la frecuencia: solo mostramos pagos futuros.
  // Al avanzar deja de ser un pago confirmado y pasa a ser estimación.
  const today = new Date(); today.setHours(0, 0, 0, 0)
  let rolled = 0
  while (payAnchor < today && rolled < 24) {
    payAnchor = addMonths(payAnchor, stepMonths)
    if (exAnchor) exAnchor = addMonths(exAnchor, stepMonths)
    rolled++
  }
  if (rolled > 0) firstConfirmed = false

  const out = []
  for (let i = 0; i < Math.min(freq, 4); i++) {
    const pay = addMonths(payAnchor, Math.round(stepMonths * i))
    const ex  = exAnchor ? addMonths(exAnchor, Math.round(stepMonths * i)) : null
    out.push({
      payLabel: fmtFullEs(pay),
      exLabel:  fmtFullEs(ex),
      gross: per,
      net:   per != null ? per * (1 - effWHT) : null,
      confirmed: i === 0 && firstConfirmed,
      estimatedFromEx: !firstConfirmed,
      type: 'Ordinario',
    })
  }
  return out
}

function balanceFirst(stmt, ...keys) {
  const d = stmt?.data
  if (!d) return null
  for (const k of keys) {
    const r = d[k]
    if (Array.isArray(r)) { for (const v of r) { if (v != null && !isNaN(v)) return parseFloat(v) } }
  }
  return null
}

function stmtRowArr(stmt, ...keys) {
  const d = stmt?.data
  if (!d) return null
  for (const k of keys) { if (Array.isArray(d[k])) return d[k] }
  return null
}

// PER de cada ejercicio con fundamentales: precio de cierre en la fecha de cierre
// fiscal (daily_prices) ÷ BPA diluido de ese año (o capitalización ÷ beneficio neto).
async function buildPeHistory(detail, supabase, ticker) {
  const isa  = detail?.income_statement_annual
  const cols = isa?.columns
  if (!Array.isArray(cols) || !cols.length) return []
  const niRow  = stmtRowArr(isa, 'Beneficio Neto', 'Net Income', 'Net Income Common Stockholders')
  const shRow  = stmtRowArr(isa, 'Acciones Medias Diluidas', 'Diluted Average Shares', 'Acciones Medias Básicas', 'Basic Average Shares')
  const epsRow = stmtRowArr(isa, 'BPA Diluido', 'Diluted EPS', 'BPA Básico', 'Basic EPS')
  const n = Math.min(cols.length, 4)

  const closes = await Promise.all(
    Array.from({ length: n }, (_, i) => {
      const end = String(cols[i]).slice(0, 10)
      return supabase.from('daily_prices')
        .select('close_price')
        .eq('ticker', ticker).lte('date', end)
        .order('date', { ascending: false }).limit(1).maybeSingle()
        .then(r => (r.data ? Number(r.data.close_price) : null))
        .catch(() => null)
    })
  )

  const out = []
  for (let i = 0; i < n; i++) {
    const close = closes[i]
    const eps = epsRow?.[i] != null ? parseFloat(epsRow[i]) : null
    const ni  = niRow?.[i]  != null ? parseFloat(niRow[i])  : null
    const sh  = shRow?.[i]  != null ? parseFloat(shRow[i])  : null
    let pe = null
    if (close != null && eps != null && eps > 0) pe = close / eps
    else if (close != null && sh != null && sh > 0 && ni != null && ni > 0) pe = (close * sh) / ni
    if (pe != null && pe > 0 && pe < 200) out.push({ year: String(cols[i]).slice(0, 4), pe: Math.round(pe * 10) / 10 })
  }
  return out.reverse()   // de más antiguo a más reciente
}

// EV/EBITDA por ejercicio = (precio·acciones + deuda neta) / EBITDA, reconstruido
// con los mismos datos que el PER (precio de cierre fiscal + estados anuales).
// Devuelve { history, current }: el punto "Hoy" se calcula con la MISMA fórmula
// (precio en vivo × acciones + deuda neta del último ejercicio / EBITDA de ese año)
// para que sea coherente con la serie, en vez del escalar ev_ebitda almacenado.
// Mediana del PER del sector (para la valoración relativa). null si < 5 pares.
async function sectorMedianPe(supabase, sector, selfTicker) {
  if (!sector) return null
  try {
    const { data } = await supabase.from('company_fundamentals').select('ticker, pe_trailing').eq('sector', sector)
    const vals = (data || []).filter(r => r.ticker !== selfTicker && r.pe_trailing != null)
      .map(r => Number(r.pe_trailing)).filter(v => v > 0 && v < 60).sort((a, b) => a - b)
    if (vals.length < 5) return null
    const mid = Math.floor(vals.length / 2)
    return vals.length % 2 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2
  } catch { return null }
}

// Mediana del múltiplo P/AFFO del sector (REITs). El PER no es válido en inmobiliarias,
// así que el cross-check relativo usa P/AFFO. Se deriva de columnas ya guardadas:
// P/AFFO = precio ÷ AFFO/acción, y AFFO/acción = dps ÷ (payout_affo/100). null si < 5 pares.
async function sectorMedianPAffo(supabase, sector, selfTicker) {
  if (!sector) return null
  try {
    const { data } = await supabase.from('company_fundamentals').select('ticker, current_price, dps, payout_affo').eq('sector', sector)
    const vals = (data || [])
      .filter(r => r.ticker !== selfTicker && Number(r.current_price) > 0 && Number(r.dps) > 0 && Number(r.payout_affo) > 0)
      .map(r => Number(r.current_price) * (Number(r.payout_affo) / 100) / Number(r.dps))   // P/AFFO
      .filter(v => v > 3 && v < 45).sort((a, b) => a - b)
    if (vals.length < 5) return null
    const mid = Math.floor(vals.length / 2)
    return vals.length % 2 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2
  } catch { return null }
}

async function buildEvEbitdaHistory(detail, supabase, ticker, livePrice = null) {
  const empty = { history: [], current: null }
  const isa = detail?.income_statement_annual
  const bsa = detail?.balance_sheet_annual
  const cols = isa?.columns
  if (!Array.isArray(cols) || !cols.length) return empty
  const ebRow   = stmtRowArr(isa, 'EBITDA', 'Normalized EBITDA')
  const shRow   = stmtRowArr(isa, 'Acciones Medias Diluidas', 'Diluted Average Shares', 'Acciones Medias Básicas', 'Basic Average Shares')
  const ndRow   = stmtRowArr(bsa, 'Net Debt', 'Deuda Neta')
  const debtRow = stmtRowArr(bsa, 'Total Debt', 'Deuda Total')
  const cashRow = stmtRowArr(bsa, 'Cash And Cash Equivalents', 'Caja y Equivalentes', 'Efectivo y Equivalentes')
  if (!ebRow || !shRow) return empty
  const n = Math.min(cols.length, 4)
  const netDebtAt = i => {
    if (ndRow?.[i] != null) return parseFloat(ndRow[i])
    if (debtRow?.[i] != null) return parseFloat(debtRow[i]) - (cashRow?.[i] != null ? parseFloat(cashRow[i]) : 0)
    return null
  }

  const closes = await Promise.all(
    Array.from({ length: n }, (_, i) => {
      const end = String(cols[i]).slice(0, 10)
      return supabase.from('daily_prices').select('close_price')
        .eq('ticker', ticker).lte('date', end)
        .order('date', { ascending: false }).limit(1).maybeSingle()
        .then(r => (r.data ? Number(r.data.close_price) : null)).catch(() => null)
    })
  )

  const evMultiple = (price, i) => {
    const ebitda = ebRow?.[i] != null ? parseFloat(ebRow[i]) : null
    const sh = shRow?.[i] != null ? parseFloat(shRow[i]) : null
    const nd = netDebtAt(i)
    if (price == null || sh == null || sh <= 0 || ebitda == null || ebitda <= 0) return null
    const m = (price * sh + (nd != null ? nd : 0)) / ebitda
    return (m > 0 && m < 100) ? Math.round(m * 10) / 10 : null
  }

  const out = []
  for (let i = 0; i < n; i++) {
    const m = evMultiple(closes[i], i)
    if (m != null) out.push({ year: String(cols[i]).slice(0, 4), val: m })
  }
  // Punto "Hoy": precio en vivo sobre los fundamentales del último ejercicio (i=0).
  const current = livePrice != null ? evMultiple(livePrice, 0) : null
  return { history: out.reverse(), current }
}

async function getUserPlan() {
  try {
    const supabase = await authClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return 'free'
    if (user.email === ADMIN_EMAIL) return 'premium'
    const { data } = await supabase
      .from('user_settings')
      .select('plan, premium_until')
      .eq('user_id', user.id)
      .single()
    if (!data) return 'free'
    if (data.plan === 'premium' && data.premium_until) {
      return new Date(data.premium_until) >= new Date() ? 'premium' : 'free'
    }
    return data.plan || 'free'
  } catch { return 'free' }
}

export async function generateMetadata({ params }) {
  const { ticker } = await params
  const t = decodeURIComponent(ticker)
  const entry = DICT.find(d => d[1] === t)
  const name = entry?.[0] ?? t
  return {
    title: `${name} — Análisis DGI | EverDiv`,
    description: `Análisis completo de dividendos, Score DGI, foso económico y valoración de ${name}.`,
  }
}

export default async function EmpresaPage({ params, searchParams }) {
  const { ticker } = await params
  const sp = searchParams ? await searchParams : {}
  const initialTab = typeof sp?.tab === 'string' ? sp.tab : 'resumen'
  const t = decodeURIComponent(ticker)

  // Cotización secundaria (mismo valor en otro mercado) → redirige a la matriz.
  const primary = primaryOf(t)
  if (primary !== t) redirect(`/empresa/${encodeURIComponent(primary)}`)

  const entry = await findDictEntry(t)
  if (!entry) notFound()

  const [name, , country, currency, sector, subsector, type] = entry

  // Obtener plan, datos, cotización en vivo y precio diario en paralelo
  const supabase = await authClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [plan, detail, liveQuote, dailyRow, positionRow, watchRow, settingsRow, scoreHistory] = await Promise.all([
    getUserPlan(),
    getCompanyDetail(t),
    getCompanyQuote(t),
    // Precio más reciente de daily_prices
    supabase.from('daily_prices').select('close_price, date, updated_at')
      .eq('ticker', t).order('date', { ascending: false }).limit(1).maybeSingle()
      .then(r => r.data),
    // Posición del usuario para mostrar avg_cost en el gráfico
    user ? supabase.from('positions').select('avg_cost')
      .eq('user_id', user.id).eq('ticker', t).maybeSingle()
      .then(r => r.data) : null,
    // Entrada de watchlist del usuario (botón Seguir/Siguiendo)
    user ? supabase.from('watchlist').select('*')
      .eq('user_id', user.id).eq('ticker', t).maybeSingle()
      .then(r => r.data) : null,
    // Retención fiscal de destino del usuario (para el yield neto)
    user ? supabase.from('user_settings').select('*')
      .eq('user_id', user.id).maybeSingle()
      .then(r => r.data).catch(() => null) : null,
    // Histórico del Score DGI (sparkline de evolución) — lectura pública (RLS)
    supabase.from('score_history').select('date, score')
      .eq('ticker', t).order('date', { ascending: true })
      .then(r => r.data || []).catch(() => []),
  ])

  // Los Reyes del dividendo (racha ≥ 50 años) tienen la ficha COMPLETA gratis: un
  // escaparate para que el usuario free vea todo el análisis antes de suscribirse.
  const isKingFree = (detail?.div_streak ?? 0) >= 50 && plan !== 'premium'
  const isPremium  = plan === 'premium' || isKingFree
  const destWHT    = resolveDestWHT(settingsRow)

  // Otras cotizaciones de la misma empresa (mercado · precio · ticker pequeño).
  const otherTickers = otherListings(t)
  let crossListings = []
  if (otherTickers.length) {
    const { data: orows } = await supabase.from('company_fundamentals').select('ticker, current_price').in('ticker', otherTickers)
    const pm = Object.fromEntries((orows || []).map(r => [r.ticker, r.current_price]))
    crossListings = otherTickers.map(tk => {
      const e = DICT.find(d => d[1] === tk)
      return { ticker: tk, country: e?.[2] ?? null, currency: e?.[3] ?? null, price: pm[tk] != null ? Number(pm[tk]) : null }
    })
  }

  const dailyPrice = dailyRow ? {
    price:     Number(dailyRow.close_price),
    date:      dailyRow.date,
    isToday:   dailyRow.date === new Date().toISOString().slice(0, 10),
    updatedAt: dailyRow.updated_at,
  } : null

  const price      = liveQuote?.price       ?? dailyPrice?.price ?? detail?.current_price  ?? null
  // El valor intrínseco, el Score y la salud se calculan con el precio REAL del día
  // (daily_prices / cotización en vivo), no con el del scrape semanal de yfinance.
  // Se fija aquí para que la valoración (precio actual y margen de seguridad) y el
  // resto de la ficha usen un único precio diario coherente.
  if (detail && price != null) detail.current_price = price
  const change     = liveQuote?.change      ?? null
  const changePct  = liveQuote?.pct         ?? null
  const yld        = price > 0 && detail?.dps != null ? detail.dps / price : null
  const divRate    = detail?.dps            ?? null
  // El rango de 52 semanas viene del scrape semanal; el precio en vivo (daily_prices)
  // es más fresco. Si el precio ha roto el máximo/mínimo almacenado, se reconcilia
  // para que el rango contenga siempre el precio actual (si no, el header mostraría
  // un precio por encima de su "máximo de 52 semanas").
  const low52      = detail?.week52_low  != null ? (price != null ? Math.min(detail.week52_low,  price) : detail.week52_low)  : null
  const high52     = detail?.week52_high != null ? (price != null ? Math.max(detail.week52_high, price) : detail.week52_high) : null
  const peTrailing = detail?.pe_trailing    ?? null
  const peForward  = detail?.pe_forward     ?? null
  const evEbitda   = detail?.ev_ebitda      ?? null
  const eps        = detail?.eps_trailing   ?? null
  const payout     = detail?.payout_fcf != null ? detail.payout_fcf / 100
                   : detail?.payout_eps != null ? detail.payout_eps / 100 : null
  const mktCap     = detail?.market_cap_m   != null ? detail.market_cap_m * 1e6 : null
  const divHistory = detail?.divHistory     ?? []
  const streak     = detail?.div_streak     ?? 0
  // ¿Reparte dividendo? true / false / null (sin verificar). Distingue empresas
  // que no pagan (Google, Berkshire…) de las que tienen el dato pendiente.
  const paysDividend = detail?.pays_dividend ?? null
  const noDividendAt = detail?.no_dividend_confirmed_at ?? null
  const cagr       = detail?.div_cagr5      != null ? detail.div_cagr5 / 100 : null
  const updatedAt  = detail?.updated_at     ?? null

  // Precio / valor contable: usa el campo si existe, si no lo deriva del balance.
  if (detail && detail.price_to_book == null && mktCap != null) {
    const equity = balanceFirst(detail.balance_sheet_annual, 'Patrimonio Neto', 'Total Stockholder Equity', 'Stockholders Equity', 'Common Stock Equity')
    if (equity != null && equity > 0) detail.price_to_book = mktCap / equity
  }

  // Clasificación nueva (Morningstar, en español) desde company_fundamentals:
  // Supersector → Sector → Industria. Fuente: detail.sector (11 de Yahoo) + detail.industry.
  const _cfSector = detail?.sector ?? null
  const _sinfo = sectorInfo(_cfSector)
  const classification = _cfSector ? {
    superLabel: SUPERSECTORS[_sinfo.sup]?.label ?? null,
    superColor: SUPERSECTORS[_sinfo.sup]?.color ?? 'var(--accent)',
    sectorEs:   _sinfo.es,
    industryEs: detail?.industry ? industryEs(_cfSector, detail.industry) : null,
  } : null

  // Métricas bancarias (solo banca): calculadas desde los estados + manuales
  // (NPL por trimestre + overrides). Premium (no enviar al cliente free).
  const isBank = isCreditRiskFinancial(type, detail?.sector, detail?.industry)
  let bankMetrics = null
  if (isBank && detail) {
    const { data: bmRows } = await supabase.from('bank_metrics_manual').select('*').eq('ticker', t)
    bankMetrics = effectiveBankMetrics(computeBankMetrics(detail), bmRows || [])
  }

  const isInsurer = type === 'aseguradora'
  let insurerMetrics = null
  if (isInsurer && detail) {
    const { data: imRows } = await supabase.from('insurer_metrics_manual').select('*').eq('ticker', t)
    insurerMetrics = effectiveInsurerMetrics(computeInsurerMetrics(detail), imRows || [])
  }

  // REITs: FFO/AFFO (sub-tipo manual fija el % de mantenimiento).
  let reitMetrics = null
  if (detail && (type === 'reit' || detail.sector === 'Real Estate')) {
    const { data: reitRow } = await supabase.from('reit_manual').select('*').eq('ticker', t).maybeSingle()
    reitMetrics = buildReitMetrics(detail, reitRow || null)
  }
  const isReit = !!reitMetrics

  // Energía (petróleo): breakeven del crudo por regresión (margen vs WTI).
  const oilBreakeven = detail ? computeOilBreakeven(detail) : null

  const roicData   = detail ? calculateROIC({ ...detail, type }, currency) : null

  // Histórico trimestral (permanente) — se carga ANTES de la valoración para inyectar el
  // crecimiento interanual reciente en el DCF (que la valoración esté al día, no anclada a
  // la ventana anual de 5 años). También alimenta los gráficos trimestrales.
  let quarterlyRows = []
  if (detail && isPremium) {
    try {
      const svc = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
      const { data: fhq } = await svc.from('financial_history_quarterly').select('*').eq('ticker', t).order('period', { ascending: true })
      if (fhq?.length) {
        quarterlyRows = fhq
        const qm = buildQuarterlyModel(fromHistoryRows(fhq))
        const recent = qm.ttm?.revenueYoY ?? qm.latest?.revenueYoY
        if (recent != null) detail._recentRevYoY = recent
      }
    } catch {}
  }

  const moat       = computeMoat(detail, streak)
  const dcf        = computeValuation(detail, moat?.width ?? 'none', type, currency)
  const projection = computeProjection(divHistory, cagr)
  const dgiScore   = computeDGIScore(detail, streak, cagr, dcf, type, paysDividend, bankMetrics, insurerMetrics, reitMetrics)
  const divSafety  = (detail && paysDividend) ? dividendSafety(detail, detectSectorType(type, detail.sector, detail.industry)) : null
  const insights   = buildInsights(detail, streak, cagr, dcf, price)
  const rdIntensity = isHealthcare(detail) ? computeRDIntensity(detail) : null
  const badges     = computeBadges(detail, streak, cagr, moat, price)
  const buybacks   = computeBuybacks(detail)
  const healthPanel = buildHealthPanel(detail, type, paysDividend)

  // ── Extras de ficha: precio de compra DGI, tendencia de calidad, percentiles de sector ──
  const buyPriceModel = detail ? computeBuyPrice({
    intrinsic: dcf?.available ? dcf.intrinsicValue : null, price, score: dgiScore?.total,
    reliableMos: !!dcf?.available, yieldAvg: detail.yield_avg, dps: detail.dps,
  }) : null
  const qualityTrend = detail ? buildQualityTrend(detail, scoreHistory) : null
  let sectorPositioning = null
  if (detail && isPremium && detail.sector) {
    try {
      const { data: peersRaw } = await supabase.from('company_fundamentals')
        .select('roic_display, operating_margin, payout_fcf, payout_eps, revenue_cagr5, div_cagr5, div_streak, net_debt_ebitda, dps, current_price')
        .eq('sector', detail.sector).range(0, 999)
      const nn = v => (v != null && !isNaN(v)) ? Number(v) : null
      // Payout comparable entre peers: preferimos el de BPA (más consistente y menos
      // artefactos que el de FCF, que puede superar el 100% por caja no recurrente).
      const sanePayout = f => { const e = nn(f.payout_eps), c = nn(f.payout_fcf); return (e != null && e > 0 && e <= 150) ? e : (c != null && c > 0 && c <= 150 ? c : null) }
      const toMetrics = (f, ownPrice) => {
        const p = ownPrice ?? nn(f.current_price), d = nn(f.dps)
        return {
          roic: nn(f.roic_display), yield: (p > 0 && d > 0) ? d / p * 100 : null,
          divCagr: nn(f.div_cagr5), revCagr: nn(f.revenue_cagr5), opMargin: nn(f.operating_margin),
          payout: sanePayout(f), debt: nn(f.net_debt_ebitda), streak: nn(f.div_streak),
        }
      }
      const peers = (peersRaw || []).map(f => toMetrics(f))
      sectorPositioning = buildSectorPositioning(toMetrics(detail, price), peers, sectorInfo(detail.sector)?.es || detail.sector, peers.length)
    } catch {}
  }

  // Datos derivados para las pestañas
  const yldNet     = yld != null ? netYield(yld * 100, getWHT(country), destWHT) : null
  const cagr10     = divCagr(divHistory, 10)
  const fullDiv    = divHistory.filter(h => !h.isPartial && h.dps != null).sort((a, b) => a.year - b.year)
  const dpsPrev    = fullDiv.length ? fullDiv[fullDiv.length - 1].dps : null
  const originWHT  = getWHT(country)
  const upcomingPayments = buildUpcomingPayments(detail?.dividend_events, detail?.next_pay_date, detail?.next_ex_date, dpsPrev, cagr, currency, country, originWHT, destWHT)
  // Solo mostramos la "próxima ex-dividendo" si aún no ha pasado (yfinance la deja obsoleta).
  const _todayMid  = new Date(); _todayMid.setHours(0, 0, 0, 0)
  const nextExDate = (detail?.next_ex_date && new Date(detail.next_ex_date + 'T12:00:00') >= _todayMid) ? detail.next_ex_date : null
  const nextEarningsDate = (detail?.next_earnings_date && new Date(detail.next_earnings_date + 'T12:00:00') >= _todayMid) ? detail.next_earnings_date : null
  const payoutEps  = detail?.payout_eps ?? null
  const priceToBook = detail?.price_to_book ?? null
  // Histórico extendido (backfill financial_history) para ampliar años en los gráficos de
  // Finanzas y el PER/EV histórico. Prioridad yfinance (solo añade años más antiguos). Se
  // lee con service_role (financial_history es service-only) y NO toca el `detail` que usan
  // scoring/valoración (calibrados sobre yfinance).
  let extStmts = { income: detail?.income_statement_annual ?? null, cashflow: detail?.cashflow_annual ?? null, balance: detail?.balance_sheet_annual ?? null, extraYears: 0 }
  if (detail && isPremium) {
    try {
      const svc = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
      const { data: fh } = await svc.from('financial_history').select('*').eq('ticker', t)
      if (fh?.length) extStmts = extendStatements(detail, fh)
    } catch {}
  }
  const detailExt = detail ? { ...detail, income_statement_annual: extStmts.income, cashflow_annual: extStmts.cashflow, balance_sheet_annual: extStmts.balance } : detail
  const peHistory  = detailExt ? await buildPeHistory(detailExt, supabase, t) : []
  const evData     = detailExt ? await buildEvEbitdaHistory(detailExt, supabase, t, price) : { history: [], current: null }

  // ── Valoración por múltiples métodos (triangulación, premium) ──────────────
  let valuationMethods = null
  if (isPremium && detail && price > 0) {
    const dpsAnnual = Number(detail.dps) || null
    const yldPct = (dpsAnnual && price > 0) ? dpsAnnual / price * 100 : null
    const waccPct = dcf?.discount != null ? dcf.discount * 100 : null
    const methods = []
    if (dcf?.available && dcf.intrinsicValue > 0) methods.push({ label: 'DCF sector-aware', value: dcf.intrinsicValue, mos: dcf.mos, note: dcf.methodLabel })
    const add = (label, res, note) => { if (res && res.value > 0) methods.push({ label, value: res.value, mos: res.mos, note }) }
    add('Reversión de yield', yieldReversionValue(dpsAnnual, detail.yield_avg, price), 'Dividendo ÷ yield medio histórico')
    if (dpsAnnual > 0) add('DDM bietápico', twoStageDDM(dpsAnnual, detail.div_cagr5, waccPct, price), 'Dividendos descontados a 2 etapas')
    // Múltiplo relativo al sector: en REITs el PER no es válido (la amortización distorsiona
    // el beneficio) → se usa P/AFFO; en el resto, la mediana de PER.
    if (dcf?.engine === 'affo') {
      const medPAffo = await sectorMedianPAffo(supabase, detail.sector, t)
      if (medPAffo && detail.payout_affo > 0) add('P/AFFO mediana del sector', pAffoRelativeValue(dpsAnnual, detail.payout_affo, medPAffo, price), `Mediana del sector: ${medPAffo.toFixed(1)}× AFFO`)
    } else {
      const medPe = await sectorMedianPe(supabase, detail.sector, t)
      if (medPe) add('PER mediana del sector', peRelativeValue(detail.pe_trailing, medPe, price), `Mediana del sector: ${medPe.toFixed(0)}×`)
    }
    if (dcf?.engine === 'dcf') add('EPV — valor sin crecimiento', epvValue(dcf.params, price), 'Negocio actual a crecimiento cero')
    const implied = dcf?.engine === 'dcf' ? impliedGrowth(dcf.params, price) : null
    valuationMethods = {
      methods, implied,
      histRevG: dcf?.revCagr ?? null, histFcfG: dcf?.fcfCagr ?? null,
    }
  }
  const manualImport = detail ? {
    active: !!(detail.manual_fields && typeof detail.manual_fields === 'object' && Object.values(detail.manual_fields).some(v => v === true)),
    date: detail.last_manual_import ?? null,
  } : null
  const finScalars = detail ? {
    roic_display: resolveRoic(detail),   // cae a reported/tangible si roic_display es null (igual que Salud)
    roe: detail.roe ?? null,
    roa: detail.roa ?? null,
    net_debt_ebitda: detail.net_debt_ebitda ?? detail.debt_ebitda ?? null,
    market_cap_m: detail.market_cap_m ?? null,
  } : null

  // ── Gating de seguridad: el usuario free NO recibe los datos premium en el
  // payload del cliente (antes solo se difuminaban con CSS y se podían leer en
  // el DOM/fuente). Se mantienen únicamente los campos del "teaser" del resumen.
  const STRONG_INS = ['positive', 'negative', 'green', 'red']
  const moatPub   = isPremium ? moat : (moat ? { width: moat.width, label: moat.label, signals: (moat.signals || []).slice(0, 3) } : null)
  const dcfPub    = isPremium ? dcf : { mos: dcf?.mos ?? null }
  const insightsPub = isPremium ? insights : (insights || []).filter(i => STRONG_INS.includes(i.type)).slice(0, 3)
  const dgiScorePub = isPremium ? dgiScore : null
  const divSafetyPub = isPremium ? divSafety : null
  const roicPub   = isPremium ? roicData : null
  const peHistPub = isPremium ? peHistory : []
  const evHistPub = isPremium ? evData.history : []
  const evCurrentPub = isPremium ? evData.current : null
  const scoreHistPub = isPremium ? scoreHistory : []
  const healthPub = isPremium ? healthPanel
    : (healthPanel ? { ...healthPanel, cards: (healthPanel.cards || []).map(() => ({})) } : null)
  const financialsPub = {
    income_statement_annual:    extStmts.income   ?? null,
    balance_sheet_annual:       extStmts.balance  ?? null,
    cashflow_annual:            extStmts.cashflow ?? null,
    income_statement_quarterly: isPremium ? (detail?.income_statement_quarterly ?? null) : null,
    balance_sheet_quarterly:    isPremium ? (detail?.balance_sheet_quarterly    ?? null) : null,
    cashflow_quarterly:         isPremium ? (detail?.cashflow_quarterly         ?? null) : null,
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <PublicNav />
      {isKingFree && (
        <div style={{ background: 'linear-gradient(90deg, rgba(251,191,36,0.14), rgba(99,102,241,0.10))', borderBottom: '1px solid rgba(251,191,36,0.3)', padding: '9px 16px', textAlign: 'center' }}>
          <p style={{ fontSize: 12.5, color: 'var(--text)', fontWeight: 600, lineHeight: 1.5 }}>
            👑 Estás viendo la ficha <b>completa gratis</b> por ser un <b>Rey del dividendo</b>. Así es el análisis Premium de las casi 2.000 empresas.{' '}
            <a href="/fundador" style={{ color: 'var(--accent)', fontWeight: 800, textDecoration: 'none' }}>Hazte fundador →</a>
          </p>
        </div>
      )}
      <CompanyDetailPage
        ticker={t}
        name={name}
        country={country}
        currency={currency}
        sector={sector}
        subsector={subsector}
        classification={classification}
        profile={getProfile(t) || detail?.business_summary || null}
        rdIntensity={rdIntensity}
        isBank={isBank}
        bankMetrics={bankMetrics}
        isInsurer={isInsurer}
        insurerMetrics={insurerMetrics}
        isReit={isReit}
        reitMetrics={reitMetrics}
        oilBreakeven={oilBreakeven}
        type={type}
        isPremium={isPremium}
        isAuthed={!!user}
        watchEntry={watchRow}
        hasData={detail != null}
        price={price}
        change={change}
        changePct={changePct}
        dailyPrice={dailyPrice}
        avgCost={positionRow?.avg_cost ?? null}
        yld={yld}
        yldNet={yldNet}
        destWHT={destWHT}
        divRate={divRate}
        low52={low52}
        high52={high52}
        peTrailing={peTrailing}
        peForward={peForward}
        evEbitda={evEbitda}
        eps={eps}
        payout={payout}
        payoutEps={payoutEps}
        priceToBook={priceToBook}
        mktCap={mktCap}
        divHistory={divHistory}
        cagr={cagr}
        cagr10={cagr10}
        streak={streak}
        updatedAt={updatedAt}
        dpsPrev={dpsPrev}
        upcomingPayments={upcomingPayments}
        nextExDate={nextExDate}
        nextEarningsDate={nextEarningsDate}
        originWHT={originWHT}
        paysDividend={paysDividend}
        noDividendAt={noDividendAt}
        peHistory={peHistPub}
        evHistory={evHistPub}
        evCurrent={evCurrentPub}
        valuationMethods={valuationMethods}
        manualImport={manualImport}
        finScalars={finScalars}
        healthPanel={healthPub}
        initialTab={initialTab}
        roicData={roicPub}
        moat={moatPub}
        dcf={dcfPub}
        projection={projection}
        dgiScore={dgiScorePub}
        dividendSafety={divSafetyPub}
        scoreHistory={scoreHistPub}
        ma200={detail?.ma200 ?? null}
        crossListings={crossListings}
        insights={insightsPub}
        badges={badges}
        buybacks={buybacks}
        revenueHistory={detail?.revenue_history    ?? null}
        netIncomeHistory={detail?.net_income_history ?? null}
        fcfHistory={detail?.fcf_history            ?? null}
        epsHistory={detail?.eps_history            ?? null}
        financials={financialsPub}
        quarterlyRows={isPremium ? quarterlyRows : []}
        buyPriceModel={isPremium ? buyPriceModel : null}
        qualityTrend={isPremium ? qualityTrend : null}
        sectorPositioning={sectorPositioning}
      />
    </div>
  )
}
