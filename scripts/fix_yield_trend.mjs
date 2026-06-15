// Reconcilia el dps cuando dividendRate rompe la trayectoria reciente del
// dividendo (special/artefacto de timing → yield sobreestimado, p.ej. Ageas
// 4,5 vs 3,5 real). Usa el dividendo del último año COMPLETO. Preserva los
// crecientes legítimos. Sin yfinance. Uso: node scripts/fix_yield_trend.mjs [--write]
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

// Misma lógica que update_fundamentals.py (compute dps trend reconciliation).
function reconciled(dps, divHistory) {
  const comp = (divHistory || []).filter(h => h && !h.isPartial && (Number(h.dps) || 0) > 0).map(h => Number(h.dps))
  if (comp.length < 2 || !(dps > comp[comp.length - 1])) return null
  const last = comp[comp.length - 1]
  const win = comp.slice(-4)
  const first = win[0], yrs = win.length - 1
  let cagr = (first > 0 && yrs > 0) ? Math.pow(last / first, 1 / yrs) - 1 : 0
  cagr = Math.max(Math.min(cagr, 1.0), 0.05)
  return dps > last * (1 + cagr) * 1.20 ? last : null
}

const all = []
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb.from('company_fundamentals').select('ticker, current_price, dps, div_history').range(from, from + 999)
  if (error || !data?.length) break
  all.push(...data); if (data.length < 1000) break
}

const updates = []
for (const r of all) {
  if (r.dps == null) continue
  const nd = reconciled(Number(r.dps), r.div_history)
  if (nd != null && Math.abs(nd - Number(r.dps)) > 1e-9) updates.push({ ticker: r.ticker, dps: nd, old: Number(r.dps) })
}
console.log(`Reconciliadas (special/artefacto): ${updates.length}`, WRITE ? '(ESCRITURA)' : '(dry-run)')
console.log(updates.slice(0, 20).map(u => `${u.ticker}: ${u.old}→${u.dps}`).join(' · '))

if (WRITE && updates.length) {
  let ok = 0
  for (const u of updates) {
    const { error } = await sb.from('company_fundamentals').update({ dps: u.dps }).eq('ticker', u.ticker)
    if (!error) ok++; else console.log('ERR', u.ticker, error.message)
  }
  console.log('Filas actualizadas:', ok)
}
