import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { enrichPositions, calcSummary, calcDividendRisks, calcFiscal } from '@/lib/portfolio'
import { resolveDestWHT } from '@/lib/fiscal-es'
import { computeDGIScore } from '@/lib/dgi-score'
import { getYahooCrumb, fetchYahooEarningsDate } from '@/lib/yahoo-estimates'
import { DICT } from '@/data/dict'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const APP_URL = 'https://www.everdiv.com'
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']

function serviceClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
}

function fmtEUR(v) {
  if (v == null) return '—'
  return v.toLocaleString('es-ES', { maximumFractionDigits: 0 }) + ' €'
}

// 'YYYY-MM-DD' → 'DD/MM' con día de la semana (p.ej. "mar 12/08")
function fmtDate(iso) {
  const d = new Date(iso + 'T00:00:00')
  if (isNaN(d)) return iso
  const dow = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'][d.getDay()]
  return `${dow} ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}

// ── Build per-user summary ─────────────────────────────────────────────────

async function buildSummary(sb, userId) {
  const { data: positions } = await sb.from('positions').select('*').eq('user_id', userId)
  if (!positions?.length) return null

  const tickers = [...new Set(positions.map(p => p.ticker))]
  const { data: funds } = await sb.from('company_fundamentals')
    .select('ticker,current_price,dps,div_cagr5,div_streak,div_history,sector,industry,country,roic,gross_margin,operating_margin,net_margin,roe,roa,revenue_cagr5,fcf_cagr5,debt_ebitda,net_debt_ebitda,current_ratio,interest_coverage,pe_trailing,pe_forward,ev_ebitda,price_to_book,eps_trailing,fcf_per_share,payout_fcf,payout_eps,payout_affo,payout_nii,market_cap_m,income_statement_annual,balance_sheet_annual,cashflow_annual,net_income_history,fcf_history')
    .in('ticker', tickers)
  const fundMap = Object.fromEntries((funds || []).map(f => [f.ticker, f]))

  const enriched = enrichPositions(positions, fundMap)
  const summary  = calcSummary(enriched)
  const nameOf = Object.fromEntries(enriched.map(p => [p.ticker, p.name]))

  const { data: uset } = await sb.from('user_settings').select('*').eq('user_id', userId).maybeSingle()
  const whtOverrides = (uset?.wht_overrides && typeof uset.wht_overrides === 'object') ? uset.wht_overrides : null
  const destWHT = resolveDestWHT(uset, summary.totalIncomeEUR)

  const now = new Date()
  const year = now.getFullYear()
  const netOf = r => { const v = r.amount_net != null ? Number(r.amount_net) : Number(r.amount); return Number.isFinite(v) ? v : 0 }

  // Todos los dividendos registrados del usuario (tabla ya prellenada al usar la app).
  const { data: allDivs } = await sb.from('dividends_received')
    .select('ticker, amount, amount_net, date, payment_date_estimated, status').eq('user_id', userId)

  // Renta neta del AÑO NATURAL en curso: MISMA cifra que "Total año natural {year}" de
  // la pestaña Dividendos y el gráfico por año (cobrado + pendiente del año, neto).
  // Gatea por fecha de compra vía el prefill (no incluye pagos previos a la compra).
  const yearNet = (allDivs || [])
    .filter(r => new Date(r.payment_date_estimated || r.date).getFullYear() === year)
    .reduce((s, r) => s + netOf(r), 0)

  // Dividendos COBRADOS este mes (status recibido, fecha de cobro en el mes en curso).
  const monthStart = new Date(year, now.getMonth(), 1), monthEnd = new Date(year, now.getMonth() + 1, 0)
  const collectedMap = {}
  for (const d of (allDivs || [])) {
    if (d.status !== 'received') continue
    const dt = new Date(d.date)
    if (dt < monthStart || dt > monthEnd) continue
    collectedMap[d.ticker] = (collectedMap[d.ticker] || 0) + netOf(d)
  }
  const collectedThisMonth = Object.entries(collectedMap)
    .map(([ticker, amount]) => ({ name: nameOf[ticker] || ticker, amount }))
    .sort((a, b) => b.amount - a.amount)
  const collectedThisMonthTotal = collectedThisMonth.reduce((s, e) => s + e.amount, 0)

  // Debug: comparativa de la renta del año (natural) vs el ritmo anual (calcFiscal).
  const fiscalRows = calcFiscal(enriched, whtOverrides, destWHT)
  const netRunRate = fiscalRows.reduce((s, r) => s + (r.net || 0), 0)
  const _debug = {
    year, yearNet: Math.round(yearNet), netRunRate: Math.round(netRunRate),
    grossRunRate: Math.round(summary.totalIncomeEUR), destWHT, taxMode: uset?.tax_mode ?? null,
    divRowsThisYear: (allDivs || []).filter(r => new Date(r.payment_date_estimated || r.date).getFullYear() === year).length,
  }

  // Aportaciones periódicas ejecutadas el mes anterior
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0)
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

  // Empresas con el dividendo en peligro: recorte reciente + señales de riesgo
  // (payout/deuda/cobertura/FCF, sector-aware). Se unifican en una sola lista.
  const riskRows = calcDividendRisks(enriched, summary.totalIncomeEUR)
  const atRisk = []
  const seen = new Set()
  for (const name of cut) {   // recortes recientes primero
    atRisk.push({ name, reason: 'Ha recortado el dividendo', level: 'alto' })
    seen.add(name)
  }
  for (const r of riskRows) {
    if (seen.has(r.name)) continue
    atRisk.push({ name: r.name, reason: r.risks[0].label, level: r.worst })
    seen.add(r.name)
  }

  // Empresas que presentan resultados el MES SIGUIENTE (fecha exacta, en vivo desde el
  // calendario de resultados). Best-effort: si falla la consulta, la empresa se omite.
  const nextStart = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  const nextEnd   = new Date(now.getFullYear(), now.getMonth() + 2, 0)
  let earnings = []
  try {
    const creds = await getYahooCrumb()
    const results = await Promise.allSettled(
      enriched.map(p => fetchYahooEarningsDate(p.ticker, creds).then(d => ({ name: p.name, date: d })))
    )
    earnings = results
      .filter(r => r.status === 'fulfilled' && r.value.date)
      .map(r => r.value)
      .filter(e => { const d = new Date(e.date); return d >= nextStart && d <= nextEnd })
      .sort((a, b) => a.date.localeCompare(b.date))
  } catch { earnings = [] }

  return {
    totalValue: summary.totalValueEUR,
    annualIncome: yearNet, year,
    collectedThisMonth, collectedThisMonthTotal,
    recurContributions, recurTotal,
    raised, atRisk, earnings, nextMonthName: MESES[nextStart.getMonth()],
    portfolioScore, incomeGrowth, _debug,
  }
}

// ── Email HTML ─────────────────────────────────────────────────────────────

function buildEmailHTML(email, data) {
  const now = new Date()
  const monthName = MESES[now.getMonth()]
  const name = email.split('@')[0]

  const divList = data.collectedThisMonth.length
    ? data.collectedThisMonth.map(e => `<tr><td style="padding:4px 0;color:#8090a8;font-size:14px">${e.name}</td><td style="padding:4px 0;color:#34d399;font-size:14px;text-align:right">${fmtEUR(e.amount)}</td></tr>`).join('')
      + `<tr><td style="padding:8px 0 0;color:#c8d0e0;font-size:14px;font-weight:bold;border-top:1px solid rgba(255,255,255,0.06)">Total cobrado</td><td style="padding:8px 0 0;color:#34d399;font-size:14px;font-weight:bold;text-align:right;border-top:1px solid rgba(255,255,255,0.06)">${fmtEUR(data.collectedThisMonthTotal)}</td></tr>`
    : `<tr><td style="color:#4a5270;font-size:13px">Aún no has cobrado dividendos este mes</td></tr>`

  const raisedHTML = data.raised.length
    ? `<p style="color:#34d399;font-size:14px;margin:4px 0">↑ Subieron dividendo: ${data.raised.join(', ')}</p>` : ''

  // Dividendo en peligro: recortes + señales de riesgo (una fila por empresa, con el motivo)
  const riskHTML = data.atRisk?.length
    ? `<p style="color:#c8d0e0;font-size:14px;font-weight:bold;margin:18px 0 6px">⚠️ Dividendo en peligro</p>
       <table width="100%">${data.atRisk.map(r => `<tr><td style="padding:3px 0;color:${r.level === 'alto' ? '#f87171' : '#fbbf24'};font-size:13px">${r.name}</td><td style="padding:3px 0;color:#8090a8;font-size:13px;text-align:right">${r.reason}</td></tr>`).join('')}</table>` : ''

  // Resultados que se publican el mes siguiente (fecha exacta)
  const earningsHTML = data.earnings?.length
    ? `<p style="color:#c8d0e0;font-size:14px;font-weight:bold;margin:18px 0 6px">📅 Presentan resultados en ${data.nextMonthName}</p>
       <table width="100%">${data.earnings.map(e => `<tr><td style="padding:3px 0;color:#8090a8;font-size:13px">${e.name}</td><td style="padding:3px 0;color:#818cf8;font-size:13px;text-align:right">${fmtDate(e.date)}</td></tr>`).join('')}</table>` : ''

  const recurHTML = data.recurContributions?.length
    ? `<p style="color:#c8d0e0;font-size:14px;font-weight:bold;margin:16px 0 6px">Aportaciones periódicas del mes</p>
       <table width="100%">${data.recurContributions.map(c => `<tr><td style="padding:3px 0;color:#8090a8;font-size:13px">${c.name}</td><td style="padding:3px 0;color:#a78bfa;font-size:13px;text-align:right">${fmtEUR(c.eur)}</td></tr>`).join('')}</table>
       <p style="color:#a78bfa;font-size:13px;margin:4px 0">Total invertido vía aportaciones: <strong>${fmtEUR(data.recurTotal)}</strong></p>` : ''

  const scoreHTML = data.portfolioScore != null
    ? `<p style="color:#c8d0e0;font-size:14px;margin:8px 0">Score DGI de tu cartera: <strong style="color:#818cf8">${data.portfolioScore.toFixed(1)}/10</strong></p>` : ''

  const motivHTML = data.incomeGrowth != null
    ? `<p style="color:#34d399;font-size:15px;font-weight:bold;margin:16px 0 0">Tu renta anual ha crecido un ${data.incomeGrowth.toFixed(1)}% en los últimos 12 meses 🚀</p>` : ''

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#080b14;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#080b14;padding:24px 0">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#0d1424;border-radius:14px;padding:28px">
  <tr><td>
    <p style="color:#818cf8;font-size:18px;font-weight:bold;margin:0 0 4px">EverDiv</p>
    <p style="color:#4a5270;font-size:13px;margin:0 0 20px">Tu resumen de ${monthName}</p>

    <p style="color:#e0e8f0;font-size:16px;margin:0 0 16px">Hola ${name},</p>

    <table width="100%" style="background:rgba(255,255,255,0.03);border-radius:10px;padding:16px;margin-bottom:16px">
      <tr>
        <td style="color:#4a5270;font-size:12px">Valor de la cartera</td>
        <td style="color:#4a5270;font-size:12px;text-align:right">Renta neta ${data.year}</td>
      </tr>
      <tr>
        <td style="color:#e0e8f0;font-size:22px;font-weight:bold">${fmtEUR(data.totalValue)}</td>
        <td style="color:#34d399;font-size:22px;font-weight:bold;text-align:right">${fmtEUR(data.annualIncome)}</td>
      </tr>
    </table>

    <p style="color:#c8d0e0;font-size:14px;font-weight:bold;margin:16px 0 8px">Dividendos cobrados este mes</p>
    <table width="100%">${divList}</table>

    ${riskHTML}
    ${earningsHTML}
    ${recurHTML}
    ${raisedHTML}
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
  const from   = process.env.RESEND_FROM || 'EverDiv <noreply@everdiv.com>'
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

  // Modo prueba: ?email=<addr> → genera y envía SOLO a ese usuario (para previsualizar
  // el resumen con datos reales). Requiere el CRON_SECRET (ya exigido arriba).
  const testEmail = new URL(request.url).searchParams.get('email')
  if (testEmail) {
    let user = null
    for (let page = 1; page <= 10 && !user; page++) {
      const { data: list } = await sb.auth.admin.listUsers({ page, perPage: 200 })
      user = (list?.users || []).find(u => u.email?.toLowerCase() === testEmail.toLowerCase())
      if (!list?.users?.length) break
    }
    if (!user) return NextResponse.json({ error: 'usuario no encontrado', email: testEmail }, { status: 404 })
    const data = await buildSummary(sb, user.id)
    if (!data) return NextResponse.json({ error: 'el usuario no tiene posiciones', email: testEmail }, { status: 200 })
    // Depuración: ?debug=1 devuelve el desglose fiscal sin enviar correo.
    if (new URL(request.url).searchParams.get('debug')) {
      return NextResponse.json({ debug: true, to: testEmail, ...data._debug })
    }
    const now2 = new Date()
    const html = buildEmailHTML(testEmail, data)
    const r = await sendEmail(testEmail, `Tu resumen DGI de ${MESES[now2.getMonth()]} — EverDiv (prueba)`, html)
    return NextResponse.json({ test: true, to: testEmail, ...r })
  }

  const { data: settings } = await sb.from('user_settings').select('user_id').eq('monthly_summary', true)
  if (!settings?.length) return NextResponse.json({ processed: 0, message: 'Sin usuarios suscritos' })

  const now = new Date()
  const subject = `Tu resumen DGI de ${MESES[now.getMonth()]} — EverDiv`

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
