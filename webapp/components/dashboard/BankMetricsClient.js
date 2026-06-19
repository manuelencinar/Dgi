'use client'
import { useState, useEffect, useMemo } from 'react'
import { Card, SectionTitle } from '@/components/dashboard/ui'

const inp = { background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(99,102,241,0.35)', borderRadius: 5, padding: '6px 8px', color: '#e0e8f0', fontSize: 12, outline: 'none', fontFamily: 'inherit' }
const th = { textAlign: 'left', padding: '6px 8px', fontSize: 10, color: '#4a5270', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }
const td = { padding: '6px 8px', borderTop: '1px solid rgba(255,255,255,0.05)', fontSize: 12, color: '#c8d0e0' }
const FIELDS = [['npl', 'NPL %'], ['cet1', 'CET1 %'], ['nim', 'NIM %'], ['rote', 'ROTE %'], ['efficiency', 'Eficiencia %']]

export default function BankMetricsClient() {
  const [banks, setBanks] = useState(null)
  const [rows, setRows] = useState([])
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(null)            // ticker seleccionado
  const [form, setForm] = useState({ period: '', npl: '', cet1: '', nim: '', rote: '', efficiency: '' })
  const [msg, setMsg] = useState(null)

  const load = () => fetch('/api/admin/bank-metrics').then(r => r.ok ? r.json() : { banks: [], rows: [] })
    .then(d => { setBanks(d.banks || []); setRows(d.rows || []) }).catch(() => setBanks([]))
  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    if (!banks) return []
    const ql = q.trim().toLowerCase()
    return banks.filter(b => !ql || b.name.toLowerCase().includes(ql) || b.ticker.toLowerCase().includes(ql))
  }, [banks, q])

  const selRows = rows.filter(r => r.ticker === sel).sort((a, b) => (b.period || '').localeCompare(a.period || ''))

  const save = async () => {
    if (!sel || !/^\d{4}Q[1-4]$/.test(form.period.trim().toUpperCase())) { setMsg({ t: 'err', m: 'Periodo inválido (formato YYYYQn, p.ej. 2025Q1)' }); return }
    setMsg(null)
    const res = await fetch('/api/admin/bank-metrics', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticker: sel, ...form, period: form.period.trim().toUpperCase() }),
    })
    if (res.ok) { setForm({ period: '', npl: '', cet1: '', nim: '', rote: '', efficiency: '' }); setMsg({ t: 'ok', m: '✓ Guardado' }); load() }
    else { const d = await res.json().catch(() => ({})); setMsg({ t: 'err', m: d.error || 'Error' }) }
  }
  const edit = (r) => setForm({ period: r.period, npl: r.npl ?? '', cet1: r.cet1 ?? '', nim: r.nim ?? '', rote: r.rote ?? '', efficiency: r.efficiency ?? '' })
  const del = async (r) => {
    if (!confirm(`Eliminar ${r.ticker} ${r.period}?`)) return
    const res = await fetch('/api/admin/bank-metrics', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticker: r.ticker, period: r.period }) })
    if (res.ok) load()
  }

  if (banks === null) return <Card><p style={{ fontSize: 13, color: '#4a5270' }}>Cargando bancos…</p></Card>

  return (
    <Card>
      <SectionTitle>Métricas bancarias por trimestre</SectionTitle>
      <p style={{ fontSize: 12, color: '#4a5270', marginBottom: 14 }}>
        NPL (morosidad) <b style={{ color: '#8090a8' }}>siempre manual</b> — mientras no lo rellenes, en la ficha sale "–" (nunca 0). NIM/ROTE/eficiencia se calculan solos; aquí solo los rellenas si quieres <b style={{ color: '#8090a8' }}>sobreescribir</b> el cálculo (bancos sin desglose en Yahoo). Periodo: <code>YYYYQn</code> (p.ej. 2025Q1).
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16 }}>
        <style>{`@media(min-width:760px){.bm-grid{grid-template-columns:260px 1fr!important}}`}</style>
        <div className="bm-grid" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16 }}>
          {/* Lista de bancos */}
          <div>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder={`Buscar banco… (${banks.length})`} style={{ ...inp, width: '100%', boxSizing: 'border-box', marginBottom: 8 }} />
            <div style={{ maxHeight: 360, overflowY: 'auto', display: 'grid', gap: 2 }}>
              {filtered.slice(0, 60).map(b => {
                const has = rows.some(r => r.ticker === b.ticker)
                return (
                  <button key={b.ticker} onClick={() => { setSel(b.ticker); setForm({ period: '', npl: '', cet1: '', nim: '', rote: '', efficiency: '' }); setMsg(null) }} style={{
                    textAlign: 'left', padding: '7px 9px', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12,
                    border: '1px solid ' + (sel === b.ticker ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.06)'),
                    background: sel === b.ticker ? 'rgba(99,102,241,0.12)' : 'transparent', color: sel === b.ticker ? '#a5b4fc' : '#c8d0e0',
                  }}>
                    {b.name} <span style={{ color: '#4a5270' }}>{b.ticker}</span> {has && <span title="Tiene datos" style={{ color: '#34d399' }}>●</span>}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Editor del banco seleccionado */}
          <div>
            {!sel ? (
              <p style={{ fontSize: 13, color: '#4a5270' }}>Selecciona un banco para ver y editar sus trimestres.</p>
            ) : (
              <>
                <p style={{ fontSize: 13, fontWeight: 700, color: '#e0e8f0', marginBottom: 10 }}>{banks.find(b => b.ticker === sel)?.name} <span style={{ color: '#4a5270', fontSize: 11 }}>{sel}</span></p>

                {/* Formulario alta/edición */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
                  <input value={form.period} onChange={e => setForm(f => ({ ...f, period: e.target.value }))} placeholder="2025Q1" style={{ ...inp, width: 80 }} />
                  {FIELDS.map(([k, lbl]) => (
                    <input key={k} value={form[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} placeholder={lbl} title={lbl} style={{ ...inp, width: 78 }} />
                  ))}
                  <button onClick={save} style={{ fontSize: 12, fontWeight: 700, padding: '6px 14px', borderRadius: 6, border: 'none', background: '#6366f1', color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>Guardar</button>
                  {msg && <span style={{ fontSize: 12, color: msg.t === 'ok' ? '#34d399' : '#f87171' }}>{msg.m}</span>}
                </div>

                {/* Tabla de trimestres */}
                {selRows.length === 0 ? (
                  <p style={{ fontSize: 12, color: '#4a5270' }}>Sin trimestres guardados.</p>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr><th style={th}>Trim.</th>{FIELDS.map(([, l]) => <th key={l} style={th}>{l}</th>)}<th style={th}></th></tr></thead>
                    <tbody>
                      {selRows.map(r => (
                        <tr key={r.period}>
                          <td style={{ ...td, fontWeight: 700 }}>{r.period}</td>
                          {FIELDS.map(([k]) => <td key={k} style={td}>{r[k] != null ? Number(r[k]).toFixed(2) : '–'}</td>)}
                          <td style={{ ...td, whiteSpace: 'nowrap' }}>
                            <button onClick={() => edit(r)} style={{ fontSize: 11, color: '#818cf8', background: 'none', border: 'none', cursor: 'pointer', marginRight: 8 }}>Editar</button>
                            <button onClick={() => del(r)} style={{ fontSize: 11, color: '#f87171', background: 'none', border: 'none', cursor: 'pointer' }}>×</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </Card>
  )
}
