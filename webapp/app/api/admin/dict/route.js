import { NextResponse } from 'next/server'
import { requireAdmin, serviceClient } from '@/lib/admin'
import { DICT } from '@/data/dict'
import { getEffectiveDict } from '@/lib/dict'

export const dynamic = 'force-dynamic'

const VALID_TYPES = new Set(['general', 'banco', 'aseguradora', 'reit', 'bdc', 'utilities'])

// ── GET: overrides actuales + tickers huérfanos (con datos, fuera del DICT) ──
export async function GET(request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const sb = serviceClient()

  // Nº de usuarios con posiciones en un ticker (aviso antes de eliminar)
  if (new URL(request.url).searchParams.get('action') === 'positions') {
    const ticker = (new URL(request.url).searchParams.get('ticker') || '').toUpperCase()
    if (!ticker) return NextResponse.json({ users: 0, rows: 0 })
    try {
      const { data } = await sb.from('positions').select('user_id').eq('ticker', ticker)
      const users = new Set((data || []).map(r => r.user_id)).size
      return NextResponse.json({ users, rows: (data || []).length })
    } catch { return NextResponse.json({ users: 0, rows: 0 }) }
  }

  const baseByTicker = new Map(DICT.map(d => [d[1], d[0]]))

  let overrides = []
  try { overrides = (await sb.from('dict_overrides').select('*').order('created_at', { ascending: false })).data || [] } catch {}

  const removed = overrides.filter(o => o.action === 'remove').map(o => ({ ticker: o.ticker, name: baseByTicker.get(o.ticker) || o.name || o.ticker }))
  const added = overrides.filter(o => o.action === 'add').map(o => ({ ticker: o.ticker, name: o.name || o.ticker, country: o.country, type: o.type }))

  // Huérfanos: tickers con fila en company_fundamentals que no aparecen en el DICT efectivo
  let orphans = []
  try {
    const effective = await getEffectiveDict()
    const effSet = new Set(effective.map(d => d[1]))
    const all = []
    for (let from = 0; ; from += 1000) {
      const { data } = await sb.from('company_fundamentals').select('ticker, sector, country').range(from, from + 999)
      if (!data?.length) break
      all.push(...data)
      if (data.length < 1000) break
    }
    orphans = all.filter(r => !effSet.has(r.ticker)).map(r => ({ ticker: r.ticker, sector: r.sector, country: r.country }))
  } catch {}

  return NextResponse.json({ removed, added, orphans })
}

// ── POST: añadir u ocultar una empresa ──────────────────────────────────────
export async function POST(request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  let body
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Body inválido' }, { status: 400 }) }
  const action = body?.action
  const ticker = (body?.ticker || '').toString().trim().toUpperCase()
  if (!ticker) return NextResponse.json({ error: 'Falta el ticker' }, { status: 400 })
  if (action !== 'add' && action !== 'remove') return NextResponse.json({ error: 'Acción no válida' }, { status: 400 })

  const sb = serviceClient()
  const row = { ticker, action, created_at: new Date().toISOString() }

  if (action === 'add') {
    const type = VALID_TYPES.has(body?.type) ? body.type : 'general'
    Object.assign(row, {
      name: (body?.name || ticker).toString().trim().slice(0, 120),
      country: (body?.country || 'OTHER').toString().trim().toUpperCase().slice(0, 6),
      currency: (body?.currency || 'USD').toString().trim().toUpperCase().slice(0, 6),
      sector: (body?.sector || '').toString().trim().slice(0, 60),
      subsector: (body?.subsector || '').toString().trim().slice(0, 80),
      type,
    })
  }

  const { error } = await sb.from('dict_overrides').upsert(row, { onConflict: 'ticker' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Al eliminar: borrar fundamentales e index_companies (NUNCA positions/transactions)
  if (action === 'remove' && body?.purge) {
    try { await sb.from('company_fundamentals').delete().eq('ticker', ticker) } catch {}
    try { await sb.from('index_companies').delete().eq('ticker', ticker) } catch {}
  }

  try {
    await sb.from('admin_logs').insert({
      event_type: 'dict_override',
      description: action === 'add' ? `Empresa ${ticker} añadida al DICT` : `Empresa ${ticker} ocultada del DICT${body?.purge ? ' (datos borrados)' : ''}`,
      status: 'ok',
    })
  } catch {}

  return NextResponse.json({ ok: true, ticker, action })
}

// ── PUT: cambiar el ticker de una empresa (atómico, todas las tablas) ───────
export async function PUT(request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  let body
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Body inválido' }, { status: 400 }) }
  const oldTicker = (body?.oldTicker || '').toString().trim().toUpperCase()
  const newTicker = (body?.newTicker || '').toString().trim().toUpperCase()
  if (!oldTicker || !newTicker) return NextResponse.json({ error: 'Faltan tickers' }, { status: 400 })
  if (!/^[A-Z0-9.\-]+$/.test(newTicker)) return NextResponse.json({ error: 'Ticker inválido (solo mayúsculas, números, punto y guion)' }, { status: 400 })
  if (oldTicker === newTicker) return NextResponse.json({ ok: true, ticker: newTicker })

  const sb = serviceClient()

  // 1) Migración atómica de datos en todas las tablas relacionadas (RPC)
  const { error: rpcErr } = await sb.rpc('rename_ticker', { p_old: oldTicker, p_new: newTicker })
  if (rpcErr) return NextResponse.json({ error: `No se pudo migrar: ${rpcErr.message}` }, { status: 500 })

  // 2) DICT: ocultar el viejo y registrar el nuevo con los campos
  try {
    await sb.from('dict_overrides').upsert({ ticker: oldTicker, action: 'remove', created_at: new Date().toISOString() }, { onConflict: 'ticker' })
    const add = {
      ticker: newTicker, action: 'add', created_at: new Date().toISOString(),
      name: (body?.name || newTicker).toString().slice(0, 120),
      country: (body?.country || 'OTHER').toString().toUpperCase().slice(0, 6),
      currency: (body?.currency || 'USD').toString().toUpperCase().slice(0, 6),
      sector: (body?.sector || '').toString().slice(0, 60),
      subsector: (body?.subsector || '').toString().slice(0, 80),
      type: VALID_TYPES.has(body?.type) ? body.type : 'general',
    }
    await sb.from('dict_overrides').upsert(add, { onConflict: 'ticker' })
  } catch (e) {
    return NextResponse.json({ error: `Datos migrados pero falló el DICT: ${e.message}` }, { status: 500 })
  }

  try {
    await sb.from('admin_logs').insert({ event_type: 'dict_override', description: `Ticker ${oldTicker} → ${newTicker} (migrado en todas las tablas)`, status: 'ok' })
  } catch {}

  return NextResponse.json({ ok: true, oldTicker, newTicker })
}

// ── DELETE: deshacer un override (restaurar comportamiento del DICT base) ────
export async function DELETE(request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  let body
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Body inválido' }, { status: 400 }) }
  const ticker = (body?.ticker || '').toString().trim().toUpperCase()
  if (!ticker) return NextResponse.json({ error: 'Falta el ticker' }, { status: 400 })

  const sb = serviceClient()
  const { error } = await sb.from('dict_overrides').delete().eq('ticker', ticker)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, ticker })
}
