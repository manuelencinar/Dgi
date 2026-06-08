// Noticias financieras generales en español para la portada (NewsAPI).
// Caché de 1 hora → como máximo ~24 llamadas/día. Key solo en servidor.
import { NextResponse } from 'next/server'

const NEWSAPI_KEY = process.env.NEWSAPI_KEY

export const revalidate = 3600 // 1 hora

function clip(s, n) {
  s = (s || '').replace(/\s+/g, ' ').trim()
  return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s
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

export async function GET() {
  try {
    if (!NEWSAPI_KEY) return NextResponse.json({ news: [], provider: 'NewsAPI' })
    const url = 'https://newsapi.org/v2/top-headlines?category=business&language=es&pageSize=6'
    const res = await fetch(url, { headers: { 'X-Api-Key': NEWSAPI_KEY }, next: { revalidate: 3600 } })
    if (!res.ok) return NextResponse.json({ news: [], provider: 'NewsAPI' })
    const j = await res.json()
    const news = normNewsApi(j.articles)
      .filter(n => n.datetime)
      .sort((a, b) => new Date(b.datetime) - new Date(a.datetime))
      .slice(0, 6)
    return NextResponse.json({ news, provider: 'NewsAPI' }, {
      headers: { 'Cache-Control': 's-maxage=3600, stale-while-revalidate=600' },
    })
  } catch {
    return NextResponse.json({ news: [], provider: 'NewsAPI' })
  }
}
