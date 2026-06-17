import { NextResponse } from 'next/server'
import { requireAdmin, serviceClient } from '@/lib/admin'
import { getEffectiveDict } from '@/lib/dict'

export const dynamic = 'force-dynamic'

const FIELDS = ['combined', 'loss', 'expense', 'solvency', 'iy', 'rote', 'gwp']

export async function GET() {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const sc = serviceClient()
  const dict = await getEffectiveDict()
  const insurers = dict.filter(d => d[6] === 'aseguradora').map(d => ({ ticker: d[1], name: d[0], country: d[2] }))
    .sort((a, b) => a.name.localeCompare(b.name))

  const { data: rows } = await sc.from('insurer_metrics_manual').select('*')
  return NextResponse.json({ insurers, rows: rows || [] })
}

export async function POST(request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  let body = {}
  try { body = await request.json() } catch {}
  const ticker = (body?.ticker || '').toString().trim()
  const period = (body?.period || '').toString().trim().toUpperCase()
  if (!ticker || !/^\d{4}Q[1-4]$/.test(period))
    return NextResponse.json({ error: 'Falta ticker o periodo válido (YYYYQn)' }, { status: 400 })

  const num = v => {
    if (v === '' || v == null) return null
    const x = Number(String(v).replace(',', '.'))   // admite coma decimal
    return isNaN(x) ? null : x
  }
  const row = { ticker, period, updated_at: new Date().toISOString() }
  for (const f of FIELDS) row[f] = num(body[f])

  const { error } = await serviceClient().from('insurer_metrics_manual').upsert(row, { onConflict: 'ticker,period' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  let body = {}
  try { body = await request.json() } catch {}
  const ticker = (body?.ticker || '').toString().trim()
  const period = (body?.period || '').toString().trim().toUpperCase()
  if (!ticker || !period) return NextResponse.json({ error: 'Falta ticker o periodo' }, { status: 400 })
  const { error } = await serviceClient().from('insurer_metrics_manual').delete().eq('ticker', ticker).eq('period', period)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
