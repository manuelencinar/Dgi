'use client'
import { useState } from 'react'
import Link from 'next/link'

const ICON = { watchlist_price: '🎯', watchlist_yield: '🎯', dividend_cut: '⚠️', dividend_increase: '📈', recurring: '💰' }

function timeAgo(date) {
  const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
  if (s < 60) return 'ahora'
  const m = Math.floor(s / 60); if (m < 60) return `hace ${m} min`
  const h = Math.floor(m / 60); if (h < 24) return `hace ${h} h`
  const d = Math.floor(h / 24); if (d < 30) return `hace ${d} d`
  return new Date(date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function NotificationsClient({ initialItems = [] }) {
  const [items, setItems] = useState(initialItems)
  const unread = items.filter(n => !n.read).length

  const markAll = async () => {
    setItems(list => list.map(n => ({ ...n, read: true })))
    await fetch('/api/notifications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ all: true }) })
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 16px 80px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, color: '#e0e8f0' }}>Notificaciones</h1>
        {unread > 0 && <button onClick={markAll} style={{ fontSize: 12, fontWeight: 700, color: '#818cf8', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)', padding: '7px 14px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit' }}>Marcar todas como leídas</button>}
      </div>

      {items.length === 0 ? (
        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '60px 20px', textAlign: 'center' }}>
          <p style={{ fontSize: 32, marginBottom: 12 }}>🔔</p>
          <p style={{ fontSize: 14, color: '#8090a8' }}>No tienes notificaciones todavía.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {items.map(n => (
            <Link key={n.id} href={n.ticker ? `/empresa/${encodeURIComponent(n.ticker)}` : '#'} style={{
              display: 'flex', gap: 12, padding: '14px 16px', textDecoration: 'none',
              background: n.read ? 'rgba(255,255,255,0.02)' : 'rgba(99,102,241,0.07)',
              border: '1px solid ' + (n.read ? 'rgba(255,255,255,0.06)' : 'rgba(99,102,241,0.2)'),
              borderRadius: 10,
            }}>
              <span style={{ fontSize: 18, flexShrink: 0 }}>{ICON[n.type] || '🔔'}</span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <p style={{ fontSize: 13, color: '#c8d0e0', lineHeight: 1.45 }}>{n.message}</p>
                <p style={{ fontSize: 11, color: '#4a5270', marginTop: 4 }}>{timeAgo(n.created_at)}</p>
              </div>
              {!n.read && <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#818cf8', flexShrink: 0, marginTop: 6 }} />}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
