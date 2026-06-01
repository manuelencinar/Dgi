import { notFound } from 'next/navigation'
import { createClient as authClient } from '@/lib/supabase/server'
import PublicNav from '@/components/PublicNav'
import CompanyDetailPage from '@/components/CompanyDetailPage'
import { DICT } from '@/data/dict'
import { getCompanyQuote } from '@/lib/company-quote'
import { calculateROIC } from '@/lib/metrics'
import {
  getCompanyDetail,
  computeHealthScore,
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

export default async function EmpresaPage({ params }) {
  const { ticker } = await params
  const t = decodeURIComponent(ticker)

  const entry = DICT.find(d => d[1] === t)
  if (!entry) notFound()

  const [name, , country, currency, sector, subsector, type] = entry

  // Obtener plan, datos, cotización en vivo y precio diario en paralelo
  const supabase = await authClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [plan, detail, liveQuote, dailyRow, positionRow] = await Promise.all([
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
  ])

  const isPremium = plan === 'premium'

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

  const roicData   = detail ? calculateROIC({ ...detail, type }, currency) : null
  const health     = computeHealthScore(detail, type)
  const moat       = computeMoat(detail, streak)
  const dcf        = computeValuation(detail, moat?.width ?? 'none', type, currency)
  const projection = computeProjection(divHistory, cagr)
  const dgiScore   = computeDGIScore(detail, streak, cagr, dcf, type)
  const insights   = buildInsights(detail, streak, cagr, dcf)
  const badges     = computeBadges(detail, streak, cagr, moat)
  const buybacks   = computeBuybacks(detail)

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
        hasData={detail != null}
        price={price}
        change={change}
        changePct={changePct}
        dailyPrice={dailyPrice}
        avgCost={positionRow?.avg_cost ?? null}
        yld={yld}
        divRate={divRate}
        low52={low52}
        high52={high52}
        peTrailing={peTrailing}
        peForward={peForward}
        evEbitda={evEbitda}
        eps={eps}
        payout={payout}
        mktCap={mktCap}
        divHistory={divHistory}
        cagr={cagr}
        streak={streak}
        updatedAt={updatedAt}
        health={health}
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
