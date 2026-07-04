// Siembra en la tabla `guias` las guías estáticas de webapp/data/guias.js,
// convirtiendo el contenido de bloques a Markdown. Idempotente (upsert por slug).
// Requiere haber ejecutado webapp/sql/guias.sql antes.
//   node scripts/seed_guias.mjs --write
import { readFileSync } from 'fs'
import { createRequire } from 'module'
import { GUIAS } from '../webapp/data/guias.js'
import { blocksToMd } from '../webapp/lib/markdown-blocks.js'
const require = createRequire(new URL('../webapp/package.json', import.meta.url))
const { createClient } = require('@supabase/supabase-js')

const env = { ...process.env }
try {
  readFileSync(new URL('../webapp/.env.local', import.meta.url), 'utf8').split('\n').forEach(l => {
    l = l.trim()
    if (l && !l.startsWith('#') && l.includes('=')) { const i = l.indexOf('='); const k = l.slice(0, i).trim(); if (env[k] == null) env[k] = l.slice(i + 1).trim() }
  })
} catch {}

const URL_ = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_ROLE_KEY
if (!URL_ || !KEY) { console.error('Faltan credenciales de Supabase.'); process.exit(1) }
const WRITE = process.argv.includes('--write')
const sb = createClient(URL_, KEY)

const rows = GUIAS.map(g => ({
  slug: g.slug, title: g.title, description: g.description || null, category: g.category || null,
  excerpt: g.excerpt || null, content: blocksToMd(g.content), minutes: g.minutes || 5,
  related: g.related || [], published: true, updated_at: new Date().toISOString(),
}))

console.log(`${rows.length} guías a sembrar${WRITE ? '' : '  [dry-run, usa --write]'}:`)
rows.forEach(r => console.log(`  · ${r.slug} (${r.content.length} car.)`))

if (WRITE) {
  const { error } = await sb.from('guias').upsert(rows, { onConflict: 'slug' })
  if (error) { console.error('ERROR:', error.message); process.exit(1) }
  console.log('\n✓ Sembradas.')
}
