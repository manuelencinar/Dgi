// Precarga las estimaciones de analistas (consenso de FMP) en company_fundamentals,
// por lotes, respetando el límite diario de la API. Pensado para correr a diario:
// con ~200 llamadas/día cubre toda la app (~2000 empresas) en ~10 días.
//
//   · Prioriza por capitalización (las más visitadas primero).
//   · FMP cubre EE.UU.; si no da datos (no-US/402), FALLBACK a Yahoo earningsTrend
//     (cubre muchas empresas no-US). Crumb de Yahoo compartido para todo el lote.
//   · Marca analyst_estimates_status='ok' (con datos, de FMP o Yahoo) | 'none' (sin cobertura).
//     Las 'none' NO se vuelven a consultar salvo --recheck. Para backfillear las no-US
//     marcadas 'none' por runs FMP-only anteriores → corre una vez con --recheck.
//   · Un fallo transitorio (red / HTTP no-200) NO marca nada → se reintenta otro día.
//   · Salta cotizaciones secundarias (la ficha redirige a la matriz).
//
// Uso:
//   node scripts/fetch_analyst_estimates.mjs --write [--limit 200] [--ticker AAPL] [--recheck]
//     --limit N    máximo de llamadas a FMP en esta ejecución (def. 200)
//     --recheck    reconsulta también las marcadas 'none' (por si FMP añadió cobertura)
//     --ticker X   solo esa empresa (ignora el límite)
//
// Requiere FMP_API_KEY + credenciales de Supabase (de webapp/.env.local en local,
// o de variables de entorno en CI). Necesita el SQL webapp/sql/analyst_estimates.sql.
import { readFileSync } from 'fs'
import { createRequire } from 'module'
import { toFmpSymbol, fetchFmpEstimatesResult } from '../webapp/lib/analyst-estimates.js'
import { fetchYahooEstimates, getYahooCrumb } from '../webapp/lib/yahoo-estimates.js'
import { isSecondary } from '../webapp/lib/listings.js'
const require = createRequire(new URL('../webapp/package.json', import.meta.url))
const { createClient } = require('@supabase/supabase-js')

// Env: variables de entorno (CI) con respaldo en webapp/.env.local (local).
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
if (!SUPA_URL || !SUPA_KEY) { console.error('Faltan credenciales de Supabase (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).'); process.exit(1) }
if (!env.FMP_API_KEY) { console.error('Falta FMP_API_KEY.'); process.exit(1) }
process.env.FMP_API_KEY = env.FMP_API_KEY   // fetchFmpEstimatesResult la lee de process.env

const sb = createClient(SUPA_URL, SUPA_KEY)

const WRITE   = process.argv.includes('--write')
const RECHECK = process.argv.includes('--recheck')
const argVal  = (name, def) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : def }
const LIMIT   = parseInt(argVal('--limit', '200'), 10)
const ONE     = argVal('--ticker', null)
const DELAY_MS = 400   // pausa entre llamadas (respeta el rate-limit por minuto de FMP)

const sleep = ms => new Promise(r => setTimeout(r, ms))

async function loadAll() {
  const rows = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('company_fundamentals')
      .select('ticker, analyst_estimates_status, market_cap_m').range(from, from + 999)
    if (error) { console.error('Lectura:', error.message); process.exit(1) }
    if (!data?.length) break
    rows.push(...data)
    if (data.length < 1000) break
  }
  return rows
}

async function run() {
  const all = await loadAll()
  const covered = all.filter(r => r.analyst_estimates_status === 'ok').length
  const none    = all.filter(r => r.analyst_estimates_status === 'none').length
  const pending = all.length - covered - none
  console.log(`Total empresas: ${all.length} · cubiertas: ${covered} · sin cobertura: ${none} · pendientes: ${pending}`)

  let candidates = all
    .filter(r => !isSecondary(r.ticker))
    .filter(r => ONE
      ? r.ticker === ONE
      : (r.analyst_estimates_status == null || (RECHECK && r.analyst_estimates_status === 'none')))
  candidates.sort((a, b) => (Number(b.market_cap_m) || 0) - (Number(a.market_cap_m) || 0))
  if (!ONE) candidates = candidates.slice(0, LIMIT)

  console.log(`Candidatas esta ejecución: ${candidates.length}${WRITE ? '' : '  [dry-run]'}\n`)

  // Crumb de Yahoo compartido para todo el lote (fallback de las no-US que FMP no cubre).
  let yCreds = null
  try { yCreds = await getYahooCrumb() } catch { console.log('  (aviso: no se pudo obtener crumb de Yahoo; sin fallback)') }

  let ok = 0, okY = 0, noneNew = 0, fail = 0
  for (const r of candidates) {
    const t = r.ticker
    const { status, rows } = await fetchFmpEstimatesResult(toFmpSymbol(t))

    // Fallo transitorio (red, 429, 5xx): no se persiste → se reintenta otro día.
    if (status === 'error') {
      fail++
      console.log(`  ${t.padEnd(12)} fallo transitorio → se reintentará otro día`)
      await sleep(DELAY_MS)
      continue
    }

    // FMP da datos (US). Si no (no-US/402 o vacío), probamos Yahoo earningsTrend.
    let finalRows = (status === 'ok' && rows && rows.length > 0) ? rows : null
    let src = finalRows ? 'fmp' : null
    if (!finalRows && yCreds) {
      const y = await fetchYahooEstimates(t, yCreds).catch(() => null)
      if (y && y.length) { finalRows = y; src = 'yahoo' }
    }

    const hasData = !!(finalRows && finalRows.length)
    const upd = {
      ticker: t,
      analyst_estimates: hasData ? finalRows : null,
      analyst_estimates_status: hasData ? 'ok' : 'none',
      analyst_estimates_at: new Date().toISOString(),
    }
    if (hasData) { ok++; if (src === 'yahoo') okY++ } else noneNew++
    if (WRITE) {
      const { error } = await sb.from('company_fundamentals').upsert(upd, { onConflict: 'ticker' })
      if (error) console.error(`  upsert ${t}:`, error.message)
    }
    console.log(`  ${t.padEnd(12)} ${hasData ? `ok (${finalRows.length} años · ${src})` : `sin cobertura → none`}`)
    await sleep(DELAY_MS)
  }

  console.log(`\nResultado: ok=${ok} (${okY} vía Yahoo) · sin-cobertura=${noneNew} · fallos=${fail}${WRITE ? '' : '  [dry-run, usa --write]'}`)
}
run()
