// Prefill fiscal: calcula dividendos cobrados y ganancias/pérdidas (FIFO) del
// ejercicio a partir de positions + transactions + company_fundamentals y los
// inserta en fiscal_entries (source=auto, is_confirmed=false).
// Nunca sobreescribe entradas confirmadas o manuales, ni regenera las eliminadas.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { computeAutoEntries } from '@/lib/fiscalidad'

export const dynamic = 'force-dynamic'

const divSig  = e => `D|${e.ticker}`
const gainSig = e => `G|${e.ticker}|${e.sell_date}|${e.buy_date}`
const sigOf   = e => e.type === 'dividend' ? divSig(e) : gainSig(e)

export async function POST(req) {
  try {
    const sb = await createClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return NextResponse.json({ error: 'no auth' }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const exercise = Number(body.exercise) || new Date().getFullYear()
    const force = !!body.force

    // Entradas existentes del ejercicio
    const { data: existing } = await sb.from('fiscal_entries').select('*').eq('user_id', user.id).eq('exercise', exercise)
    const rows = existing || []

    // El prefill solo genera transmisiones (ganancias/pérdidas). No se salta por
    // tener entradas antiguas de dividendos: solo si ya existen ganancias/pérdidas.
    const hasGains = rows.some(r => r.type === 'gain' || r.type === 'loss')
    if (!force && hasGains) {
      return NextResponse.json({ skipped: true, reason: 'already_has_gains' })
    }

    // En modo recálculo: borrar solo las auto NO confirmadas y NO eliminadas
    if (force) {
      await sb.from('fiscal_entries').delete()
        .eq('user_id', user.id).eq('exercise', exercise)
        .eq('source', 'auto').eq('is_confirmed', false).eq('deleted', false)
    }

    // Firmas a respetar: eliminadas (no regenerar) + confirmadas/manuales (no duplicar)
    const deletedSigs = new Set(rows.filter(r => r.deleted).map(sigOf))
    const keptSigs    = new Set(rows.filter(r => !r.deleted && (r.is_confirmed || r.source === 'manual')).map(sigOf))

    // Cargar datos de cálculo
    const [{ data: positions }, { data: transactions }] = await Promise.all([
      sb.from('positions').select('*').eq('user_id', user.id),
      sb.from('transactions').select('*').eq('user_id', user.id),
    ])
    const tickers = [...new Set([...(positions || []).map(p => p.ticker), ...(transactions || []).map(t => t.ticker)])]
    let fundamentals = {}
    if (tickers.length) {
      const { data: funds } = await sb.from('company_fundamentals')
        .select('ticker, country, div_history, dividend_events').in('ticker', tickers)
      fundamentals = Object.fromEntries((funds || []).map(f => [f.ticker, f]))
    }

    const { divEntries, gainEntries, missingDivHistory, excludedSells } =
      computeAutoEntries({ positions: positions || [], transactions: transactions || [], fundamentals, exercise })

    // Los dividendos de la fiscalidad vienen de dividends_received (sección Dividendos).
    // El prefill de fiscal_entries solo genera las transmisiones (ganancias/pérdidas).
    const toInsert = [...gainEntries]
      .filter(e => { const s = sigOf(e); return !deletedSigs.has(s) && !keptSigs.has(s) })
      .map(e => ({ ...e, user_id: user.id, exercise, source: 'auto', is_manual: false, is_confirmed: false, deleted: false }))

    let inserted = 0
    if (toInsert.length) {
      const { error } = await sb.from('fiscal_entries').insert(toInsert)
      if (error) return NextResponse.json({ error: error.message }, { status: 200 })
      inserted = toInsert.length
    }

    return NextResponse.json({ inserted, missingDivHistory, excludedSells })
  } catch (e) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 200 })
  }
}
