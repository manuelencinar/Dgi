import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { DICT } from '@/data/dict'
import { computeMoat, computeValuation, computeDGIScore } from '@/lib/company-detail'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// Snapshot semanal del Score DGI (dgiScore.total) de todas las empresas en
// score_history. Reúsa la MISMA lógica que la ficha (computeDGIScore), por eso
// vive como API route dentro de Next (las libs usan el alias @/ y no resuelven
// desde un script Node plano). Sin backfill posible: acumula desde el primer run.

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
}

// type/currency por ticker desde el DICT [name, ticker, country, currency, sector, _, type]
const TYPE_OF = Object.fromEntries(DICT.map(d => [d[1], d[6] || 'general']))
const CUR_OF  = Object.fromEntries(DICT.map(d => [d[1], d[3] || 'USD']))

// Igual que enrichDivHistory en lib/company-detail.js
function enrichDiv(history) {
  if (!Array.isArray(history) || !history.length) return []
  const y = new Date().getFullYear()
  return [...history].sort((a, b) => a.year - b.year).map(h => ({ ...h, isPartial: h.year === y }))
}

function scoreRow(f, today) {
  const ticker = f.ticker
  if (!(ticker in CUR_OF)) return null            // fuera del DICT (ETFs/fondos): no se puntúan
  const type = TYPE_OF[ticker] || 'general'
  const currency = CUR_OF[ticker] || 'USD'
  const detail = { ...f, divHistory: enrichDiv(f.div_history ?? []) }
  const streak = detail.div_streak ?? 0
  const cagr = detail.div_cagr5 != null ? detail.div_cagr5 / 100 : null
  const paysDividend = detail.pays_dividend ?? null
  try {
    const moat = computeMoat(detail, streak)
    const dcf = computeValuation(detail, moat?.width ?? 'none', type, currency)
    const s = computeDGIScore(detail, streak, cagr, dcf, type, paysDividend)
    if (!s || s.total == null) return null
    return { ticker, date: today, score: s.total, prepenalty: s.prepenalty ?? null, sector_type: s.sectorType ?? null }
  } catch {
    return null
  }
}

export async function GET(request) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const client = sb()
  const today = new Date().toISOString().slice(0, 10)
  let scanned = 0, snapped = 0, failed = 0

  // Paginado en bloques pequeños — las filas traen jsonb pesados (estados anuales).
  for (let from = 0; ; from += 100) {
    const { data, error } = await client.from('company_fundamentals').select('*').range(from, from + 99)
    if (error) { failed++; break }
    if (!data?.length) break
    scanned += data.length

    const rows = []
    for (const f of data) {
      const r = scoreRow(f, today)
      if (r) rows.push(r)
    }
    if (rows.length) {
      const { error: upErr } = await client.from('score_history').upsert(rows, { onConflict: 'ticker,date' })
      if (upErr) failed += rows.length
      else snapped += rows.length
    }
    if (data.length < 100) break
  }

  return NextResponse.json({ date: today, scanned, snapped, failed })
}
