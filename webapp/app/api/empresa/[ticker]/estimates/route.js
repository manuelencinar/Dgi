import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { findDictEntry } from '@/lib/dict'
import { toFmpSymbol, fetchFmpEstimates, extractRealHistory, buildEstimateSeries, mergeRealHistory } from '@/lib/analyst-estimates'
import { fetchYahooEstimates } from '@/lib/yahoo-estimates'

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
    // Las estimaciones se precargan por lotes en BD (script + workflow diario). Se
    // intentan leer de ahí; si las columnas aún no existen (SQL sin ejecutar), se
    // cae a un select mínimo.
    const sel = supabase.from('company_fundamentals')
      .select('income_statement_annual, analyst_estimates, analyst_estimates_status').eq('ticker', t).maybeSingle()
    const [selRes, entry] = await Promise.all([sel, findDictEntry(t)])
    let row = selRes.data
    if (selRes.error) {
      const { data } = await supabase.from('company_fundamentals').select('income_statement_annual').eq('ticker', t).maybeSingle()
      row = data
    }
    let realRows = extractRealHistory(row?.income_statement_annual)
    const currency = entry?.[3] || null

    // Amplía el histórico real con los ejercicios antiguos del backfill (financial_history,
    // service-only). yfinance manda; el backfill solo aporta años anteriores.
    try {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY
      if (url && key) {
        const svc = createServiceClient(url, key)
        const { data: fh } = await svc.from('financial_history')
          .select('fiscal_year, source, revenue, eps_diluted').eq('ticker', t)
        if (fh?.length) realRows = mergeRealHistory(realRows, fh)
      }
    } catch { /* sin backfill → histórico de yfinance tal cual */ }

    // Estimaciones: preferimos las precargadas en BD (sin gastar llamada). Solo si la
    // empresa todavía no se ha procesado (status null) se consulta a FMP en vivo.
    let estRows
    if (row?.analyst_estimates_status === 'ok' && Array.isArray(row.analyst_estimates)) {
      estRows = row.analyst_estimates
    } else if (row?.analyst_estimates_status === 'none') {
      estRows = null                                  // sin cobertura confirmada (FMP) → no llamar a FMP
    } else {
      estRows = await fetchFmpEstimates(toFmpSymbol(t))   // aún sin procesar → fallback en vivo
    }

    // FMP free apenas cubre fuera de EE. UU. → si no hay estimaciones, las pedimos a
    // Yahoo (earningsTrend), que sí cubre muchas empresas no-US (año en curso + siguiente).
    if (!estRows || !estRows.length) {
      const y = await fetchYahooEstimates(t).catch(() => null)
      if (y && y.length) estRows = y
    }

    if ((realRows && realRows.length) || (estRows && estRows.length)) {
      // histYears alto → se incluyen TODOS los años reales disponibles (los antiguos se
      // pliegan en un desplegable en la UI); las estimaciones futuras siguen limitadas.
      const rows = buildEstimateSeries(realRows, estRows, { histYears: 100 })
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
