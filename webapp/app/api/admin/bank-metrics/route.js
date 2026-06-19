import { NextResponse } from 'next/server'
import { requireAdmin, serviceClient } from '@/lib/admin'
import { getEffectiveDict } from '@/lib/dict'
import { isCreditRiskFinancial } from '@/lib/dgi-score'

export const dynamic = 'force-dynamic'

const FIELDS = ['npl', 'cet1', 'nim', 'rote', 'efficiency']

// GET: lista de entidades con lógica bancaria (banca + financieras con riesgo de
// crédito, por industria de Yahoo) + todas las filas manuales guardadas.
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
  const banks = dict
    .filter(d => isCreditRiskFinancial(d[6], fmap[d[1]]?.sector, fmap[d[1]]?.industry))
    .map(d => ({ ticker: d[1], name: d[0], country: d[2] }))
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

  const num = v => {
    if (v === '' || v == null) return null
    const x = Number(String(v).replace(',', '.'))   // admite coma decimal
    return isNaN(x) ? null : x
  }
  const row = { ticker, period, updated_at: new Date().toISOString() }
  for (const f of FIELDS) row[f] = num(body[f])

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
