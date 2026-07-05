import Link from 'next/link'
import { notFound } from 'next/navigation'
import PublicNav from '@/components/PublicNav'
import GuiaContent from '@/components/GuiaContent'
import { getPublishedGuia, listPublishedGuias } from '@/lib/guias-db'
import { mdToBlocks } from '@/lib/markdown-blocks'

const BASE = 'https://www.everdiv.com'
export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }) {
  const { slug } = await params
  const g = await getPublishedGuia(slug)
  if (!g) return { title: 'Guía no encontrada — EverDiv' }
  const url = `${BASE}/guias/${g.slug}`
  return {
    title: `${g.title} | EverDiv`,
    description: g.description,
    alternates: { canonical: url },
    openGraph: { title: g.title, description: g.description, url, type: 'article' },
  }
}

const CARD = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 18 }

export default async function GuiaPage({ params }) {
  const { slug } = await params
  const g = await getPublishedGuia(slug)
  if (!g) notFound()
  const blocks = mdToBlocks(g.content)

  let related = []
  if (Array.isArray(g.related) && g.related.length) {
    const all = await listPublishedGuias()
    const map = Object.fromEntries(all.map(x => [x.slug, x]))
    related = g.related.map(s => map[s]).filter(Boolean).slice(0, 3)
  }

  const jsonLd = {
    '@context': 'https://schema.org', '@type': 'Article',
    headline: g.title, description: g.description,
    datePublished: g.updated_at, dateModified: g.updated_at,
    author: { '@type': 'Organization', name: 'EverDiv' },
    publisher: { '@type': 'Organization', name: 'EverDiv' },
    mainEntityOfPage: `${BASE}/guias/${g.slug}`,
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <PublicNav />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <article style={{ maxWidth: 720, margin: '0 auto', padding: '32px 20px 70px' }}>
        <Link href="/guias" style={{ fontSize: 12.5, color: 'var(--accent)', textDecoration: 'none' }}>← Guías</Link>
        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.1em', textTransform: 'uppercase', margin: '18px 0 10px' }}>{g.category || 'Guía'}{g.minutes ? ` · ${g.minutes} min de lectura` : ''}</p>
        <h1 style={{ fontSize: 'clamp(26px, 5vw, 34px)', fontWeight: 900, color: 'var(--text-strong)', lineHeight: 1.2, marginBottom: 22 }}>{g.title}</h1>

        <GuiaContent content={blocks} />

        <div style={{ ...CARD, marginTop: 36, textAlign: 'center', background: 'linear-gradient(135deg, rgba(99,102,241,0.12), var(--surface) 70%)' }}>
          <p style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-strong)', marginBottom: 6 }}>Analiza casi 2.000 empresas DGI con criterio</p>
          <p style={{ fontSize: 13.5, color: 'var(--text-muted)', marginBottom: 16, maxWidth: 440, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.6 }}>Score DGI, salud financiera, valoración y una cartera que sigue tus dividendos. Empieza gratis, sin tarjeta.</p>
          <Link href="/register" style={{ display: 'inline-block', fontSize: 14, fontWeight: 800, color: '#fff', textDecoration: 'none', padding: '12px 26px', background: 'var(--accent)', borderRadius: 10 }}>Empezar gratis →</Link>
        </div>

        {related.length > 0 && (
          <div style={{ marginTop: 40 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>Sigue leyendo</p>
            <div style={{ display: 'grid', gap: 10 }}>
              {related.map(r => (
                <Link key={r.slug} href={`/guias/${r.slug}`} style={{ ...CARD, textDecoration: 'none', display: 'block' }}>
                  <p style={{ fontSize: 10.5, color: 'var(--accent)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{r.category || 'Guía'}</p>
                  <p style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--text-strong)', lineHeight: 1.35 }}>{r.title}</p>
                </Link>
              ))}
            </div>
          </div>
        )}
      </article>
    </div>
  )
}
