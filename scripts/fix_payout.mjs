// Anula en BD los payout_fcf absurdos (<0 o >300%) — artefactos de un FCF base
// ínfimo (p.ej. Infosys 5422%). Los consumidores (ficha, salud, score) caen a
// payout_eps. Sin yfinance. Uso: node scripts/fix_payout.mjs [--write]
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
  const { data, error } = await sb.from('company_fundamentals').select('ticker, payout_fcf').range(from, from + 999)
  if (error || !data?.length) break
  all.push(...data); if (data.length < 1000) break
}
const bad = all.filter(r => r.payout_fcf != null && (Number(r.payout_fcf) < 0 || Number(r.payout_fcf) > 300))
console.log(`Empresas: ${all.length} · payout_fcf absurdo (<0 o >300): ${bad.length}`, WRITE ? '(ESCRITURA)' : '(dry-run)')
console.log('Ejemplos:', bad.slice(0, 12).map(r => `${r.ticker}=${r.payout_fcf}`).join(' · '))

if (WRITE && bad.length) {
  let ok = 0
  for (const r of bad) {
    const { error } = await sb.from('company_fundamentals').update({ payout_fcf: null }).eq('ticker', r.ticker)
    if (!error) ok++; else console.log('ERR', r.ticker, error.message)
  }
  console.log('Filas actualizadas (payout_fcf→null):', ok)
}
