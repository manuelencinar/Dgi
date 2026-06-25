'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

// Icono de ojo para las tarjetas del screener. Añade/quita directamente sin
// modal. Relleno si ya se sigue, contorno si no.
export default function WatchlistEyeButton({ ticker, isAuthed = false, initialFollowing = false, size = 15 }) {
  const router = useRouter()
  const [following, setFollowing] = useState(initialFollowing)
  const [busy, setBusy] = useState(false)

  const toggle = async (e) => {
    e.preventDefault(); e.stopPropagation()
    if (!isAuthed) {
      router.push(`/login?next=${encodeURIComponent(`/empresa/${ticker}`)}&msg=watchlist`)
      return
    }
    if (busy) return
    setBusy(true)
    const next = !following
    setFollowing(next) // optimista
    try {
      if (next) {
        const res = await fetch('/api/watchlist', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticker }),
        })
        if (res.status === 403) { setFollowing(false); alert('Límite del plan gratuito (10 empresas). Hazte Premium para seguir más.') }
        else if (!res.ok) setFollowing(false)
      } else {
        const res = await fetch(`/api/watchlist?ticker=${encodeURIComponent(ticker)}`, { method: 'DELETE' })
        if (!res.ok) setFollowing(true)
      }
    } catch { setFollowing(!next) }
    setBusy(false)
  }

  return (
    <button
      onClick={toggle}
      title={following ? 'En tu watchlist — clic para quitarla' : 'Añadir a tu watchlist (seguir)'}
      style={{
        background: following ? 'rgba(99,102,241,0.16)' : 'transparent',
        border: '1px solid ' + (following ? 'rgba(99,102,241,0.4)' : 'var(--border-strong)'),
        borderRadius: 6, cursor: 'pointer', padding: '2px 6px', lineHeight: 1,
        fontSize: size, opacity: following ? 1 : 0.45, flexShrink: 0,
      }}
    >
      👁
    </button>
  )
}
