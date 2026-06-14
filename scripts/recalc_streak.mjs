// Recalcula div_streak en BD desde el div_history ya guardado (sin yfinance).
// Una racha DGI solo cuenta INCREMENTOS reales (growth > 0): un dividendo
// congelado (growth == 0) o recortado la rompe. Antes se contaba growth >= 0,
// inflando la racha de empresas con el dividendo estancado (p.ej. Telefónica).
// Uso: node scripts/recalc_streak.mjs [--write] [--ticker TEF.MC]
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
const TICKER = (() => { const i = process.argv.indexOf('--ticker'); return i >= 0 ? process.argv[i + 1] : null })()
const CUR_YEAR = new Date().getFullYear()

// Racha robusta a los artefactos de agrupar dividendos por año natural (pico+caída
// de timing). Tolera una caída puntual si sigue por encima del nivel de hace 2
// años y el año previo fue un pico; un congelamiento/recorte sostenido sí rompe.
function computeStreak(divHistory) {
  const full = (divHistory || [])
    .filter(h => h && !h.isPartial && h.year < CUR_YEAR && (Number(h.dps) || 0) > 0)
    .sort((a, b) => a.year - b.year)
  const n = full.length
  if (n < 2) return 0
  const dps = full.map(h => Number(h.dps))
  let s = 0
  for (let i = n - 1; i >= 1; i--) {
    const cur = dps[i], prev = dps[i - 1]
    const prev2 = i >= 2 ? dps[i - 2] : null
    const rec1 = i + 1 <= n - 1 ? dps[i + 1] : null
    const rec2 = i + 2 <= n - 1 ? dps[i + 2] : null
    const increased = cur > prev * 1.001
    const spikeNorm = prev2 != null && cur >= prev2 && prev > prev2 * 1.001          // pico→normalización (KO)
    const recovered = (rec1 != null && rec1 > prev * 1.001) || (rec2 != null && rec2 > prev * 1.001) // caída que recupera ≤2a (O)
    if (increased || spikeNorm || recovered) s++
    else break
  }
  return s
}

async function fetchAll() {
  if (TICKER) {
    const { data } = await sb.from('company_fundamentals').select('ticker, div_streak, div_history').eq('ticker', TICKER)
    return data || []
  }
  const all = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('company_fundamentals').select('ticker, div_streak, div_history').range(from, from + 999)
    if (error || !data?.length) break
    all.push(...data); if (data.length < 1000) break
  }
  return all
}

const rows = await fetchAll()
console.log('Empresas:', rows.length, WRITE ? '(MODO ESCRITURA)' : '(dry-run)')

const updates = []
let changed = 0
for (const c of rows) {
  if (!Array.isArray(c.div_history)) continue
  const ns = computeStreak(c.div_history)
  const old = c.div_streak ?? 0
  if (ns !== old) {
    changed++
    updates.push({ ticker: c.ticker, div_streak: ns })
    if (['TEF.MC', 'KO', 'JNJ', 'T', 'VOD.L', 'BAYN.DE', 'INTC'].includes(c.ticker)) console.log(`  ${c.ticker}: ${old} → ${ns}`)
  }
}
console.log(`Rachas que cambian: ${changed} de ${rows.length}`)

if (WRITE && updates.length) {
  let ok = 0
  for (let i = 0; i < updates.length; i += 500) {
    const chunk = updates.slice(i, i + 500)
    const { error } = await sb.from('company_fundamentals').upsert(chunk, { onConflict: 'ticker' })
    if (error) console.log('ERR upsert:', error.message)
    else ok += chunk.length
  }
  console.log('Filas actualizadas en BD:', ok)
}
