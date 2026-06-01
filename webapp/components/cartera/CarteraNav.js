'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { href: '/cartera',            label: 'Cartera',    exact: true },
  { href: '/cartera/proyeccion', label: 'Proyección' },
  { href: '/cartera/calendario', label: 'Calendario' },
  { href: '/cartera/simulador',  label: 'Simulador'  },
  { href: '/cartera/historial',  label: 'Historial'  },
  { href: '/cartera/alertas',    label: 'Alertas'    },
  { href: '/cartera/ajustes',    label: 'Ajustes'    },
]

export default function CarteraNav() {
  const path = usePathname()
  return (
    <div style={{
      position: 'sticky', top: 52, zIndex: 40,
      background: 'rgba(8,11,20,0.96)', backdropFilter: 'blur(12px)',
      borderBottom: '1px solid rgba(255,255,255,0.06)',
      padding: '0 16px',
    }}>
      <div style={{ maxWidth: 1000, margin: '0 auto', display: 'flex', gap: 2, height: 42, alignItems: 'center', overflowX: 'auto', scrollbarWidth: 'none' }}>
        {TABS.map(t => {
          const active = t.exact ? path === t.href : path.startsWith(t.href)
          return (
            <Link key={t.href} href={t.href} style={{
              fontSize: 13, fontWeight: active ? 700 : 500, padding: '5px 13px', borderRadius: 7,
              textDecoration: 'none', color: active ? '#818cf8' : '#4a5270',
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
