'use client'
import { useState } from 'react'

const METRICS = [
  { id: 'revenue',    label: 'Ingresos',        unit: 'M' },
  { id: 'netIncome',  label: 'Beneficio neto',   unit: 'M' },
  { id: 'fcf',        label: 'FCF',              unit: 'M' },
  { id: 'eps',        label: 'BPA',              unit: '' },
]

function fmtVal(v, unit) {
  if (v == null) return '—'
  if (unit === 'M') {
    const abs = Math.abs(v)
    const sign = v < 0 ? '−' : ''
    if (abs >= 1000) return sign + (abs / 1000).toFixed(1) + 'B'
    return sign + abs.toFixed(0) + 'M'
  }
  return (v < 0 ? '−' : '') + Math.abs(v).toFixed(2)
}

function pctChg(curr, prev) {
  if (curr == null || prev == null || prev === 0) return null
  return ((curr - prev) / Math.abs(prev)) * 100
}

export default function KeyMetricsChart({ revenueHistory, netIncomeHistory, fcfHistory, epsHistory }) {
  const [active, setActive] = useState('revenue')

  const sources = {
    revenue:   revenueHistory,
    netIncome: netIncomeHistory,
    fcf:       fcfHistory,
    eps:       epsHistory,
  }

  const meta = METRICS.find(m => m.id === active)
  const raw  = sources[active]

  // Sort years ascending, take last 5
  const years = raw ? Object.keys(raw).sort().slice(-5) : []
  const vals  = years.map(y => raw[y] != null ? parseFloat(raw[y]) : null)

  const hasData = vals.some(v => v != null)

  // Chart dimensions
  const BAR_W  = 52
  const GAP    = 14
  const CHART_H = 130
  const TOP_PAD = 28   // space for value labels
  const BOT_PAD = 22   // space for year labels
  const totalW = years.length * (BAR_W + GAP) - GAP

  const validVals = vals.filter(v => v != null)
  const minV = Math.min(0, ...validVals)
  const maxV = Math.max(0, ...validVals)
  const span = maxV - minV || 1

  const yOf = v => TOP_PAD + (1 - (v - minV) / span) * CHART_H
  const zeroY = yOf(0)

  return (
    <div>
      {/* Metric tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap' }}>
        {METRICS.map(m => {
          const hasMetricData = sources[m.id] && Object.keys(sources[m.id]).length > 0
          const isActive = m.id === active
          return (
            <button
              key={m.id}
              onClick={() => setActive(m.id)}
              disabled={!hasMetricData}
              style={{
                fontSize: 12, fontWeight: isActive ? 700 : 400, padding: '5px 14px', borderRadius: 7,
                border: '1px solid ' + (isActive ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.08)'),
                background: isActive ? 'rgba(99,102,241,0.18)' : 'transparent',
                color: isActive ? '#818cf8' : hasMetricData ? '#4a5270' : '#2e3a55',
                cursor: hasMetricData ? 'pointer' : 'default',
                fontFamily: 'inherit', opacity: hasMetricData ? 1 : 0.4,
              }}
            >
              {m.label}
            </button>
          )
        })}
      </div>

      {!hasData ? (
        <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ fontSize: 13, color: '#2e3a55' }}>Sin datos históricos disponibles</p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <svg
            viewBox={`0 0 ${Math.max(totalW + 24, 200)} ${TOP_PAD + CHART_H + BOT_PAD}`}
            style={{ width: '100%', minWidth: Math.min(totalW + 24, 320), display: 'block' }}
          >
            {/* Zero line */}
            <line
              x1={0} x2={totalW + 24}
              y1={zeroY} y2={zeroY}
              stroke="rgba(255,255,255,0.08)" strokeWidth={1}
            />

            {years.map((yr, i) => {
              const v    = vals[i]
              const prev = i > 0 ? vals[i - 1] : null
              const chg  = pctChg(v, prev)
              const x    = i * (BAR_W + GAP)

              if (v == null) return null

              const barTop    = Math.min(yOf(v), zeroY)
              const barBottom = Math.max(yOf(v), zeroY)
              const barH      = Math.max(2, barBottom - barTop)

              const col = i === 0 ? '#818cf8'
                        : chg == null ? '#818cf8'
                        : chg >= 0   ? '#34d399'
                        : '#f87171'

              const labelY = barTop - 6
              const isNeg  = v < 0

              return (
                <g key={yr}>
                  {/* Bar */}
                  <rect
                    x={x} y={barTop} width={BAR_W} height={barH}
                    rx={3} fill={col} opacity={0.85}
                  />

                  {/* Value above bar */}
                  <text
                    x={x + BAR_W / 2}
                    y={isNeg ? barBottom + 14 : Math.max(labelY, 12)}
                    textAnchor="middle"
                    fontSize={10} fontWeight={700}
                    fill={col} fontFamily="inherit"
                  >
                    {fmtVal(v, meta.unit)}
                  </text>

                  {/* YoY % badge */}
                  {chg != null && (
                    <text
                      x={x + BAR_W / 2}
                      y={isNeg ? barBottom + 26 : Math.max(labelY - 10, 4)}
                      textAnchor="middle"
                      fontSize={9} fill={chg >= 0 ? '#34d399' : '#f87171'}
                      fontFamily="inherit"
                    >
                      {chg >= 0 ? '+' : ''}{chg.toFixed(1)}%
                    </text>
                  )}

                  {/* Year label */}
                  <text
                    x={x + BAR_W / 2}
                    y={TOP_PAD + CHART_H + BOT_PAD - 4}
                    textAnchor="middle"
                    fontSize={10} fill="#4a5270" fontFamily="inherit"
                  >
                    {yr}
                  </text>
                </g>
              )
            })}
          </svg>
        </div>
      )}

      <p style={{ fontSize: 10, color: '#2e3a55', marginTop: 6 }}>
        {meta.unit === 'M' ? 'Cifras en millones · ' : ''}
        Verde = crecimiento interanual · Rojo = caída
      </p>
    </div>
  )
}
