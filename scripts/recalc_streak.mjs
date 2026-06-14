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

function computeStreak(divHistory) {
  const full = (divHistory || []).filter(h => h && h.year < CUR_YEAR && h.growth != null)
                                 .sort((a, b) => a.year - b.year)
  let s = 0
  for (let i = full.length - 1; i >= 0; i--) { if (Number(full[i].growth) > 0) s++; else break }
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
