'use client'
import Link from 'next/link'

// Pestañas de la sección "Rankings": Aristócratas ↔ Caníbales.
const TABS = [
  { href: '/aristocratas', label: '👑 Aristócratas', key: 'aristocratas' },
  { href: '/canibales',    label: '🦈 Caníbales',    key: 'canibales' },
  { href: '/compounders',  label: '⚙️ Compounding',  key: 'compounders' },
]

export default function RankingsTabs({ active }) {
  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
      {TABS.map(t => {
        const on = t.key === active
        return (
          <Link key={t.key} href={t.href} style={{
            fontSize: 13, fontWeight: on ? 800 : 600, textDecoration: 'none',
            padding: '8px 16px', borderRadius: 9,
            border: '1px solid ' + (on ? 'rgba(129,140,248,0.5)' : 'rgba(255,255,255,0.08)'),
            background: on ? 'rgba(99,102,241,0.16)' : 'transparent',
            color: on ? '#a5b4fc' : '#6a7090',
          }}>{t.label}</Link>
        )
      })}
    </div>
  )
}
