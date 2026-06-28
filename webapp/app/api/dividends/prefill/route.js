// Prefill de dividendos: genera registros 'pending'/'auto' en dividends_received
// para los cobros esperados (año en curso transcurrido + próximos 3 meses).
// Nunca duplica ni sobreescribe registros 'received' o 'manual', ni regenera
// los que el usuario excluyó.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { computeAutoDividends } from '@/lib/dividends'
import { resolveDestWHT } from '@/lib/fiscal-es'

export const dynamic = 'force-dynamic'

const periodOf = dateStr => { const d = dateStr ? String(dateStr).slice(0, 7) : null; return d } // YYYY-MM

export async function POST() {
  try {
    const sb = await createClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return NextResponse.json({ error: 'no auth' }, { status: 401 })

    // Regenera las estimaciones: borra las automáticas PENDIENTES del año en curso en
    // adelante para recalcularlas con el dividendo y las acciones actuales. No toca
    // las confirmadas ('received') ni las introducidas a mano ('manual').
    const yearStartIso = `${new Date().getFullYear()}-01-01`
    await sb.from('dividends_received').delete()
      .eq('user_id', user.id).eq('source', 'auto').eq('status', 'pending')
      .gte('payment_date_estimated', yearStartIso)

    const [{ data: positions }, { data: transactions }, { data: existing }, { data: excl }, { data: cfgRows }, { data: settings }] = await Promise.all([
      sb.from('positions').select('*').eq('user_id', user.id),
      sb.from('transactions').select('ticker, type, shares, date').eq('user_id', user.id),
      sb.from('dividends_received').select('*').eq('user_id', user.id),
      sb.from('dividend_prefill_exclusions').select('ticker, period').eq('user_id', user.id),
      sb.from('dividend_config').select('*').eq('user_id', user.id),
      sb.from('user_settings').select('*').eq('user_id', user.id).maybeSingle(),
    ])
    const config = Object.fromEntries((cfgRows || []).map(c => [c.ticker, c]))
    const destWHT = resolveDestWHT(settings)
    const whtOverrides = (settings?.wht_overrides && typeof settings.wht_overrides === 'object') ? settings.wht_overrides : null
    if (!positions?.length) return NextResponse.json({ inserted: 0 })

    const tickers = [...new Set(positions.map(p => p.ticker))]
    let fundamentals = {}
    if (tickers.length) {
      const { data: funds } = await sb.from('company_fundamentals')
        .select('ticker, country, dps, div_history, dividend_events, next_ex_date, next_pay_date').in('ticker', tickers)
      fundamentals = Object.fromEntries((funds || []).map(f => [f.ticker, f]))
    }

    // Periodos ya ocupados (cualquier registro) y exclusiones → no regenerar
    const taken = new Set()
    ;(existing || []).forEach(r => {
      const p = periodOf(r.payment_date_estimated || r.date)
      if (p) taken.add(`${r.ticker}|${p}`)
    })
    ;(excl || []).forEach(e => taken.add(`${e.ticker}|${e.period}`))

    const auto = computeAutoDividends({ positions, transactions: transactions || [], fundamentals, config, destWHT, whtOverrides })
    const toInsert = auto
      .filter(d => !taken.has(`${d.ticker}|${d.period}`))
      .map(d => ({
        user_id: user.id, ticker: d.ticker, date: d.payment_date_estimated,
        amount: d.amount, amount_net: d.amount_net, shares: d.shares, dps: d.dps,
        withholding_origin_pct: d.withholding_origin_pct, withholding_origin: d.withholding_origin,
        withholding_dest_pct: d.withholding_dest_pct, withholding_dest: d.withholding_dest,
        ex_dividend_date: d.ex_dividend_date, payment_date_estimated: d.payment_date_estimated,
        status: 'pending', source: 'auto',
      }))

    let inserted = 0
    if (toInsert.length) {
      const { error } = await sb.from('dividends_received').insert(toInsert)
      if (error) return NextResponse.json({ error: error.message, inserted: 0 }, { status: 200 })
      inserted = toInsert.length
    }
    return NextResponse.json({ inserted })
  } catch (e) {
    return NextResponse.json({ error: String(e?.message || e), inserted: 0 }, { status: 200 })
  }
}
