import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { DICT } from '@/data/dict'
import { cS } from '@/lib/helpers'

const ADMIN_EMAIL = 'vayaebookk@gmail.com'

export async function POST(request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.email !== ADMIN_EMAIL) {
    return Response.json({ error: 'No autorizado' }, { status: 403 })
  }

  const body = await request.json()
  const githubUrl = body?.githubUrl
  if (!githubUrl) {
    return Response.json({ error: 'githubUrl requerida' }, { status: 400 })
  }

  try {
    const r = await fetch(githubUrl + '?t=' + Date.now(), { signal: AbortSignal.timeout(25000) })
    if (!r.ok) throw new Error('HTTP ' + r.status)
    const raw = await r.text()
    const clean = raw.replace(/:\s*NaN/g, ':null').replace(/:\s*Infinity/g, ':null')
    const data = JSON.parse(clean)
    const fundList = Array.isArray(data) ? data : data.fundamentals || data.companies || []
    if (!fundList.length) throw new Error('JSON vacío o sin empresas')

    // Build ticker lookup (handle suffixes like AENA.MC → AENA)
    const fundMap = {}
    fundList.forEach(f => {
      const t = (f.ticker || '').toUpperCase()
      if (!t) return
      fundMap[t] = f
      const base = t.split('.')[0]
      if (base !== t) fundMap[base] = fundMap[base] || f
    })

    const rowsMap = new Map()
    for (const d of DICT) {
      const [name, ticker, , , , , sector] = d
      const t    = (ticker || '').toUpperCase()
      const base = t.split('.')[0]
      const fd   = fundMap[t] || fundMap[base] || null

      const values = {}
      if (fd) {
        // Dividend growth history
        if (fd.div_streak    != null) values.div_years  = parseInt(fd.div_streak)
        if (fd.div_cagr5     != null) values.div_cagr5  = fd.div_cagr5

        // Yield — compute from dps + price
        const price = parseFloat(fd.current_price) || 0
        const dps   = parseFloat(fd.dps) || 0
        if (dps > 0 && price > 0)    values.yield_pct  = parseFloat((dps / price * 100).toFixed(2))

        // Payout & FCF
        if (fd.payout_fcf    != null) values.payout_fcf  = fd.payout_fcf
        if (fd.fcf_cagr5     != null) values.fcf_cagr5   = fd.fcf_cagr5

        // P/FCF — compute from price + fcf_per_share
        const fcfPs = parseFloat(fd.fcf_per_share) || 0
        if (price > 0 && fcfPs > 0)  values.p_fcf = parseFloat((price / fcfPs).toFixed(2))

        // Balance
        const debtEbitda = fd.net_debt_ebitda ?? fd.debt_ebitda
        if (debtEbitda   != null) values.debt_ebitda  = debtEbitda
        if (fd.interest_coverage != null) values.interest_cov = fd.interest_coverage
        if (fd.roic      != null) values.roic          = fd.roic

        // Extra for display & badges
        if (fd.market_cap_m   != null) values.market_cap_m   = fd.market_cap_m
        if (price > 0)                 values.current_price   = price
      }

      const { scores, total } = cS(values, sector)
      const hasScores = Object.keys(scores).length > 0

      rowsMap.set(t, {
        ticker: t,
        name,
        score:  hasScores ? parseFloat(total.toFixed(2)) : null,
        scores: hasScores ? scores : null,
        values: Object.keys(values).length > 0 ? values : null,
        updated_at: new Date().toISOString(),
      })
    }
    const rows = Array.from(rowsMap.values())

    const serviceSupabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    const CHUNK = 100
    for (let i = 0; i < rows.length; i += CHUNK) {
      const { error } = await serviceSupabase
        .from('index_companies')
        .upsert(rows.slice(i, i + CHUNK), { onConflict: 'ticker' })
      if (error) throw new Error(error.message)
    }

    const scored = rows.filter(r => r.score != null).length
    return Response.json({ ok: true, total: rows.length, scored })

  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}
