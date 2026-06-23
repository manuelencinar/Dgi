// Backfill de last_report_period / last_report_date desde los estados trimestrales
// ya guardados (sin yfinance). Pobla la señal de "resultados recientes" de Novedades
// de inmediato; los runs semanales luego la refinan por detección de trimestre nuevo.
// last_report_date inicial = estimación (cierre de trimestre + ~35 días, tope hoy).
// Uso: node scripts/backfill_report_dates.mjs [--write] [--ticker AAPL]
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
const todayISO = new Date().toISOString().slice(0, 10)

function estReportDate(period) {
  const d = new Date(period + 'T00:00:00Z')
  if (isNaN(d)) return todayISO
  d.setUTCDate(d.getUTCDate() + 35)
  const est = d.toISOString().slice(0, 10)
  return est > todayISO ? todayISO : est
}

async function run() {
  let from = 0, total = 0, updated = 0
  for (;;) {
    let q = sb.from('company_fundamentals').select('ticker, income_statement_quarterly, last_report_period')
    if (TICKER) q = q.eq('ticker', TICKER)
    const { data, error } = await q.range(from, from + 499)
    if (error) { console.error(error.message); break }
    if (!data?.length) break
    const updates = []
    for (const r of data) {
      total++
      const cols = r.income_statement_quarterly?.columns
      const period = Array.isArray(cols) && cols.length ? cols[0] : null
      if (!period) continue
      if (r.last_report_period === period) continue   // ya está bien → preservar
      updates.push({ ticker: r.ticker, last_report_period: period, last_report_date: estReportDate(period) })
    }
    if (updates.length) {
      updated += updates.length
      if (WRITE) {
        for (let i = 0; i < updates.length; i += 200) {
          const { error: e } = await sb.from('company_fundamentals').upsert(updates.slice(i, i + 200), { onConflict: 'ticker' })
          if (e) console.error('upsert:', e.message)
        }
      }
    }
    if (data.length < 500 || TICKER) break
    from += 500
  }
  console.log(`${WRITE ? 'Escritas' : '[dry-run] a escribir'}: ${updated} / ${total} revisadas`)
}
run()
