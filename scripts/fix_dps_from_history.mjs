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
  const { data, error } = await sb.from('company_fundamentals').select('ticker, current_price, dps, div_cagr5, pays_dividend, div_history').range(from, from + 999)
  if (error || !data?.length) break
  all.push(...data); if (data.length < 1000) break
}

// CAGR del dividendo (%) sobre una serie de entradas {dps}; misma fórmula que el pipeline.
function cagr5(entries) {
  if (entries.length < 2) return null
  const n = Math.min(5, entries.length - 1)
  const v0 = Number(entries[entries.length - 1 - n].dps), vn = Number(entries[entries.length - 1].dps)
  if (!(v0 > 0)) return null
  const r = (Math.pow(vn / v0, 1 / n) - 1) * 100
  return Number.isFinite(r) ? Math.round(r * 10000) / 10000 : null
}

const updates = []
for (const r of all) {
  if (r.dps == null) continue                                    // no tocar no-pagadores
  const complete = (r.div_history || []).filter(h => h && !h.isPartial && (Number(h.dps) || 0) > 0)
  if (!complete.length) continue                                 // sin año completo → dejar dividendRate
  const px = Number(r.current_price)
  const last = Number(complete[complete.length - 1].dps)
  // Año en curso (parcial): si ya supera al último año completo, se usa como referencia.
  const partial = (r.div_history || []).find(h => h && h.isPartial && (Number(h.dps) || 0) > 0)
  const useCurrent = partial && Number(partial.dps) > last
  let ref = useCurrent ? Number(partial.dps) : last
  const fields = {}

  // Special que dispara el yield >40% → volver al último año completo; si aún absurdo, descartar.
  if (px > 0 && ref / px * 100 > 40) {
    if (last / px * 100 <= 40) ref = last
    else { updates.push({ ticker: r.ticker, fields: { dps: null, pays_dividend: false }, old: r.dps, neu: 'null' }); continue }
  }
  if (Math.abs(ref - Number(r.dps)) > 1e-9) fields.dps = ref

  // div_cagr5 con la misma regla (año en curso como punto más reciente si es mayor).
  const eff = (useCurrent && ref === Number(partial.dps)) ? [...complete, partial] : complete
  const newCagr = cagr5(eff)
  if (newCagr != null && (r.div_cagr5 == null || Math.abs(newCagr - Number(r.div_cagr5)) > 0.01)) fields.div_cagr5 = newCagr

  if (Object.keys(fields).length) updates.push({ ticker: r.ticker, fields, old: Number(r.dps), neu: fields.dps != null ? fields.dps : Number(r.dps), cagr: fields.div_cagr5 })
}
const dpsN = updates.filter(u => u.fields.dps !== undefined).length
const cagrN = updates.filter(u => u.fields.div_cagr5 !== undefined).length
console.log(`Actualizaciones: ${updates.length} (dps: ${dpsN}, cagr: ${cagrN})`, WRITE ? '(ESCRITURA)' : '(dry-run)')
console.log(updates.slice(0, 25).map(u => `${u.ticker}: ${u.old}→${u.neu}${u.cagr != null ? ` cagr=${u.cagr}` : ''}`).join(' · '))

if (WRITE && updates.length) {
  let ok = 0
  for (const u of updates) {
    const { error } = await sb.from('company_fundamentals').update(u.fields).eq('ticker', u.ticker)
    if (!error) ok++; else console.log('ERR', u.ticker, error.message)
  }
  console.log('Filas actualizadas:', ok)
}
