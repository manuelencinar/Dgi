// DICT efectivo = DICT estático (data/dict.js) + overrides de Supabase.
// SOLO server (usa service_role). No importar desde componentes cliente.
//
// dict_overrides.action:
//   'remove' → oculta la empresa.
//   'add'    → upsert: si el ticker ya está en el DICT base, reemplaza sus
//              campos (edición); si no, lo añade como empresa nueva.
import { createClient } from '@supabase/supabase-js'
import { DICT } from '@/data/dict'

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
}

export function applyDictOverrides(base, overrides) {
  const map = new Map(base.map(d => [d[1], d]))
  for (const o of overrides || []) {
    if (!o?.ticker) continue
    if (o.action === 'remove') { map.delete(o.ticker); continue }
    const ex = map.get(o.ticker)
    const e = ex ? [...ex] : ['', o.ticker, 'OTHER', 'USD', '', '', 'general']
    if (o.name != null && o.name !== '') e[0] = o.name
    e[1] = o.ticker
    if (o.country) e[2] = o.country
    if (o.currency) e[3] = o.currency
    if (o.sector != null) e[4] = o.sector
    if (o.subsector != null) e[5] = o.subsector
    if (o.type) e[6] = o.type
    map.set(o.ticker, e)
  }
  return [...map.values()]
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

export async function findDictEntry(ticker) {
  const eff = applyDictOverrides(DICT, await getDictOverrides())
  return eff.find(e => e[1] === ticker) || null
}
