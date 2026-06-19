'use client'
import { useState, useEffect, useMemo } from 'react'
import { Card, SectionTitle } from '@/components/dashboard/ui'

const inp = { background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(99,102,241,0.35)', borderRadius: 5, padding: '6px 8px', color: '#e0e8f0', fontSize: 12, outline: 'none', fontFamily: 'inherit' }
const th = { textAlign: 'left', padding: '6px 8px', fontSize: 10, color: '#4a5270', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }
const td = { padding: '6px 8px', borderTop: '1px solid rgba(255,255,255,0.05)', fontSize: 12, color: '#c8d0e0' }

export default function ReitMetricsClient() {
  const [reits, setReits] = useState(null)
  const [rows, setRows] = useState([])
  const [subtypes, setSubtypes] = useState({})
  const [q, setQ] = useState('')
  const [msg, setMsg] = useState(null)

  const load = () => fetch('/api/admin/reit-metrics').then(r => r.ok ? r.json() : { reits: [], rows: [], subtypes: {} })
    .then(d => { setReits(d.reits || []); setRows(d.rows || []); setSubtypes(d.subtypes || {}) }).catch(() => setReits([]))
  useEffect(() => { load() }, [])

  const rowByTicker = useMemo(() => Object.fromEntries(rows.map(r => [r.ticker, r])), [rows])
  const filtered = useMemo(() => {
    if (!reits) return []
    const ql = q.trim().toLowerCase()
    return reits.filter(b => !ql || b.name.toLowerCase().includes(ql) || b.ticker.toLowerCase().includes(ql))
  }, [reits, q])

  const save = async (ticker, subtype, maint_pct) => {
    setMsg(null)
    const res = await fetch('/api/admin/reit-metrics', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticker, subtype: subtype || null, maint_pct: maint_pct === '' ? null : maint_pct }),
    })
    if (res.ok) { setMsg({ t: 'ok', m: '✓ ' + ticker }); load() }
    else { const d = await res.json().catch(() => ({})); setMsg({ t: 'err', m: d.error || 'Error' }) }
  }

  if (reits === null) return <Card><p style={{ fontSize: 13, color: '#4a5270' }}>Cargando REITs…</p></Card>
  const opts = Object.entries(subtypes)

  return (
    <Card>
      <SectionTitle>Sub-tipo de REIT (para el AFFO)</SectionTitle>
      <p style={{ fontSize: 12, color: '#4a5270', marginBottom: 6 }}>
        El sub-tipo fija el % de capex de mantenimiento sobre NOI que se resta al FFO para estimar el <b style={{ color: '#8090a8' }}>AFFO</b>. Yahoo no lo distingue bien (los <b style={{ color: '#8090a8' }}>net-lease</b> salen como "Retail") → corrígelo aquí. El % opcional sobreescribe el del sub-tipo.
      </p>
      {msg && <p style={{ fontSize: 12, color: msg.t === 'ok' ? '#34d399' : '#f87171', marginBottom: 8 }}>{msg.m}</p>}

      <input value={q} onChange={e => setQ(e.target.value)} placeholder={`Buscar REIT… (${reits.length})`} style={{ ...inp, width: '100%', maxWidth: 320, boxSizing: 'border-box', marginBottom: 10 }} />

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620 }}>
          <thead><tr><th style={th}>REIT</th><th style={th}>Industria (Yahoo)</th><th style={th}>Sub-tipo</th><th style={th}>% mant.</th></tr></thead>
          <tbody>
            {filtered.slice(0, 120).map(b => {
              const r = rowByTicker[b.ticker] || {}
              const cur = r.subtype || ''
              return (
                <tr key={b.ticker}>
                  <td style={td}>{b.name} <span style={{ color: '#4a5270', fontSize: 10 }}>{b.ticker}</span></td>
                  <td style={{ ...td, color: '#4a5270', fontSize: 11 }}>{b.industry || '—'}</td>
                  <td style={td}>
                    <select value={cur} onChange={e => save(b.ticker, e.target.value, r.maint_pct ?? '')} style={{ ...inp, width: '100%' }}>
                      <option value="">— (auto: {subtypes[b.suggested]?.label || b.suggested})</option>
                      {opts.map(([k, v]) => <option key={k} value={k}>{v.label} ({v.maint}%)</option>)}
                    </select>
                  </td>
                  <td style={td}>
                    <input defaultValue={r.maint_pct ?? ''} placeholder="auto" onBlur={e => save(b.ticker, cur, e.target.value)}
                      style={{ ...inp, width: 64 }} title="Override del % de mantenimiento" />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
