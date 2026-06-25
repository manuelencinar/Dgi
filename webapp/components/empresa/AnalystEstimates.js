'use client'
import { useState, useEffect } from 'react'

const CARD = { background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 20 }

// Ingresos: en la divisa de reporte (valores absolutos). Se muestra en B / M.
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
        // Solo mostramos la sección si hay estimaciones futuras (lo que aporta valor
        // sobre los estados financieros que ya están en la pestaña).
        if (d?.hasData && d?.hasEstimates && Array.isArray(d.rows) && d.rows.length) {
          setData(d); setStatus('ok')
        } else setStatus('none')
      })
      .catch(() => { if (!cancelled) setStatus('none') })
    return () => { cancelled = true }
  }, [ticker])

  // Sin estimaciones (típico fuera de EE. UU. o sin cobertura de FMP) → no se muestra.
  if (status === 'loading' || status === 'none') return null

  const { rows, currency } = data
  const estTint = 'rgba(99,102,241,0.07)'

  const cell = (content, isEst, extra) => (
    <td style={{ padding: '8px 10px', textAlign: 'right', whiteSpace: 'nowrap', background: isEst ? estTint : 'transparent', ...extra }}>{content}</td>
  )

  return (
    <div style={CARD}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, flexWrap: 'wrap', gap: 8 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: '#4a5270', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          Estimaciones de analistas
        </p>
        <span style={{ fontSize: 10, fontWeight: 700, color: '#818cf8', background: 'rgba(99,102,241,0.12)', padding: '2px 8px', borderRadius: 5 }}>
          Consenso · estimación
        </span>
      </div>
      <p style={{ fontSize: 12, color: '#8090a8', marginBottom: 14, lineHeight: 1.5 }}>
        Ingresos y BPA reales por ejercicio, seguidos de la proyección de consenso de los analistas.
      </p>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 560 }}>
          <thead>
            <tr>
              <th style={{ padding: '8px 10px', textAlign: 'left', color: '#4a5270', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.08)', whiteSpace: 'nowrap', position: 'sticky', left: 0, background: '#0b0f1a' }}></th>
              {rows.map(r => (
                <th key={r.year} style={{
                  padding: '8px 10px', textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap',
                  color: r.actual ? '#c8d0e0' : '#818cf8',
                  background: r.actual ? 'transparent' : estTint,
                  borderBottom: `2px solid ${r.actual ? 'rgba(255,255,255,0.1)' : 'rgba(99,102,241,0.4)'}`,
                }}>
                  {r.year}
                  <span style={{ display: 'block', fontSize: 9, fontWeight: 600, color: r.actual ? '#3a4565' : '#6366f1', marginTop: 1 }}>
                    {r.actual ? 'real' : 'est.'}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Ingresos */}
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <td style={{ padding: '8px 10px', color: '#8090a8', whiteSpace: 'nowrap', position: 'sticky', left: 0, background: '#0b0f1a' }}>Ingresos</td>
              {rows.map(r => cell(
                <span style={{ color: '#c8d0e0', fontWeight: 600 }}>{fmtRevenue(r.revenue, currency)}</span>,
                !r.actual, { fontVariantNumeric: 'tabular-nums' }
              ))}
            </tr>
            {/* Crecimiento de ingresos YoY */}
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <td style={{ padding: '8px 10px', color: '#8090a8', whiteSpace: 'nowrap', position: 'sticky', left: 0, background: '#0b0f1a' }}>Crecimiento ingresos</td>
              {rows.map(r => cell(
                <span style={{ color: growthCol(r.revenueGrowth), fontWeight: 700 }}>{fmtGrowth(r.revenueGrowth)}</span>,
                !r.actual, { fontVariantNumeric: 'tabular-nums' }
              ))}
            </tr>
            {/* BPA */}
            <tr>
              <td style={{ padding: '8px 10px', color: '#8090a8', whiteSpace: 'nowrap', position: 'sticky', left: 0, background: '#0b0f1a' }}>BPA{currency ? ` (${currency})` : ''}</td>
              {rows.map(r => cell(
                <span style={{ color: '#c8d0e0', fontWeight: 600 }}>{fmtEps(r.eps)}</span>,
                !r.actual, { fontVariantNumeric: 'tabular-nums' }
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', marginTop: 12 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10.5, color: '#4a5270' }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: 'transparent', border: '1px solid rgba(255,255,255,0.15)' }} /> Real (estados financieros)
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10.5, color: '#818cf8' }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: estTint, border: '1px solid rgba(99,102,241,0.4)' }} /> Estimación de consenso
        </span>
      </div>
      <p style={{ fontSize: 10, color: '#2e3a55', marginTop: 8 }}>
        Fuente de las estimaciones: Financial Modeling Prep. Las proyecciones de analistas son consensos orientativos, no una garantía de resultados.
      </p>
    </div>
  )
}
