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
  if (d < 30) return `hace ${d} ${d === 1 ? 'día' : 'días'}`
  const mo = Math.round(d / 30)
  return `hace ${mo} ${mo === 1 ? 'mes' : 'meses'}`
}

const CARD = { background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 20 }
const Title = () => (
  <p style={{ fontSize: 11, fontWeight: 700, color: '#4a5270', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14 }}>
    Últimas noticias
  </p>
)

function Skeleton() {
  return (
    <div style={{ display: 'flex', gap: 12, padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
      <div className="cn-shimmer" style={{ width: 60, height: 60, borderRadius: 6, flexShrink: 0 }} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 7, paddingTop: 2 }}>
        <div className="cn-shimmer" style={{ height: 12, borderRadius: 4, width: '90%' }} />
        <div className="cn-shimmer" style={{ height: 12, borderRadius: 4, width: '60%' }} />
        <div className="cn-shimmer" style={{ height: 10, borderRadius: 4, width: '40%' }} />
      </div>
    </div>
  )
}

export default function CompanyNews({ ticker, country, name }) {
  const [status, setStatus] = useState('loading') // loading | ok | empty | error
  const [news, setNews] = useState([])
  const [provider, setProvider] = useState(null)

  useEffect(() => {
    if (!ticker) return
    let cancelled = false
    setStatus('loading')
    const params = new URLSearchParams({ ticker, country: country || '', name: name || '' })
    fetch(`/api/news/company?${params.toString()}`)
      .then(r => r.json())
      .then(d => {
        if (cancelled) return
        const arr = Array.isArray(d?.news) ? d.news : []
        setNews(arr)
        setProvider(d?.provider || null)
        setStatus(arr.length ? 'ok' : 'empty')
      })
      .catch(() => { if (!cancelled) setStatus('error') })
    return () => { cancelled = true }
  }, [ticker, country, name])

  // Las noticias son complementarias: ante un error no mostramos la sección.
  if (status === 'error') return null

  return (
    <div style={CARD}>
      <style>{`
        @keyframes cnShimmer { 0% { background-position: -200px 0; } 100% { background-position: 200px 0; } }
        .cn-shimmer { background: linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 75%); background-size: 400px 100%; animation: cnShimmer 1.3s infinite linear; }
        .cn-row { display: flex; gap: 12px; padding: 12px 8px; margin: 0 -8px; border-radius: 8px; text-decoration: none; transition: background 0.15s; }
        .cn-row:hover { background: rgba(255,255,255,0.035); }
        .cn-clamp2 { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
      `}</style>
      <Title />

      {status === 'loading' && <div>{[0, 1, 2].map(i => <Skeleton key={i} />)}</div>}

      {status === 'empty' && (
        <p style={{ fontSize: 12, color: '#4a5270' }}>No hay noticias recientes disponibles para esta empresa</p>
      )}

      {status === 'ok' && (
        <>
          <div>
            {news.map((n, i) => (
              <a key={n.id} href={n.url} target="_blank" rel="noopener noreferrer" className="cn-row"
                style={{ borderBottom: i < news.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                {n.image && (
                  <img src={n.image} alt="" loading="lazy"
                    style={{ width: 60, height: 60, borderRadius: 6, objectFit: 'cover', flexShrink: 0, background: 'rgba(255,255,255,0.04)' }}
                    onError={e => { e.currentTarget.style.display = 'none' }} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p className="cn-clamp2" style={{ fontSize: 14, fontWeight: 500, color: '#e0e8f0', lineHeight: 1.35, marginBottom: 4 }}>{n.headline}</p>
                  <p style={{ fontSize: 11, color: '#6b7693', marginBottom: n.summary ? 4 : 0 }}>
                    {n.source} · {timeAgo(n.datetime)}
                  </p>
                  {n.summary && <p className="cn-clamp2" style={{ fontSize: 12, color: '#4a5270', lineHeight: 1.4 }}>{n.summary}</p>}
                </div>
              </a>
            ))}
          </div>
          {provider && (
            <p style={{ fontSize: 9.5, color: '#2e3a55', marginTop: 12 }}>Noticias proporcionadas por {provider}</p>
          )}
        </>
      )}
    </div>
  )
}
