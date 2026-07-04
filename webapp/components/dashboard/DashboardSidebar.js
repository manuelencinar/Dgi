'use client'
import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const LINKS = [
  { href: '/dashboard',          label: 'Resumen',  icon: '▦', exact: true },
  { href: '/dashboard/datos',    label: 'Datos',    icon: '⛁' },
  { href: '/dashboard/usuarios', label: 'Usuarios', icon: '👥' },
  { href: '/dashboard/beta',     label: 'Fundadores (Bizum)', icon: '🚀' },
  { href: '/dashboard/guias',    label: 'Guías (blog)', icon: '✍️' },
  { href: '/dashboard/indices',  label: 'Índices',  icon: '🌐' },
  { href: '/dashboard/sistema',  label: 'Sistema',  icon: '⚙' },
  { href: '/dashboard/cambios',  label: 'Cambios pendientes', icon: '📋' },
]

export default function DashboardSidebar() {
  const path = usePathname()
  const [open, setOpen] = useState(false)

  const nav = (
    <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {LINKS.map(l => {
        const active = l.exact ? path === l.href : path.startsWith(l.href)
        return (
          <Link key={l.href} href={l.href} onClick={() => setOpen(false)} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8,
            textDecoration: 'none', fontSize: 14, fontWeight: active ? 700 : 500,
            color: active ? 'var(--accent)' : 'var(--text-muted)',
            background: active ? 'rgba(99,102,241,0.12)' : 'transparent',
          }}>
            <span style={{ fontSize: 15, width: 18, textAlign: 'center' }}>{l.icon}</span>
            {l.label}
          </Link>
        )
      })}
    </nav>
  )

  const header = (
    <div style={{ marginBottom: 24 }}>
      <p style={{ fontSize: 15, fontWeight: 900, color: 'var(--text-strong)' }}>EverDiv</p>
      <p style={{ fontSize: 10, fontWeight: 700, color: '#fb923c', letterSpacing: '0.1em', marginTop: 2 }}>ADMIN</p>
    </div>
  )

  const viewApp = (
    <a href="/" target="_blank" rel="noopener" style={{
      display: 'block', marginTop: 'auto', padding: '9px 14px', borderRadius: 8, textAlign: 'center',
      fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textDecoration: 'none',
      background: 'var(--surface-2)', border: '1px solid var(--surface-3)',
    }}>
      Ver app ↗
    </a>
  )

  return (
    <>
      {/* Topbar móvil */}
      <div className="dash-mobile-bar" style={{
        display: 'none', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px', borderBottom: '1px solid var(--border)',
        position: 'sticky', top: 0, background: 'var(--nav-bg)', backdropFilter: 'blur(12px)', zIndex: 60,
      }}>
        <p style={{ fontSize: 14, fontWeight: 900, color: 'var(--text-strong)' }}>Admin · EverDiv</p>
        <button onClick={() => setOpen(o => !o)} style={{ background: 'none', border: 'none', color: 'var(--text)', fontSize: 22, cursor: 'pointer' }}>≡</button>
      </div>

      {/* Drawer móvil */}
      {open && (
        <div className="dash-mobile-drawer" style={{
          display: 'none', position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(0,0,0,0.6)',
        }} onClick={() => setOpen(false)}>
          <div onClick={e => e.stopPropagation()} style={{
            width: 240, height: '100%', background: 'var(--bg-elev)', padding: 20,
            display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--surface-3)',
          }}>
            {header}{nav}{viewApp}
          </div>
        </div>
      )}

      {/* Sidebar desktop */}
      <aside className="dash-sidebar" style={{
        width: 220, flexShrink: 0, height: '100vh', position: 'sticky', top: 0,
        background: 'var(--bg-elev)', borderRight: '1px solid var(--border)',
        padding: 20, display: 'flex', flexDirection: 'column',
      }}>
        {header}{nav}{viewApp}
      </aside>

      <style>{`
        @media (max-width: 768px) {
          .dash-sidebar { display: none !important; }
          .dash-mobile-bar { display: flex !important; }
          .dash-mobile-drawer { display: block !important; }
        }
      `}</style>
    </>
  )
}
