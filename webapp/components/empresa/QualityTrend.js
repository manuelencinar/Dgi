'use client'
// Panel "¿está mejorando o empeorando?": flechas por dimensión de calidad (desde las
// bonificaciones por tendencia) + evolución del Score DGI.
const ARROW = {
  up: { icon: '↑', color: 'var(--positive)', word: 'Mejorando' },
  flat: { icon: '→', color: 'var(--text-faint)', word: 'Estable' },
  down: { icon: '↓', color: 'var(--negative)', word: 'Bajando' },
}

export default function QualityTrend({ trend }) {
  const t = trend
  if (!t || !t.dims?.length) return null
  const hasScore = t.scoreDelta != null

  return (
    <div>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
        Tendencias sostenidas de los fundamentales.
        {t.improving > 0
          ? <b style={{ color: 'var(--positive)' }}> {t.improving} de {t.total} dimensiones mejorando.</b>
          : <span> Sin mejoras destacadas ahora mismo.</span>}
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {t.dims.map(d => {
          const a = ARROW[d.dir]
          return (
            <div key={d.label} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 11px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8 }}>
              <span style={{ fontSize: 15, fontWeight: 800, color: a.color, width: 14, textAlign: 'center' }}>{a.icon}</span>
              <span style={{ fontSize: 11.5, color: 'var(--text)', fontWeight: 600, flex: 1 }}>{d.label}</span>
              <span style={{ fontSize: 10.5, fontWeight: 700, color: a.color }}>{a.word}</span>
            </div>
          )
        })}
      </div>
      {hasScore && (
        <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 10 }}>
          <b style={{ color: ARROW[t.scoreDir].color }}>Score DGI {t.scoreDelta >= 0 ? '+' : ''}{t.scoreDelta}</b> en las últimas {t.weeks} semanas registradas.
        </p>
      )}
    </div>
  )
}
