// DICT efectivo = DICT estático (data/dict.js) + overrides de Supabase.
// SOLO server (usa service_role). No importar desde componentes cliente.
import { createClient } from '@supabase/supabase-js'
import { DICT } from '@/data/dict'

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
}

function asEntry(o) {
  return [o.name || o.ticker, o.ticker, o.country || 'OTHER', o.currency || 'USD', o.sector || '', o.subsector || '', o.type || 'general']
}

export function applyDictOverrides(base, overrides) {
  const removed = new Set()
  const added = []
  for (const o of overrides || []) {
    if (o.action === 'remove') removed.add(o.ticker)
    else if (o.action === 'add') added.push(asEntry(o))
  }
  const filtered = base.filter(d => !removed.has(d[1]))
  const present = new Set(filtered.map(d => d[1]))
  const extra = added.filter(a => !present.has(a[1]))
  return [...filtered, ...extra]
}

export async function getDictOverrides() {
  try {
    const { data } = await sb().from('dict_overrides').select('*')
    return data || []
  } catch { return [] }
}

export async function getEffectiveDict() {
  return applyDictOverrides(DICT, await getDictOverrides())
}

// Resuelve una entrada de empresa teniendo en cuenta los overrides.
export async function findDictEntry(ticker) {
  const ov = await getDictOverrides()
  if (ov.some(o => o.action === 'remove' && o.ticker === ticker)) return null
  const base = DICT.find(d => d[1] === ticker)
  if (base) return base
  const add = ov.find(o => o.action === 'add' && o.ticker === ticker)
  return add ? asEntry(add) : null
}
