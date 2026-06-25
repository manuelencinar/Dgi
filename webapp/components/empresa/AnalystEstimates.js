'use client'
import { useState, useEffect, useMemo } from 'react'
import {
  ResponsiveContainer, ComposedChart, Bar, Line, Cell,
  XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts'

const CARD = { background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 20 }
const C = { rev: '#60a5fa', revEst: '#818cf8', eps: '#34d399' }

// Ingresos en la divisa de reporte (valores absolutos) → B / M.
function fmtRevenue(v, currency) {
  if (v == null || isNaN(v)) return '—'
  const a = Math.abs(v)
  const cur = currency ? ` ${currency}` : ''
  if (a >= 1e9) return (v / 1e9).toLocaleString('es-ES', { maximumFractionDigits: 2 }) + ' B' + cur
  if (a >= 1e6) return (v / 1e6).toLocaleString('es-ES', { maximumFractionDigits: 0 }) + ' M' + cur
  return v.toLocaleString('es-ES', { maximumFractionDigits: 0 }) + cur
}
function fmtEps(v) {
  if (v == null || isNaN(v)) return '—'
  return v.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtGrowth(v) {
  if (v == null || isNaN(v)) return '—'
  return (v > 0 ? '+' : '') + (v * 100).toFixed(1) + '%'
}
const growthCol = v => v == null ? '#4a5270' : v >= 0 ? '#34d399' : '#f87171'

// Unidad coherente para el eje de ingresos (no mezcla M y B).
function revUnit(values) {
  const max = Math.max(0, ...values.filter(v => v != null).map(Math.abs))
  if (max >= 1e9) return { div: 1e9, suffix: ' B' }
  if (max >= 1e6) return { div: 1e6, suffix: ' M' }
  return { div: 1, suffix: '' }
}

function ChartTooltip({ active, payload, currency }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div style={{ background: 'rgba(13,20,36,0.97)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '8px 11px', fontSize: 11.5, lineHeight: 1.7 }}>
      <p style={{ color: '#c8d0e0', fontWeight: 700, marginBottom: 3 }}>
        {d.year} <span style={{ color: d.actual ? '#3a4565' : '#818cf8', fontWeight: 600 }}>· {d.actual ? 'real' : 'estimación'}</span>
      </p>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
        <span style={{ color: C.rev }}>Ingresos</span><span style={{ color: '#e0e8f0', fontWeight: 600 }}>{fmtRevenue(d.revenue, currency)}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
        <span style={{ color: '#8090a8' }}>Crecimiento</span><span style={{ color: growthCol(d.revenueGrowth), fontWeight: 600 }}>{fmtGrowth(d.revenueGrowth)}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
        <span style={{ color: C.eps }}>BPA</span><span style={{ color: '#e0e8f0', fontWeight: 600 }}>{fmtEps(d.eps)}{currency ? ` ${currency}` : ''}</span>
      </div>
    </div>
  )
}

export default function AnalystEstimates({ ticker }) {
  const [status, setStatus] = useState('loading')   // loading | ok | none
  const [data, setData] = useState(null)

  useEffect(() => {
    if (!ticker) { setStatus('none'); return }
    let cancelled = false
    setStatus('loading')
    fetch(`/api/empresa/${encodeURIComponent(ticker)}/estimates`)
      .then(r => r.json())
      .then(d => {
        if (cancelled) return
        // Solo se muestra si hay estimaciones futuras (lo que aporta valor frente
        // a los estados financieros que ya están en la pestaña).
        if (d?.hasData && d?.hasEstimates && Array.isArray(d.rows) && d.rows.length) {
          setData(d); setStatus('ok')
        } else setStatus('none')
      })
      .catch(() => { if (!cancelled) setStatus('none') })
    return () => { cancelled = true }
  }, [ticker])

  const rows = data?.rows
  const currency = data?.currency

  // Serie para el gráfico: barras de ingresos + línea de BPA (real sólida / est. discontinua).
  const { chartData, unit } = useMemo(() => {
    if (!rows?.length) return { chartData: [], unit: { div: 1, suffix: '' } }
    const u = revUnit(rows.map(r => r.revenue))
    // Índice del último año real para "puentear" la línea de BPA real→estimada.
    let lastReal = -1
    rows.forEach((r, i) => { if (r.actual) lastReal = i })
    const cd = rows.map((r, i) => ({
      year: r.year,
      actual: r.actual,
      revenue: r.revenue,
      revenueGrowth: r.revenueGrowth,
      eps: r.eps,
      revScaled: r.revenue != null ? r.revenue / u.div : null,
      // Dos líneas de BPA que se tocan en el último año real (continuidad visual):
      // la real cubre los años reales; la estimada arranca en el último real (puente).
      epsReal: r.actual ? r.eps : null,
      epsEst: (!r.actual || i === lastReal) ? r.eps : null,
    }))
    return { chartData: cd, unit: u }
  }, [rows])

  // Sin estimaciones (típico fuera de EE. UU. o sin cobertura de FMP) → no se muestra.
  if (status === 'loading' || status === 'none') return null

  return (
    <div style={CARD}>
      <style>{`.ae-chart{height:230px}@media(max-width:768px){.ae-chart{height:190px}}`}</style>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, flexWrap: 'wrap', gap: 8 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: '#4a5270', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          Estimaciones de analistas
        </p>
        <span style={{ fontSize: 10, fontWeight: 700, color: '#818cf8', background: 'rgba(99,102,241,0.12)', padding: '2px 8px', borderRadius: 5 }}>
          Consenso de analistas
        </span>
      </div>
      <p style={{ fontSize: 12, color: '#8090a8', marginBottom: 14, lineHeight: 1.5 }}>
        Ingresos y BPA reales por ejercicio, seguidos de la proyección de consenso de los analistas.
      </p>

      {/* Gráfico combinado: barras de ingresos + línea de BPA */}
      <div className="ae-chart">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
            <XAxis dataKey="year" tick={{ fontSize: 10, fill: '#4a5270' }} axisLine={{ stroke: 'rgba(255,255,255,0.08)' }} tickLine={false} />
            <YAxis yAxisId="rev" tick={{ fontSize: 10, fill: '#4a5270' }} axisLine={false} tickLine={false} width={44}
              tickFormatter={v => v.toLocaleString('es-ES', { maximumFractionDigits: 0 }) + unit.suffix} />
            <YAxis yAxisId="eps" orientation="right" tick={{ fontSize: 10, fill: '#4a5270' }} axisLine={false} tickLine={false} width={36} />
            <Tooltip content={<ChartTooltip currency={currency} />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
            <Bar yAxisId="rev" dataKey="revScaled" name="Ingresos" radius={[2, 2, 0, 0]} maxBarSize={46}>
              {chartData.map((d, i) => (
                <Cell key={i} fill={d.actual ? C.rev : C.revEst} fillOpacity={d.actual ? 1 : 0.45} />
              ))}
            </Bar>
            <Line yAxisId="eps" dataKey="epsReal" name="BPA" stroke={C.eps} strokeWidth={2} dot={{ r: 2.5, fill: C.eps }} connectNulls={false} isAnimationActive={false} />
            <Line yAxisId="eps" dataKey="epsEst" name="BPA est." stroke={C.eps} strokeWidth={2} strokeDasharray="4 3" dot={{ r: 2.5, fill: C.eps, strokeWidth: 0 }} connectNulls isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Leyenda manual (controla exactamente real vs estimación) */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', margin: '10px 0 16px' }}>
        <Legend sw={<span style={{ width: 11, height: 11, borderRadius: 3, background: C.rev }} />} label="Ingresos (real)" color="#8090a8" />
        <Legend sw={<span style={{ width: 11, height: 11, borderRadius: 3, background: C.revEst, opacity: 0.55 }} />} label="Ingresos (est.)" color="#818cf8" />
        <Legend sw={<span style={{ width: 14, height: 0, borderTop: `2px solid ${C.eps}` }} />} label="BPA (real)" color="#8090a8" />
        <Legend sw={<span style={{ width: 14, height: 0, borderTop: `2px dashed ${C.eps}` }} />} label="BPA (est.)" color="#8090a8" />
      </div>

      {/* Tabla años en filas (responsive, sin scroll horizontal forzado) */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
        <thead>
          <tr>
            {['Año', 'Ingresos', 'Crec.', `BPA${currency ? ` (${currency})` : ''}`].map((h, i) => (
              <th key={h} style={{ padding: '7px 8px', textAlign: i === 0 ? 'left' : 'right', color: '#4a5270', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.08)', whiteSpace: 'nowrap' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.year} style={{ background: r.actual ? 'transparent' : 'rgba(99,102,241,0.06)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <td style={{ padding: '7px 8px', whiteSpace: 'nowrap' }}>
                <span style={{ color: r.actual ? '#c8d0e0' : '#818cf8', fontWeight: 700 }}>{r.year}</span>
                {!r.actual && <span style={{ fontSize: 9, fontWeight: 700, color: '#6366f1', marginLeft: 6 }}>EST.</span>}
              </td>
              <td style={{ padding: '7px 8px', textAlign: 'right', color: '#c8d0e0', fontWeight: 600, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{fmtRevenue(r.revenue, null)}</td>
              <td style={{ padding: '7px 8px', textAlign: 'right', color: growthCol(r.revenueGrowth), fontWeight: 700, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{fmtGrowth(r.revenueGrowth)}</td>
              <td style={{ padding: '7px 8px', textAlign: 'right', color: '#c8d0e0', fontWeight: 600, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{fmtEps(r.eps)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p style={{ fontSize: 10, color: '#2e3a55', marginTop: 12 }}>
        Fuente de las estimaciones: Financial Modeling Prep. Las proyecciones de analistas son consensos orientativos, no una garantía de resultados.
      </p>
    </div>
  )
}

function Legend({ sw, label, color }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10.5, color }}>
      {sw} {label}
    </span>
  )
}
