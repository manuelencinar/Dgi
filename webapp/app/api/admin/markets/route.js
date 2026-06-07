import { NextResponse } from 'next/server'
import { requireAdmin, serviceClient } from '@/lib/admin'
import { getAllMarkets } from '@/lib/markets-overrides'

export const dynamic = 'force-dynamic'

const REGIONS = new Set(['América', 'Europa', 'Asia-Pacífico', 'África', 'ETFs globales'])

export async function GET() {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  return NextResponse.json({ markets: await getAllMarkets() })
}

// Editar campos / activar-desactivar un índice (no add/remove).
export async function POST(request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  let body
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Body inválido' }, { status: 400 }) }
  const symbol = (body?.symbol || '').toString().trim()
  if (!symbol) return NextResponse.json({ error: 'Falta el símbolo' }, { status: 400 })

  const row = { symbol, updated_at: new Date().toISOString() }
  if (body.name != null) row.name = String(body.name).slice(0, 80)
  if (body.country != null) row.country = String(body.country).slice(0, 40)
  if (body.region != null && REGIONS.has(body.region)) row.region = body.region
  if (body.yf_ticker != null) row.yf_ticker = String(body.yf_ticker).slice(0, 20)
  if (typeof body.active === 'boolean') row.active = body.active

  const sb = serviceClient()
  const { error } = await sb.from('markets_overrides').upsert(row, { onConflict: 'symbol' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  try {
    await sb.from('admin_logs').insert({
      event_type: 'market_override',
      description: typeof body.active === 'boolean'
        ? `Índice ${symbol} ${body.active ? 'activado' : 'desactivado'}`
        : `Índice ${symbol} editado`,
      status: 'ok',
    })
  } catch {}

  return NextResponse.json({ ok: true, symbol })
}
