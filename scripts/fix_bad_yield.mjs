// Corrige yields absurdos (>40%) por dps artefacto (special dividend, error de
// Yahoo, precio en céntimos). Intenta el dps del último año COMPLETO; si sigue
// siendo absurdo, anula el dividendo (dps=null, pays_dividend=false). Sin yfinance.
// Uso: node scripts/fix_bad_yield.mjs [--write]
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
  const { data, error } = await sb.from('company_fundamentals').select('ticker, current_price, dps, div_history').range(from, from + 999)
  if (error || !data?.length) break
  all.push(...data); if (data.length < 1000) break
}

const updates = []
for (const r of all) {
  const px = Number(r.current_price), dps = r.dps != null ? Number(r.dps) : null
  if (dps == null || !(px > 0)) continue
  if (dps / px * 100 <= 40) continue                     // yield razonable
  const complete = (r.div_history || []).filter(h => h && !h.isPartial && (Number(h.dps) || 0) > 0)
  const alt = complete.length ? Number(complete[complete.length - 1].dps) : null
  if (alt != null && alt / px * 100 <= 40) updates.push({ ticker: r.ticker, dps: alt, old: dps })
  else updates.push({ ticker: r.ticker, dps: null, pays_dividend: false, old: dps })
}
console.log(`Yields absurdos (>40%): ${updates.length}`, WRITE ? '(ESCRITURA)' : '(dry-run)')
console.log(updates.slice(0, 15).map(u => `${u.ticker}: ${u.old}→${u.dps}`).join(' · '))

if (WRITE && updates.length) {
  let ok = 0
  for (const u of updates) {
    const fields = u.dps === null ? { dps: null, pays_dividend: false } : { dps: u.dps }
    const { error } = await sb.from('company_fundamentals').update(fields).eq('ticker', u.ticker)
    if (!error) ok++; else console.log('ERR', u.ticker, error.message)
  }
  console.log('Filas actualizadas:', ok)
}
