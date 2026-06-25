// Descarga los logos de las empresas desde el CDN de FMP y los sube a Supabase
// Storage (bucket público 'company-logos'), para auto-alojarlos (sin depender de
// un tercero en cada render). ~15-20 MB para todo el universo.
//
//   · Salta cotizaciones secundarias (la ficha redirige a la matriz).
//   · Valida que sea un PNG real (magic bytes) antes de subir.
//   · Las que no tienen logo en FMP se omiten → la UI cae a un monograma.
//
// Uso: node scripts/fetch_logos.mjs [--limit N] [--ticker X]
// Requiere credenciales de Supabase (de webapp/.env.local en local o env en CI).
import { readFileSync } from 'fs'
import { createRequire } from 'module'
import { toFmpSymbol } from '../webapp/lib/analyst-estimates.js'
import { isSecondary } from '../webapp/lib/listings.js'
import { DICT } from '../webapp/data/dict.js'
const require = createRequire(new URL('../webapp/package.json', import.meta.url))
const { createClient } = require('@supabase/supabase-js')

const env = { ...process.env }
try {
  readFileSync(new URL('../webapp/.env.local', import.meta.url), 'utf8').split('\n').forEach(l => {
    l = l.trim()
    if (l && !l.startsWith('#') && l.includes('=')) { const i = l.indexOf('='); const k = l.slice(0, i).trim(); if (env[k] == null) env[k] = l.slice(i + 1).trim() }
  })
} catch {}
const SUPA_URL = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL
const SUPA_KEY = env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPA_URL || !SUPA_KEY) { console.error('Faltan credenciales de Supabase.'); process.exit(1) }
const sb = createClient(SUPA_URL, SUPA_KEY)
const BUCKET = 'company-logos'

const argVal = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d }
const LIMIT = parseInt(argVal('--limit', '0'), 10)
const ONE = argVal('--ticker', null)
const CONCURRENCY = 8

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47])

async function ensureBucket() {
  const { error } = await sb.storage.createBucket(BUCKET, { public: true, fileSizeLimit: 1048576 })
  if (error && !/exist/i.test(error.message)) { console.error('createBucket:', error.message); process.exit(1) }
  console.log(`Bucket '${BUCKET}' listo (público).`)
}

async function processTicker(ticker) {
  const url = `https://images.financialmodelingprep.com/symbol/${encodeURIComponent(toFmpSymbol(ticker))}.png`
  let buf
  try {
    const res = await fetch(url)
    if (!res.ok) return 'miss'
    buf = Buffer.from(await res.arrayBuffer())
  } catch { return 'error' }
  if (buf.length < 100 || !buf.subarray(0, 4).equals(PNG_MAGIC)) return 'miss'   // sin logo / placeholder
  const { error } = await sb.storage.from(BUCKET).upload(`${ticker}.png`, buf, { contentType: 'image/png', upsert: true })
  if (error) { console.error(`  upload ${ticker}:`, error.message); return 'error' }
  return 'ok'
}

async function run() {
  await ensureBucket()
  let tickers = [...new Set(DICT.map(d => d[1]).filter(Boolean))].filter(t => !isSecondary(t) && !t.startsWith('^'))
  if (ONE) tickers = tickers.filter(t => t === ONE)
  if (LIMIT > 0) tickers = tickers.slice(0, LIMIT)
  console.log(`Procesando ${tickers.length} tickers (concurrencia ${CONCURRENCY})…`)

  let ok = 0, miss = 0, err = 0, done = 0
  for (let i = 0; i < tickers.length; i += CONCURRENCY) {
    const batch = tickers.slice(i, i + CONCURRENCY)
    const res = await Promise.all(batch.map(processTicker))
    res.forEach(r => { if (r === 'ok') ok++; else if (r === 'miss') miss++; else err++ })
    done += batch.length
    if (done % 200 < CONCURRENCY) console.log(`  …${done}/${tickers.length} (ok=${ok} sin-logo=${miss} err=${err})`)
  }
  console.log(`\nHecho: ok=${ok} · sin-logo=${miss} · errores=${err}`)
}
run()
