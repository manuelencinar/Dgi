'use client'
import { useState, useEffect, useMemo } from 'react'
import { Card, SectionTitle } from '@/components/dashboard/ui'
import { SUPERSECTORS } from '@/lib/supersectors'
import { SECTORS_BY_SUPER, industriesOf, sectorLabelEs, industryEs } from '@/lib/taxonomy'

const SUPER_KEYS = Object.keys(SECTORS_BY_SUPER)   // ciclico, sensible, defensivo
const PAGE = 20
const sel = { background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(99,102,241,0.35)', borderRadius: 5, padding: '5px 6px', color: 'var(--text-strong)', fontSize: 12, outline: 'none', width: '100%', fontFamily: 'inherit' }
const th = { textAlign: 'left', padding: '8px 8px', fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, whiteSpace: 'nowrap' }
const td = { padding: '7px 8px', borderTop: '1px solid var(--surface-2)', verticalAlign: 'middle' }

// Supersector (de los 3 asignables) al que pertenece un sector inglés.
function superOf(sector) {
  for (const k of SUPER_KEYS) if (SECTORS_BY_SUPER[k].includes(sector)) return k
  return ''
}

export default function SectorAssignClient() {
  const [companies, setCompanies] = useState(null)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('all')   // all | nosector | locked
  const [page, setPage] = useState(1)
  const [edits, setEdits] = useState({})        // ticker -> { sup, sector, industry }
  const [state, setState] = useState({})        // ticker -> 'saving' | 'ok' | 'err'

  useEffect(() => {
    fetch('/api/admin/company-taxonomy')
      .then(r => r.ok ? r.json() : { companies: [] })
      .then(d => setCompanies(d.companies || []))
      .catch(() => setCompanies([]))
  }, [])

  const filtered = useMemo(() => {
    if (!companies) return []
    const ql = q.trim().toLowerCase()
    return companies.filter(c =>
      (!ql || c.name.toLowerCase().includes(ql) || c.ticker.toLowerCase().includes(ql)) &&
      (filter !== 'nosector' || !c.sector || !superOf(c.sector)) &&
      (filter !== 'locked' || c.locked)
    )
  }, [companies, q, filter])

  const pageRows = filtered.slice((page - 1) * PAGE, page * PAGE)
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE))

  const editFor = (c) => edits[c.ticker] || { sup: superOf(c.sector), sector: c.sector || '', industry: c.industry || '' }
  const patch = (ticker, p) => setEdits(e => ({ ...e, [ticker]: { ...editFor(companies.find(c => c.ticker === ticker)), ...e[ticker], ...p } }))

  const onSuper    = (t, v) => setEdits(e => ({ ...e, [t]: { sup: v, sector: '', industry: '' } }))
  const onSector   = (t, v) => setEdits(e => ({ ...e, [t]: { ...editFor(companies.find(c => c.ticker === t)), ...e[t], sector: v, industry: '' } }))
  const onIndustry = (t, v) => setEdits(e => ({ ...e, [t]: { ...editFor(companies.find(c => c.ticker === t)), ...e[t], industry: v } }))

  const save = async (c) => {
    const ed = editFor(c)
    if (!ed.sector) return
    setState(s => ({ ...s, [c.ticker]: 'saving' }))
    try {
      const res = await fetch('/api/admin/company-taxonomy', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker: c.ticker, sector: ed.sector, industry: ed.industry || null }),
      })
      if (!res.ok) throw new Error()
      setCompanies(cs => cs.map(x => x.ticker === c.ticker ? { ...x, sector: ed.sector, industry: ed.industry || null, locked: true } : x))
      setEdits(e => { const n = { ...e }; delete n[c.ticker]; return n })
      setState(s => ({ ...s, [c.ticker]: 'ok' })); setTimeout(() => setState(s => ({ ...s, [c.ticker]: null })), 2000)
    } catch {
      setState(s => ({ ...s, [c.ticker]: 'err' })); setTimeout(() => setState(s => ({ ...s, [c.ticker]: null })), 2500)
    }
  }

  if (companies === null) return <Card><p style={{ fontSize: 13, color: 'var(--text-faint)' }}>Cargando empresas…</p></Card>

  return (
    <Card>
      <SectionTitle>Asignación de sectores (Morningstar)</SectionTitle>
      <p style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 14 }}>
        Tres niveles: <b style={{ color: 'var(--text-muted)' }}>Supersector → Sector → Industria</b>. El sector define el supersector del gráfico de la cartera; la industria es informativa. Al guardar se bloquea para que el run de Yahoo no lo sobreescriba.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <input value={q} onChange={e => { setQ(e.target.value); setPage(1) }} placeholder="Buscar empresa o ticker…"
          style={{ ...sel, width: 'auto', flex: '1 1 220px' }} />
        <select value={filter} onChange={e => { setFilter(e.target.value); setPage(1) }} style={{ ...sel, width: 'auto' }}>
          <option value="all">Todas</option>
          <option value="nosector">Sin sector válido</option>
          <option value="locked">Asignadas a mano</option>
        </select>
        <span style={{ fontSize: 12, color: 'var(--text-faint)', alignSelf: 'center' }}>{filtered.length} empresas</span>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
          <thead>
            <tr>
              <th style={th}>Empresa</th>
              <th style={th}>Supersector</th>
              <th style={th}>Sector</th>
              <th style={th}>Industria</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map(c => {
              const ed = editFor(c)
              const dirty = !!edits[c.ticker]
              const st = state[c.ticker]
              return (
                <tr key={c.ticker}>
                  <td style={{ ...td, minWidth: 150 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 180 }}>{c.name}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-faint)' }}>
                      {c.ticker} {c.locked && <span title="Asignado a mano" style={{ color: 'var(--accent)' }}>· 🔒</span>}
                    </div>
                  </td>
                  <td style={{ ...td, minWidth: 130 }}>
                    <select value={ed.sup} onChange={e => onSuper(c.ticker, e.target.value)} style={sel}>
                      <option value="">—</option>
                      {SUPER_KEYS.map(k => <option key={k} value={k}>{SUPERSECTORS[k].label}</option>)}
                    </select>
                  </td>
                  <td style={{ ...td, minWidth: 150 }}>
                    <select value={ed.sector} onChange={e => onSector(c.ticker, e.target.value)} disabled={!ed.sup} style={{ ...sel, opacity: ed.sup ? 1 : 0.5 }}>
                      <option value="">—</option>
                      {(SECTORS_BY_SUPER[ed.sup] || []).map(s => <option key={s} value={s}>{sectorLabelEs(s)}</option>)}
                    </select>
                  </td>
                  <td style={{ ...td, minWidth: 170 }}>
                    <select value={ed.industry} onChange={e => onIndustry(c.ticker, e.target.value)} disabled={!ed.sector} style={{ ...sel, opacity: ed.sector ? 1 : 0.5 }}>
                      <option value="">— (opcional)</option>
                      {industriesOf(ed.sector).map(([en, es]) => <option key={en} value={en}>{es}</option>)}
                    </select>
                  </td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>
                    <button onClick={() => save(c)} disabled={!dirty || !ed.sector || st === 'saving'} style={{
                      fontSize: 12, fontWeight: 700, padding: '6px 12px', borderRadius: 6, border: 'none', fontFamily: 'inherit',
                      cursor: (!dirty || !ed.sector) ? 'default' : 'pointer',
                      background: (!dirty || !ed.sector) ? 'var(--border)' : 'var(--accent)',
                      color: (!dirty || !ed.sector) ? 'var(--text-faint)' : '#fff',
                    }}>
                      {st === 'saving' ? '…' : st === 'ok' ? '✓' : st === 'err' ? '✗' : 'Guardar'}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 14 }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{ fontSize: 12, padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border-strong)', background: 'transparent', color: page === 1 ? 'var(--text-faintest)' : 'var(--text-muted)', cursor: page === 1 ? 'default' : 'pointer' }}>← Anterior</button>
          <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>{page} / {pages}</span>
          <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages} style={{ fontSize: 12, padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border-strong)', background: 'transparent', color: page === pages ? 'var(--text-faintest)' : 'var(--text-muted)', cursor: page === pages ? 'default' : 'pointer' }}>Siguiente →</button>
        </div>
      )}
    </Card>
  )
}
