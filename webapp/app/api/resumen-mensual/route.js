import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { enrichPositions, calcSummary } from '@/lib/portfolio'
import { buildCalendar } from '@/lib/portfolio-calc'
import { computeDGIScore } from '@/lib/dgi-score'
import { DICT } from '@/data/dict'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const APP_URL = 'https://invest-dgi.vercel.app'
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']

function serviceClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
}

function fmtEUR(v) {
  if (v == null) return '—'
  return v.toLocaleString('es-ES', { maximumFractionDigits: 0 }) + ' €'
}

// ── Build per-user summary ─────────────────────────────────────────────────

async function buildSummary(sb, userId) {
  const { data: positions } = await sb.from('positions').select('*').eq('user_id', userId)
  if (!positions?.length) return null

  const tickers = [...new Set(positions.map(p => p.ticker))]
  const { data: funds } = await sb.from('company_fundamentals')
    .select('ticker,current_price,dps,div_cagr5,div_streak,div_history,sector,industry,country,roic,gross_margin,operating_margin,net_margin,roe,roa,revenue_cagr5,fcf_cagr5,debt_ebitda,net_debt_ebitda,current_ratio,interest_coverage,pe_trailing,pe_forward,ev_ebitda,price_to_book,eps_trailing,fcf_per_share,payout_fcf,payout_eps,market_cap_m,income_statement_annual,balance_sheet_annual,cashflow_annual,net_income_history,fcf_history')
    .in('ticker', tickers)
  const fundMap = Object.fromEntries((funds || []).map(f => [f.ticker, f]))

  const enriched = enrichPositions(positions, fundMap)
  const summary  = calcSummary(enriched)
  const { months } = buildCalendar(enriched)

  const now = new Date()
  const thisMonthEntries = months[now.getMonth()].entries

  // Dividendos cobrados mes anterior
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0)
  const { data: divsReceived } = await sb.from('dividends_received').select('amount,date').eq('user_id', userId)
    .gte('date', prevMonth.toISOString().slice(0, 10)).lte('date', prevMonthEnd.toISOString().slice(0, 10))
  const collectedLastMonth = (divsReceived || []).reduce((s, d) => s + Number(d.amount), 0)

  // Aportaciones periódicas ejecutadas el mes anterior
  const { data: recurTx } = await sb.from('transactions').select('ticker, shares, price, date').eq('user_id', userId).eq('type', 'buy_recurring')
    .gte('date', prevMonth.toISOString().slice(0, 10)).lte('date', prevMonthEnd.toISOString().slice(0, 10))
  let recurFundsMap = {}
  if (recurTx?.length) {
    const rt = [...new Set(recurTx.map(t => t.ticker))]
    const { data: fr } = await sb.from('funds').select('ticker, name, currency').in('ticker', rt)
    recurFundsMap = Object.fromEntries((fr || []).map(f => [f.ticker, f]))
  }
  const recurContributions = (recurTx || []).map(t => {
    const f = recurFundsMap[t.ticker] || {}
    const fx = { EUR: 1, USD: 0.92, GBP: 1.17, JPY: 0.006 }[f.currency] || 1
    return { name: f.name || t.ticker, eur: Number(t.shares) * Number(t.price) * fx, shares: Number(t.shares) }
  })
  const recurTotal = recurContributions.reduce((s, c) => s + c.eur, 0)

  // Subidas/recortes recientes de dividendo
  const raised = [], cut = []
  enriched.forEach(p => {
    const f = fundMap[p.ticker]
    const dh = Array.isArray(f?.div_history) ? f.div_history : []
    const full = dh.filter(h => !h.isPartial && h.growth != null)
    const last = full[full.length - 1]
    if (last?.growth > 0.001) raised.push(p.name)
    else if (last?.growth < -0.001) cut.push(p.name)
  })

  // Score DGI cartera (equiponderado)
  let portfolioScore = null
  const scores = enriched.map(p => {
    const f = fundMap[p.ticker]
    if (!f) return null
    const entry = DICT.find(d => d[1] === p.ticker)
    const type  = entry?.[6] ?? 'general'
    const dh    = Array.isArray(f.div_history) ? f.div_history : []
    const s = computeDGIScore({ ...f, divHistory: dh }, f.div_streak ?? 0, f.div_cagr5 != null ? f.div_cagr5 / 100 : null, null, type)
    return s?.hasData ? s.total : null
  }).filter(v => v != null)
  if (scores.length) portfolioScore = scores.reduce((a, b) => a + b, 0) / scores.length

  // Crecimiento renta 12m estimado (media div_cagr5)
  const cagrs = enriched.map(p => fundMap[p.ticker]?.div_cagr5).filter(v => v != null)
  const incomeGrowth = cagrs.length ? cagrs.reduce((a, b) => a + b, 0) / cagrs.length : null

  return {
    totalValue: summary.totalValueEUR,
    annualIncome: summary.totalIncomeEUR,
    thisMonthEntries,
    collectedLastMonth,
    recurContributions, recurTotal,
    raised, cut,
    portfolioScore, incomeGrowth,
  }
}

// ── Email HTML ─────────────────────────────────────────────────────────────

function buildEmailHTML(email, data) {
  const now = new Date()
  const monthName = MESES[now.getMonth()]
  const name = email.split('@')[0]

  const divList = data.thisMonthEntries.length
    ? data.thisMonthEntries.map(e => `<tr><td style="padding:4px 0;color:#8090a8;font-size:14px">${e.name}</td><td style="padding:4px 0;color:#34d399;font-size:14px;text-align:right">${fmtEUR(e.amount)}</td></tr>`).join('')
    : `<tr><td style="color:#4a5270;font-size:13px">Sin dividendos estimados este mes</td></tr>`

  const raisedHTML = data.raised.length
    ? `<p style="color:#34d399;font-size:14px;margin:4px 0">↑ Subieron dividendo: ${data.raised.join(', ')}</p>` : ''
  const cutHTML = data.cut.length
    ? `<p style="color:#f87171;font-size:14px;margin:4px 0">↓ Recortaron dividendo: ${data.cut.join(', ')}</p>` : ''

  const collectedHTML = data.collectedLastMonth > 0
    ? `<p style="color:#c8d0e0;font-size:14px;margin:8px 0">Cobraste <strong style="color:#34d399">${fmtEUR(data.collectedLastMonth)}</strong> en dividendos el mes pasado.</p>` : ''

  const recurHTML = data.recurContributions?.length
    ? `<p style="color:#c8d0e0;font-size:14px;font-weight:bold;margin:16px 0 6px">Aportaciones periódicas del mes</p>
       <table width="100%">${data.recurContributions.map(c => `<tr><td style="padding:3px 0;color:#8090a8;font-size:13px">${c.name}</td><td style="padding:3px 0;color:#a78bfa;font-size:13px;text-align:right">${fmtEUR(c.eur)}</td></tr>`).join('')}</table>
       <p style="color:#a78bfa;font-size:13px;margin:4px 0">Total invertido vía aportaciones: <strong>${fmtEUR(data.recurTotal)}</strong></p>` : ''

  const scoreHTML = data.portfolioScore != null
    ? `<p style="color:#c8d0e0;font-size:14px;margin:8px 0">Score DGI de tu cartera: <strong style="color:#818cf8">${data.portfolioScore.toFixed(1)}/10</strong></p>` : ''

  const motivHTML = data.incomeGrowth != null
    ? `<p style="color:#34d399;font-size:15px;font-weight:bold;margin:16px 0 0">Tu renta anual ha crecido un ${data.incomeGrowth.toFixed(1)}% en los últimos 12 meses 🚀</p>` : ''

  return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#080b14;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#080b14;padding:24px 0">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#0d1424;border-radius:14px;padding:28px">
  <tr><td>
    <p style="color:#818cf8;font-size:18px;font-weight:bold;margin:0 0 4px">Mi Índice DGI</p>
    <p style="color:#4a5270;font-size:13px;margin:0 0 20px">Tu resumen de ${monthName}</p>

    <p style="color:#e0e8f0;font-size:16px;margin:0 0 16px">Hola ${name},</p>

    <table width="100%" style="background:rgba(255,255,255,0.03);border-radius:10px;padding:16px;margin-bottom:16px">
      <tr>
        <td style="color:#4a5270;font-size:12px">Valor de la cartera</td>
        <td style="color:#4a5270;font-size:12px;text-align:right">Renta anual estimada</td>
      </tr>
      <tr>
        <td style="color:#e0e8f0;font-size:22px;font-weight:bold">${fmtEUR(data.totalValue)}</td>
        <td style="color:#34d399;font-size:22px;font-weight:bold;text-align:right">${fmtEUR(data.annualIncome)}</td>
      </tr>
    </table>

    <p style="color:#c8d0e0;font-size:14px;font-weight:bold;margin:16px 0 8px">Dividendos estimados este mes</p>
    <table width="100%">${divList}</table>

    ${collectedHTML}
    ${recurHTML}
    ${raisedHTML}
    ${cutHTML}
    ${scoreHTML}
    ${motivHTML}

    <table width="100%" style="margin:24px 0 8px"><tr><td align="center">
      <a href="${APP_URL}/cartera" style="display:inline-block;background:#6366f1;color:#fff;font-size:14px;font-weight:bold;text-decoration:none;padding:12px 28px;border-radius:8px">Ver mi cartera completa</a>
    </td></tr></table>

    <p style="color:#2e3a55;font-size:11px;text-align:center;margin-top:20px">
      Recibes este email porque activaste el resumen mensual.
      <a href="${APP_URL}/ajustes" style="color:#4a5270">Desactivar resumen mensual</a>
    </p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`
}

// ── Send via Resend ────────────────────────────────────────────────────────

async function sendEmail(to, subject, html) {
  const apiKey = process.env.RESEND_API_KEY
  const from   = process.env.RESEND_FROM || 'Mi Índice DGI <noreply@miindicedgi.com>'
  if (!apiKey) return { skipped: true, reason: 'RESEND_API_KEY no configurada' }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, subject, html }),
  })
  if (!res.ok) return { error: await res.text() }
  return { sent: true }
}

// ── Handler ────────────────────────────────────────────────────────────────

export async function GET(request) {
  // Seguridad: si CRON_SECRET está configurado, exigirlo
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const auth = request.headers.get('authorization')
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
  }

  const sb = serviceClient()
  const { data: settings } = await sb.from('user_settings').select('user_id').eq('monthly_summary', true)
  if (!settings?.length) return NextResponse.json({ processed: 0, message: 'Sin usuarios suscritos' })

  const now = new Date()
  const subject = `Tu resumen DGI de ${MESES[now.getMonth()]} — Mi Índice DGI`

  let sent = 0, skipped = 0, errors = 0
  const results = []

  for (const s of settings) {
    try {
      const { data: userResp } = await sb.auth.admin.getUserById(s.user_id)
      const email = userResp?.user?.email
      if (!email) { skipped++; continue }

      const data = await buildSummary(sb, s.user_id)
      if (!data) { skipped++; continue }

      const html = buildEmailHTML(email, data)
      const r = await sendEmail(email, subject, html)
      if (r.sent)        { sent++ }
      else if (r.skipped){ skipped++; results.push({ email, ...r }) }
      else               { errors++; results.push({ email, ...r }) }
    } catch (e) {
      errors++
      results.push({ user: s.user_id, error: String(e) })
    }
  }

  return NextResponse.json({ processed: settings.length, sent, skipped, errors, results })
}
