// Búsqueda global: empresas (DICT efectivo) + ETFs/fondos (tabla funds) + índices (MARKETS efectivos).
// Filtra server-side por nombre o ticker. Devuelve resultados ligeros para la lupa del menú.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getEffectiveDict } from '@/lib/dict'
import { getEffectiveMarkets } from '@/lib/markets-overrides'
import { sectorLabelEs } from '@/lib/supersectors'

export const dynamic = 'force-dynamic'

function norm(s) {
  return (s || '')
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quita acentos
    .trim()
}

// Puntuación: prioriza coincidencia exacta de ticker, luego "empieza por", luego "contiene".
function scoreMatch(name, ticker, q) {
  const n = norm(name)
  const t = norm(ticker)
  if (t === q) return 0
  if (t.startsWith(q)) return 1
  if (n.startsWith(q)) return 2
  if (t.includes(q)) return 3
  if (n.includes(q)) return 4
  return 99
}

export async function GET(req) {
  try {
    const q = norm(new URL(req.url).searchParams.get('q') || '')
    if (q.length < 1) {
      return NextResponse.json({ companies: [], funds: [], indices: [] })
    }

    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

    const [dict, markets, fundsRes] = await Promise.all([
      getEffectiveDict(),
      getEffectiveMarkets(),
      sb.from('funds').select('ticker, name, asset_type, currency, country'),
    ])

    // Empresas — candidatas por nombre/ticker
    const candidates = (dict || [])
      .map(d => ({ name: d[0], ticker: d[1], country: d[2], sector: d[4], _s: scoreMatch(d[0], d[1], q) }))
      .filter(c => c._s < 99)
      .sort((a, b) => a._s - b._s || a.name.localeCompare(b.name))
      .slice(0, 40)

    // Ocultar las empresas sin precio válido (0,00 o sin dato). De paso traemos
    // el sector real (company_fundamentals) para mostrarlo en castellano.
    let validTickers = new Set()
    const secByTicker = {}
    if (candidates.length) {
      const { data: pxRows } = await sb.from('company_fundamentals')
        .select('ticker, current_price, sector').in('ticker', candidates.map(c => c.ticker))
      validTickers = new Set((pxRows || []).filter(r => r.current_price != null && Number(r.current_price) >= 0.01).map(r => r.ticker))
      ;(pxRows || []).forEach(r => { if (r.sector) secByTicker[r.ticker] = r.sector })
    }

    const companies = candidates
      .filter(c => validTickers.has(c.ticker))
      .slice(0, 8)
      .map(c => ({
        type: 'company', name: c.name, ticker: c.ticker,
        sub: secByTicker[c.ticker] ? sectorLabelEs(secByTicker[c.ticker]) : (c.country || ''),
        href: `/empresa/${encodeURIComponent(c.ticker)}`,
      }))

    // ETFs y fondos
    const funds = (fundsRes?.data || [])
      .map(f => ({ ...f, _s: scoreMatch(f.name, f.ticker, q) }))
      .filter(f => f._s < 99)
      .sort((a, b) => a._s - b._s || (a.name || '').localeCompare(b.name || ''))
      .slice(0, 6)
      .map(f => ({
        type: f.asset_type === 'fund' ? 'fund' : 'etf',
        name: f.name || f.ticker,
        ticker: f.ticker,
        sub: f.asset_type === 'fund' ? 'Fondo' : 'ETF',
        href: `/fondo/${encodeURIComponent(f.ticker)}`,
      }))

    // Índices / mercados
    const indices = (markets || [])
      .map(m => ({ ...m, _s: scoreMatch(m.name, m.symbol, q) }))
      .filter(m => m._s < 99)
      .sort((a, b) => a._s - b._s || (a.name || '').localeCompare(b.name || ''))
      .slice(0, 6)
      .map(m => ({
        type: 'index',
        name: m.name,
        ticker: m.symbol,
        sub: m.country || m.region || 'Índice',
        href: `/mercados/${encodeURIComponent(m.symbol)}`,
      }))

    return NextResponse.json({ companies, funds, indices })
  } catch (e) {
    return NextResponse.json({ companies: [], funds: [], indices: [], error: String(e?.message || e) }, { status: 200 })
  }
}
