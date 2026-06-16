import { NextResponse } from 'next/server'
import { requireAdmin, serviceClient } from '@/lib/admin'
import { getEffectiveDict } from '@/lib/dict'
import { ALL_SECTORS, INDUSTRIES_BY_SECTOR } from '@/lib/taxonomy'

export const dynamic = 'force-dynamic'

// GET: lista de empresas con su sector/industria actuales (de company_fundamentals)
// + nombre del DICT, para el editor de taxonomía del dashboard.
export async function GET() {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const sc = serviceClient()
  const rows = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sc.from('company_fundamentals')
      .select('ticker, sector, industry, taxonomy_locked').range(from, from + 999)
    if (error || !data?.length) break
    rows.push(...data)
    if (data.length < 1000) break
  }

  const dict = await getEffectiveDict()
  const nameByTicker = Object.fromEntries(dict.map(d => [d[1], d[0]]))

  const companies = rows.map(r => ({
    ticker: r.ticker,
    name: nameByTicker[r.ticker] || r.ticker,
    sector: r.sector || null,
    industry: r.industry || null,
    locked: !!r.taxonomy_locked,
  })).sort((a, b) => a.name.localeCompare(b.name))

  return NextResponse.json({ companies })
}

// POST: asigna manualmente sector + industria a una empresa y bloquea la fila
// para que el run de yfinance no la sobreescriba.
export async function POST(request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  let body = {}
  try { body = await request.json() } catch {}
  const ticker = (body?.ticker || '').toString().trim()
  if (!ticker) return NextResponse.json({ error: 'Falta ticker' }, { status: 400 })

  const sector = body.sector || null
  const industry = body.industry || null

  if (sector && !ALL_SECTORS.includes(sector))
    return NextResponse.json({ error: 'Sector no válido' }, { status: 400 })
  if (industry && sector && !(INDUSTRIES_BY_SECTOR[sector] || []).some(([en]) => en === industry))
    return NextResponse.json({ error: 'La industria no pertenece al sector' }, { status: 400 })

  const { error, data } = await serviceClient()
    .from('company_fundamentals')
    .update({ sector, industry, taxonomy_locked: true })
    .eq('ticker', ticker)
    .select('ticker')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json({ error: 'Empresa sin fundamentales (no existe la fila)' }, { status: 404 })

  try {
    await serviceClient().from('admin_logs').insert({
      event_type: 'taxonomy_update', status: 'ok',
      description: `Taxonomía manual ${ticker}: ${sector || '—'} / ${industry || '—'}`,
    })
  } catch {}
  return NextResponse.json({ ok: true })
}
