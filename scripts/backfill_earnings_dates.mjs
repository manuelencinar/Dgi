// Rellena next_earnings_date en company_fundamentals desde el calendario de resultados
// (módulo calendarEvents), reutilizando el crumb de Yahoo. La fuente ONGOING es
// update_fundamentals.py (semanal); esto sirve para poblar YA sin esperar al run.
//
//   · Prioriza por capitalización (las más visitadas primero).
//   · Candidatas: sin fecha o con fecha ya pasada (stale). --ticker X para una.
//   · Solo escribe si obtiene fecha (no pisa con null). Fallo transitorio → se salta.
//   · Salta cotizaciones secundarias (la ficha redirige a la matriz).
//
// Uso:
//   node scripts/backfill_earnings_dates.mjs --write [--limit 400] [--ticker AAPL] [--all]
//     --limit N   máximo de consultas en esta ejecución (def. 400)
//     --all       incluye también las que ya tienen fecha futura (refresco completo)
//     --ticker X  solo esa empresa (ignora el límite)
//
// Requiere credenciales de Supabase (webapp/.env.local en local o env en CI) + el SQL
// webapp/sql/earnings_dates.sql ejecutado.
import { readFileSync } from 'fs'
import { createRequire } from 'module'
import { fetchYahooEarningsDate, getYahooCrumb } from '../webapp/lib/yahoo-estimates.js'
import { isSecondary } from '../webapp/lib/listings.js'
const require = createRequire(new URL('../webapp/package.json', import.meta.url))
const { createClient } = require('@supabase/supabase-js')

const env = { ...process.env }
try {
  readFileSync(new URL('../webapp/.env.local', import.meta.url), 'utf8').split('\n').forEach(l => {
    l = l.trim()
    if (l && !l.startsWith('#') && l.includes('=')) {
      const i = l.indexOf('='); const k = l.slice(0, i).trim()
      if (env[k] == null) env[k] = l.slice(i + 1).trim()
    }
  })
} catch {}

const SUPA_URL = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL
const SUPA_KEY = env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPA_URL || !SUPA_KEY) { console.error('Faltan credenciales de Supabase.'); process.exit(1) }

const sb = createClient(SUPA_URL, SUPA_KEY)
const WRITE = process.argv.includes('--write')
const ALL   = process.argv.includes('--all')
const argVal = (name, def) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : def }
const LIMIT = parseInt(argVal('--limit', '400'), 10)
const ONE   = argVal('--ticker', null)
const DELAY_MS = 350

const sleep = ms => new Promise(r => setTimeout(r, ms))
const today = new Date().toISOString().slice(0, 10)

async function loadAll() {
  const rows = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('company_fundamentals')
      .select('ticker, next_earnings_date, market_cap_m').range(from, from + 999)
    if (error) { console.error('Lectura:', error.message); process.exit(1) }
    if (!data?.length) break
    rows.push(...data)
    if (data.length < 1000) break
  }
  return rows
}

async function run() {
  const all = await loadAll()
  const withFuture = all.filter(r => r.next_earnings_date && r.next_earnings_date >= today).length
  console.log(`Total: ${all.length} · con fecha futura: ${withFuture}`)

  let candidates = all
    .filter(r => !isSecondary(r.ticker))
    .filter(r => ONE ? r.ticker === ONE
      : (ALL || !r.next_earnings_date || r.next_earnings_date < today))
  candidates.sort((a, b) => (Number(b.market_cap_m) || 0) - (Number(a.market_cap_m) || 0))
  if (!ONE) candidates = candidates.slice(0, LIMIT)
  console.log(`Candidatas: ${candidates.length}${WRITE ? '' : '  [dry-run]'}\n`)

  let creds = null
  try { creds = await getYahooCrumb() } catch { console.error('No se pudo obtener el crumb de Yahoo.'); process.exit(1) }

  let ok = 0, none = 0
  for (const r of candidates) {
    const t = r.ticker
    let d = null
    try { d = await fetchYahooEarningsDate(t, creds) } catch {}
    if (d) {
      ok++
      if (WRITE) {
        const { error } = await sb.from('company_fundamentals').upsert({ ticker: t, next_earnings_date: d }, { onConflict: 'ticker' })
        if (error) console.error(`  upsert ${t}:`, error.message)
      }
      console.log(`  ${t.padEnd(12)} ${d}`)
    } else {
      none++
    }
    await sleep(DELAY_MS)
  }
  console.log(`\nResultado: con fecha=${ok} · sin fecha=${none}${WRITE ? '' : '  [dry-run, usa --write]'}`)
}
run()
