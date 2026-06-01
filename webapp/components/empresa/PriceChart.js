'use client'
import { useState, useCallback, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

const RANGES = [
  { id: '1M',  label: '1M',  days: 35  },
  { id: '3M',  label: '3M',  days: 95  },
  { id: '6M',  label: '6M',  days: 185 },
  { id: '1A',  label: '1A',  days: 370 },
  { id: '3A',  label: '3A',  days: 1100 },
]

const W = 800, H = 200
const PAD = { top: 16, right: 12, bottom: 32, left: 58 }
const IW  = W - PAD.left - PAD.right
const IH  = H - PAD.top  - PAD.bottom

function fmtPrice(v) {
  if (v == null) return '—'
  if (Math.abs(v) >= 10000) return v.toLocaleString('es-ES', { maximumFractionDigits: 0 })
  if (Math.abs(v) >= 1000)  return v.toLocaleString('es-ES', { maximumFractionDigits: 1 })
  return v.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDateLabel(dateStr, rangeId) {
  const d = new Date(dateStr + 'T12:00:00')
  if (rangeId === '3A') return d.toLocaleDateString('es-ES', { month: 'short', year: '2-digit' })
  if (rangeId === '1A') return d.toLocaleDateString('es-ES', { month: 'short', year: '2-digit' })
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
}

// Para períodos > 1 año, agrupa a último cierre de cada mes
function toMonthly(rows) {
  const map = {}
  for (const r of rows) map[r.date.slice(0, 7)] = r
  return Object.values(map).sort((a, b) => a.date.localeCompare(b.date))
}

function buildLine(series, xOf, yOf) {
  return series.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xOf(i).toFixed(1)} ${yOf(v).toFixed(1)}`).join(' ')
}

function buildArea(linePath, n, xOf, yOf) {
  const lastX = xOf(n - 1).toFixed(1)
  const baseY = (PAD.top + IH).toFixed(1)
  return `${linePath} L ${lastX},${baseY} L ${PAD.left.toFixed(1)},${baseY} Z`
}

function Chart({ rows, rangeId, avgCost }) {
  const [hover, setHover] = useState(null)
  const svgRef = useRef(null)

  if (!rows?.length) return (
    <div style={{ height: H, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: '#3a4260', fontSize: 12 }}>Sin datos — ejecuta update_prices.py para poblar daily_prices</p>
    </div>
  )

  const closes  = rows.map(r => r.price)
  const dates   = rows.map(r => r.date)

  const minPrice = Math.min(...closes)
  const maxPrice = Math.max(...closes)
  const span     = maxPrice - minPrice || 1

  const xOf = i => PAD.left + (i / (closes.length - 1)) * IW
  const yOf = v => PAD.top  + IH - ((v - minPrice) / span) * IH

  const priceUp    = closes[closes.length - 1] >= closes[0]
  const priceColor = priceUp ? '#34d399' : '#f87171'
  const priceGain  = ((closes[closes.length - 1] / closes[0]) - 1) * 100

  const priceLine = buildLine(closes, xOf, yOf)
  const priceArea = buildArea(priceLine, closes.length, xOf, yOf)

  const labelCount = 5
  const xLabels = Array.from({ length: labelCount }, (_, i) => {
    const idx = Math.round(i / (labelCount - 1) * (dates.length - 1))
    return { x: xOf(idx), label: fmtDateLabel(dates[idx], rangeId) }
  })
  const yLabels = [0, 0.33, 0.67, 1].map(t => ({
    y: yOf(minPrice + t * span), label: fmtPrice(minPrice + t * span),
  }))

  // avg_cost horizontal line — solo si está dentro del rango visible
  const showAvgCost = avgCost != null && avgCost >= minPrice * 0.8 && avgCost <= maxPrice * 1.2
  const avgCostY    = showAvgCost ? yOf(avgCost) : null

  function handleMouseMove(e) {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return
    const relX = ((e.clientX - rect.left) / rect.width) * W - PAD.left
    if (relX < 0 || relX > IW) { setHover(null); return }
    const idx = Math.min(closes.length - 1, Math.max(0, Math.round(relX / IW * (closes.length - 1))))
    setHover({ idx, x: xOf(idx), yPrice: yOf(closes[idx]), price: closes[idx], date: dates[idx] })
  }

  return (
    <div style={{ position: 'relative' }}>
      {/* Legend row */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 6, fontSize: 11, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ color: priceColor, fontWeight: 600 }}>
          {priceGain >= 0 ? '+' : ''}{priceGain.toFixed(1)}%
        </span>
        <span style={{ color: '#4a5270' }}>
          Mín {fmtPrice(minPrice)} · Máx {fmtPrice(maxPrice)}
        </span>
        {showAvgCost && (
          <span style={{ color: '#fbbf24', fontWeight: 600 }}>— Precio medio compra {fmtPrice(avgCost)}</span>
        )}
      </div>

      {/* Hover tooltip */}
      {hover && (
        <div style={{
          position: 'absolute', top: 22,
          left: hover.x / W * 100 + '%',
          transform: hover.idx > closes.length * 0.65 ? 'translateX(-110%)' : 'translateX(8px)',
          background: '#0f1221', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 8, padding: '6px 10px', pointerEvents: 'none', zIndex: 10, whiteSpace: 'nowrap',
        }}>
          <p style={{ fontSize: 10, color: '#4a5270', marginBottom: 4 }}>{fmtDateLabel(hover.date, rangeId)}</p>
          <p style={{ fontSize: 13, fontWeight: 800, color: priceColor, fontVariantNumeric: 'tabular-nums' }}>
            {fmtPrice(hover.price)}
          </p>
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
        </defs>

        {yLabels.map((l, i) => (
          <g key={i}>
            <line x1={PAD.left} x2={W - PAD.right} y1={l.y} y2={l.y} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
            <text x={PAD.left - 6} y={l.y + 4} textAnchor="end" fontSize="9" fill="#2a3045" fontFamily="inherit">{l.label}</text>
          </g>
        ))}

        {/* Avg cost horizontal line */}
        {avgCostY != null && (
          <g>
            <line x1={PAD.left} x2={W - PAD.right} y1={avgCostY} y2={avgCostY}
              stroke="#fbbf24" strokeWidth="1" strokeDasharray="5 3" />
            <text x={W - PAD.right + 4} y={avgCostY + 4} fontSize="8" fill="#fbbf24" fontFamily="inherit">
              {fmtPrice(avgCost)}
            </text>
          </g>
        )}

        <path d={priceArea} fill="url(#grad-price)" />
        <path d={priceLine} stroke={priceColor} strokeWidth="1.5" fill="none" strokeLinejoin="round" />

        {hover && (
          <>
            <line x1={hover.x} x2={hover.x} y1={PAD.top} y2={PAD.top + IH}
              stroke="rgba(255,255,255,0.18)" strokeWidth="1" strokeDasharray="4 3" />
            <circle cx={hover.x} cy={hover.yPrice} r="4" fill={priceColor} stroke="#080b14" strokeWidth="2" />
          </>
        )}

        {xLabels.map((l, i) => (
          <text key={i} x={l.x} y={H - 6} textAnchor="middle" fontSize="9" fill="#2a3045" fontFamily="inherit">{l.label}</text>
        ))}
      </svg>
    </div>
  )
}

export default function PriceChart({ ticker, currency, avgCost }) {
  const [range,   setRange]   = useState('1A')
  const [rows,    setRows]    = useState(null)
  const [loading, setLoading] = useState(false)
  const sb = createClient()

  const load = useCallback(async (rangeId) => {
    setLoading(true)
    const def   = RANGES.find(r => r.id === rangeId) || RANGES[3]
    const since = new Date()
    since.setDate(since.getDate() - def.days)
    const sinceStr = since.toISOString().slice(0, 10)

    const { data } = await sb
      .from('daily_prices')
      .select('date, close_price')
      .eq('ticker', ticker)
      .gte('date', sinceStr)
      .order('date', { ascending: true })

    let result = (data || []).map(r => ({ date: r.date, price: Number(r.close_price) }))

    // Para períodos > 1 año, usar datos mensuales
    if (def.days > 370 && result.length > 0) {
      result = toMonthly(result)
    }

    setRows(result)
    setLoading(false)
  }, [ticker, sb])

  useEffect(() => { load('1A') }, [load])

  function handleRange(id) { setRange(id); load(id) }

  return (
    <div>
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
        {loading && <span style={{ fontSize: 11, color: '#3a4260', marginLeft: 4 }}>cargando…</span>}
        {rows !== null && rows.length > 0 && (
          <span style={{ fontSize: 10, color: '#2e3a55', marginLeft: 'auto' }}>
            {currency} · daily_prices
          </span>
        )}
      </div>

      {rows === null ? (
        <div style={{ height: H, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: '#3a4260', fontSize: 12 }}>Cargando…</p>
        </div>
      ) : (
        <Chart rows={rows} rangeId={range} avgCost={avgCost} />
      )}
    </div>
  )
}
