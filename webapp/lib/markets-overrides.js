// MARKETS efectivos = MARKETS estáticos (lib/markets.js) + overrides de Supabase.
// SOLO server (service_role). Los overrides solo editan/desactivan (no añaden/borran).
import { createClient } from '@supabase/supabase-js'
import { MARKETS, UPDATED_INDICES } from '@/lib/markets'

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
}

export function applyMarketOverrides(base, overrides) {
  const ov = new Map((overrides || []).map(o => [o.symbol, o]))
  return base.map(m => {
    const updated = UPDATED_INDICES.has(m.symbol)
    const o = ov.get(m.symbol)
    if (!o) return { ...m, active: true, updated }
    return {
      ...m,
      name: o.name ?? m.name,
      country: o.country ?? m.country,
      region: o.region ?? m.region,
      yf_ticker: o.yf_ticker || m.symbol,
      active: o.active !== false,
      updated,
    }
  })
}

export async function getMarketOverrides() {
  try {
    const { data } = await sb().from('markets_overrides').select('*')
    return data || []
  } catch { return [] }
}

// Todos los mercados con sus campos efectivos + flag active (para el admin).
export async function getAllMarkets() {
  return applyMarketOverrides(MARKETS, await getMarketOverrides())
}

// Solo los mercados activos (para la app pública).
export async function getEffectiveMarkets() {
  return (await getAllMarkets()).filter(m => m.active !== false)
}
