'use client'
import { useState, useCallback, useRef } from 'react'

const RANGES = [
  { id: '1mo', label: '1M' },
  { id: '3mo', label: '3M' },
  { id: '1y',  label: '1A' },
  { id: '5y',  label: '5A' },
]

const W = 800, H = 200
const PAD = { top: 16, right: 12, bottom: 32, left: 58 }
const IW = W - PAD.left - PAD.right
const IH = H - PAD.top  - PAD.bottom

function fmtPrice(v) {
  if (v == null) return '—'
  if (Math.abs(v) >= 10000) return v.toLocaleString('es-ES', { maximumFractionDigits: 0 })
  if (Math.abs(v) >= 1000)  return v.toLocaleString('es-ES', { maximumFractionDigits: 1 })
  return v.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(ts, range) {
  const d = new Date(ts * 1000)
  if (range === '5y' || range === '1y') return d.toLocaleDateString('es-ES', { month: 'short', year: '2-digit' })
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
}

function Chart({ data, range }) {
  const [hover, setHover] = useState(null)
  const svgRef = useRef(null)

  const { timestamps: ts, closes } = data || {}
  if (!closes?.length) return (
    <div style={{ height: H, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: '#3a4260', fontSize: 12 }}>Sin datos</p>
    </div>
  )

  const min  = Math.min(...closes)
  const max  = Math.max(...closes)
  const span = max - min || 1

  const xOf = i => PAD.left + (i / (closes.length - 1)) * IW
  const yOf = v => PAD.top  + IH - ((v - min) / span) * IH

  const linePath = closes.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xOf(i).toFixed(1)} ${yOf(v).toFixed(1)}`).join(' ')
  const areaPath = `${linePath} L ${xOf(closes.length - 1).toFixed(1)} ${(PAD.top + IH).toFixed(1)} L ${PAD.left.toFixed(1)} ${(PAD.top + IH).toFixed(1)} Z`

  const netUp    = closes[closes.length - 1] >= closes[0]
  const lineColor = netUp ? '#34d399' : '#f87171'

  const labelCount = 5
  const xLabels = Array.from({ length: labelCount }, (_, i) => {
    const idx = Math.round(i / (labelCount - 1) * (ts.length - 1))
    return { x: xOf(idx), label: fmtDate(ts[idx], range) }
  })

  const yLabels = [0, 0.33, 0.67, 1].map(t => ({
    y:     yOf(min + t * span),
    label: fmtPrice(min + t * span),
  }))

  function handleMouseMove(e) {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return
    const relX = ((e.clientX - rect.left) / rect.width) * W - PAD.left
    if (relX < 0 || relX > IW) { setHover(null); return }
    const idx = Math.min(closes.length - 1, Math.max(0, Math.round(relX / IW * (closes.length - 1))))
    setHover({ idx, x: xOf(idx), y: yOf(closes[idx]), price: closes[idx], ts: ts[idx] })
  }

  return (
    <div style={{ position: 'relative' }}>
      {hover && (
        <div style={{
          position: 'absolute', top: 4,
          left: hover.x / W * 100 + '%',
          transform: hover.idx > closes.length * 0.65 ? 'translateX(-110%)' : 'translateX(8px)',
          background: '#0f1221', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 8, padding: '6px 10px', pointerEvents: 'none', zIndex: 10, whiteSpace: 'nowrap',
        }}>
          <p style={{ fontSize: 10, color: '#4a5270', marginBottom: 2 }}>{fmtDate(hover.ts, range)}</p>
          <p style={{ fontSize: 14, fontWeight: 800, color: '#e0e8f0', fontVariantNumeric: 'tabular-nums' }}>{fmtPrice(hover.price)}</p>
        </div>
      )}
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block', cursor: 'crosshair' }}
        onMouseMove={handleMouseMove} onMouseLeave={() => setHover(null)}>
        <defs>
          <linearGradient id="company-chart-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={lineColor} stopOpacity="0.22" />
            <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
          </linearGradient>
        </defs>
        {yLabels.map((l, i) => (
          <g key={i}>
            <line x1={PAD.left} x2={W - PAD.right} y1={l.y} y2={l.y} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
            <text x={PAD.left - 6} y={l.y + 4} textAnchor="end" fontSize="9" fill="#2a3045" fontFamily="inherit">{l.label}</text>
          </g>
        ))}
        <path d={areaPath} fill="url(#company-chart-grad)" />
        <path d={linePath} stroke={lineColor} strokeWidth="1.5" fill="none" strokeLinejoin="round" />
        {hover && (
          <>
            <line x1={hover.x} x2={hover.x} y1={PAD.top} y2={PAD.top + IH} stroke="rgba(255,255,255,0.18)" strokeWidth="1" strokeDasharray="4 3" />
            <circle cx={hover.x} cy={hover.y} r="4" fill={lineColor} stroke="#080b14" strokeWidth="2" />
          </>
        )}
        {xLabels.map((l, i) => (
          <text key={i} x={l.x} y={H - 6} textAnchor="middle" fontSize="9" fill="#2a3045" fontFamily="inherit">{l.label}</text>
        ))}
      </svg>
    </div>
  )
}

export default function PriceChart({ ticker, currency }) {
  const [range,    setRange]   = useState('1y')
  const [data,     setData]    = useState(null)
  const [loading,  setLoading] = useState(false)
  const [error,    setError]   = useState(false)
  const loaded = useRef(false)

  const load = useCallback(async (r) => {
    setLoading(true)
    setError(false)
    try {
      const res = await fetch(`/api/empresa/${encodeURIComponent(ticker)}/chart?range=${r}`, { cache: 'no-store' })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setData(json)
    } catch {
      setError(true)
    }
    setLoading(false)
  }, [ticker])

  // Load on first render
  if (!loaded.current) {
    loaded.current = true
    load('1y')
  }

  function handleRange(r) {
    setRange(r)
    load(r)
  }

  return (
    <div>
      {/* Range buttons */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
        {RANGES.map(r => {
          const active = r.id === range
          return (
            <button key={r.id} onClick={() => handleRange(r.id)} style={{
              fontSize: 11, fontWeight: active ? 700 : 400, padding: '4px 12px', borderRadius: 6,
              border: '1px solid ' + (active ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.08)'),
              background: active ? 'rgba(99,102,241,0.2)' : 'transparent',
              color: active ? '#818cf8' : '#4a5270', cursor: 'pointer', fontFamily: 'inherit',
            }}>{r.label}</button>
          )
        })}
        {loading && <span style={{ fontSize: 11, color: '#3a4260', alignSelf: 'center', marginLeft: 4 }}>cargando…</span>}
      </div>

      {/* Chart */}
      {error ? (
        <div style={{ height: H, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: '#3a4260', fontSize: 12 }}>Sin datos de cotización disponibles</p>
        </div>
      ) : data ? (
        <Chart data={data} range={range} />
      ) : (
        <div style={{ height: H, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: '#3a4260', fontSize: 12 }}>Cargando…</p>
        </div>
      )}
    </div>
  )
}
