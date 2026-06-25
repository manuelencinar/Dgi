'use client'
import { useState } from 'react'

// Logos auto-alojados en Supabase Storage (bucket público 'company-logos', poblado
// por scripts/fetch_logos.mjs). Si una empresa no tiene logo, cae a un monograma
// circular con las iniciales y un color derivado del nombre (nunca un icono roto).
// Nota: la env var puede traer espacios al final (caso real en Vercel) → .trim()
// para no generar una URL rota tipo "…supabase.co  /storage/…".
const SUPA_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim().replace(/\/+$/, '')
const BASE = SUPA_URL ? `${SUPA_URL}/storage/v1/object/public/company-logos` : ''

function colorFromName(s) {
  let h = 0
  for (let i = 0; i < (s || '').length; i++) h = (h * 31 + s.charCodeAt(i)) % 360
  return `hsl(${h},42%,42%)`
}

function initials(name, ticker) {
  const base = (name || ticker || '?').replace(/[^A-Za-zÀ-ÿ0-9 ]/g, ' ').trim()
  const words = base.split(/\s+/).filter(Boolean)
  const ini = words.slice(0, 2).map(w => w[0]).join('')
  return (ini || (ticker || '?')[0] || '?').toUpperCase()
}

export default function CompanyLogo({ ticker, name, size = 36, rounded = true }) {
  const [failed, setFailed] = useState(false)
  const radius = rounded ? '50%' : Math.round(size * 0.22)
  const box = { width: size, height: size, borderRadius: radius, flexShrink: 0, boxSizing: 'border-box' }

  if (failed || !BASE || !ticker) {
    return (
      <div aria-label={name || ticker} style={{
        ...box, background: colorFromName(name || ticker || '?'),
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff', fontWeight: 800, fontSize: Math.round(size * 0.4), letterSpacing: '0.02em',
      }}>{initials(name, ticker)}</div>
    )
  }

  // Logo sobre un "chip" blanco para que se vea en ambos temas (muchos logos son
  // oscuros/transparentes y se perderían sobre fondo oscuro).
  return (
    <img
      src={`${BASE}/${encodeURIComponent(ticker)}.png`}
      alt={name || ticker} width={size} height={size} loading="lazy"
      onError={() => setFailed(true)}
      style={{ ...box, objectFit: 'contain', background: '#fff', padding: Math.round(size * 0.12), border: '1px solid var(--border)' }}
    />
  )
}
