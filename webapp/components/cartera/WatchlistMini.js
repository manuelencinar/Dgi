'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'

const CUR_SYM = { EUR: '€', USD: '$', GBP: '£', GBp: 'p', JPY: '¥', CHF: 'Fr', CAD: 'C$', AUD: 'A$' }
function fmtPx(v, cur) {
  if (v == null) return '—'
  const s = CUR_SYM[cur] || ''
  const n = Number(v).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return cur === 'EUR' ? `${n} ${s}` : `${s}${n}`
}

const CARD = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }

export default function WatchlistMini() {
  const [items, setItems] = useState(null)

  useEffect(() => {
    let alive = true
    fetch('/api/watchlist/enriched')
      .then(r => r.ok ? r.json() : { items: [] })
      .then(j => { if (alive) setItems((j.items || []).slice(0, 5)) })
      .catch(() => { if (alive) setItems([]) })
    return () => { alive = false }
  }, [])

  // No renderizar nada mientras carga o si la watchlist está vacía.
  if (!items || items.length === 0) return null

  return (
    <div style={{ ...CARD, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Siguiendo</p>
        <Link href="/watchlist" style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', textDecoration: 'none' }}>Ver watchlist completa →</Link>
      </div>
      <div style={{ display: 'grid', gap: 6 }}>
        {items.map(it => {
          const prox = it.proximity
          return (
            <Link key={it.id} href={`/empresa/${encodeURIComponent(it.ticker)}`} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8, textDecoration: 'none',
              background: prox?.inZone ? 'rgba(52,211,153,0.08)' : 'var(--surface)',
            }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.name}</p>
              <p style={{ fontSize: 12, color: 'var(--text)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{fmtPx(it.currentPrice, it.currency)}</p>
              {it.targetPrice != null && prox && (
                <p style={{ fontSize: 11, fontWeight: 700, color: prox.inZone ? 'var(--positive)' : 'var(--text-muted)', flexShrink: 0, width: 56, textAlign: 'right' }}>
                  {prox.pct >= 0 ? '+' : ''}{prox.pct.toFixed(1)}%
                </p>
              )}
              {prox?.inZone && <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--positive)', background: 'rgba(52,211,153,0.15)', padding: '2px 6px', borderRadius: 4, flexShrink: 0 }}>🎯 Zona</span>}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
