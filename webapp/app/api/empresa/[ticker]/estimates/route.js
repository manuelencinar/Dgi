import { createClient } from '@/lib/supabase/server'
import { findDictEntry } from '@/lib/dict'
import { toFmpSymbol, fetchFmpEstimates, extractRealHistory, buildEstimateSeries } from '@/lib/analyst-estimates'

export const dynamic     = 'force-dynamic'
export const maxDuration = 20

// Caché en memoria por ticker (TTL 24h): las estimaciones de consenso apenas cambian
// — no tiene sentido golpear FMP en cada visita a la ficha.
const cache = new Map()
const TTL = 24 * 60 * 60 * 1000

export async function GET(request, { params }) {
  const { ticker } = await params
  const t = decodeURIComponent(ticker || '').trim().toUpperCase()
  if (!t) return Response.json({ hasData: false })

  const hit = cache.get(t)
  if (hit && Date.now() - hit.at < TTL) return Response.json(hit.data)

  let payload = { hasData: false }
  try {
    // Histórico REAL desde nuestros estados ya almacenados + divisa desde el DICT.
    const supabase = await createClient()
    const [{ data: row }, entry] = await Promise.all([
      supabase.from('company_fundamentals').select('income_statement_annual').eq('ticker', t).maybeSingle(),
      findDictEntry(t),
    ])
    const realRows = extractRealHistory(row?.income_statement_annual)
    const currency = entry?.[3] || null

    // Estimaciones futuras de FMP (símbolo convertido al formato FMP).
    const estRows = await fetchFmpEstimates(toFmpSymbol(t))

    if ((realRows && realRows.length) || (estRows && estRows.length)) {
      const rows = buildEstimateSeries(realRows, estRows)
      payload = {
        hasData: rows.length > 0,
        hasEstimates: rows.some(r => !r.actual),
        currency,
        rows,
      }
    }
  } catch {
    payload = { hasData: false }
  }

  // Cachea solo respuestas con datos: así un fallo puntual de FMP no fija un
  // "sin datos" durante 24h.
  if (payload.hasData) cache.set(t, { at: Date.now(), data: payload })
  return Response.json(payload)
}
