// Calcula la reducción de acciones en circulación desde el año base (~2022) a
// partir de los estados ya guardados en BD (sin yfinance). Para el ranking de
// "Caníbales de acciones". % positivo = ha reducido acciones (recompra neta).
//   shares_reduced_pct  = (acciones_base − acciones_ultimas) / acciones_base * 100
//   shares_base_year    = año más antiguo usado (≈ 2022)
// Uso: node scripts/recalc_shares.mjs [--write] [--ticker AAPL]
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
const yearOf = c => parseInt(String(c).slice(0, 4), 10)

// Serie de acciones preferida: diluidas medias > básicas medias > ordinarias (balance).
function sharesSeries(isStmt, bsStmt) {
  const pick = (stmt, key) => {
    const d = stmt?.data, cols = stmt?.columns
    if (!d || !Array.isArray(cols) || !Array.isArray(d[key])) return null
    return cols.map((c, i) => ({ year: yearOf(c), v: d[key][i] != null ? Number(d[key][i]) : null }))
              .filter(p => Number.isFinite(p.year) && p.v != null && p.v > 0)
  }
  return pick(isStmt, 'Diluted Average Shares')
      || pick(isStmt, 'Basic Average Shares')
      || pick(bsStmt, 'Ordinary Shares Number')
      || pick(bsStmt, 'Share Issued')
      || null
}

function computeReduction(isStmt, bsStmt) {
  const s = sharesSeries(isStmt, bsStmt)
  if (!s || s.length < 2) return null
  s.sort((a, b) => a.year - b.year)            // ascendente
  const base = s[0], latest = s[s.length - 1]
  if (!(base.v > 0) || !(latest.v > 0)) return null
  const curYear = new Date().getFullYear()
  if (latest.year < curYear - 2) return null   // dato demasiado viejo
  if (base.year < 2019) return null            // ventana coherente (~desde 2022)
  const pct = (base.v - latest.v) / base.v * 100   // + = reducción
  // |>50%| en ~4 años no es recompra real: split, contrasplit o cambio de unidad.
  if (pct > 50 || pct < -100) return null
  return { pct: r2(pct), baseYear: base.year }
}

async function fetchAll() {
  const FIELDS = 'ticker, income_statement_annual, balance_sheet_annual'
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
let computed = 0
const SAMPLE = new Set(['AAPL', 'AZO', 'NVR', 'ORLY', 'MA', 'V', 'TEF.MC', 'BATS.L'])
for (const c of rows) {
  const res = computeReduction(c.income_statement_annual, c.balance_sheet_annual)
  if (!res) continue
  computed++
  updates.push({ ticker: c.ticker, shares_reduced_pct: res.pct, shares_base_year: res.baseYear })
  if (SAMPLE.has(c.ticker)) console.log(`  ${c.ticker}: ${res.pct}% desde ${res.baseYear}`)
}
console.log(`Calculados: ${computed} de ${rows.length}`)
// Top 15 caníbales
const top = [...updates].sort((a, b) => b.shares_reduced_pct - a.shares_reduced_pct).slice(0, 15)
console.log('TOP 15 caníbales:', top.map(t => `${t.ticker} ${t.shares_reduced_pct}%`).join(' · '))

if (WRITE && updates.length) {
  let ok = 0
  for (let i = 0; i < updates.length; i += 500) {
    const chunk = updates.slice(i, i + 500)
    const { error } = await sb.from('company_fundamentals').upsert(chunk, { onConflict: 'ticker' })
    if (error) console.log('ERR upsert:', error.message); else ok += chunk.length
  }
  console.log('Filas actualizadas en BD:', ok)
}
