// Estimaciones de analistas (Financial Modeling Prep, endpoint v3 analyst-estimates).
// La tabla muestra un CONTINUO años reales → estimados:
//   · histórico REAL: de nuestros estados financieros ya almacenados (mismos datos
//     que el resto de la ficha, sin volver a llamar a una API externa).
//   · proyección: consenso de analistas de FMP para los años futuros.
//
// El símbolo en nuestra app está en formato Yahoo Finance (p.ej. MUV2.DE). FMP usa
// en su mayoría los MISMOS sufijos de mercado que Yahoo, pero algunos difieren →
// toFmpSymbol() los remapea. La API key vive en la env var FMP_API_KEY.

// API "stable" de FMP. El endpoint legacy v3 (/api/v3/analyst-estimates/{symbol})
// dejó de servirse a cuentas creadas después del 31-ago-2025 (devuelve 403
// "Legacy Endpoint"); la API actual usa /stable/ con el símbolo como query param.
const FMP_BASE = 'https://financialmodelingprep.com/stable'

// Remapeo de sufijos Yahoo → FMP SOLO para los que difieren. La mayoría coinciden
// (.DE Xetra, .PA París, .L Londres, .MC Madrid, .AS Ámsterdam, .MI Milán,
// .SW SIX Suiza, .ST Estocolmo, .HE Helsinki, .OL Oslo, .CO Copenhague…), así que
// el mapa solo lista excepciones conocidas; el resto pasa tal cual.
const SUFFIX_MAP = {
  // yahoo : fmp
  // (vacío por ahora — ampliar si se detecta un sufijo que FMP nombre distinto)
}

// Convierte un ticker en formato Yahoo al formato que espera FMP.
export function toFmpSymbol(yahooTicker) {
  if (!yahooTicker) return null
  const t = String(yahooTicker).trim().toUpperCase()
  const dot = t.lastIndexOf('.')
  if (dot === -1) return t                 // acción US: sin sufijo, mismo símbolo
  const base = t.slice(0, dot)
  const suf  = t.slice(dot + 1)
  const mapped = SUFFIX_MAP[suf]
  return mapped ? `${base}.${mapped}` : t
}

const num = v => (typeof v === 'number' && isFinite(v)) ? v : (v != null && !isNaN(v) ? parseFloat(v) : null)

// Llama a FMP y devuelve las estimaciones normalizadas [{year, revenue, eps, analysts}]
// (incluye años pasados y futuros tal cual los da FMP; el merge filtra después).
// Devuelve null si no hay API key, el símbolo no tiene cobertura o falla la petición.
// Normaliza el array crudo de FMP → [{year, revenue, eps, analysts}].
function normalizeFmp(json) {
  return json.map(e => ({
    year: e?.date ? parseInt(String(e.date).slice(0, 4)) : null,
    // API stable: revenueAvg/epsAvg; se aceptan también los nombres legacy por si acaso.
    revenue: num(e?.revenueAvg) ?? num(e?.estimatedRevenueAvg),
    eps: num(e?.epsAvg) ?? num(e?.estimatedEpsAvg),
    analysts: num(e?.numAnalystsEps) ?? num(e?.numAnalystsRevenue) ?? num(e?.numberAnalystsEstimatedEps),
  })).filter(e => e.year && (e.revenue != null || e.eps != null))
}

// Petición a FMP con el RESULTADO discriminado, para el script de backfill:
//   { status: 'ok',          rows }       → 200; rows puede venir vacío (US sin estimaciones).
//   { status: 'unsupported', rows: null } → 402: símbolo no cubierto por el plan (p.ej.
//     casi todo lo no-US en el plan free) o inexistente → permanente, NO reconsultar.
//   { status: 'error',       rows: null } → fallo transitorio (sin key, red, 429, 5xx,
//     respuesta no-array) → NO marcar nada, reintentar otro día.
export async function fetchFmpEstimatesResult(fmpSymbol) {
  const key = process.env.FMP_API_KEY
  if (!key || !fmpSymbol) return { status: 'error', rows: null }
  const url = `${FMP_BASE}/analyst-estimates?symbol=${encodeURIComponent(fmpSymbol)}&period=annual&apikey=${encodeURIComponent(key)}`
  let res
  try { res = await fetch(url, { cache: 'no-store' }) } catch { return { status: 'error', rows: null } }
  if (res.status === 402) return { status: 'unsupported', rows: null }   // fuera del plan / símbolo no cubierto
  if (!res.ok) return { status: 'error', rows: null }                    // 429, 5xx… → transitorio
  let json
  try { json = await res.json() } catch { return { status: 'error', rows: null } }
  if (!Array.isArray(json)) return { status: 'error', rows: null }       // {Error Message:…}
  return { status: 'ok', rows: normalizeFmp(json) }
}

// Versión simple para la ruta: devuelve el array o null (sin distinguir el motivo).
export async function fetchFmpEstimates(fmpSymbol) {
  const r = await fetchFmpEstimatesResult(fmpSymbol)
  return (r.status === 'ok' && r.rows && r.rows.length) ? r.rows : null
}

// Extrae el histórico real {year, revenue, eps} desde income_statement_annual
// (jsonb { columns:[fechas], data:{ etiqueta:[valores] } }). Acepta claves en
// español (yfinance traducido) e inglés.
export function extractRealHistory(isa) {
  const cols = isa?.columns
  const data = isa?.data
  if (!Array.isArray(cols) || !data) return []
  const pick = (...keys) => { for (const k of keys) if (Array.isArray(data[k])) return data[k]; return null }
  const revRow = pick('Ingresos Totales', 'Total Revenue', 'Total Revenues', 'Operating Revenue', 'Ingresos')
  const epsRow = pick('BPA Diluido', 'Diluted EPS', 'BPA Básico', 'Basic EPS')
  const out = []
  for (let i = 0; i < cols.length; i++) {
    const year = parseInt(String(cols[i]).slice(0, 4))
    if (!year) continue
    out.push({ year, revenue: revRow ? num(revRow[i]) : null, eps: epsRow ? num(epsRow[i]) : null })
  }
  return out
}

// Fusiona el histórico real de yfinance (extractRealHistory) con los ejercicios ANTIGUOS
// del backfill (financial_history) para ampliar los años de la tabla/gráfico de estimaciones.
// yfinance MANDA para los años que ya cubre; el backfill solo aporta los anteriores.
// fhRows: filas de financial_history [{fiscal_year, source, revenue, eps_diluted}].
export function mergeRealHistory(realRows, fhRows) {
  const byYear = {}
  for (const r of realRows || []) if (r?.year != null) byYear[r.year] = { year: r.year, revenue: r.revenue, eps: r.eps }
  const rank = s => { const i = ['sec_edgar', 'stockanalysis', 'macrotrends'].indexOf(s); return i < 0 ? 99 : i }
  const fhBest = {}
  for (const r of fhRows || []) {
    const y = r?.fiscal_year
    if (y == null || byYear[y]) continue                    // año ya cubierto por yfinance → se ignora
    if (!fhBest[y] || rank(r.source) < rank(fhBest[y].source)) fhBest[y] = r
  }
  for (const r of Object.values(fhBest)) {
    byYear[r.fiscal_year] = { year: Number(r.fiscal_year), revenue: num(r.revenue), eps: num(r.eps_diluted) }
  }
  return Object.values(byYear).sort((a, b) => a.year - b.year)
}

// Construye la serie continua real → estimado y calcula el crecimiento YoY de
// ingresos sobre TODA la serie (para que el primer año mostrado también tenga YoY).
//   realRows / estRows: [{year, revenue, eps, ...}]
//   histYears / estYears: máximo de años reales y estimados a mostrar.
// Una estimación solo se considera "futura" si su año es POSTERIOR al último año real
// (FMP también devuelve registros de estimación de años ya cerrados → se descartan).
export function buildEstimateSeries(realRows, estRows, { histYears = 5, estYears = 5 } = {}) {
  const real = [...(realRows || [])].filter(r => r && r.year != null).sort((a, b) => a.year - b.year)
  const lastActual = real.length ? real[real.length - 1].year : null
  const est = [...(estRows || [])]
    .filter(r => r && r.year != null && (lastActual == null || r.year > lastActual))
    .sort((a, b) => a.year - b.year)
    .slice(0, estYears)

  // Serie completa (todos los reales + estimados) para un YoY correcto en los bordes.
  const full = [
    ...real.map(r => ({ ...r, actual: true })),
    ...est.map(r => ({ ...r, actual: false })),
  ]
  for (let i = 0; i < full.length; i++) {
    const prev = full[i - 1]
    full[i].revenueGrowth = (prev && prev.revenue != null && full[i].revenue != null && prev.revenue > 0)
      ? (full[i].revenue - prev.revenue) / prev.revenue
      : null
  }

  // Recorta el histórico a los últimos histYears; las estimaciones se mantienen.
  const histPart = full.filter(r => r.actual).slice(-histYears)
  const estPart  = full.filter(r => !r.actual)
  return [...histPart, ...estPart]
}
