// Calcula capex_cfo_pct = CapEx / Flujo de Caja Operativo (%) medio, desde los
// estados ya guardados (sin yfinance). Para el ranking "Máquinas de Compounding".
// CFO = FCF + |CapEx| (ambos en el cashflow). Bajo = negocio poco intensivo en
// capital (no necesita reinvertir para mantenerse).
// Uso: node scripts/recalc_capex_cfo.mjs [--write] [--ticker MA]
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
const r2 = v => Math.round(v * 100) / 100

function rowOf(stmt, keys) {
  const d = stmt?.data; if (!d) return null
  for (const k of keys) if (Array.isArray(d[k])) return d[k]
  return null
}

// CapEx / CFO medio (agregado: Σ|capex| / ΣCFO). null si no hay datos.
function capexCfo(cf) {
  const capex = rowOf(cf, ['Capex', 'Capital Expenditure', 'Capital Expenditure Reported'])
  const fcf   = rowOf(cf, ['Flujo de Caja Libre', 'Free Cash Flow'])
  if (!capex || !fcf) return null
  let sumCapex = 0, sumCfo = 0
  for (let i = 0; i < Math.min(capex.length, fcf.length); i++) {
    const cap = capex[i] != null ? Math.abs(Number(capex[i])) : null
    const f   = fcf[i] != null ? Number(fcf[i]) : null
    if (cap == null || f == null) continue
    const cfo = f + cap            // CFO = FCF + CapEx
    if (cfo <= 0) continue
    sumCapex += cap; sumCfo += cfo
  }
  if (sumCfo <= 0) return null
  return r2(sumCapex / sumCfo * 100)
}

function resolveRoic(f) {
  if (f.roic_display != null) return Number(f.roic_display)
  const vals = [f.roic_reported, f.roic_tangible].filter(v => v != null).map(Number)
  return vals.length ? Math.min(...vals) : null
}

async function fetchAll() {
  const FIELDS = 'ticker, cashflow_annual, roic_display, roic_reported, roic_tangible, revenue_cagr5'
  if (TICKER) { const { data } = await sb.from('company_fundamentals').select(FIELDS).eq('ticker', TICKER); return data || [] }
  const all = []
  for (let from = 0; ; from += 500) {
    const { data, error } = await sb.from('company_fundamentals').select(FIELDS).range(from, from + 499)
    if (error || !data?.length) break
    all.push(...data); if (data.length < 500) break
  }
  return all
}

const rows = await fetchAll()
console.log('Empresas:', rows.length, WRITE ? '(MODO ESCRITURA)' : '(dry-run)')

const updates = []
const compounders = []
for (const c of rows) {
  const pct = capexCfo(c.cashflow_annual)
  if (pct == null) continue
  updates.push({ ticker: c.ticker, capex_cfo_pct: pct })
  const roic = resolveRoic(c), rev = c.revenue_cagr5 != null ? Number(c.revenue_cagr5) : null
  if (roic != null && roic >= 18 && pct <= 20 && rev != null && rev >= 4) compounders.push({ t: c.ticker, roic: r2(roic), pct, rev: r2(rev) })
}
console.log(`capex_cfo calculado: ${updates.length} de ${rows.length}`)
compounders.sort((a, b) => b.roic - a.roic)
console.log(`Máquinas de compounding (ROIC≥18 · CapEx/CFO≤20 · Rev≥4%): ${compounders.length}`)
console.log('TOP 20:', compounders.slice(0, 20).map(c => `${c.t}(roic${c.roic} cx${c.pct} rev${c.rev})`).join(' · '))

if (WRITE && updates.length) {
  let ok = 0
  for (let i = 0; i < updates.length; i += 500) {
    const chunk = updates.slice(i, i + 500)
    const { error } = await sb.from('company_fundamentals').upsert(chunk, { onConflict: 'ticker' })
    if (error) console.log('ERR upsert:', error.message); else ok += chunk.length
  }
  console.log('Filas actualizadas en BD:', ok)
}
