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

// Gauge dimensions
const VW = 200, VH = 128
const CX = 100, CY = 96, R = 78

// Arc path for a semicircle of radius R centered at (CX, CY)
const arcPath = `M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`

export default function HealthGauge({ score }) {
  if (score == null) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
        <svg width={VW} height={VH} viewBox={`0 0 ${VW} ${VH}`}>
          <path d={arcPath} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={12} strokeLinecap="round" />
        </svg>
        <span style={{ fontSize: 12, color: '#4a5270' }}>Sin datos</span>
      </div>
    )
  }

  const { color, label } = getColor(score)
  const clamped = Math.max(0, Math.min(100, score))

  // Needle: angle goes from π (left, score=0) to 0 (right, score=100)
  const angle  = Math.PI * (1 - clamped / 100)
  const nLen   = 62
  const tipX   = CX + nLen * Math.cos(angle)
  const tipY   = CY - nLen * Math.sin(angle)

  // Needle base triangle (perpendicular to needle direction)
  const perpA  = angle + Math.PI / 2
  const bHalf  = 5
  const b1x    = CX + bHalf * Math.cos(perpA)
  const b1y    = CY - bHalf * Math.sin(perpA)
  const b2x    = CX - bHalf * Math.cos(perpA)
  const b2y    = CY + bHalf * Math.sin(perpA)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <svg width={VW} height={VH} viewBox={`0 0 ${VW} ${VH}`}>
        {/* Track */}
        <path d={arcPath} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={12} strokeLinecap="round" />
        {/* Fill arc */}
        <path
          d={arcPath}
          fill="none"
          stroke={color}
          strokeWidth={12}
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray={`${clamped} 100`}
        />
        {/* Score labels: 0 (izq), 50 (arriba), 100 (der) — posiciones bien separadas */}
        <text x={CX - R} y={CY + 16} textAnchor="middle" fontSize="9" fill="#4a5270" fontFamily="inherit">0</text>
        <text x={CX}     y={CY - R - 5} textAnchor="middle" fontSize="9" fill="#4a5270" fontFamily="inherit">50</text>
        <text x={CX + R} y={CY + 16} textAnchor="middle" fontSize="9" fill="#4a5270" fontFamily="inherit">100</text>
        {/* Needle */}
        <polygon
          points={`${b1x.toFixed(1)},${b1y.toFixed(1)} ${tipX.toFixed(1)},${tipY.toFixed(1)} ${b2x.toFixed(1)},${b2y.toFixed(1)}`}
          fill={color}
          opacity="0.9"
        />
        {/* Center hub */}
        <circle cx={CX} cy={CY} r="6" fill={color} />
        <circle cx={CX} cy={CY} r="3" fill="#080b14" />
        {/* Score text below arc */}
        <text x={CX} y={CY + 22} textAnchor="middle" fontSize="22" fontWeight="700" fill="#c8d0e0" fontFamily="'Figtree',sans-serif">
          {Math.round(clamped)}
        </text>
      </svg>
      <span style={{ fontSize: 12, fontWeight: 600, color, marginTop: -4 }}>{label}</span>
    </div>
  )
}
