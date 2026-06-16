import { NextResponse } from 'next/server'
import { requireAdmin, serviceClient } from '@/lib/admin'
import { getEffectiveDict } from '@/lib/dict'

export const dynamic = 'force-dynamic'

const FIELDS = ['npl', 'nim', 'rote', 'efficiency']

// GET: lista de bancos (DICT type 'banco') + todas las filas manuales guardadas.
export async function GET() {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const sc = serviceClient()
  const dict = await getEffectiveDict()
  const banks = dict.filter(d => d[6] === 'banco').map(d => ({ ticker: d[1], name: d[0], country: d[2] }))
    .sort((a, b) => a.name.localeCompare(b.name))

  const { data: rows } = await sc.from('bank_metrics_manual').select('*')
  return NextResponse.json({ banks, rows: rows || [] })
}

// POST: upsert de una fila (ticker, period) con los valores manuales.
export async function POST(request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  let body = {}
  try { body = await request.json() } catch {}
  const ticker = (body?.ticker || '').toString().trim()
  const period = (body?.period || '').toString().trim().toUpperCase()
  if (!ticker || !/^\d{4}Q[1-4]$/.test(period))
    return NextResponse.json({ error: 'Falta ticker o periodo válido (YYYYQn)' }, { status: 400 })

  const row = { ticker, period, updated_at: new Date().toISOString() }
  for (const f of FIELDS) {
    const v = body[f]
    row[f] = (v === '' || v == null || isNaN(Number(v))) ? null : Number(v)
  }

  const { error } = await serviceClient().from('bank_metrics_manual').upsert(row, { onConflict: 'ticker,period' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE: elimina una fila (ticker, period).
export async function DELETE(request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  let body = {}
  try { body = await request.json() } catch {}
  const ticker = (body?.ticker || '').toString().trim()
  const period = (body?.period || '').toString().trim().toUpperCase()
  if (!ticker || !period) return NextResponse.json({ error: 'Falta ticker o periodo' }, { status: 400 })
  const { error } = await serviceClient().from('bank_metrics_manual').delete().eq('ticker', ticker).eq('period', period)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
