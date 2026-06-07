import { NextResponse } from 'next/server'
import { requireAdmin, serviceClient } from '@/lib/admin'
import { DICT } from '@/data/dict'
import { HISTORY_COLS, STATEMENT_COLS, vintageOf } from '@/lib/investing-parser'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const RESERVED = new Set(['ticker', 'updated_at'])
const nameOf = t => DICT.find(d => d[1] === t)?.[0] ?? t

// Merge de jsonb plano {año: valor}. Nunca elimina años existentes.
function mergeFlat(existing, incoming, protectedField, overwrite) {
  const ex = existing && typeof existing === 'object' ? existing : {}
  if (overwrite) return { ...ex, ...incoming }
  if (protectedField) return { ...incoming, ...ex }   // años manuales existentes ganan
  return { ...ex, ...incoming }
}

// Estado financiero {columns:[años], data:{partida:[vals]}} → mapa {año: {partida: val}}
function stmtToMap(stmt) {
  const out = {}, disp = {}
  if (!stmt || !Array.isArray(stmt.columns) || !stmt.data) return { out, disp }
  stmt.columns.forEach((col, i) => {
    const y = String(col).slice(0, 4)
    disp[y] = col
    out[y] = out[y] || {}
    for (const [lbl, arr] of Object.entries(stmt.data)) {
      const v = Array.isArray(arr) ? arr[i] : null
      if (v != null) out[y][lbl] = v
    }
  })
  return { out, disp }
}

// Merge de estados financieros {columns,data} por año y partida. Nunca borra años.
function mergeStmt(existing, incoming, protectedField, overwrite) {
  const A = stmtToMap(existing), B = stmtToMap(incoming)
  const years = [...new Set([...Object.keys(A.out), ...Object.keys(B.out)])]
    .map(Number).filter(n => !isNaN(n)).sort((a, b) => b - a)
  if (!years.length) return existing || incoming
  const columns = years.map(y => A.disp[y] ?? B.disp[y] ?? String(y))
  const labels = [...new Set([
    ...Object.values(A.out).flatMap(o => Object.keys(o)),
    ...Object.values(B.out).flatMap(o => Object.keys(o)),
  ])]
  const data = {}
  for (const lbl of labels) {
    data[lbl] = years.map(y => {
      const a = A.out[String(y)]?.[lbl] ?? null
      const b = B.out[String(y)]?.[lbl] ?? null
      if (overwrite) return b ?? a
      if (protectedField) return a ?? b          // año/partida existente gana
      return b ?? a                              // no protegido: el nuevo gana, conserva lo existente
    })
  }
  return { columns, data }
}

// ── POST: importar registros ya parseados en el cliente ─────────────────────
export async function POST(request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  let body
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Body inválido' }, { status: 400 }) }
  const records = Array.isArray(body?.records) ? body.records : null
  const overwrite = !!body?.overwrite_manual
  const notes = typeof body?.notes === 'string' ? body.notes.slice(0, 500) : null
  const silent = !!body?.silent          // los lotes intermedios no escriben en admin_logs
  const aggregate = body?.aggregate || null   // totales acumulados para el log final

  // logOnly: tras enviar todos los lotes (silenciosos), registra un único log final
  if (body?.logOnly && aggregate) {
    const aggStatus = aggregate.errors === 0 ? 'ok' : (aggregate.updated + aggregate.created > 0 ? 'partial' : 'error')
    try {
      await serviceClient().from('admin_logs').insert({
        event_type: 'manual_import',
        description: `Importación manual — ${aggregate.updated + aggregate.created} empresas procesadas, ${aggregate.created} creadas, ${aggregate.errors} errores`,
        details: { ...aggregate, overwrite },
        status: aggStatus,
      })
    } catch {}
    return NextResponse.json({ ok: true })
  }

  if (!records?.length) return NextResponse.json({ error: 'No hay registros para importar' }, { status: 400 })

  const sb = serviceClient()
  const results = []
  let updated = 0, created = 0, errored = 0

  for (const rec of records) {
    const ticker = (rec?.ticker || '').toString().trim().toUpperCase()
    if (!ticker) { errored++; results.push({ ticker: '(sin ticker)', status: 'error', error: 'Falta el ticker' }); continue }

    try {
      const { data: existing } = await sb.from('company_fundamentals').select('*').eq('ticker', ticker).maybeSingle()
      const manualFields = (existing?.manual_fields && typeof existing.manual_fields === 'object') ? { ...existing.manual_fields } : {}
      const dataVintage = (existing?.data_vintage && typeof existing.data_vintage === 'object') ? { ...existing.data_vintage } : {}

      const payload = { ticker }
      const fieldsAdded = []
      const fieldsSkipped = []

      for (const [col, value] of Object.entries(rec)) {
        if (RESERVED.has(col) || value == null) continue
        const isProtected = manualFields[col] === true

        if (STATEMENT_COLS.has(col)) {
          payload[col] = mergeStmt(existing?.[col], value, isProtected, overwrite)
          manualFields[col] = true
          fieldsAdded.push(col)
        } else if (HISTORY_COLS.has(col)) {
          payload[col] = mergeFlat(existing?.[col], value, isProtected, overwrite)
          manualFields[col] = true
          fieldsAdded.push(col)
        } else {
          // Campo escalar
          if (isProtected && !overwrite) { fieldsSkipped.push(col); continue }
          payload[col] = value
          manualFields[col] = true
          fieldsAdded.push(col)
        }
      }

      // data_vintage: año más reciente de cada estado financiero mergeado.
      const stmtVintage = {
        income_statement_annual: 'income_statement_annual_through',
        income_statement_quarterly: 'income_statement_quarterly_through',
        balance_sheet_annual: 'balance_sheet_annual_through',
        balance_sheet_quarterly: 'balance_sheet_quarterly_through',
        cashflow_annual: 'cashflow_annual_through',
        cashflow_quarterly: 'cashflow_quarterly_through',
      }
      for (const [col, key] of Object.entries(stmtVintage)) {
        const cols = payload[col]?.columns
        if (Array.isArray(cols) && cols.length) {
          const maxY = Math.max(...cols.map(c => parseInt(String(c).slice(0, 4), 10)).filter(n => !isNaN(n)))
          if (!isNaN(maxY)) dataVintage[key] = maxY
        }
      }
      // Respaldo: si no hubo estado, deriva el vintage anual de los históricos.
      const histVintage = {
        income_statement_annual_through: 'revenue_history',
        balance_sheet_annual_through: 'assets_history',
        cashflow_annual_through: payload.ocf_history ? 'ocf_history' : 'fcf_history',
      }
      for (const [key, col] of Object.entries(histVintage)) {
        if (dataVintage[key] == null && payload[col]) {
          const y = vintageOf(payload[col], false)
          if (y != null) dataVintage[key] = y
        }
      }

      payload.manual_fields = manualFields
      payload.data_vintage = dataVintage
      payload.last_manual_import = new Date().toISOString()
      if (notes) payload.manual_import_notes = notes
      payload.updated_at = new Date().toISOString()
      if (!DICT.find(d => d[1] === ticker)) {
        const country = rec.country
        if (country) payload.country = country
      }

      const { error } = await sb.from('company_fundamentals').upsert(payload, { onConflict: 'ticker' })
      if (error) throw new Error(error.message)

      if (existing) updated++; else created++
      results.push({ ticker, status: existing ? 'updated' : 'created', fieldsAdded, fieldsSkipped })
    } catch (e) {
      errored++
      results.push({ ticker, status: 'error', error: String(e.message || e) })
    }
  }

  const status = errored === 0 ? 'ok' : (updated + created > 0 ? 'partial' : 'error')
  const summary = { updated, created, errors: errored, total: records.length, results }

  if (!silent) {
    const agg = aggregate || { updated, created, errors: errored, total: records.length }
    const aggStatus = agg.errors === 0 ? 'ok' : (agg.updated + agg.created > 0 ? 'partial' : 'error')
    try {
      await sb.from('admin_logs').insert({
        event_type: 'manual_import',
        description: `Importación manual — ${agg.updated + agg.created} empresas procesadas, ${agg.created} creadas, ${agg.errors} errores`,
        details: { ...agg, overwrite },
        status: aggStatus,
      })
    } catch {}
  }

  return NextResponse.json(summary)
}

// ── GET: estado de datos manuales / empresas desactualizadas ────────────────
export async function GET(request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const action = new URL(request.url).searchParams.get('action') || 'manual-status'
  const sb = serviceClient()
  const curYear = new Date().getFullYear()

  if (action === 'manual-status') {
    const { data } = await sb.from('company_fundamentals')
      .select('ticker, manual_fields, data_vintage, last_manual_import')
      .not('last_manual_import', 'is', null)
      .order('last_manual_import', { ascending: false })
      .limit(1000)
    const rows = (data || []).map(r => ({
      ticker: r.ticker,
      name: nameOf(r.ticker),
      protectedFields: Object.entries(r.manual_fields || {}).filter(([, v]) => v === true).map(([k]) => k),
      lastImport: r.last_manual_import,
      vintage: r.data_vintage || {},
    }))
    return NextResponse.json({ rows })
  }

  if (action === 'stale') {
    // Empresas con datos manuales cuyo estado anual tiene > 12 meses de antigüedad
    const { data } = await sb.from('company_fundamentals')
      .select('ticker, data_vintage, last_manual_import')
      .not('data_vintage', 'is', null)
      .limit(2000)
    const stale = (data || [])
      .map(r => ({ ticker: r.ticker, through: r.data_vintage?.income_statement_annual_through ?? null, lastImport: r.last_manual_import }))
      .filter(r => r.through != null && r.through < curYear - 1)
      .map(r => ({ ...r, name: nameOf(r.ticker), monthsBehind: (curYear - r.through) * 12 }))
      .sort((a, b) => a.through - b.through)

    // Empresas del DICT sin fila en company_fundamentals (sin datos)
    const { data: all } = await sb.from('company_fundamentals').select('ticker').limit(5000)
    const present = new Set((all || []).map(r => r.ticker))
    const missing = DICT.filter(d => !present.has(d[1])).map(d => ({ ticker: d[1], name: d[0] }))

    return NextResponse.json({ stale, missing })
  }

  return NextResponse.json({ error: 'Acción no válida' }, { status: 400 })
}

// ── PATCH: desproteger todos los campos manuales de una empresa ─────────────
export async function PATCH(request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  let body
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Body inválido' }, { status: 400 }) }
  const ticker = (body?.ticker || '').toString().trim().toUpperCase()
  if (!ticker) return NextResponse.json({ error: 'Falta el ticker' }, { status: 400 })

  const sb = serviceClient()
  const { error } = await sb.from('company_fundamentals')
    .update({ manual_fields: {} })
    .eq('ticker', ticker)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  try {
    await sb.from('admin_logs').insert({
      event_type: 'manual_import',
      description: `Datos manuales desprotegidos para ${ticker}`,
      status: 'ok',
    })
  } catch {}
  return NextResponse.json({ ok: true, ticker })
}
