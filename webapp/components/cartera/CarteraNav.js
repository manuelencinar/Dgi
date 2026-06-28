'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { href: '/cartera',            label: 'Cartera',    exact: true },
  { href: '/cartera/proyeccion', label: 'Proyección' },
  { href: '/cartera/dividendos', label: 'Dividendos' },
  { href: '/cartera/liquidez',   label: 'Liquidez'   },
  { href: '/cartera/historial',  label: 'Historial'  },
  { href: '/etfs',               label: 'ETFs y Fondos' },
  { href: '/cartera/fiscalidad', label: 'Fiscalidad' },
]

export default function CarteraNav() {
  const path = usePathname()
  return (
    <div style={{
      position: 'sticky', top: 52, zIndex: 40,
      background: 'var(--nav-bg)', backdropFilter: 'blur(12px)',
      borderBottom: '1px solid var(--border)',
      padding: '0 16px',
    }}>
      <div style={{ maxWidth: 1000, margin: '0 auto', display: 'flex', gap: 2, height: 42, alignItems: 'center', overflowX: 'auto', scrollbarWidth: 'none' }}>
        {TABS.map(t => {
          const active = t.exact ? path === t.href : path.startsWith(t.href)
          return (
            <Link key={t.href} href={t.href} style={{
              fontSize: 13, fontWeight: active ? 700 : 500, padding: '5px 13px', borderRadius: 7,
              textDecoration: 'none', color: active ? 'var(--accent)' : 'var(--text-faint)',
              background: active ? 'rgba(99,102,241,0.12)' : 'transparent',
              whiteSpace: 'nowrap', flexShrink: 0,
            }}>
              {t.label}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
