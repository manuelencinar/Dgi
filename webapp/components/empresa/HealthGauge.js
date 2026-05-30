'use client'

const COLOR_MAP = [
  [75, '#34d399', 'Muy sana'],
  [55, '#86efac', 'Sana'],
  [40, '#fbbf24', 'Regular'],
  [25, '#f97316', 'Débil'],
  [0,  '#f87171', 'Frágil'],
]

function getColor(score) {
  for (const [threshold, color, label] of COLOR_MAP) {
    if (score >= threshold) return { color, label }
  }
  return { color: '#f87171', label: 'Frágil' }
}

export default function HealthGauge({ score }) {
  if (score == null) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
        <svg width={160} height={90} viewBox="0 0 160 90">
          <path d="M 20 80 A 60 60 0 0 1 140 80" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={14} strokeLinecap="round" />
        </svg>
        <span style={{ fontSize: 12, color: '#4a5270' }}>Sin datos</span>
      </div>
    )
  }

  const { color, label } = getColor(score)
  const clamped = Math.max(0, Math.min(100, score))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <svg width={160} height={90} viewBox="0 0 160 90">
        {/* track */}
        <path
          d="M 20 80 A 60 60 0 0 1 140 80"
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={14}
          strokeLinecap="round"
        />
        {/* fill arc — pathLength normalises stroke-dasharray to 0–100 */}
        <path
          d="M 20 80 A 60 60 0 0 1 140 80"
          fill="none"
          stroke={color}
          strokeWidth={14}
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray={`${clamped} 100`}
        />
        {/* score text */}
        <text
          x={80} y={72}
          textAnchor="middle"
          fill="#c8d0e0"
          fontSize={28}
          fontWeight={700}
          fontFamily="'Figtree',sans-serif"
        >
          {score}
        </text>
      </svg>
      <span style={{ fontSize: 12, fontWeight: 600, color }}>{label}</span>
    </div>
  )
}
