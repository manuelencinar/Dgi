'use client'
import { useState } from 'react'
import { Card, SectionTitle } from '@/components/dashboard/ui'

const REGIONS = ['América', 'Europa', 'Asia-Pacífico', 'África', 'ETFs globales']
const cellInput = { background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(99,102,241,0.4)', borderRadius: 5, padding: '4px 6px', color: '#e0e8f0', fontSize: 12, outline: 'none', width: '100%', fontFamily: 'inherit' }

function Cell({ value, options, onSave, color }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(value)
  const [st, setSt] = useState(null)
  const commit = async () => {
    setEditing(false)
    if (val === value) return
    const ok = await onSave(val); setSt(ok ? 'ok' : 'err'); setTimeout(() => setSt(null), 2000); if (!ok) setVal(value)
  }
  if (editing) return options
    ? <select autoFocus value={val} onChange={e => setVal(e.target.value)} onBlur={commit} onKeyDown={e => e.key === 'Enter' && commit()} style={cellInput}>{options.map(o => <option key={o} value={o}>{o}</option>)}</select>
    : <input autoFocus value={val} onChange={e => setVal(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setVal(value); setEditing(false) } }} style={cellInput} />
  return <span onClick={() => { setVal(value); setEditing(true) }} style={{ cursor: 'pointer', color: color || '#c8d0e0', display: 'inline-flex', gap: 5, alignItems: 'center' }}>{value || <span style={{ color: '#4a5270' }}>—</span>}{st === 'ok' && <span style={{ color: '#34d399' }}>✓</span>}{st === 'err' && <span style={{ color: '#f87171' }}>✗</span>}</span>
}

export default function MarketsAdminClient({ markets: initial }) {
  const [rows, setRows] = useState(initial || [])

  const save = async (symbol, field, value) => {
    try {
      const res = await fetch('/api/admin/markets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol, [field]: value }) })
      if (!res.ok) return false
      setRows(rs => rs.map(r => r.symbol === symbol ? { ...r, [field]: value } : r)); return true
    } catch { return false }
  }
  const toggleActive = async (r) => { await save(r.symbol, 'active', !(r.active !== false)) }

  return (
    <Card>
      <SectionTitle>Índices ({rows.length})</SectionTitle>
      <p style={{ fontSize: 12, color: '#4a5270', marginBottom: 12 }}>Edita los campos (clic) o activa/desactiva un índice. Los índices no se eliminan — solo se desactivan.</p>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 720 }}>
          <thead><tr>{['Símbolo', 'Nombre', 'Ticker yfinance', 'País', 'Región', 'Activo'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
          <tbody>
            {rows.map(r => {
              const active = r.active !== false
              return (
                <tr key={r.symbol} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', opacity: active ? 1 : 0.5 }}>
                  <td style={{ ...td, color: '#818cf8', fontWeight: 700 }}>{r.flag} {r.symbol}</td>
                  <td style={td}><Cell value={r.name} onSave={v => save(r.symbol, 'name', v)} /></td>
                  <td style={td}><Cell value={r.yf_ticker || r.symbol} onSave={v => save(r.symbol, 'yf_ticker', v)} color="#8090a8" /></td>
                  <td style={td}><Cell value={r.country} onSave={v => save(r.symbol, 'country', v)} color="#8090a8" /></td>
                  <td style={td}><Cell value={r.region} options={REGIONS} onSave={v => save(r.symbol, 'region', v)} color="#8090a8" /></td>
                  <td style={td}>
                    <button onClick={() => toggleActive(r)} style={{
                      fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 12, cursor: 'pointer', border: 'none',
                      background: active ? 'rgba(52,211,153,0.15)' : 'rgba(255,255,255,0.06)', color: active ? '#34d399' : '#4a5270',
                    }}>{active ? '● Activo' : '○ Inactivo'}</button>
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

const th = { padding: '6px 8px', textAlign: 'left', color: '#4a5270', borderBottom: '1px solid rgba(255,255,255,0.08)', fontWeight: 600, whiteSpace: 'nowrap' }
const td = { padding: '6px 8px', whiteSpace: 'nowrap' }
