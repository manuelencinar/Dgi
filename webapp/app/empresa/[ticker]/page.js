import { notFound } from 'next/navigation'
import { createClient as authClient } from '@/lib/supabase/server'
import PublicNav from '@/components/PublicNav'
import CompanyDetailPage from '@/components/CompanyDetailPage'
import { DICT } from '@/data/dict'
import { findDictEntry } from '@/lib/dict'
import { getCompanyQuote } from '@/lib/company-quote'
import { calculateROIC } from '@/lib/metrics'
import { buildHealthPanel } from '@/lib/health'
import { netYield, getWHT } from '@/lib/screener'
import {
  getCompanyDetail,
  computeMoat,
  computeValuation,
  computeProjection,
  computeDGIScore,
  buildInsights,
  computeBadges,
  computeBuybacks,
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
function estimateUpcomingPayments(dpsPrev, cagr, currency) {
  if (dpsPrev == null || dpsPrev <= 0) return []
  const annual = dpsPrev * (1 + (cagr ?? 0))
  const freq = (currency === 'USD' || currency === 'CAD') ? 4 : (currency === 'GBP' || currency === 'CHF') ? 2 : 1
  const per = annual / freq
  const monthsStep = 12 / freq
  const ML = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
  const now = new Date()
  const out = []
  for (let i = 0; i < Math.min(freq, 4); i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + Math.round(monthsStep * (i + 1)), 1)
    out.push({ dateLabel: `${ML[d.getMonth()]} ${d.getFullYear()}`, amount: per, type: 'Ordinario' })
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
    title: `${name} — Análisis DGI | Mi Índice DGI`,
    description: `Análisis completo de dividendos, Score DGI, foso económico y valoración de ${name}.`,
  }
}

export default async function EmpresaPage({ params, searchParams }) {
  const { ticker } = await params
  const sp = searchParams ? await searchParams : {}
  const initialTab = typeof sp?.tab === 'string' ? sp.tab : 'resumen'
  const t = decodeURIComponent(ticker)

  const entry = await findDictEntry(t)
  if (!entry) notFound()

  const [name, , country, currency, sector, subsector, type] = entry

  // Obtener plan, datos, cotización en vivo y precio diario en paralelo
  const supabase = await authClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [plan, detail, liveQuote, dailyRow, positionRow, watchRow, settingsRow] = await Promise.all([
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
    user ? supabase.from('user_settings').select('dest_wht')
      .eq('user_id', user.id).maybeSingle()
      .then(r => r.data).catch(() => null) : null,
  ])

  const isPremium = plan === 'premium'
  const destWHT   = settingsRow?.dest_wht != null ? Number(settingsRow.dest_wht) : 19

  const dailyPrice = dailyRow ? {
    price:     Number(dailyRow.close_price),
    date:      dailyRow.date,
    isToday:   dailyRow.date === new Date().toISOString().slice(0, 10),
    updatedAt: dailyRow.updated_at,
  } : null

  const price      = liveQuote?.price       ?? dailyPrice?.price ?? detail?.current_price  ?? null
  const change     = liveQuote?.change      ?? null
  const changePct  = liveQuote?.pct         ?? null
  const yld        = price > 0 && detail?.dps != null ? detail.dps / price : null
  const divRate    = detail?.dps            ?? null
  const low52      = detail?.week52_low     ?? null
  const high52     = detail?.week52_high    ?? null
  const peTrailing = detail?.pe_trailing    ?? null
  const peForward  = detail?.pe_forward     ?? null
  const evEbitda   = detail?.ev_ebitda      ?? null
  const eps        = detail?.eps_trailing   ?? null
  const payout     = detail?.payout_fcf != null ? detail.payout_fcf / 100
                   : detail?.payout_eps != null ? detail.payout_eps / 100 : null
  const mktCap     = detail?.market_cap_m   != null ? detail.market_cap_m * 1e6 : null
  const divHistory = detail?.divHistory     ?? []
  const streak     = detail?.div_streak     ?? 0
  const cagr       = detail?.div_cagr5      != null ? detail.div_cagr5 / 100 : null
  const updatedAt  = detail?.updated_at     ?? null

  // Precio / valor contable: usa el campo si existe, si no lo deriva del balance.
  if (detail && detail.price_to_book == null && mktCap != null) {
    const equity = balanceFirst(detail.balance_sheet_annual, 'Patrimonio Neto', 'Total Stockholder Equity', 'Stockholders Equity', 'Common Stock Equity')
    if (equity != null && equity > 0) detail.price_to_book = mktCap / equity
  }

  const roicData   = detail ? calculateROIC({ ...detail, type }, currency) : null
  const moat       = computeMoat(detail, streak)
  const dcf        = computeValuation(detail, moat?.width ?? 'none', type, currency)
  const projection = computeProjection(divHistory, cagr)
  const dgiScore   = computeDGIScore(detail, streak, cagr, dcf, type)
  const insights   = buildInsights(detail, streak, cagr, dcf)
  const badges     = computeBadges(detail, streak, cagr, moat)
  const buybacks   = computeBuybacks(detail)
  const healthPanel = buildHealthPanel(detail, type)

  // Datos derivados para las pestañas
  const yldNet     = yld != null ? netYield(yld * 100, getWHT(country), destWHT) : null
  const cagr10     = divCagr(divHistory, 10)
  const fullDiv    = divHistory.filter(h => !h.isPartial && h.dps != null).sort((a, b) => a.year - b.year)
  const dpsPrev    = fullDiv.length ? fullDiv[fullDiv.length - 1].dps : null
  const upcomingPayments = estimateUpcomingPayments(dpsPrev, cagr, currency)
  const payoutEps  = detail?.payout_eps ?? null
  const priceToBook = detail?.price_to_book ?? null
  const peHistory  = detail ? await buildPeHistory(detail, supabase, t) : []
  const manualImport = detail ? {
    active: !!(detail.manual_fields && typeof detail.manual_fields === 'object' && Object.values(detail.manual_fields).some(v => v === true)),
    date: detail.last_manual_import ?? null,
  } : null

  return (
    <div style={{ minHeight: '100vh', background: '#080b14' }}>
      <PublicNav />
      <CompanyDetailPage
        ticker={t}
        name={name}
        country={country}
        currency={currency}
        sector={sector}
        subsector={subsector}
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
        peHistory={peHistory}
        manualImport={manualImport}
        healthPanel={healthPanel}
        initialTab={initialTab}
        roicData={roicData}
        moat={moat}
        dcf={dcf}
        projection={projection}
        dgiScore={dgiScore}
        insights={insights}
        badges={badges}
        buybacks={buybacks}
        revenueHistory={detail?.revenue_history    ?? null}
        netIncomeHistory={detail?.net_income_history ?? null}
        fcfHistory={detail?.fcf_history            ?? null}
        epsHistory={detail?.eps_history            ?? null}
        financials={{
          income_statement_annual:    detail?.income_statement_annual    ?? null,
          balance_sheet_annual:       detail?.balance_sheet_annual       ?? null,
          cashflow_annual:            detail?.cashflow_annual            ?? null,
          income_statement_quarterly: detail?.income_statement_quarterly ?? null,
          balance_sheet_quarterly:    detail?.balance_sheet_quarterly    ?? null,
          cashflow_quarterly:         detail?.cashflow_quarterly         ?? null,
        }}
      />
    </div>
  )
}
