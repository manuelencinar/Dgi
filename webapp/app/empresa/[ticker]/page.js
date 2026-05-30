import { notFound } from 'next/navigation'
import { createClient as authClient } from '@/lib/supabase/server'
import PublicNav from '@/components/PublicNav'
import CompanyDetailPage from '@/components/CompanyDetailPage'
import { DICT } from '@/data/dict'
import {
  getCompanyDetail,
  computeHealthScore,
  computeMoat,
  computeDCF,
  computeProjection,
  computeDGIScore,
  buildInsights,
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

  const [plan, detail] = await Promise.all([getUserPlan(), getCompanyDetail(t)])

  const isPremium = plan === 'premium'

  // ── Campos de display ──────────────────────────────────────────────────
  const price   = detail?.current_price  ?? null
  const yld     = price > 0 && detail?.dps != null ? detail.dps / price : null
  const divRate = detail?.dps            ?? null
  const low52   = detail?.week52_low     ?? null
  const high52  = detail?.week52_high    ?? null
  const pe      = detail?.pe_trailing    ?? detail?.pe_forward ?? null
  const eps     = detail?.eps_trailing   ?? null
  const payout  = detail?.payout_fcf != null ? detail.payout_fcf / 100
                : detail?.payout_eps != null ? detail.payout_eps / 100 : null
  const mktCap  = detail?.market_cap_m   != null ? detail.market_cap_m * 1e6 : null
  const divHistory = detail?.divHistory  ?? []
  const streak  = detail?.div_streak     ?? 0
  const cagr    = detail?.div_cagr5      != null ? detail.div_cagr5 / 100 : null
  const updatedAt = detail?.updated_at   ?? null

  // ── Métricas calculadas ─────────────────────────────────────────────────
  const health     = computeHealthScore(detail, type)
  const moat       = computeMoat(detail, streak)
  const dcf        = computeDCF(detail, moat?.width ?? 'none')
  const projection = computeProjection(divHistory, cagr)
  const dgiScore   = computeDGIScore(detail, streak, cagr)
  const insights   = buildInsights(detail, streak, cagr, dcf)

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
        yld={yld}
        divRate={divRate}
        low52={low52}
        high52={high52}
        pe={pe}
        eps={eps}
        payout={payout}
        mktCap={mktCap}
        divHistory={divHistory}
        cagr={cagr}
        streak={streak}
        updatedAt={updatedAt}
        health={health}
        moat={moat}
        dcf={dcf}
        projection={projection}
        dgiScore={dgiScore}
        insights={insights}
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
