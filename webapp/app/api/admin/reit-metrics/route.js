import { NextResponse } from 'next/server'
import { requireAdmin, serviceClient } from '@/lib/admin'
import { getEffectiveDict } from '@/lib/dict'
import { REIT_SUBTYPES, defaultReitSubtype } from '@/lib/reit-metrics'

export const dynamic = 'force-dynamic'

// GET: lista de REITs (type 'reit' o sector Real Estate) con su industria
// (para sugerir el sub-tipo por defecto) + filas manuales.
export async function GET() {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const sc = serviceClient()
  const dict = await getEffectiveDict()
  const fmap = {}
  for (let from = 0; ; from += 1000) {
    const { data } = await sc.from('company_fundamentals').select('ticker, sector, industry').range(from, from + 999)
    if (!data?.length) break
    data.forEach(r => { fmap[r.ticker] = { sector: r.sector, industry: r.industry } })
    if (data.length < 1000) break
  }
  const reits = dict
    .filter(d => d[6] === 'reit' || fmap[d[1]]?.sector === 'Real Estate')
    .map(d => ({ ticker: d[1], name: d[0], industry: fmap[d[1]]?.industry || null, suggested: defaultReitSubtype(fmap[d[1]]?.industry) }))
    .sort((a, b) => a.name.localeCompare(b.name))

  const { data: rows } = await sc.from('reit_manual').select('*')
  return NextResponse.json({ reits, rows: rows || [], subtypes: REIT_SUBTYPES })
}

export async function POST(request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  let body = {}
  try { body = await request.json() } catch {}
  const ticker = (body?.ticker || '').toString().trim()
  if (!ticker) return NextResponse.json({ error: 'Falta ticker' }, { status: 400 })
  const subtype = body.subtype && REIT_SUBTYPES[body.subtype] ? body.subtype : null
  const mp = body.maint_pct
  const maint_pct = (mp === '' || mp == null || isNaN(Number(String(mp).replace(',', '.')))) ? null : Number(String(mp).replace(',', '.'))

  const { error } = await serviceClient().from('reit_manual')
    .upsert({ ticker, subtype, maint_pct, updated_at: new Date().toISOString() }, { onConflict: 'ticker' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  let body = {}
  try { body = await request.json() } catch {}
  const ticker = (body?.ticker || '').toString().trim()
  if (!ticker) return NextResponse.json({ error: 'Falta ticker' }, { status: 400 })
  const { error } = await serviceClient().from('reit_manual').delete().eq('ticker', ticker)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
