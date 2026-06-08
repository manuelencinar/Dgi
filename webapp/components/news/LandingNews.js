'use client'
import { useState, useEffect } from 'react'

function timeAgo(iso) {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  if (isNaN(diff)) return ''
  const m = Math.round(diff / 60000)
  if (m < 1) return 'ahora mismo'
  if (m < 60) return `hace ${m} min`
  const h = Math.round(m / 60)
  if (h < 24) return `hace ${h} ${h === 1 ? 'hora' : 'horas'}`
  const d = Math.round(h / 24)
  return `hace ${d} ${d === 1 ? 'día' : 'días'}`
}

// Gradiente de marca cuando la noticia no trae imagen
const GRADIENTS = [
  'linear-gradient(135deg, rgba(99,102,241,0.35), rgba(52,211,153,0.18))',
  'linear-gradient(135deg, rgba(52,211,153,0.28), rgba(99,102,241,0.22))',
  'linear-gradient(135deg, rgba(129,140,248,0.3), rgba(251,191,36,0.15))',
]

function SkeletonCard() {
  return (
    <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, overflow: 'hidden' }}>
      <div className="ln-shimmer" style={{ height: 140 }} />
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div className="ln-shimmer" style={{ height: 13, borderRadius: 4, width: '95%' }} />
        <div className="ln-shimmer" style={{ height: 13, borderRadius: 4, width: '70%' }} />
        <div className="ln-shimmer" style={{ height: 10, borderRadius: 4, width: '35%', marginTop: 4 }} />
      </div>
    </div>
  )
}

export default function LandingNews() {
  const [status, setStatus] = useState('loading') // loading | ok | hidden
  const [news, setNews] = useState([])

  useEffect(() => {
    let cancelled = false
    fetch('/api/news/general')
      .then(r => r.json())
      .then(d => {
        if (cancelled) return
        const arr = Array.isArray(d?.news) ? d.news : []
        if (arr.length) { setNews(arr); setStatus('ok') }
        else setStatus('hidden')
      })
      .catch(() => { if (!cancelled) setStatus('hidden') })
    return () => { cancelled = true }
  }, [])

  // Si no hay noticias, no dejamos hueco: no renderizamos la sección.
  if (status === 'hidden') return null

  return (
    <section style={{ padding: '80px 24px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
      <style>{`
        @keyframes lnShimmer { 0% { background-position: -200px 0; } 100% { background-position: 200px 0; } }
        .ln-shimmer { background: linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 75%); background-size: 400px 100%; animation: lnShimmer 1.3s infinite linear; }
        .ln-grid { display: grid; grid-template-columns: 1fr; gap: 18px; max-width: 1000px; margin: 0 auto; }
        @media (min-width: 760px) { .ln-grid { grid-template-columns: repeat(3, 1fr); } }
        .ln-card { display: flex; flex-direction: column; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.07); border-radius: 14px; overflow: hidden; text-decoration: none; transition: transform 0.18s, box-shadow 0.18s, border-color 0.18s; }
        .ln-card:hover { transform: scale(1.02); box-shadow: 0 16px 40px rgba(0,0,0,0.45); border-color: rgba(129,140,248,0.35); }
        .ln-clamp3 { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
      `}</style>

      <div style={{ textAlign: 'center', marginBottom: 44 }}>
        <h2 style={{ fontSize: 28, fontWeight: 900, color: '#e0e8f0', marginBottom: 10 }}>Actualidad financiera</h2>
        <p style={{ fontSize: 14, color: '#4a5270' }}>Las últimas noticias del mercado</p>
      </div>

      <div className="ln-grid">
        {status === 'loading'
          ? [0, 1, 2, 3, 4, 5].map(i => <SkeletonCard key={i} />)
          : news.map((n, i) => (
            <a key={n.id} href={n.url} target="_blank" rel="noopener noreferrer" className="ln-card">
              <div style={{ position: 'relative', height: 140, background: GRADIENTS[i % GRADIENTS.length] }}>
                {n.image && (
                  <img src={n.image} alt="" loading="lazy"
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    onError={e => { e.currentTarget.style.display = 'none' }} />
                )}
                {n.source && (
                  <span style={{
                    position: 'absolute', top: 8, left: 8, fontSize: 9.5, fontWeight: 700, color: '#e0e8f0',
                    background: 'rgba(8,11,20,0.72)', padding: '3px 8px', borderRadius: 5, backdropFilter: 'blur(4px)',
                    maxWidth: 'calc(100% - 16px)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{n.source}</span>
                )}
              </div>
              <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                <p className="ln-clamp3" style={{ fontSize: 14, fontWeight: 600, color: '#e0e8f0', lineHeight: 1.4 }}>{n.headline}</p>
                <p style={{ fontSize: 11, color: '#4a5270', marginTop: 'auto' }}>{timeAgo(n.datetime)}</p>
              </div>
            </a>
          ))}
      </div>

      {status === 'ok' && (
        <p style={{ fontSize: 9.5, color: '#2e3a55', textAlign: 'center', marginTop: 24 }}>Noticias proporcionadas por NewsAPI</p>
      )}
    </section>
  )
}
