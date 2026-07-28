'use client'
// Resiliencia del dividendo en crisis: mantuvo / subió / recortó el dividendo en 2008, 2020…
import { dividendResilience } from '@/lib/dividend-resilience'

const STYLE = {
  raised: { icon: '↑', color: 'var(--positive)', word: 'Subió' },
  held: { icon: '=', color: 'var(--warning)', word: 'Mantuvo' },
  cut: { icon: '↓', color: 'var(--negative)', word: 'Recortó' },
}

export default function DividendResilience({ divHistory }) {
  const r = dividendResilience(divHistory)
  if (!r.available) return null

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
      <p style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-strong)', marginBottom: 10 }}>Resiliencia del dividendo en crisis</p>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
        Comportamiento del dividendo en las grandes crisis — la mejor prueba de compromiso con el accionista.
        {r.total > 0 && <b style={{ color: r.survived === r.total ? 'var(--positive)' : 'var(--text)' }}> Superó {r.survived} de {r.total} sin recortarlo.</b>}
      </p>
      <div style={{ display: 'grid', gap: 8 }}>
        {r.crises.map(c => {
          const s = STYLE[c.outcome]
          return (
            <div key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 12px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 9 }}>
              <span style={{ fontSize: 18, fontWeight: 800, color: s.color, width: 18, textAlign: 'center' }}>{s.icon}</span>
              <span style={{ fontSize: 12.5, color: 'var(--text)', fontWeight: 600, flex: 1 }}>{c.label}</span>
              <span style={{ fontSize: 12.5, fontWeight: 800, color: s.color }}>{s.word} el dividendo</span>
              {c.changePct != null && (
                <span style={{ fontSize: 11, color: 'var(--text-faint)', width: 56, textAlign: 'right' }}>
                  {c.changePct >= 0 ? '+' : ''}{c.changePct}%
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
