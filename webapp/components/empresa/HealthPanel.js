'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'

// ── NIVEL 1 — SEMÁFORO ──────────────────────────────────────────────────────
// 5 filas compactas: círculo de color · categoría · diagnóstico · valor.

export function Semaforo({ rows }) {
  if (!rows?.length) {
    return <p style={{ fontSize: 13, color: '#4a5270' }}>Sin datos suficientes para el diagnóstico.</p>
  }
  return (
    <div style={{
      background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 10, overflow: 'hidden',
    }}>
      {rows.map((r, i) => (
        <div key={r.key} style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px',
          borderTop: i === 0 ? 'none' : '1px solid rgba(255,255,255,0.05)',
        }}>
          <span style={{ width: 11, height: 11, borderRadius: '50%', background: r.color, flexShrink: 0 }} />
          <span style={{ fontSize: 13, color: '#c8d0e0', flex: 1, minWidth: 0 }}>{r.name}</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: r.color, flexShrink: 0 }}>{r.diagnosis}</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#e0e8f0', width: 56, textAlign: 'right', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
            {r.value}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── NIVEL 2 — TARJETAS DETALLADAS ────────────────────────────────────────────

function MetricCard({ c }) {
  const gray = !c.hasData
  const beatColor = c.beats == null ? '#4a5270' : c.beats ? '#34d399' : '#fb923c'
  return (
    <div style={{
      background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 10, padding: '13px 14px', display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ fontSize: 11, color: '#8090a8', flex: 1, minWidth: 0 }}>{c.label}</span>
        <span title={c.tooltip} style={{
          fontSize: 9, fontWeight: 700, color: '#4a5270', border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: '50%', width: 15, height: 15, display: 'inline-flex', alignItems: 'center',
          justifyContent: 'center', cursor: 'help', flexShrink: 0,
        }}>?</span>
      </div>

      <p style={{ fontSize: 24, fontWeight: 800, color: gray ? '#4a5270' : c.color, lineHeight: 1 }}>
        {c.valueStr}
      </p>

      {/* Barra de progreso con 3 zonas + marcador */}
      <div style={{ position: 'relative', height: 6, borderRadius: 3, overflow: 'hidden', display: 'flex', background: 'rgba(255,255,255,0.05)' }}>
        {c.bar.segments.map((s, i) => (
          <div key={i} style={{ width: `${s.w}%`, background: gray ? 'rgba(255,255,255,0.06)' : `${s.color}66`, height: '100%' }} />
        ))}
      </div>
      <div style={{ position: 'relative', height: 0 }}>
        {!gray && c.bar.marker != null && (
          <div style={{
            position: 'absolute', top: -9, left: `${c.bar.marker}%`, transform: 'translateX(-50%)',
            width: 9, height: 9, borderRadius: '50%', background: c.color, border: '2px solid #080b14',
          }} />
        )}
      </div>

      {/* Comparativa vs sector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
        <span style={{ fontSize: 10, color: '#4a5270' }}>Sector ~{c.medianStr}</span>
        {!gray && c.beats != null && (
          <span style={{ fontSize: 10, fontWeight: 700, color: beatColor }}>
            {c.beats ? '▲' : '▼'}
          </span>
        )}
      </div>
    </div>
  )
}

export function HealthCards({ cards, isPremium }) {
  if (!cards?.length) return null

  const grid = (
    <>
      <style>{`
        .health-cards-grid { display: grid; grid-template-columns: 1fr; gap: 12px; }
        @media (min-width: 560px) { .health-cards-grid { grid-template-columns: 1fr 1fr; } }
        @media (min-width: 900px) { .health-cards-grid { grid-template-columns: 1fr 1fr 1fr; } }
        .health-expand { animation: healthExpand 0.28s ease; }
        @keyframes healthExpand { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
      `}</style>
      <div className="health-cards-grid">
        {cards.map(c => <MetricCard key={c.id} c={c} />)}
      </div>
    </>
  )

  if (isPremium) return grid

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ filter: 'blur(5px)', pointerEvents: 'none', userSelect: 'none' }}>{grid}</div>
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 8, background: 'rgba(8,11,20,0.55)',
      }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: '#818cf8' }}>Métricas detalladas (Premium)</p>
        <p style={{ fontSize: 12, color: '#4a5270', textAlign: 'center', maxWidth: 280 }}>
          Valores, barras de progreso y comparativa vs sector de cada métrica.
        </p>
        <Link href="/pricing" style={{
          fontSize: 12, fontWeight: 700, color: '#fff', textDecoration: 'none',
          padding: '7px 18px', background: 'rgba(99,102,241,0.85)', borderRadius: 8,
        }}>Activar Premium →</Link>
      </div>
    </div>
  )
}

// ── DOS NIVELES — semáforo + tarjetas colapsables ────────────────────────────
// Nivel 2 colapsado por defecto; recuerda el estado en localStorage por empresa.
// Default: desktop expandido · móvil colapsado.

export default function HealthTwoLevel({ panel, isPremium, ticker, sectorLabel }) {
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    let v = null
    try {
      const s = localStorage.getItem(`healthCards:${ticker}`)
      if (s === '1') v = true
      else if (s === '0') v = false
    } catch {}
    if (v == null) v = typeof window !== 'undefined' && window.innerWidth >= 820
    setExpanded(v)
  }, [ticker])

  const toggle = () => setExpanded(e => {
    const nv = !e
    try { localStorage.setItem(`healthCards:${ticker}`, nv ? '1' : '0') } catch {}
    return nv
  })

  return (
    <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: '#4a5270', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Salud financiera</p>
        {sectorLabel && (
          <span style={{ fontSize: 10, color: '#4a5270', background: 'rgba(255,255,255,0.04)', padding: '2px 8px', borderRadius: 5 }}>{sectorLabel}</span>
        )}
      </div>

      <Semaforo rows={panel?.semaforo} />

      {panel?.cards?.length > 0 && (
        <>
          <button onClick={toggle} style={{
            marginTop: 14, width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 8, padding: '9px 12px', cursor: 'pointer', color: '#818cf8', fontSize: 12, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            {expanded ? 'Ocultar métricas detalladas ▲' : 'Ver métricas detalladas ▼'}
          </button>
          {expanded && (
            <div className="health-expand" style={{ marginTop: 16 }}>
              <HealthCards cards={panel.cards} isPremium={isPremium} />
            </div>
          )}
        </>
      )}
    </div>
  )
}
