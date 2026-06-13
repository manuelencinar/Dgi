// Corrige el "yield falso" de empresas que dejaron de repartir dividendo.
// Una empresa que no repartió el año anterior NI en el año en curso (según su
// div_history ya guardado) se marca como que NO reparte: dps=null,
// pays_dividend=false. No usa yfinance — trabaja sobre los datos ya en BD.
// Uso (desde la raíz del repo): node scripts/fix_stale_dividends.mjs [--write]
import { readFileSync } from 'fs'
import { createRequire } from 'module'
const require = createRequire(new URL('../webapp/package.json', import.meta.url))
const { createClient } = require('@supabase/supabase-js')

const env = {}
readFileSync(new URL('../webapp/.env.local', import.meta.url), 'utf8').split('\n').forEach(l => {
  l = l.trim(); if (l && !l.startsWith('#') && l.includes('=')) { const i = l.indexOf('='); env[l.slice(0, i).trim()] = l.slice(i + 1).trim() }
})
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const WRITE = process.argv.includes('--write')
const CUR = new Date().getFullYear()

function lastDivYear(dh) {
  if (!Array.isArray(dh)) return null
  let y = null
  for (const h of dh) if (h && Number(h.dps) > 0 && h.year != null && (y == null || h.year > y)) y = h.year
  return y
}

const all = []
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb.from('company_fundamentals').select('ticker, div_history, dps, pays_dividend').range(from, from + 999)
  if (error) { console.error('Error leyendo:', error.message); process.exit(1) }
  if (!data?.length) break
  all.push(...data)
  if (data.length < 1000) break
}

const targets = []
for (const f of all) {
  if (!Array.isArray(f.div_history) || f.div_history.length === 0) continue   // sin histórico → no tocar
  const ly = lastDivYear(f.div_history)
  const stale = ly == null || ly < CUR - 1
  if (stale && Number(f.dps) > 0) targets.push({ ticker: f.ticker, lastDivYear: ly, dps: f.dps })
}

console.log(`Empresas totales: ${all.length}`)
console.log(`Con dividendo obsoleto y dps>0 (yield falso): ${targets.length}`)
console.log(targets.slice(0, 20).map(t => `  ${t.ticker} (último ${t.lastDivYear}, dps ${t.dps})`).join('\n'))

if (!WRITE) { console.log('\n[dry-run] No se ha escrito nada. Añade --write para persistir.'); process.exit(0) }

let ok = 0, fail = 0
const nowIso = new Date().toISOString()
for (const t of targets) {
  const { error } = await sb.from('company_fundamentals')
    .update({ dps: null, pays_dividend: false, no_dividend_confirmed_at: nowIso })
    .eq('ticker', t.ticker)
  if (error) { fail++; console.error(`  ✗ ${t.ticker}: ${error.message}`) } else ok++
}
console.log(`\nActualizadas: ${ok}  ·  Fallidas: ${fail}`)
