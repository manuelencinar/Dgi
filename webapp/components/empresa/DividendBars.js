'use client'

export default function DividendBars({ history }) {
  if (!history?.length) {
    return <p style={{ fontSize: 13, color: 'var(--text-faint)', textAlign: 'center', padding: '24px 0' }}>Sin historial de dividendos disponible.</p>
  }

  const maxDps = Math.max(...history.map(h => h.dps))

  return (
    <div>
      <div style={{
        display: 'flex',
        alignItems: 'flex-end',
        gap: 3,
        width: '100%',
        maxWidth: Math.min(760, Math.max(280, history.length * 56)),
        margin: '0 auto',
        height: 150,
        padding: '8px 2px 0',
        boxSizing: 'border-box',
      }}>
        {history.map((h) => {
          const pct = maxDps > 0 ? (h.dps / maxDps) * 100 : 0
          const grew = h.growth != null && h.growth > 0
          const flat = h.growth != null && h.growth === 0
          const barColor = h.isPartial
            ? 'rgba(99,102,241,0.5)'
            : grew ? 'var(--positive)'
            : flat ? 'var(--warning)'
            : h.growth == null ? 'var(--border-strong)'
            : 'var(--negative)'

          return (
            <div
              key={h.year}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flex: 1, minWidth: 0 }}
            >
              {h.growth != null && !h.isPartial && (
                <span style={{
                  fontSize: 9,
                  color: grew ? 'var(--positive)' : h.growth === 0 ? 'var(--warning)' : 'var(--negative)',
                  fontWeight: 600,
                  height: 14,
                  lineHeight: '14px',
                }}>
                  {h.growth === 0 ? '=' : `${h.growth > 0 ? '+' : ''}${(h.growth * 100).toFixed(0)}%`}
                </span>
              )}
              {(h.growth == null || h.isPartial) && <span style={{ height: 14 }} />}

              <div style={{
                width: '50%',
                height: `${Math.max(4, pct * 0.78)}px`,
                background: barColor,
                borderRadius: '3px 3px 0 0',
                transition: 'height 0.4s ease',
              }} />

              <span style={{ fontSize: 10, color: 'var(--text-faint)', whiteSpace: 'nowrap' }}>
                {h.year}{h.isPartial ? '*' : ''}
              </span>
              <span style={{ fontSize: 10, color: 'var(--text)', fontWeight: 600 }}>
                {h.dps.toFixed(2)}
              </span>
            </div>
          )
        })}
      </div>
      <p style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 8, textAlign: 'right' }}>
        * año en curso (parcial)
      </p>
    </div>
  )
}
