'use client'
// Posición de la empresa dentro de su sector (percentiles). Barras por métrica: cuanto más
// a la derecha, mejor que sus comparables. Datos calculados en el servidor (page.js).

function barColor(pct) {
  return pct >= 80 ? 'var(--positive)' : pct >= 60 ? '#a3e635' : pct >= 40 ? 'var(--warning)' : pct >= 20 ? '#fb923c' : 'var(--negative)'
}

export default function SectorPositioning({ positioning }) {
  if (!positioning || !positioning.metrics?.length) return null
  const { sectorLabel, peerCount, metrics } = positioning

  return (
    <div>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
        Frente a {peerCount} empresas de su sector{sectorLabel ? ` (${sectorLabel})` : ''}. Barra a la derecha = mejor que la mayoría.
      </p>
      <div style={{ display: 'grid', gap: 9 }}>
        {metrics.map(m => (
          <div key={m.key} style={{ display: 'grid', gridTemplateColumns: '130px 1fr 62px', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 12, color: 'var(--text)', fontWeight: 600 }}>{m.label}</span>
            <div style={{ position: 'relative', height: 18, background: 'var(--surface-2)', borderRadius: 9, overflow: 'hidden' }}>
              <div style={{ position: 'absolute', inset: 0, width: `${m.percentile}%`, background: barColor(m.percentile), borderRadius: 9, transition: 'width .3s' }} />
              <span style={{ position: 'absolute', right: 7, top: 0, lineHeight: '18px', fontSize: 10.5, fontWeight: 700, color: 'var(--text-strong)' }}>{m.valueFmt}</span>
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color: barColor(m.percentile), textAlign: 'right' }}>
              {m.top <= 25 ? `top ${Math.max(1, m.top)}%` : `P${m.percentile}`}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
