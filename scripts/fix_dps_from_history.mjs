// dps = dividendo del ÚLTIMO AÑO COMPLETO del histórico (misma unidad que el
// precio). Corrige los yields mal calculados por usar info.dividendRate (unidad
// distinta en las .L → ×100, o specials). Solo toca empresas que ya pagan
// (dps != null). Sin yfinance. Uso: node scripts/fix_dps_from_history.mjs [--write]
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

const all = []
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb.from('company_fundamentals').select('ticker, current_price, dps, pays_dividend, div_history').range(from, from + 999)
  if (error || !data?.length) break
  all.push(...data); if (data.length < 1000) break
}

const updates = []
for (const r of all) {
  if (r.dps == null) continue                                    // no tocar no-pagadores
  const complete = (r.div_history || []).filter(h => h && !h.isPartial && (Number(h.dps) || 0) > 0)
  if (!complete.length) continue                                 // sin año completo → dejar dividendRate
  const px = Number(r.current_price)
  const last = Number(complete[complete.length - 1].dps)
  // Special en el propio último año (yield >40%) → descartar dividendo.
  if (px > 0 && last / px * 100 > 40) {
    if (r.dps != null) updates.push({ ticker: r.ticker, fields: { dps: null, pays_dividend: false }, old: r.dps, neu: 'null' })
    continue
  }
  if (Math.abs(last - Number(r.dps)) > 1e-9) updates.push({ ticker: r.ticker, fields: { dps: last }, old: Number(r.dps), neu: last })
}
console.log(`dps recalculados desde el histórico: ${updates.length}`, WRITE ? '(ESCRITURA)' : '(dry-run)')
console.log(updates.slice(0, 25).map(u => `${u.ticker}: ${u.old}→${u.neu}`).join(' · '))

if (WRITE && updates.length) {
  let ok = 0
  for (const u of updates) {
    const { error } = await sb.from('company_fundamentals').update(u.fields).eq('ticker', u.ticker)
    if (!error) ok++; else console.log('ERR', u.ticker, error.message)
  }
  console.log('Filas actualizadas:', ok)
}
