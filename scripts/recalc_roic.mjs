// Recalcula roic_reported / roic_tangible desde los estados financieros ya
// guardados en Supabase (sin yfinance). Misma fórmula que lib/metrics.js.
// Uso: node scripts/recalc_roic.mjs [--write] [--ticker EDEN.PA]
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
const TICKER_ARG = (() => { const i = process.argv.indexOf('--ticker'); return i >= 0 ? process.argv[i + 1] : null })()

function row(stmt, names, idx = 0) {
  if (!stmt) return null
  for (const nm of names) { const v = stmt[nm]; if (Array.isArray(v) && v[idx] != null) return Number(v[idx]); if (v != null && !Array.isArray(v) && idx === 0) return Number(v) }
  return null
}
function curOf(ticker) {
  if (!ticker.includes('.')) return 'USD'
  const s = ticker.split('.').pop()
  const EUR = ['PA', 'AS', 'DE', 'MC', 'MI', 'BR', 'LS', 'VI', 'IR', 'HE']
  if (EUR.includes(s)) return 'EUR'
  if (s === 'L') return 'GBP'; if (s === 'SW') return 'CHF'
  if (['ST', 'CO', 'OL'].includes(s)) return 'EUR'
  return 'USD'
}
const EBIT   = ['EBIT / Bº Operativo', 'Operating Income', 'Ebit', 'EBIT', 'Bº Operativo']
const TA     = ['Activos Totales', 'Total Assets']
const TAXP   = ['Tax Provision', 'Income Tax Expense', 'Provisión Impuestos']
const PRETAX = ['Pretax Income', 'Income Before Tax', 'Bº Antes de Impuestos']
const CASH   = ['Caja y Equivalentes', 'Cash And Cash Equivalents', 'Cash Equivalents', 'Cash Financial', 'Cash Cash Equivalents And Short Term Investments']
const EQUITY = ['Patrimonio Neto', 'Stockholders Equity', 'Total Equity Gross Minority Interest', 'Common Stock Equity', 'Total Equity']
const DEBT   = ['Deuda Total', 'Total Debt']
const DEBT_LP = ['Deuda a L/P', 'Long Term Debt', 'Long Term Debt And Capital Lease Obligation']
const DEBT_CP = ['Current Debt', 'Deuda a C/P', 'Current Debt And Capital Lease Obligation', 'Short Long Term Debt']
const GW     = ['Fondo de Comercio', 'Goodwill']
const INT    = ['Other Intangible Assets', 'Otros Intangibles']
const GWINT  = ['Fondo de Comercio e Intangibles', 'Goodwill And Other Intangible Assets']

// Promedio de los dos últimos ejercicios (idx 0 y 1) para suavizar el balance
function val2(stmt, names) {
  const v0 = row(stmt, names, 0)
  if (v0 == null) return null
  const v1 = row(stmt, names, 1)
  return v1 != null ? (v0 + v1) / 2 : v0
}

// ROIC = NOPAT / (Deuda financiera + Patrimonio neto − Caja), capital invertido medio
function compute(c) {
  const is = c.income_statement_annual?.data || c.income_statement_annual || null
  const bs = c.balance_sheet_annual?.data || c.balance_sheet_annual || null
  const i = (c.industry || '').toLowerCase()
  if (i.includes('bank') || i.includes('savings') || i.includes('insur') || i.includes('reit') || i.includes('real estate investment'))
    return { na: true }
  if (!is || !bs) return null
  const ebit = row(is, EBIT); if (ebit == null) return null
  const ta = row(bs, TA); if (ta == null || ta <= 0) return null
  const cur = curOf(c.ticker)
  const defTax = cur === 'USD' ? 0.21 : cur === 'EUR' ? 0.25 : 0.23
  const tp = row(is, TAXP), pt = row(is, PRETAX)
  let tax = (tp != null && pt != null && pt > 0) ? tp / pt : defTax
  if (tax < 0 || tax > 0.50) tax = defTax
  const nopat = ebit * (1 - tax)

  const equity = val2(bs, EQUITY)
  if (equity == null) return null
  // Deuda financiera: total directo, o suma de largo + corto plazo
  let debt = val2(bs, DEBT)
  if (debt == null) { const lp = val2(bs, DEBT_LP) || 0, cp = val2(bs, DEBT_CP) || 0; debt = lp + cp }

  // Capital empleado = Deuda total + Patrimonio neto (sin restar caja: no
  // distorsiona los negocios que acumulan mucho efectivo)
  let invested = equity + debt
  if (invested <= 0) return { na: false, neg: true, nopat, invested, tax }
  const floor = 0.10 * ta
  if (invested < floor) invested = floor
  const roicR = nopat / invested * 100

  // Variante tangible: descuenta goodwill e intangibles del capital
  let gw = val2(bs, GW), intang = val2(bs, INT)
  if (gw == null && intang == null) { gw = val2(bs, GWINT) || 0; intang = 0 }
  gw = gw || 0; intang = intang || 0
  let ict = invested - gw - intang; if (ict < floor) ict = floor
  const roicT = nopat / ict * 100
  const warn = (roicR > 60 || roicT > 60)
  return {
    na: false, roic_reported: r1(roicR), roic_tangible: r1(roicT), roic_warning: warn,
    nopat: Math.round(nopat), invested_capital: Math.round(invested), invested_capital_tangible: Math.round(ict),
    tax_rate_effective: Math.round(tax * 1000) / 1000,
  }
}
const r1 = v => Math.round(v * 10) / 10

async function fetchAll() {
  if (TICKER_ARG) {
    const { data } = await sb.from('company_fundamentals').select('ticker, sector, industry, income_statement_annual, balance_sheet_annual').eq('ticker', TICKER_ARG)
    return data || []
  }
  const all = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('company_fundamentals').select('ticker, sector, industry, income_statement_annual, balance_sheet_annual').range(from, from + 999)
    if (error || !data?.length) break
    all.push(...data); if (data.length < 1000) break
  }
  return all
}

const rows = await fetchAll()
console.log('Empresas:', rows.length, WRITE ? '(MODO ESCRITURA)' : '(dry-run)')
let updated = 0, na = 0, nulled = 0
const updates = []
for (const c of rows) {
  const res = compute(c)
  if (res == null) { nulled++; continue }
  if (res.na) { na++; updates.push({ ticker: c.ticker, roic_reported: null, roic_tangible: null, roic_warning: false }); continue }
  if (res.neg) { updates.push({ ticker: c.ticker, roic_reported: null, roic_tangible: null, roic_warning: false, nopat: Math.round(res.nopat), invested_capital: Math.round(res.invested), tax_rate_effective: res.tax }); continue }
  updates.push({ ticker: c.ticker, roic_reported: res.roic_reported, roic_tangible: res.roic_tangible, roic_warning: res.roic_warning, nopat: res.nopat, invested_capital: res.invested_capital, invested_capital_tangible: res.invested_capital_tangible, tax_rate_effective: res.tax_rate_effective })
  updated++
  if (['EDEN.PA', 'MA', 'ADP', 'CL', 'MUV2.DE', 'KO', 'JNJ', 'SNA'].includes(c.ticker)) {
    const disp = Math.min(...[res.roic_reported, res.roic_tangible].filter(v => v != null))
    console.log(`  ${c.ticker}: display(min)=${disp}% (reported=${res.roic_reported}% tangible=${res.roic_tangible}%)`)
  }
}
console.log(`Calculados: ${updated} | N/A (banca/REIT): ${na} | sin estados: ${nulled}`)

if (WRITE) {
  let ok = 0
  for (const u of updates) {
    const { ticker, ...fields } = u
    const { error } = await sb.from('company_fundamentals').update(fields).eq('ticker', ticker)
    if (!error) ok++
    else console.log('ERR', ticker, error.message)
  }
  console.log('Filas actualizadas en BD:', ok)
}
