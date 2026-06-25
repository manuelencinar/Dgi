'use client'
import { useState } from 'react'
import Link from 'next/link'
import NotificationBell from '@/components/NotificationBell'
import GlobalSearch from '@/components/GlobalSearch'
import ThemeToggle from '@/components/ThemeToggle'

// Menú principal
const PRIMARY = [
  { href: '/mercados',     label: 'Mercados' },
  { href: '/screener',     label: 'Screener' },
  { href: '/aristocratas', label: 'Rankings' },
  { href: '/watchlist',    label: 'Watchlist' },
  { href: '/comparador',   label: 'Comparador' },
  { href: '/cartera',      label: 'Cartera' },
]
// Secundarios — accesibles desde sus flujos; en móvil aparecen apagados
const SECONDARY = [
  { href: '/construir-cartera', label: 'Construir cartera' },
  { href: '/calendario-dividendos', label: 'Calendario dividendos' },
  { href: '/etfs',       label: 'ETFs y Fondos' },
]

export default function NavMenu({ active, sessionUser }) {
  const [open, setOpen] = useState(false)

  const linkStyle = (href, secondary = false) => ({
    fontSize: secondary ? 12 : 13,
    fontWeight: secondary ? 400 : 500,
    padding: '6px 12px', borderRadius: 7, textDecoration: 'none',
    color: active === href ? 'var(--accent)' : secondary ? 'var(--text-faintest)' : 'var(--text-faint)',
    background: active === href ? 'var(--accent-bg)' : 'transparent',
  })

  return (
    <nav style={{
      position: 'sticky', top: 0, zIndex: 50,
      background: 'var(--nav-bg)', backdropFilter: 'blur(12px)',
      borderBottom: '1px solid var(--border)', padding: '0 16px',
    }}>
      <style>{`
        .nav-desktop { display: none; }
        .nav-burger  { display: inline-flex; }
        @media (min-width: 760px) {
          .nav-desktop { display: flex; }
          .nav-burger  { display: none; }
          .nav-mobile-menu { display: none !important; }
        }
      `}</style>

      <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'center', height: 52, gap: 0 }}>
        <Link href="/" style={{ fontSize: 14, fontWeight: 900, color: 'var(--text-strong)', textDecoration: 'none', marginRight: 28, flexShrink: 0 }}>
          Mi Índice DGI
        </Link>

        {/* Desktop: solo los tres principales */}
        <div className="nav-desktop" style={{ gap: 2, flex: 1 }}>
          {PRIMARY.map(l => <Link key={l.href} href={l.href} style={linkStyle(l.href)}>{l.label}</Link>)}
        </div>

        {/* Espaciador en móvil */}
        <div style={{ flex: 1 }} />

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <GlobalSearch />
          <ThemeToggle />
          {sessionUser ? (
            <>
              <NotificationBell />
              <Link href="/ajustes" title="Ajustes" style={{
                fontSize: 17, color: active === '/ajustes' ? 'var(--accent)' : 'var(--text-faint)',
                textDecoration: 'none', padding: '4px 7px', borderRadius: 7, lineHeight: 1,
                background: active === '/ajustes' ? 'var(--accent-bg)' : 'transparent',
              }}>⚙</Link>
            </>
          ) : (
            <>
              <Link href="/login" style={{ fontSize: 12, color: 'var(--text-faint)', textDecoration: 'none', padding: '6px 12px' }}>Acceder</Link>
              <Link href="/register" style={{ fontSize: 12, fontWeight: 700, color: '#fff', textDecoration: 'none', padding: '6px 14px', background: 'rgba(99,102,241,0.8)', borderRadius: 8 }}>Registro gratis</Link>
            </>
          )}
          {/* Botón hamburguesa (solo móvil) */}
          <button className="nav-burger" onClick={() => setOpen(o => !o)} aria-label="Menú" style={{
            background: 'none', border: 'none', color: 'var(--text)', fontSize: 20, cursor: 'pointer',
            padding: '4px 6px', lineHeight: 1, alignItems: 'center',
          }}>{open ? '✕' : '☰'}</button>
        </div>
      </div>

      {/* Dropdown móvil */}
      {open && (
        <div className="nav-mobile-menu" style={{
          maxWidth: 1100, margin: '0 auto', padding: '8px 0 14px',
          display: 'flex', flexDirection: 'column', gap: 2,
        }}>
          {PRIMARY.map(l => (
            <Link key={l.href} href={l.href} onClick={() => setOpen(false)} style={{ ...linkStyle(l.href), padding: '10px 12px', fontSize: 15 }}>{l.label}</Link>
          ))}
          <div style={{ height: 1, background: 'var(--border)', margin: '8px 12px' }} />
          {SECONDARY.map(l => (
            <Link key={l.href} href={l.href} onClick={() => setOpen(false)} style={{ ...linkStyle(l.href, true), padding: '8px 12px', fontSize: 13 }}>{l.label}</Link>
          ))}
        </div>
      )}
    </nav>
  )
}
