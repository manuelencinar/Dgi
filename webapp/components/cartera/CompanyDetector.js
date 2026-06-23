'use client'
import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { superSectorOf } from '@/lib/supersectors'

// ── Pesos de la cartera (cliente) ────────────────────────────────────────────
// Se calculan en el navegador desde `enriched` (datos propios del usuario) y se
// envían al server, que decide las 5 recomendaciones contra el universo completo.
function computeWeights(enriched) {
  const total = enriched.reduce((s, p) => s + (p.valueEUR || 0), 0)
  const sectorW = {}, supW = {}, currW = {}, countryW = {}
  enriched.forEach(p => {
    const v = p.valueEUR || 0
    const sec = p.sector || '—'
    const sup = superSectorOf(sec)
    const cur = p.currency || 'EUR'
    const ct  = (p.countryCode || '').toUpperCase()
    sectorW[sec] = (sectorW[sec] || 0) + v
    supW[sup]    = (supW[sup]    || 0) + v
    currW[cur]   = (currW[cur]   || 0) + v
    if (ct) countryW[ct] = (countryW[ct] || 0) + v
  })
  const toPct = m => Object.fromEntries(Object.entries(m).map(([k, x]) => [k, total > 0 ? x / total * 100 : 0]))
  return { sectorW: toPct(sectorW), supW: toPct(supW), currW: toPct(currW), countryW: toPct(countryW) }
}

const fmtPrice = (v, cur) => v == null ? '—' : `${Number(v).toLocaleString('es-ES', { maximumFractionDigits: 2 })} ${cur || ''}`.trim()

// ── Tarjeta de empresa recomendada ───────────────────────────────────────────
function RecCard({ rec }) {
  const [following, setFollowing] = useState(false)
  const [busy, setBusy] = useState(false)

  const follow = async () => {
    if (following || busy) return
    setBusy(true)
    setFollowing(true) // optimista
    try {
      const res = await fetch('/api/watchlist', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker: rec.ticker }),
      })
      if (res.status === 403) { setFollowing(false); alert('Límite del plan gratuito (10 empresas). Hazte Premium para seguir más.') }
      else if (!res.ok) setFollowing(false)
    } catch { setFollowing(false) }
    setBusy(false)
  }

  const fit = rec.reason || rec.whyFit
  return (
    <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 9, padding: '8px 11px' }}>
      {/* Línea 1: empresa + Score/Yield */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <span style={{ fontSize: 14, flexShrink: 0 }}>{rec.flag}</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#e6ebf5', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rec.name}</span>
          <span style={{ fontSize: 10, color: '#7a85a0', fontWeight: 600, flexShrink: 0 }}>{rec.ticker}</span>
        </div>
        <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
          <span style={{ fontSize: 12.5, fontWeight: 800, color: '#34d399' }}>{rec.score != null ? rec.score.toFixed(1) : '—'}<span style={{ fontSize: 9, color: '#5a647e', fontWeight: 600 }}> Sc</span></span>
          <span style={{ fontSize: 12.5, fontWeight: 800, color: '#fbbf24' }}>{rec.yield != null ? `${rec.yield.toFixed(1)}%` : '—'}<span style={{ fontSize: 9, color: '#5a647e', fontWeight: 600 }}> Yld</span></span>
        </div>
      </div>
      {/* Línea 2: encaje + acciones */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 5 }}>
        <span title={fit} style={{ fontSize: 11, color: '#34d399', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>✓ {fit}</span>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button onClick={follow} disabled={following} title={following ? 'Siguiendo' : 'Seguir'} style={{
            fontSize: 11, fontWeight: 700, padding: '4px 9px', borderRadius: 7, cursor: following ? 'default' : 'pointer',
            color: following ? '#34d399' : '#818cf8',
            background: following ? 'rgba(52,211,153,0.12)' : 'rgba(99,102,241,0.12)',
            border: `1px solid ${following ? 'rgba(52,211,153,0.3)' : 'rgba(99,102,241,0.3)'}`,
          }}>
            {following ? '✓' : '👁'}
          </button>
          <Link href={`/empresa/${rec.ticker}`} style={{
            fontSize: 11, fontWeight: 700, padding: '4px 9px', borderRadius: 7, textDecoration: 'none',
            color: '#c8d0e0', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
          }}>
            Ver →
          </Link>
        </div>
      </div>
    </div>
  )
}

// ── Componente ───────────────────────────────────────────────────────────────
export default function CompanyDetector({ enriched, isPremium }) {
  const [recs, setRecs]       = useState([])
  const [nextUpdate, setNext] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(false)

  const weights = useMemo(() => computeWeights(enriched), [enriched])

  useEffect(() => {
    if (!isPremium) { setLoading(false); return }
    let cancelled = false
    setLoading(true); setError(false)
    fetch('/api/empresas-encajan', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weights }),
    })
      .then(r => r.json())
      .then(d => { if (cancelled) return; setRecs(d.recommendations || []); setNext(d.nextUpdate || null) })
      .catch(() => { if (!cancelled) setError(true) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [isPremium, weights])

  const daysLeft = useMemo(() => {
    if (!nextUpdate) return null
    const d = Math.ceil((new Date(nextUpdate) - Date.now()) / (24 * 60 * 60 * 1000))
    return d > 0 ? d : null
  }, [nextUpdate])

  if (!isPremium) {
    return (
      <div style={{ background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 12, padding: '14px 18px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#c8d0e0', marginBottom: 2 }}>Empresas que encajan en tu cartera</p>
          <p style={{ fontSize: 12, color: '#4a5270' }}>Cada semana, 5 empresas de calidad en zona de compra que refuerzan tus huecos de sector, divisa y país.</p>
        </div>
        <Link href="/pricing" style={{ fontSize: 12, fontWeight: 700, color: '#fff', textDecoration: 'none', padding: '8px 16px', background: 'rgba(99,102,241,0.85)', borderRadius: 8, flexShrink: 0 }}>
          Premium →
        </Link>
      </div>
    )
  }

  return (
    <div style={{ marginBottom: 16, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 12, padding: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: '#818cf8', textTransform: 'uppercase', letterSpacing: '0.1em' }} title="5 empresas de calidad en zona de compra que cubren sectores, divisas y países poco presentes en tu cartera.">Empresas que encajan · semanal</p>
        {daysLeft != null && (
          <span style={{ fontSize: 11, color: '#5a647e' }}>Se renueva en {daysLeft} {daysLeft === 1 ? 'día' : 'días'}</span>
        )}
      </div>

      {loading ? (
        <p style={{ fontSize: 12, color: '#4a5270' }}>Analizando tu cartera y buscando oportunidades…</p>
      ) : error ? (
        <p style={{ fontSize: 12, color: '#f87171' }}>No se pudieron generar recomendaciones. Inténtalo más tarde.</p>
      ) : recs.length === 0 ? (
        <p style={{ fontSize: 12.5, color: '#34d399', padding: '4px 0' }}>✓ Sin huecos claros esta semana — vuelve la semana que viene.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 8 }}>
          {recs.map(rec => <RecCard key={rec.ticker} rec={rec} />)}
        </div>
      )}
    </div>
  )
}
