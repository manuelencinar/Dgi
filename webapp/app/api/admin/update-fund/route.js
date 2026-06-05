import { NextResponse } from 'next/server'
import { requireAdmin, serviceClient } from '@/lib/admin'

export const dynamic = 'force-dynamic'

export async function POST(request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  let body = {}
  try { body = await request.json() } catch {}
  const { ticker } = body
  if (!ticker) return NextResponse.json({ error: 'Falta ticker' }, { status: 400 })

  const update = {}
  if (body.ter !== undefined)              update.ter = body.ter            // decimal (0.0006)
  if (body.benchmark_ticker !== undefined) update.benchmark_ticker = body.benchmark_ticker || null
  if (body.benchmark_name !== undefined)   update.benchmark_name = body.benchmark_name || null
  if (!Object.keys(update).length) return NextResponse.json({ error: 'Sin cambios' }, { status: 400 })

  const { error } = await serviceClient().from('funds').update(update).eq('ticker', ticker)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
