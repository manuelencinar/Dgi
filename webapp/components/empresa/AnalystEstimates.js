'use client'
import { useState, useEffect, useMemo } from 'react'
import {
  ResponsiveContainer, ComposedChart, Bar, Line, Cell,
  XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts'

const CARD = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }
const C = { rev: '#60a5fa', revEst: 'var(--accent)', eps: 'var(--positive)' }

// Ingresos en la divisa de reporte (valores absolutos). En millones (M) / miles (K),
// como en el resto de la app (evita el "billion" americano, ambiguo en español).
function fmtRevenue(v, currency) {
  if (v == null || isNaN(v)) return '—'
  const a = Math.abs(v)
  const cur = currency ? ` ${currency}` : ''
  if (a >= 1e6) return (v / 1e6).toLocaleString('es-ES', { maximumFractionDigits: 0 }) + ' M' + cur
  if (a >= 1e3) return (v / 1e3).toLocaleString('es-ES', { maximumFractionDigits: 0 }) + ' K' + cur
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
const growthCol = v => v == null ? 'var(--text-faint)' : v >= 0 ? 'var(--positive)' : 'var(--negative)'

// Unidad coherente para el eje de ingresos (millones / miles, como en el resto de la app).
function revUnit(values) {
  const max = Math.max(0, ...values.filter(v => v != null).map(Math.abs))
  if (max >= 1e6) return { div: 1e6, suffix: ' M' }
  if (max >= 1e3) return { div: 1e3, suffix: ' K' }
  return { div: 1, suffix: '' }
}

function ChartTooltip({ active, payload, currency }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div style={{ background: 'var(--bg-elev)', border: '1px solid var(--border-strong)', borderRadius: 8, padding: '8px 11px', fontSize: 11.5, lineHeight: 1.7, boxShadow: '0 4px 16px rgba(0,0,0,0.18)' }}>
      <p style={{ color: 'var(--text)', fontWeight: 700, marginBottom: 3 }}>
        {d.year} <span style={{ color: d.actual ? 'var(--text-faintest)' : 'var(--accent)', fontWeight: 600 }}>· {d.actual ? 'real' : 'estimación'}</span>
      </p>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
        <span style={{ color: C.rev }}>Ingresos</span><span style={{ color: 'var(--text-strong)', fontWeight: 600 }}>{fmtRevenue(d.revenue, currency)}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
        <span style={{ color: 'var(--text-muted)' }}>Crecimiento</span><span style={{ color: growthCol(d.revenueGrowth), fontWeight: 600 }}>{fmtGrowth(d.revenueGrowth)}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
        <span style={{ color: C.eps }}>BPA</span><span style={{ color: 'var(--text-strong)', fontWeight: 600 }}>{fmtEps(d.eps)}{currency ? ` ${currency}` : ''}</span>
      </div>
    </div>
  )
}

const RECENT_REAL = 4   // ejercicios reales recientes visibles en la tabla; los anteriores se pliegan

export default function AnalystEstimates({ ticker }) {
  const [status, setStatus] = useState('loading')   // loading | ok | none
  const [data, setData] = useState(null)
  const [showOlder, setShowOlder] = useState(false)

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

  // Tabla: los últimos ejercicios reales + estimaciones siempre visibles; los años
  // anteriores (histórico ampliado del backfill) se pliegan en un desplegable.
  const { tableRows, olderCount } = useMemo(() => {
    if (!rows?.length) return { tableRows: [], olderCount: 0 }
    const real = rows.filter(r => r.actual)
    const est = rows.filter(r => !r.actual)
    const nOld = Math.max(0, real.length - RECENT_REAL)
    return { tableRows: showOlder ? rows : [...real.slice(nOld), ...est], olderCount: nOld }
  }, [rows, showOlder])

  // Sin estimaciones (típico fuera de EE. UU. o sin cobertura de FMP) → no se muestra.
  if (status === 'loading' || status === 'none') return null

  return (
    <div style={CARD}>
      <style>{`.ae-chart{height:230px}@media(max-width:768px){.ae-chart{height:190px}}`}</style>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, flexWrap: 'wrap', gap: 8 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          Estimaciones de analistas
        </p>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', background: 'rgba(99,102,241,0.12)', padding: '2px 8px', borderRadius: 5 }}>
          Consenso de analistas
        </span>
      </div>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.5 }}>
        Ingresos y BPA reales por ejercicio, seguidos de la proyección de consenso de los analistas.
      </p>

      {/* Gráfico combinado: barras de ingresos + línea de BPA */}
      <div className="ae-chart">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-2)" vertical={false} />
            <XAxis dataKey="year" tick={{ fontSize: 10, fill: 'var(--text-faint)' }} axisLine={{ stroke: 'var(--surface-3)' }} tickLine={false} />
            <YAxis yAxisId="rev" tick={{ fontSize: 10, fill: 'var(--text-faint)' }} axisLine={false} tickLine={false} width={44}
              tickFormatter={v => v.toLocaleString('es-ES', { maximumFractionDigits: 0 }) + unit.suffix} />
            <YAxis yAxisId="eps" orientation="right" tick={{ fontSize: 10, fill: 'var(--text-faint)' }} axisLine={false} tickLine={false} width={36} />
            <Tooltip content={<ChartTooltip currency={currency} />} cursor={{ fill: 'var(--surface-2)' }} />
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
        <Legend sw={<span style={{ width: 11, height: 11, borderRadius: 3, background: C.rev }} />} label="Ingresos (real)" color="var(--text-muted)" />
        <Legend sw={<span style={{ width: 11, height: 11, borderRadius: 3, background: C.revEst, opacity: 0.55 }} />} label="Ingresos (est.)" color="var(--accent)" />
        <Legend sw={<span style={{ width: 14, height: 0, borderTop: `2px solid ${C.eps}` }} />} label="BPA (real)" color="var(--text-muted)" />
        <Legend sw={<span style={{ width: 14, height: 0, borderTop: `2px dashed ${C.eps}` }} />} label="BPA (est.)" color="var(--text-muted)" />
      </div>

      {/* Tabla años en filas (responsive, sin scroll horizontal forzado) */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
        <thead>
          <tr>
            {['Año', 'Ingresos', 'Crec.', `BPA${currency ? ` (${currency})` : ''}`].map((h, i) => (
              <th key={h} style={{ padding: '7px 8px', textAlign: i === 0 ? 'left' : 'right', color: 'var(--text-faint)', fontWeight: 600, borderBottom: '1px solid var(--surface-3)', whiteSpace: 'nowrap' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {olderCount > 0 && (
            <tr>
              <td colSpan={4} style={{ padding: '4px 8px' }}>
                <button onClick={() => setShowOlder(v => !v)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontSize: 11.5, fontWeight: 600, padding: '2px 0' }}>
                  {showOlder ? '▾ Ocultar años anteriores' : `▸ Ver ${olderCount} ejercicio${olderCount > 1 ? 's' : ''} anterior${olderCount > 1 ? 'es' : ''}`}
                </button>
              </td>
            </tr>
          )}
          {tableRows.map(r => (
            <tr key={r.year} style={{ background: r.actual ? 'transparent' : 'rgba(99,102,241,0.06)', borderBottom: '1px solid var(--surface-2)' }}>
              <td style={{ padding: '7px 8px', whiteSpace: 'nowrap' }}>
                <span style={{ color: r.actual ? 'var(--text)' : 'var(--accent)', fontWeight: 700 }}>{r.year}</span>
                {!r.actual && <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--accent)', marginLeft: 6 }}>EST.</span>}
              </td>
              <td style={{ padding: '7px 8px', textAlign: 'right', color: 'var(--text)', fontWeight: 600, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{fmtRevenue(r.revenue, null)}</td>
              <td style={{ padding: '7px 8px', textAlign: 'right', color: growthCol(r.revenueGrowth), fontWeight: 700, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{fmtGrowth(r.revenueGrowth)}</td>
              <td style={{ padding: '7px 8px', textAlign: 'right', color: 'var(--text)', fontWeight: 600, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{fmtEps(r.eps)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p style={{ fontSize: 10, color: 'var(--text-faintest)', marginTop: 12 }}>
        Las proyecciones de analistas son consensos orientativos, no una garantía de resultados.
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
