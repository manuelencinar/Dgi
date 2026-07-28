'use client'
// Análisis de sensibilidad de la valoración (solo motor DCF): cómo cambia el margen de
// seguridad al variar el crecimiento (g1) y la tasa de descuento (r). Reutiliza
// recomputeValuation con los parámetros ya calculados.
import { useMemo } from 'react'
import { recomputeValuation } from '@/lib/valuation'

// Color por margen de seguridad (verde = barata, rojo = cara).
function mosColor(mos) {
  if (mos == null) return 'var(--surface-2)'
  const m = mos * 100
  if (m >= 30) return 'rgba(22,163,74,0.85)'
  if (m >= 15) return 'rgba(101,163,13,0.7)'
  if (m >= 0) return 'rgba(217,119,6,0.6)'
  if (m >= -20) return 'rgba(234,88,12,0.6)'
  return 'rgba(220,38,38,0.7)'
}

export default function ValuationSensitivity({ dcf }) {
  const grid = useMemo(() => {
    if (!dcf || dcf.engine !== 'dcf' || !dcf.params || dcf.params.g1 == null || dcf.params.r == null || !dcf.price) return null
    const p = dcf.params
    const gAxis = [-0.02, -0.01, 0, 0.01, 0.02].map(d => p.g1 + d)
    const rAxis = [-0.015, -0.0075, 0, 0.0075, 0.015].map(d => p.r + d)
    const rows = gAxis.map(g => ({
      g,
      cells: rAxis.map(r => {
        const res = recomputeValuation('dcf', { ...p, g1: g, r }, dcf.price)
        return { r, mos: res?.mos ?? null, iv: res?.intrinsicValue ?? null }
      }),
    }))
    return { gAxis, rAxis, rows, baseG: p.g1, baseR: p.r }
  }, [dcf])

  if (!grid) return null

  return (
    <div>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
        Margen de seguridad según el crecimiento supuesto (filas) y la tasa de descuento (columnas). El centro es el escenario base.
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'separate', borderSpacing: 3, fontSize: 11 }}>
          <thead>
            <tr>
              <th style={{ padding: 4 }}></th>
              <th colSpan={grid.rAxis.length} style={{ fontSize: 10, color: 'var(--text-faint)', fontWeight: 700, paddingBottom: 3 }}>Tasa de descuento →</th>
            </tr>
            <tr>
              <th style={{ fontSize: 9.5, color: 'var(--text-faint)', fontWeight: 700 }}>Crec.↓</th>
              {grid.rAxis.map((r, j) => (
                <th key={j} style={{ fontSize: 10, color: Math.abs(r - grid.baseR) < 1e-9 ? 'var(--accent)' : 'var(--text-muted)', fontWeight: 700, padding: '2px 6px' }}>
                  {(r * 100).toFixed(1)}%
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.rows.map((row, i) => (
              <tr key={i}>
                <td style={{ fontSize: 10, fontWeight: 700, color: Math.abs(row.g - grid.baseG) < 1e-9 ? 'var(--accent)' : 'var(--text-muted)', paddingRight: 6, textAlign: 'right' }}>
                  {(row.g * 100).toFixed(1)}%
                </td>
                {row.cells.map((c, j) => {
                  const isBase = Math.abs(row.g - grid.baseG) < 1e-9 && Math.abs(c.r - grid.baseR) < 1e-9
                  return (
                    <td key={j} title={c.iv != null ? `Valor ${c.iv.toFixed(2)}` : ''}
                      style={{ background: mosColor(c.mos), color: '#fff', fontWeight: isBase ? 900 : 700, textAlign: 'center', padding: '7px 9px', borderRadius: 6, minWidth: 46, border: isBase ? '2px solid var(--text-strong)' : '2px solid transparent' }}>
                      {c.mos != null ? `${c.mos >= 0 ? '+' : ''}${(c.mos * 100).toFixed(0)}%` : '—'}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 10, color: 'var(--text-faintest)', marginTop: 10 }}>
        Verde = infravalorada · rojo = sobrevalorada. Muestra cuánto depende la valoración de los supuestos.
      </p>
    </div>
  )
}
