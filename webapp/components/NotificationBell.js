'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { BellIcon } from '@/components/NavIcons'

const ICON = { watchlist_price: '🎯', watchlist_yield: '🎯', watchlist_buyzone: '🟢', dividend_cut: '⚠️', dividend_increase: '📈', recurring: '💰' }

function timeAgo(date) {
  const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
  if (s < 60) return 'ahora'
  const m = Math.floor(s / 60); if (m < 60) return `hace ${m} min`
  const h = Math.floor(m / 60); if (h < 24) return `hace ${h} h`
  const d = Math.floor(h / 24); if (d < 30) return `hace ${d} d`
  return new Date(date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })
}

export default function NotificationBell() {
  const [items, setItems] = useState([])
  const [unread, setUnread] = useState(0)
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  const load = async () => {
    try {
      const res = await fetch('/api/notifications?limit=5')
      if (!res.ok) return
      const json = await res.json()
      setItems(json.items || [])
      setUnread(json.unread || 0)
    } catch {}
  }

  useEffect(() => { load() }, [])

  // Cerrar al hacer clic fuera
  useEffect(() => {
    if (!open) return
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const markAll = async () => {
    setUnread(0)
    setItems(list => list.map(n => ({ ...n, read: true })))
    await fetch('/api/notifications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ all: true }) })
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} aria-label="Notificaciones" style={{
        position: 'relative', background: 'none', border: 'none', cursor: 'pointer',
        color: 'var(--text-strong)', padding: '5px 7px', lineHeight: 0,
        display: 'inline-flex', alignItems: 'center',
      }}>
        <BellIcon />
        {unread > 0 && (
          <span style={{
            position: 'absolute', top: -2, right: -2, minWidth: 15, height: 15, padding: '0 3px',
            background: 'var(--negative)', color: '#fff', fontSize: 9, fontWeight: 800, borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
          }}>{unread > 9 ? '9+' : unread}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 38, right: 0, width: 320, maxWidth: '90vw', zIndex: 100,
          background: 'var(--bg-elev)', border: '1px solid var(--border-strong)', borderRadius: 12,
          boxShadow: '0 8px 30px rgba(0,0,0,0.5)', overflow: 'hidden',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Notificaciones</p>
            {unread > 0 && <button onClick={markAll} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>Marcar todas como leídas</button>}
          </div>

          {items.length === 0 ? (
            <p style={{ padding: '24px 14px', fontSize: 12, color: 'var(--text-faint)', textAlign: 'center' }}>No tienes notificaciones</p>
          ) : (
            <div>
              {items.map(n => (
                <Link key={n.id} href={n.ticker ? `/empresa/${encodeURIComponent(n.ticker)}` : '/notificaciones'} onClick={() => setOpen(false)} style={{
                  display: 'flex', gap: 10, padding: '11px 14px', textDecoration: 'none',
                  borderBottom: '1px solid var(--surface-2)',
                  background: n.read ? 'transparent' : 'rgba(99,102,241,0.06)',
                }}>
                  <span style={{ fontSize: 15, flexShrink: 0, color: 'var(--text)', display: 'inline-flex', alignItems: 'center' }}>{ICON[n.type] || <BellIcon size={15} />}</span>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.4 }}>{n.message}</p>
                    <p style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 2 }}>{timeAgo(n.created_at)}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}

          <Link href="/notificaciones" onClick={() => setOpen(false)} style={{ display: 'block', padding: '11px 14px', textAlign: 'center', fontSize: 12, fontWeight: 700, color: 'var(--accent)', textDecoration: 'none', borderTop: '1px solid var(--border)' }}>
            Ver todas →
          </Link>
        </div>
      )}
    </div>
  )
}
