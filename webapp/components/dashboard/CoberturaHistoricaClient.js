'use client'
import { useState, useEffect, useMemo } from 'react'
import { Card, SectionTitle } from '@/components/dashboard/ui'

const TH = { padding: '7px 8px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }
const TD = { padding: '7px 8px', fontSize: 12, color: 'var(--text)', borderBottom: '1px solid var(--surface-2)' }
const SRC_LABEL = { sec_edgar: 'SEC', stockanalysis: 'stockanalysis' }
const PER_PAGE = 100

function Blk({ label, n, total }) {
  const col = n === 0 ? 'var(--text-faint)' : n >= total && total > 0 ? 'var(--positive)' : 'var(--warning)'
  return <span title={`${label}: ${n} de ${total} años`} style={{ fontSize: 9.5, fontWeight: 700, color: col, background: `${col}18`, padding: '1px 5px', borderRadius: 4 }}>{label} {n || '—'}</span>
}

export default function CoberturaHistoricaClient() {
  const [data, setData] = useState(null)
  const [err, setErr] = useState(null)
  const [search, setSearch] = useState('')
  const [onlyUncovered, setOnlyUncovered] = useState(false)
  const [page, setPage] = useState(1)

  useEffect(() => {
    fetch('/api/admin/coverage').then(r => r.ok ? r.json() : Promise.reject()).then(setData).catch(() => setErr('No se pudo cargar la cobertura.'))
  }, [])

  const rows = useMemo(() => {
    if (!data) return []
    const q = search.trim().toLowerCase()
    let list = onlyUncovered
      ? data.uncovered.map(u => ({ ...u, num_anos: 0, fuentes: [], blocks: null }))
      : data.coverage
    if (q) list = list.filter(r => r.ticker.toLowerCase().includes(q) || (r.name || '').toLowerCase().includes(q))
    return list
  }, [data, search, onlyUncovered])

  useEffect(() => { setPage(1) }, [search, onlyUncovered])

  if (err) return <Card><p style={{ fontSize: 13, color: 'var(--negative)' }}>{err}</p></Card>
  if (!data) return <Card><p style={{ fontSize: 13, color: 'var(--text-faint)' }}>Cargando cobertura…</p></Card>

  const covered = data.coverage.length
  const uncovered = data.uncovered.length
  const totalYears = data.coverage.reduce((s, c) => s + c.num_anos, 0)
  const avgYears = covered ? (totalYears / covered).toFixed(1) : '—'
  const bySrc = { sec_edgar: 0, stockanalysis: 0, mixto: 0 }
  data.coverage.forEach(c => { if (c.fuentes.length > 1) bySrc.mixto++; else if (c.fuentes[0]) bySrc[c.fuentes[0]] = (bySrc[c.fuentes[0]] || 0) + 1 })

  const pages = Math.max(1, Math.ceil(rows.length / PER_PAGE))
  const pageRows = rows.slice((page - 1) * PER_PAGE, page * PER_PAGE)

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Card>
        <SectionTitle>Resumen de cobertura histórica</SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 12 }}>
          {[
            ['Con histórico', covered, 'var(--positive)'],
            ['Sin ningún dato', uncovered, uncovered > 0 ? 'var(--warning)' : 'var(--positive)'],
            ['Media de años', avgYears, 'var(--accent)'],
            ['SEC · stockanalysis · mixto', `${bySrc.sec_edgar} · ${bySrc.stockanalysis} · ${bySrc.mixto}`, 'var(--text)'],
          ].map(([l, v, c]) => (
            <div key={l} style={{ background: 'var(--surface-2)', borderRadius: 8, padding: '10px 12px' }}>
              <p style={{ fontSize: 10.5, color: 'var(--text-faint)', marginBottom: 5 }}>{l}</p>
              <p style={{ fontSize: 18, fontWeight: 900, color: c }}>{v}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar ticker o nombre…"
            style={{ flex: 1, minWidth: 180, background: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: 8, padding: '8px 11px', color: 'var(--text)', fontSize: 13, outline: 'none' }} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer' }}>
            <input type="checkbox" checked={onlyUncovered} onChange={e => setOnlyUncovered(e.target.checked)} />
            Solo empresas sin datos
          </label>
          <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{rows.length.toLocaleString('es-ES')} empresas</span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
            <thead><tr>
              {['Empresa', 'Primer', 'Último', 'Años', 'Fuente', 'Bloques'].map((h, i) => <th key={h} style={{ ...TH, textAlign: i >= 1 && i <= 3 ? 'right' : 'left' }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {pageRows.map(r => (
                <tr key={r.ticker}>
                  <td style={{ ...TD, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name} <span style={{ color: 'var(--text-faint)', fontSize: 10 }}>{r.ticker}</span></td>
                  <td style={{ ...TD, textAlign: 'right' }}>{r.primer_ejercicio ?? '—'}</td>
                  <td style={{ ...TD, textAlign: 'right' }}>{r.ultimo_ejercicio ?? '—'}</td>
                  <td style={{ ...TD, textAlign: 'right', fontWeight: 700 }}>{r.num_anos || '—'}</td>
                  <td style={{ ...TD }}>{r.fuentes?.length ? r.fuentes.map(s => SRC_LABEL[s] || s).join(' + ') : <span style={{ color: 'var(--text-faint)' }}>—</span>}</td>
                  <td style={{ ...TD }}>
                    {r.blocks ? (
                      <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
                        <Blk label="IS" n={r.blocks.income} total={r.num_anos} />
                        <Blk label="BS" n={r.blocks.balance} total={r.num_anos} />
                        <Blk label="CF" n={r.blocks.cashflow} total={r.num_anos} />
                        <Blk label="Acc" n={r.blocks.shares} total={r.num_anos} />
                      </span>
                    ) : <span style={{ color: 'var(--text-faint)', fontSize: 11 }}>sin datos</span>}
                  </td>
                </tr>
              ))}
              {pageRows.length === 0 && <tr><td colSpan={6} style={{ ...TD, textAlign: 'center', color: 'var(--text-faint)', padding: 20 }}>Sin resultados.</td></tr>}
            </tbody>
          </table>
        </div>

        {pages > 1 && (
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center', marginTop: 14 }}>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} style={{ ...pgBtn, opacity: page <= 1 ? 0.4 : 1 }}>←</button>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Página {page} de {pages}</span>
            <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page >= pages} style={{ ...pgBtn, opacity: page >= pages ? 0.4 : 1 }}>→</button>
          </div>
        )}
      </Card>

      <p style={{ fontSize: 11, color: 'var(--text-faint)', lineHeight: 1.5 }}>
        Datos de <code>financial_history</code> (backfill puntual SEC EDGAR + stockanalysis). Bloques: IS = cuenta de resultados · BS = balance · CF = flujo de caja · Acc = acciones/dividendo. Verde = todos los años cubiertos, ámbar = parcial.
      </p>
    </div>
  )
}

const pgBtn = { background: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: 7, color: 'var(--text)', fontSize: 13, padding: '5px 12px', cursor: 'pointer' }
