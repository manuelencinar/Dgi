'use client'
import { useState, Fragment } from 'react'
import { Card, PageTitle, fmtDate } from '@/components/dashboard/ui'

function coverageColor(c) { return c > 90 ? 'var(--positive)' : c >= 70 ? 'var(--warning)' : 'var(--negative)' }

export default function IndicesClient({ coverage }) {
  const [expanded, setExpanded] = useState(null)

  const totalCompanies = coverage.reduce((s, m) => s + m.total, 0)
  const totalComplete  = coverage.reduce((s, m) => s + m.complete, 0)
  const avgCoverage = totalCompanies > 0 ? totalComplete / totalCompanies * 100 : 0

  return (
    <div style={{ maxWidth: 1100 }}>
      <PageTitle sub={`43 mercados · cobertura media ${avgCoverage.toFixed(0)}%`}>Índices</PageTitle>

      <Card>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                {['Índice', 'Empresas', 'Completas', 'Sin datos', 'Cobertura', 'Actualizado', ''].map(h => (
                  <th key={h} style={{ padding: '7px 8px', textAlign: h === 'Índice' ? 'left' : 'left', color: 'var(--text-faint)', borderBottom: '1px solid var(--border)', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {coverage.map(m => (
                <Fragment key={m.symbol}>
                  <tr style={{ borderBottom: '1px solid var(--surface-2)' }}>
                    <td style={{ padding: '8px' }}>
                      <span style={{ marginRight: 6 }}>{m.flag}</span>
                      <span style={{ color: 'var(--text)', fontWeight: 600 }}>{m.name}</span>
                      <span style={{ color: 'var(--text-faint)', fontSize: 11, marginLeft: 6 }}>{m.country}</span>
                    </td>
                    <td style={{ padding: '8px', color: 'var(--text-muted)' }}>{m.total}</td>
                    <td style={{ padding: '8px', color: 'var(--positive)' }}>{m.complete}</td>
                    <td style={{ padding: '8px', color: m.missing > 0 ? 'var(--warning)' : 'var(--text-faint)' }}>{m.missing}</td>
                    <td style={{ padding: '8px', minWidth: 140 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden', minWidth: 60 }}>
                          <div style={{ height: '100%', width: `${m.coverage}%`, background: coverageColor(m.coverage), borderRadius: 3 }} />
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: coverageColor(m.coverage), width: 34 }}>{m.coverage.toFixed(0)}%</span>
                      </div>
                    </td>
                    <td style={{ padding: '8px', color: 'var(--text-faint)', fontSize: 11 }}>{fmtDate(m.latest)}</td>
                    <td style={{ padding: '8px' }}>
                      {m.missing > 0 && (
                        <button onClick={() => setExpanded(expanded === m.symbol ? null : m.symbol)} style={{ fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}>
                          {expanded === m.symbol ? '▲ Ocultar' : '▼ Sin datos'}
                        </button>
                      )}
                    </td>
                  </tr>
                  {expanded === m.symbol && (
                    <tr>
                      <td colSpan={7} style={{ padding: '0 8px 12px' }}>
                        <div style={{ background: 'var(--surface)', borderRadius: 8, padding: 12 }}>
                          <p style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 8 }}>Empresas sin fundamentales en {m.name}:</p>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {m.missingList.map(c => (
                              <span key={c.ticker} style={{ fontSize: 11, color: 'var(--text)', background: 'var(--surface-2)', padding: '3px 8px', borderRadius: 5 }}>
                                {c.ticker} <span style={{ color: 'var(--text-faint)' }}>· {c.name}</span>
                              </span>
                            ))}
                          </div>
                          <a href="/dashboard/datos" style={{ display: 'inline-block', marginTop: 10, fontSize: 11, color: 'var(--accent)' }}>Ir a gestión de datos →</a>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
