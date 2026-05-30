'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { MARKETS, REGIONS } from '@/lib/markets'

const REFRESH_INTERVAL = 60

function flagCode(emoji) {
  const cps = [...(emoji || '')].map(c => c.codePointAt(0))
  if (cps.length !== 2 || cps[0] < 0x1F1E6 || cps[0] > 0x1F1FF) return null
  return cps.map(cp => String.fromCharCode(cp - 0x1F1E6 + 65)).join('').toLowerCase()
}

function Flag({ emoji }) {
  const code = flagCode(emoji)
  if (!code) return <span style={{ fontSize: 14, lineHeight: 1 }}>🌐</span>
  return <img src={`https://flagcdn.com/20x15/${code}.png`} width={20} height={15} alt={code} style={{ display: 'block', borderRadius: 2, flexShrink: 0 }} />
}

function fmt(v) {
  if (v == null) return '—'
  if (Math.abs(v) >= 10000) return v.toLocaleString('es-ES', { maximumFractionDigits: 0 })
  if (Math.abs(v) >= 1000)  return v.toLocaleString('es-ES', { maximumFractionDigits: 1 })
  return v.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function scoreColor(s) {
  if (s == null) return '#2e3a55'
  return s >= 7 ? '#34d399' : s >= 4 ? '#fbbf24' : '#f87171'
}

function MarketCard({ m, q, dgi }) {
  const up     = q?.pct != null ? q.pct >= 0 : null
  const pctCol = up === null ? '#3a4260' : up ? '#34d399' : '#f87171'
  const sign   = q?.pct != null && q.pct >= 0 ? '+' : ''
  const pctStr = q?.pct != null
    ? sign + q.pct.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%'
    : '—'

  const score = dgi?.score           ?? null
  const yield_ = dgi?.avgYield       ?? null
  const opps  = dgi?.opportunityCount ?? null
  const sCol  = scoreColor(score)

  return (
    <Link href={`/mercados/${encodeURIComponent(m.symbol)}`} style={{ textDecoration: 'none', display: 'block' }}>
      <div
        style={{ padding: '11px 14px', borderBottom: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer' }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >
        {/* Top row: name + score */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <Flag emoji={m.flag} />
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#d0d8e8', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {m.name}
              </p>
              <p style={{ fontSize: 10, color: '#2e3a55', marginTop: 1 }}>{m.country}</p>
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <p style={{ fontSize: 22, fontWeight: 900, color: sCol, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
              {score != null ? score.toFixed(1) : '—'}
            </p>
            <p style={{ fontSize: 8, color: '#2e3a55', letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 1 }}>
              Score DGI
            </p>
          </div>
        </div>

        {/* Bottom row: price + yield + opps */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#8090a8', fontVariantNumeric: 'tabular-nums' }}>
              {fmt(q?.price)}
            </p>
            <p style={{ fontSize: 11, fontWeight: 600, color: pctCol, fontVariantNumeric: 'tabular-nums' }}>
              {pctStr}
            </p>
          </div>

          {yield_ != null && (
            <>
              <div style={{ width: 1, height: 10, background: 'rgba(255,255,255,0.08)', flexShrink: 0 }} />
              <p style={{ fontSize: 11, color: '#4a5270' }}>
                Yield <span style={{ color: '#34d399', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{(yield_ * 100).toFixed(2)}%</span>
              </p>
            </>
          )}

          {opps != null && opps > 0 && (
            <>
              <div style={{ width: 1, height: 10, background: 'rgba(255,255,255,0.08)', flexShrink: 0 }} />
              <p style={{ fontSize: 11, color: '#fb923c', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#fb923c', display: 'inline-block', flexShrink: 0 }} />
                {opps} en zona de compra
              </p>
            </>
          )}
        </div>
      </div>
    </Link>
  )
}

const SORT_OPTIONS = [
  { id: 'score', label: 'Score DGI'    },
  { id: 'yield', label: 'Yield'        },
  { id: 'opps',  label: 'Oportunidades'},
]

function applySorted(markets, region, sortBy, dgiScores) {
  const filtered = region === 'Todos' ? markets : markets.filter(m => m.region === region)
  return [...filtered].sort((a, b) => {
    const da = dgiScores[a.symbol]
    const db = dgiScores[b.symbol]
    if (sortBy === 'yield') return (db?.avgYield ?? -1) - (da?.avgYield ?? -1)
    if (sortBy === 'opps')  return (db?.opportunityCount ?? -1) - (da?.opportunityCount ?? -1)
    return (db?.score ?? -1) - (da?.score ?? -1)
  })
}

export default function MarketsClient({ initialQuotes = {}, initialTs = 0, dgiScores = {} }) {
  const [quotes,    setQuotes]    = useState(initialQuotes)
  const [ts,        setTs]        = useState(initialTs)
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL)
  const [loading,   setLoading]   = useState(false)
  const [region,    setRegion]    = useState('Todos')
  const [sortBy,    setSortBy]    = useState('score')

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/markets', { cache: 'no-store' })
      if (r.ok) {
        const d = await r.json()
        if (d.quotes) { setQuotes(d.quotes); setTs(d.ts) }
      }
    } catch {}
    setLoading(false)
    setCountdown(REFRESH_INTERVAL)
  }, [])

  useEffect(() => {
    const tick = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) { refresh(); return REFRESH_INTERVAL }
        return c - 1
      })
    }, 1000)
    return () => clearInterval(tick)
  }, [refresh])

  const regions     = ['Todos', ...REGIONS]
  const sorted      = applySorted(MARKETS, region, sortBy, dgiScores)
  const scoredCount = Object.keys(dgiScores).length
  const updatedAt   = ts
    ? new Date(ts).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <>
      <style>{`
        .mkts-grid { display: grid; grid-template-columns: 1fr; }
        @media (min-width: 640px) { .mkts-grid { grid-template-columns: 1fr 1fr; } }
      `}</style>

      <div style={{ maxWidth: 960, margin: '0 auto', padding: '22px 16px 60px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 900, color: '#e0e8f0', lineHeight: 1, marginBottom: 3 }}>
              Mercados Globales
            </h1>
            <p style={{ fontSize: 10, color: '#3a4260' }}>
              {sorted.length} índices
              {scoredCount > 0 && <> · <span style={{ color: '#4a5270' }}>{scoredCount} con Score DGI</span></>}
              {updatedAt && <> · act. {updatedAt}</>}
            </p>
          </div>
          <button onClick={refresh} disabled={loading} style={{
            fontSize: 11, fontWeight: 700,
            color: loading ? '#3a4260' : '#818cf8',
            background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)',
            borderRadius: 8, padding: '5px 12px', cursor: loading ? 'default' : 'pointer', fontFamily: 'inherit',
          }}>
            {loading ? '↻ Actualizando…' : `↻ ${countdown}s`}
          </button>
        </div>

        {/* Region tabs */}
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 8 }}>
          {regions.map(r => {
            const active = r === region
            const count  = r === 'Todos' ? MARKETS.length : MARKETS.filter(m => m.region === r).length
            return (
              <button key={r} onClick={() => setRegion(r)} style={{
                fontSize: 11, fontWeight: active ? 700 : 400, padding: '4px 11px', borderRadius: 20,
                border: '1px solid ' + (active ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.07)'),
                background: active ? 'rgba(99,102,241,0.15)' : 'transparent',
                color: active ? '#818cf8' : '#4a5270', cursor: 'pointer', fontFamily: 'inherit',
              }}>
                {r} <span style={{ opacity: 0.5, fontSize: 10 }}>{count}</span>
              </button>
            )
          })}
        </div>

        {/* Sort controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
          <p style={{ fontSize: 10, color: '#2e3a55' }}>Ordenar por:</p>
          {SORT_OPTIONS.map(o => {
            const active = o.id === sortBy
            return (
              <button key={o.id} onClick={() => setSortBy(o.id)} style={{
                fontSize: 10, fontWeight: active ? 700 : 400, padding: '3px 10px', borderRadius: 6,
                border: '1px solid ' + (active ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.06)'),
                background: active ? 'rgba(255,255,255,0.07)' : 'transparent',
                color: active ? '#c8d4e4' : '#3a4260', cursor: 'pointer', fontFamily: 'inherit',
              }}>
                {o.label}{active ? ' ↓' : ''}
              </button>
            )
          })}
        </div>

        {/* Grid */}
        <div className="mkts-grid" style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, overflow: 'hidden' }}>
          {sorted.map(m => (
            <MarketCard key={m.symbol} m={m} q={quotes[m.symbol]} dgi={dgiScores[m.symbol]} />
          ))}
        </div>

      </div>
    </>
  )
}
