'use client'

export default function DividendBars({ history }) {
  if (!history?.length) {
    return <p style={{ fontSize: 13, color: '#4a5270', textAlign: 'center', padding: '24px 0' }}>Sin historial de dividendos disponible.</p>
  }

  const maxDps = Math.max(...history.map(h => h.dps))

  return (
    <div>
      <div style={{
        display: 'flex',
        alignItems: 'flex-end',
        gap: 6,
        width: '100%',
        height: 120,
        padding: '0 4px',
        boxSizing: 'border-box',
      }}>
        {history.map((h) => {
          const pct = maxDps > 0 ? (h.dps / maxDps) * 100 : 0
          const grew = h.growth != null && h.growth > 0
          const flat = h.growth != null && h.growth === 0
          const barColor = h.isPartial
            ? 'rgba(99,102,241,0.5)'
            : grew ? '#34d399'
            : flat ? '#fbbf24'
            : h.growth == null ? 'rgba(255,255,255,0.12)'
            : '#f87171'

          return (
            <div
              key={h.year}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flex: 1, minWidth: 0 }}
            >
              {h.growth != null && !h.isPartial && (
                <span style={{
                  fontSize: 9,
                  color: grew ? '#34d399' : h.growth === 0 ? '#fbbf24' : '#f87171',
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

              <span style={{ fontSize: 10, color: '#4a5270', whiteSpace: 'nowrap' }}>
                {h.year}{h.isPartial ? '*' : ''}
              </span>
              <span style={{ fontSize: 10, color: '#c8d0e0', fontWeight: 600 }}>
                {h.dps.toFixed(2)}
              </span>
            </div>
          )
        })}
      </div>
      <p style={{ fontSize: 10, color: '#4a5270', marginTop: 8, textAlign: 'right' }}>
        * año en curso (parcial)
      </p>
    </div>
  )
}
