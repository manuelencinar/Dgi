'use client'
import { useState, useEffect, useMemo } from 'react'
import { Card, SectionTitle } from '@/components/dashboard/ui'

const inp = { background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(99,102,241,0.35)', borderRadius: 5, padding: '6px 8px', color: 'var(--text-strong)', fontSize: 12, outline: 'none', fontFamily: 'inherit' }
const th = { textAlign: 'left', padding: '6px 8px', fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }
const td = { padding: '6px 8px', borderTop: '1px solid var(--surface-3)', fontSize: 12, color: 'var(--text)' }
const FIELDS = [
  ['combined', 'Combined %'], ['loss', 'Loss %'], ['expense', 'Expense %'], ['solvency', 'Solvencia %'],
  ['iy', 'Inv.Yield %'], ['rote', 'ROTE %'], ['gwp', 'GWP'],
]
const EMPTY = { period: '', combined: '', loss: '', expense: '', solvency: '', iy: '', rote: '', gwp: '' }

export default function InsurerMetricsClient() {
  const [insurers, setInsurers] = useState(null)
  const [rows, setRows] = useState([])
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [msg, setMsg] = useState(null)

  const load = () => fetch('/api/admin/insurer-metrics').then(r => r.ok ? r.json() : { insurers: [], rows: [] })
    .then(d => { setInsurers(d.insurers || []); setRows(d.rows || []) }).catch(() => setInsurers([]))
  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    if (!insurers) return []
    const ql = q.trim().toLowerCase()
    return insurers.filter(b => !ql || b.name.toLowerCase().includes(ql) || b.ticker.toLowerCase().includes(ql))
  }, [insurers, q])

  const selRows = rows.filter(r => r.ticker === sel).sort((a, b) => (b.period || '').localeCompare(a.period || ''))

  const save = async () => {
    if (!sel || !/^\d{4}Q[1-4]$/.test(form.period.trim().toUpperCase())) { setMsg({ t: 'err', m: 'Periodo inválido (YYYYQn, p.ej. 2025Q1)' }); return }
    setMsg(null)
    const res = await fetch('/api/admin/insurer-metrics', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticker: sel, ...form, period: form.period.trim().toUpperCase() }),
    })
    if (res.ok) { setForm(EMPTY); setMsg({ t: 'ok', m: '✓ Guardado' }); load() }
    else { const d = await res.json().catch(() => ({})); setMsg({ t: 'err', m: d.error || 'Error' }) }
  }
  const edit = (r) => setForm({ period: r.period, combined: r.combined ?? '', loss: r.loss ?? '', expense: r.expense ?? '', solvency: r.solvency ?? '', iy: r.iy ?? '', rote: r.rote ?? '', gwp: r.gwp ?? '' })
  const del = async (r) => {
    if (!confirm(`Eliminar ${r.ticker} ${r.period}?`)) return
    const res = await fetch('/api/admin/insurer-metrics', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticker: r.ticker, period: r.period }) })
    if (res.ok) load()
  }

  if (insurers === null) return <Card><p style={{ fontSize: 13, color: 'var(--text-faint)' }}>Cargando aseguradoras…</p></Card>

  return (
    <Card>
      <SectionTitle>Métricas de aseguradoras por trimestre</SectionTitle>
      <p style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 14 }}>
        Combined / Loss / Expense ratio y Solvencia (II o RBC) son <b style={{ color: 'var(--text-muted)' }}>manuales</b> — si no se rellenan, en la ficha sale "–". Investment yield, ROTE y GWP se calculan solos; rellénalos solo para <b style={{ color: 'var(--text-muted)' }}>sobreescribir</b>. Periodo: <code>YYYYQn</code>.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16 }}>
        <style>{`@media(min-width:760px){.im-grid{grid-template-columns:260px 1fr!important}}`}</style>
        <div className="im-grid" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16 }}>
          <div>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder={`Buscar aseguradora… (${insurers.length})`} style={{ ...inp, width: '100%', boxSizing: 'border-box', marginBottom: 8 }} />
            <div style={{ maxHeight: 360, overflowY: 'auto', display: 'grid', gap: 2 }}>
              {filtered.slice(0, 60).map(b => {
                const has = rows.some(r => r.ticker === b.ticker)
                return (
                  <button key={b.ticker} onClick={() => { setSel(b.ticker); setForm(EMPTY); setMsg(null) }} style={{
                    textAlign: 'left', padding: '7px 9px', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12,
                    border: '1px solid ' + (sel === b.ticker ? 'rgba(99,102,241,0.5)' : 'var(--border)'),
                    background: sel === b.ticker ? 'rgba(99,102,241,0.12)' : 'transparent', color: sel === b.ticker ? '#a5b4fc' : 'var(--text)',
                  }}>
                    {b.name} <span style={{ color: 'var(--text-faint)' }}>{b.ticker}</span> {has && <span title="Tiene datos" style={{ color: 'var(--positive)' }}>●</span>}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            {!sel ? (
              <p style={{ fontSize: 13, color: 'var(--text-faint)' }}>Selecciona una aseguradora para ver y editar sus trimestres.</p>
            ) : (
              <>
                <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 10 }}>{insurers.find(b => b.ticker === sel)?.name} <span style={{ color: 'var(--text-faint)', fontSize: 11 }}>{sel}</span></p>

                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
                  <input value={form.period} onChange={e => setForm(f => ({ ...f, period: e.target.value }))} placeholder="2025Q1" style={{ ...inp, width: 78 }} />
                  {FIELDS.map(([k, lbl]) => (
                    <input key={k} value={form[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} placeholder={lbl} title={lbl} style={{ ...inp, width: 86 }} />
                  ))}
                  <button onClick={save} style={{ fontSize: 12, fontWeight: 700, padding: '6px 14px', borderRadius: 6, border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>Guardar</button>
                  {msg && <span style={{ fontSize: 12, color: msg.t === 'ok' ? 'var(--positive)' : 'var(--negative)' }}>{msg.m}</span>}
                </div>

                {selRows.length === 0 ? (
                  <p style={{ fontSize: 12, color: 'var(--text-faint)' }}>Sin trimestres guardados.</p>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
                      <thead><tr><th style={th}>Trim.</th>{FIELDS.map(([, l]) => <th key={l} style={th}>{l}</th>)}<th style={th}></th></tr></thead>
                      <tbody>
                        {selRows.map(r => (
                          <tr key={r.period}>
                            <td style={{ ...td, fontWeight: 700 }}>{r.period}</td>
                            {FIELDS.map(([k]) => <td key={k} style={td}>{r[k] != null ? Number(r[k]).toFixed(2) : '–'}</td>)}
                            <td style={{ ...td, whiteSpace: 'nowrap' }}>
                              <button onClick={() => edit(r)} style={{ fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', marginRight: 8 }}>Editar</button>
                              <button onClick={() => del(r)} style={{ fontSize: 11, color: 'var(--negative)', background: 'none', border: 'none', cursor: 'pointer' }}>×</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </Card>
  )
}
