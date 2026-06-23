// Calcula payout_affo (REITs) y payout_nii (BDC) en company_fundamentals desde los
// estados ya guardados (sin yfinance), reutilizando la MISMA lógica de AFFO que el
// resto de la app (lib/reit-metrics.buildReitMetrics) → sin riesgo de divergencia.
//   REIT: payout_affo = dividendo / AFFO (AFFO = FFO − NOI×maint%, maint% por sub-tipo
//         con override manual en reit_manual).
//   BDC:  payout_nii  = dividendo / NII (NII ≈ ingresos de inversión − gastos operativos).
// Uso: node scripts/recalc_payout_affo_nii.mjs [--write] [--ticker MAIN]
import { readFileSync } from 'fs'
import { createRequire } from 'module'
import { buildReitMetrics } from '../webapp/lib/reit-metrics.js'
import { DICT } from '../webapp/data/dict.js'
const require = createRequire(new URL('../webapp/package.json', import.meta.url))
const { createClient } = require('@supabase/supabase-js')

const env = {}
readFileSync(new URL('../webapp/.env.local', import.meta.url), 'utf8').split('\n').forEach(l => {
  l = l.trim(); if (l && !l.startsWith('#') && l.includes('=')) { const i = l.indexOf('='); env[l.slice(0, i).trim()] = l.slice(i + 1).trim() }
})
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const WRITE = process.argv.includes('--write')
const TICKER = (() => { const i = process.argv.indexOf('--ticker'); return i >= 0 ? process.argv[i + 1] : null })()
const typeOf = Object.fromEntries(DICT.map(d => [d[1], d[6]]))

function readRow(stmt, ...labels) {
  const d = stmt?.data, cols = stmt?.columns
  if (!d || !Array.isArray(cols)) return {}
  let arr = null
  for (const l of labels) { if (Array.isArray(d[l])) { arr = d[l]; break } }
  if (!arr) return {}
  const out = {}
  cols.forEach((c, i) => { const y = parseInt(String(c).slice(0, 4), 10); const v = arr[i]; if (!isNaN(y) && v != null && !isNaN(v)) out[y] = Number(v) })
  return out
}
const lastVal = m => { const ys = Object.keys(m).map(Number).filter(y => !isNaN(y)).sort((a, b) => b - a); return ys.length ? m[ys[0]] : null }

// NII ≈ ingresos de inversión − gastos operativos (último año). Excluye plusvalías
// valorativas (que sí están en el beneficio neto y distorsionan el payout sobre EPS).
function computePayoutNii(row) {
  const is = row.income_statement_annual
  const opRev = lastVal(readRow(is, 'Operating Revenue', 'Total Revenue', 'Ingresos Totales'))
  const opExp = lastVal(readRow(is, 'Operating Expense'))
  const shares = lastVal(readRow(is, 'Diluted Average Shares', 'Basic Average Shares'))
  const dps = row.dps != null ? Number(row.dps) : null
  if (opRev == null || opExp == null || !(shares > 0) || dps == null) return null
  const nii = opRev - opExp
  if (!(nii > 0)) return null
  return dps * shares / nii * 100
}

async function run() {
  // Conjunto objetivo: REITs/BDC del DICT + cualquier sector Real Estate.
  const sectorOf = {}
  for (let from = 0; ; from += 1000) {
    const { data } = await sb.from('company_fundamentals').select('ticker, sector').range(from, from + 999)
    if (!data?.length) break
    data.forEach(r => { sectorOf[r.ticker] = r.sector })
    if (data.length < 1000) break
  }
  let targets = new Set()
  for (const d of DICT) { const t = d[6]; if (t === 'reit' || t === 'bdc') targets.add(d[1]) }
  for (const [tk, s] of Object.entries(sectorOf)) if (s === 'Real Estate') targets.add(tk)
  let list = [...targets]
  if (TICKER) list = list.filter(t => t === TICKER)

  const { data: manualRows } = await sb.from('reit_manual').select('*')
  const manualMap = Object.fromEntries((manualRows || []).map(r => [r.ticker, r]))

  const updates = []
  for (let i = 0; i < list.length; i += 120) {
    const batch = list.slice(i, i + 120)
    const { data } = await sb.from('company_fundamentals')
      .select('ticker, sector, industry, dps, current_price, income_statement_annual, cashflow_annual, balance_sheet_annual')
      .in('ticker', batch)
    for (const row of data || []) {
      const type = typeOf[row.ticker]
      const upd = { ticker: row.ticker }
      let touched = false
      if (type === 'bdc') {
        upd.payout_nii = round2(computePayoutNii(row)); touched = true
      } else if (type === 'reit' || row.sector === 'Real Estate') {
        const m = buildReitMetrics({ ...row, type }, manualMap[row.ticker] || null)
        upd.payout_affo = round2(m?.payoutAffo ?? null); touched = true
      }
      if (touched) updates.push(upd)
    }
  }

  // Muestra de validación
  const show = ['MAIN', 'ARCC', 'ORCC', 'HTGC', 'O', 'VICI', 'WPC', 'PLD', 'SPG']
  console.log('Muestra:')
  for (const u of updates.filter(u => show.includes(u.ticker)))
    console.log(`  ${u.ticker.padEnd(6)} payout_affo=${u.payout_affo ?? '—'}  payout_nii=${u.payout_nii ?? '—'}`)
  const okAffo = updates.filter(u => u.payout_affo != null).length
  const okNii = updates.filter(u => u.payout_nii != null).length
  console.log(`\nObjetivo: ${list.length} · con payout_affo: ${okAffo} · con payout_nii: ${okNii}`)

  if (WRITE) {
    for (let i = 0; i < updates.length; i += 200) {
      const { error } = await sb.from('company_fundamentals').upsert(updates.slice(i, i + 200), { onConflict: 'ticker' })
      if (error) console.error('upsert:', error.message)
    }
    console.log(`Escritas ${updates.length} filas.`)
  } else {
    console.log('[dry-run] usa --write para persistir.')
  }
}
const round2 = v => v == null ? null : Math.round(v * 100) / 100
run()
