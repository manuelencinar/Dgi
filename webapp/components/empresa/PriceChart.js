'use client'
import { useState, useCallback, useRef } from 'react'

const RANGES = [
  { id: '1M', label: '1M' },
  { id: '3M', label: '3M' },
  { id: '6M', label: '6M' },
  { id: '1A', label: '1A' },
  { id: '3A', label: '3A' },
  { id: '5A', label: '5A' },
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
  if (range === '1A' || range === '3A' || range === '5A') return d.toLocaleDateString('es-ES', { month: 'short', year: '2-digit' })
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
}

function buildLine(series, xOf, yOf) {
  return series.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xOf(i).toFixed(1)} ${yOf(v).toFixed(1)}`).join(' ')
}

// Reconstruye el total return (dividendos reinvertidos) a partir del historial
// anual de dividendos. Cada dividendo anual se reparte en 4 pagos trimestrales
// aproximados (mar/jun/sep/dic) y se reinvierte sobre la serie de precios.
function buildTotalReturn(timestamps, closes, divHistory) {
  if (!Array.isArray(divHistory) || !divHistory.length || !closes.length) return null

  const t0 = timestamps[0]
  const tN = timestamps[timestamps.length - 1]

  const pays = []
  for (const h of divHistory) {
    const dps = Number(h?.dps)
    if (!dps || dps <= 0 || h?.year == null) continue
    for (const month of [2, 5, 8, 11]) {       // mar, jun, sep, dic (índice 0-based)
      const t = Math.floor(Date.UTC(h.year, month, 15) / 1000)
      if (t >= t0 && t <= tN) pays.push({ t, amt: dps / 4 })
    }
  }
  if (!pays.length) return null
  pays.sort((a, b) => a.t - b.t)

  let shares = 1, pi = 0
  const tr = []
  for (let i = 0; i < closes.length; i++) {
    while (pi < pays.length && pays[pi].t <= timestamps[i]) {
      if (closes[i] > 0) shares += shares * pays[pi].amt / closes[i]
      pi++
    }
    tr.push(shares * closes[i])
  }
  return tr
}

function buildArea(linePath, closes, xOf, yOf) {
  const lastX = xOf(closes.length - 1).toFixed(1)
  const baseY = (PAD.top + IH).toFixed(1)
  return `${linePath} L ${lastX},${baseY} L ${PAD.left.toFixed(1)},${baseY} Z`
}

function Chart({ data, range, showTR, avgCost }) {
  const [hover, setHover] = useState(null)
  const svgRef = useRef(null)

  const { timestamps: ts, closes, adjCloses } = data || {}
  if (!closes?.length) return (
    <div style={{ height: H, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: '#3a4260', fontSize: 12 }}>Sin datos</p>
    </div>
  )

  // Normalise adjCloses to start at the same price as closes
  // This makes both lines share the same starting point so the divergence = cumulative dividends
  const firstClose = closes[0]
  const firstAdj   = adjCloses?.[0] ?? firstClose
  const trSeries   = (adjCloses && showTR)
    ? adjCloses.map(v => v * firstClose / firstAdj)
    : null

  // Y scale across both series so they share the same axis
  const allValues = trSeries ? [...closes, ...trSeries] : closes
  const min  = Math.min(...allValues)
  const max  = Math.max(...allValues)
  const span = max - min || 1

  const xOf = i => PAD.left + (i / (closes.length - 1)) * IW
  const yOf = v => PAD.top  + IH - ((v - min) / span) * IH

  const priceUp    = closes[closes.length - 1] >= closes[0]
  const priceColor = priceUp ? '#34d399' : '#f87171'

  const priceLine = buildLine(closes, xOf, yOf)
  const priceArea = buildArea(priceLine, closes, xOf, yOf)

  const trLine = trSeries ? buildLine(trSeries, xOf, yOf) : null
  const trArea = trSeries ? buildArea(trLine, trSeries, xOf, yOf) : null

  // Línea horizontal del precio medio de compra del usuario (solo si está en rango visible)
  const showAvgCost = avgCost != null && avgCost >= min && avgCost <= max
  const avgCostY    = showAvgCost ? yOf(avgCost) : null

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
    setHover({
      idx,
      x:       xOf(idx),
      yPrice:  yOf(closes[idx]),
      yTR:     trSeries ? yOf(trSeries[idx]) : null,
      price:   closes[idx],
      trPrice: trSeries?.[idx] ?? null,
      ts:      ts[idx],
    })
  }

  // % gain from start
  const priceGain = ((closes[closes.length - 1] / firstClose) - 1) * 100
  const trGain    = trSeries ? ((trSeries[trSeries.length - 1] / firstClose) - 1) * 100 : null

  return (
    <div style={{ position: 'relative' }}>
      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 6, fontSize: 11, flexWrap: 'wrap', alignItems: 'center' }}>
        {trSeries ? (
          <>
            <span style={{ color: priceColor, fontWeight: 600 }}>
              — Precio  {priceGain >= 0 ? '+' : ''}{priceGain.toFixed(1)}%
            </span>
            <span style={{ color: '#818cf8', fontWeight: 600 }}>
              — Con dividendos  {trGain != null ? `${trGain >= 0 ? '+' : ''}${trGain.toFixed(1)}%` : ''}
            </span>
          </>
        ) : (
          <span style={{ color: priceColor, fontWeight: 600 }}>
            {priceGain >= 0 ? '+' : ''}{priceGain.toFixed(1)}%
          </span>
        )}
        <span style={{ color: '#4a5270' }}>Mín {fmtPrice(min)} · Máx {fmtPrice(max)}</span>
        {showAvgCost && (
          <span style={{ color: '#fbbf24', fontWeight: 600 }}>— Precio medio {fmtPrice(avgCost)}</span>
        )}
      </div>

      {/* Hover tooltip */}
      {hover && (
        <div style={{
          position: 'absolute', top: 28,
          left: hover.x / W * 100 + '%',
          transform: hover.idx > closes.length * 0.65 ? 'translateX(-110%)' : 'translateX(8px)',
          background: '#0f1221', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 8, padding: '6px 10px', pointerEvents: 'none', zIndex: 10, whiteSpace: 'nowrap',
        }}>
          <p style={{ fontSize: 10, color: '#4a5270', marginBottom: 4 }}>{fmtDate(hover.ts, range)}</p>
          <p style={{ fontSize: 13, fontWeight: 800, color: priceColor, fontVariantNumeric: 'tabular-nums' }}>
            {fmtPrice(hover.price)}
          </p>
          {hover.trPrice != null && (
            <p style={{ fontSize: 11, color: '#818cf8', fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>
              Total return {fmtPrice(hover.trPrice)}
            </p>
          )}
        </div>
      )}

      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', display: 'block', cursor: 'crosshair' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="grad-price" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={priceColor} stopOpacity="0.18" />
            <stop offset="100%" stopColor={priceColor} stopOpacity="0" />
          </linearGradient>
          <linearGradient id="grad-tr" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#818cf8" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#818cf8" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Grid lines + Y labels */}
        {yLabels.map((l, i) => (
          <g key={i}>
            <line x1={PAD.left} x2={W - PAD.right} y1={l.y} y2={l.y} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
            <text x={PAD.left - 6} y={l.y + 4} textAnchor="end" fontSize="9" fill="#2a3045" fontFamily="inherit">{l.label}</text>
          </g>
        ))}

        {/* Total return fill + line (behind price) */}
        {trSeries && trArea && (
          <path d={trArea} fill="url(#grad-tr)" />
        )}
        {trSeries && trLine && (
          <path d={trLine} stroke="#818cf8" strokeWidth="1.5" fill="none" strokeLinejoin="round" strokeDasharray="4 2" />
        )}

        {/* Price fill + line */}
        <path d={priceArea} fill="url(#grad-price)" />
        <path d={priceLine} stroke={priceColor} strokeWidth="1.5" fill="none" strokeLinejoin="round" />

        {/* Avg cost horizontal line */}
        {avgCostY != null && (
          <g>
            <line x1={PAD.left} x2={W - PAD.right} y1={avgCostY} y2={avgCostY}
              stroke="#fbbf24" strokeWidth="1" strokeDasharray="5 3" />
            <text x={W - PAD.right + 2} y={avgCostY + 3} textAnchor="end" fontSize="8" fill="#fbbf24" fontFamily="inherit">
              {fmtPrice(avgCost)}
            </text>
          </g>
        )}

        {/* Hover crosshair + dots */}
        {hover && (
          <>
            <line x1={hover.x} x2={hover.x} y1={PAD.top} y2={PAD.top + IH}
              stroke="rgba(255,255,255,0.18)" strokeWidth="1" strokeDasharray="4 3" />
            <circle cx={hover.x} cy={hover.yPrice} r="4" fill={priceColor} stroke="#080b14" strokeWidth="2" />
            {hover.yTR != null && (
              <circle cx={hover.x} cy={hover.yTR} r="4" fill="#818cf8" stroke="#080b14" strokeWidth="2" />
            )}
          </>
        )}

        {/* X labels */}
        {xLabels.map((l, i) => (
          <text key={i} x={l.x} y={H - 6} textAnchor="middle" fontSize="9" fill="#2a3045" fontFamily="inherit">{l.label}</text>
        ))}
      </svg>
    </div>
  )
}

export default function PriceChart({ ticker, currency, avgCost, divHistory }) {
  const [range,    setRange]    = useState('1A')
  const [data,     setData]     = useState(null)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState(false)
  const [showTR,   setShowTR]   = useState(false)
  const loaded = useRef(false)

  const load = useCallback(async (r) => {
    setLoading(true)
    setError(false)
    try {
      const res  = await fetch(`/api/empresa/${encodeURIComponent(ticker)}/chart?range=${r}`, { cache: 'no-store' })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      if (!json.timestamps?.length) { setData(null); setError(true); setLoading(false); return }
      // Reconstruir la línea de total return desde el historial de dividendos
      const adjCloses = buildTotalReturn(json.timestamps, json.closes, divHistory)
      setData({ ...json, adjCloses })
    } catch {
      setError(true)
    }
    setLoading(false)
  }, [ticker, divHistory])

  if (!loaded.current) { loaded.current = true; load('1A') }

  function handleRange(r) { setRange(r); load(r) }

  const hasTR = data?.adjCloses?.length > 0

  return (
    <div>
      {/* Controls row */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
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

        {/* Separator */}
        <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.08)', margin: '0 4px' }} />

        {/* Total return toggle */}
        <button
          onClick={() => setShowTR(v => !v)}
          disabled={!hasTR}
          style={{
            fontSize: 11, fontWeight: showTR ? 700 : 400, padding: '4px 12px', borderRadius: 6,
            border: '1px solid ' + (showTR ? 'rgba(129,140,248,0.5)' : 'rgba(255,255,255,0.08)'),
            background: showTR ? 'rgba(99,102,241,0.15)' : 'transparent',
            color: showTR ? '#818cf8' : hasTR ? '#4a5270' : '#2e3a55',
            cursor: hasTR ? 'pointer' : 'default', fontFamily: 'inherit',
            opacity: hasTR ? 1 : 0.4,
          }}
          title="Muestra el retorno total incluyendo dividendos reinvertidos"
        >
          + Dividendos
        </button>

        {loading && <span style={{ fontSize: 11, color: '#3a4260', marginLeft: 4 }}>cargando…</span>}
      </div>

      {/* Chart */}
      {error ? (
        <div style={{ height: H, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: '#3a4260', fontSize: 12 }}>Sin datos de cotización disponibles</p>
        </div>
      ) : data ? (
        <Chart data={data} range={range} showTR={showTR} avgCost={avgCost} />
      ) : (
        <div style={{ height: H, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: '#3a4260', fontSize: 12 }}>Cargando…</p>
        </div>
      )}
    </div>
  )
}
