import { DICT } from '@/data/dict'
import { MARKETS } from '@/lib/markets'
import { getEffectiveMarkets } from '@/lib/markets-overrides'
import { isSecondary } from '@/lib/listings'
import { listPublishedGuias } from '@/lib/guias-db'

// Sitemap para que Google descubra y priorice las ~2000 fichas de empresa y los
// índices (el canal de tráfico orgánico principal). Las páginas privadas/de app
// quedan fuera (ver robots.js).
const BASE = 'https://everdiv.com'

export const revalidate = 86400 // 1 día

export default async function sitemap() {
  const now = new Date()

  const staticRoutes = [
    ['', 1.0, 'daily'],
    ['/mercados', 0.8, 'daily'],
    ['/screener', 0.8, 'daily'],
    ['/aristocratas', 0.7, 'weekly'],
    ['/canibales', 0.6, 'weekly'],
    ['/compounders', 0.6, 'weekly'],
    ['/comparador', 0.6, 'weekly'],
    ['/etfs', 0.6, 'weekly'],
    ['/calendario-dividendos', 0.5, 'weekly'],
    ['/construir-cartera', 0.6, 'monthly'],
    ['/guias', 0.7, 'weekly'],
    ['/pricing', 0.5, 'monthly'],
  ].map(([p, priority, changeFrequency]) => ({ url: BASE + p, lastModified: now, changeFrequency, priority }))

  let guias = []
  try { guias = await listPublishedGuias() } catch {}
  const guiaRoutes = guias.map(g => ({
    url: `${BASE}/guias/${g.slug}`,
    lastModified: g.updated_at ? new Date(g.updated_at) : now, changeFrequency: 'monthly', priority: 0.6,
  }))

  let markets = MARKETS
  try { const eff = await getEffectiveMarkets(); if (eff?.length) markets = eff } catch {}
  const marketRoutes = markets.map(m => ({
    url: `${BASE}/mercados/${encodeURIComponent(m.symbol)}`,
    lastModified: now, changeFrequency: 'daily', priority: 0.6,
  }))

  // Una ficha por empresa: se excluyen las cotizaciones secundarias (redirigen a
  // la matriz → contenido duplicado) y entradas sin ticker.
  const seen = new Set()
  const companyRoutes = []
  for (const d of DICT) {
    const ticker = d[1]
    if (!ticker || seen.has(ticker) || isSecondary(ticker)) continue
    seen.add(ticker)
    companyRoutes.push({
      url: `${BASE}/empresa/${encodeURIComponent(ticker)}`,
      lastModified: now, changeFrequency: 'weekly', priority: 0.5,
    })
  }

  return [...staticRoutes, ...guiaRoutes, ...marketRoutes, ...companyRoutes]
}
