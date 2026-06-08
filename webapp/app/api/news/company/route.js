// Noticias de una empresa. Empresas españolas (.MC o country=ES) → NewsAPI por
// nombre; el resto → Finnhub por ticker. Las keys viven solo aquí (servidor).
// Caché de 30 min vía Next data cache (fetch revalidate) — no agota los límites.
import { NextResponse } from 'next/server'
import { DICT } from '@/data/dict'

const FINNHUB_KEY = process.env.FINNHUB_API_KEY
const NEWSAPI_KEY = process.env.NEWSAPI_KEY

const REVALIDATE = 1800 // 30 min

function clip(s, n) {
  s = (s || '').replace(/\s+/g, ' ').trim()
  return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s
}
function stripSuffix(t) { return (t || '').split('.')[0] }
function isoDay(offsetDays) {
  const d = new Date(); d.setDate(d.getDate() - offsetDays)
  return d.toISOString().slice(0, 10)
}

function normFinnhub(arr) {
  return (arr || [])
    .filter(a => a && a.headline && a.url)
    .map(a => ({
      id: String(a.id ?? a.url),
      headline: a.headline,
      summary: clip(a.summary, 200),
      source: a.source || 'Finnhub',
      url: a.url,
      datetime: a.datetime ? new Date(a.datetime * 1000).toISOString() : null,
      image: a.image || null,
    }))
}

function normNewsApi(articles) {
  return (articles || [])
    .filter(a => a && a.title && a.url && a.title !== '[Removed]')
    .map(a => ({
      id: a.url,
      headline: a.title,
      summary: clip(a.description, 200),
      source: a.source?.name || 'NewsAPI',
      url: a.url,
      datetime: a.publishedAt || null,
      image: a.urlToImage || null,
    }))
}

export async function GET(req) {
  try {
    const sp = new URL(req.url).searchParams
    const ticker  = (sp.get('ticker') || '').trim()
    const country = (sp.get('country') || '').trim().toUpperCase()
    const nameParam = (sp.get('name') || '').trim()
    if (!ticker) return NextResponse.json({ news: [], provider: null })

    const isSpanish = country === 'ES' || ticker.toUpperCase().endsWith('.MC')

    let news = []
    let provider = isSpanish ? 'NewsAPI' : 'Finnhub'

    if (isSpanish) {
      if (NEWSAPI_KEY) {
        const name = nameParam || DICT.find(d => d[1] === ticker)?.[0] || stripSuffix(ticker)
        const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(name)}&language=es&sortBy=publishedAt&pageSize=5`
        const res = await fetch(url, { headers: { 'X-Api-Key': NEWSAPI_KEY }, next: { revalidate: REVALIDATE } })
        if (res.ok) { const j = await res.json(); news = normNewsApi(j.articles) }
      }
    } else {
      if (FINNHUB_KEY) {
        const sym = stripSuffix(ticker).toUpperCase()
        const url = `https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(sym)}&from=${isoDay(7)}&to=${isoDay(0)}`
        const res = await fetch(url, { headers: { 'X-Finnhub-Token': FINNHUB_KEY }, next: { revalidate: REVALIDATE } })
        // 429 (rate limit) u otros → array vacío, nunca 500
        if (res.ok) { const j = await res.json(); news = normFinnhub(j) }
      }
    }

    news = news
      .filter(n => n.datetime)
      .sort((a, b) => new Date(b.datetime) - new Date(a.datetime))
      .slice(0, 5)

    return NextResponse.json({ news, provider }, {
      headers: { 'Cache-Control': 's-maxage=1800, stale-while-revalidate=600' },
    })
  } catch {
    // Las noticias son opcionales — nunca devolver 500
    return NextResponse.json({ news: [], provider: null })
  }
}
