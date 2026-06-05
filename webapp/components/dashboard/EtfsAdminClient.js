'use client'
import { useState } from 'react'
import { Card, SectionTitle } from '@/components/dashboard/ui'

const BENCHMARKS = [
  { t: '^GSPC', n: 'S&P 500' },
  { t: 'URTH',  n: 'MSCI World' },
  { t: '^STOXX', n: 'STOXX Europe 600' },
  { t: '^NDX',  n: 'NASDAQ 100' },
  { t: '^FTSE', n: 'FTSE 100' },
  { t: '^GDAXI', n: 'DAX 40' },
  { t: '',      n: 'Ninguno' },
  { t: '__custom__', n: 'Personalizado' },
]

export default function EtfsAdminClient({ funds: initialFunds }) {
  const [funds, setFunds] = useState(initialFunds || [])
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(null)  // ticker en edición de TER
  const [draft, setDraft] = useState('')

  const patch = (ticker, fields) => setFunds(fs => fs.map(f => f.ticker === ticker ? { ...f, ...fields } : f))

  const save = async (ticker, payload) => {
    try {
      const res = await fetch('/api/admin/update-fund', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticker, ...payload }) })
      if (!res.ok) { const d = await res.json().catch(() => ({})); setMsg('✗ ' + (d.error || 'error')); return false }
      return true
    } catch { setMsg('✗ error de red'); return false }
  }

  // TER: el admin edita en %, se guarda en decimal
  const commitTer = async (ticker) => {
    const pct = parseFloat(draft)
    setEditing(null)
    if (isNaN(pct)) return
    const ter = Math.round(pct / 100 * 1000000) / 1000000
    patch(ticker, { ter })
    if (await save(ticker, { ter })) setMsg('✓ TER guardado')
  }

  const onBenchmark = async (ticker, value) => {
    if (value === '__custom__') { patch(ticker, { _custom: true }); return }
    const b = BENCHMARKS.find(x => x.t === value)
    patch(ticker, { benchmark_ticker: value || null, benchmark_name: b?.n === 'Ninguno' ? null : b?.n || null, _custom: false })
    if (await save(ticker, { benchmark_ticker: value || null, benchmark_name: b?.n === 'Ninguno' ? null : b?.n || null })) setMsg('✓ Benchmark guardado')
  }

  const saveCustomBench = async (ticker, tk, nm) => {
    patch(ticker, { benchmark_ticker: tk || null, benchmark_name: nm || tk || null, _custom: false })
    if (await save(ticker, { benchmark_ticker: tk || null, benchmark_name: nm || tk || null })) setMsg('✓ Benchmark guardado')
  }

  const recalc = async (ticker) => {
    setBusy(true); setMsg(ticker ? `Recalculando ${ticker}…` : 'Recalculando todas (puede tardar)…')
    try {
      const body = ticker ? { ticker } : { all: true }
      const res = await fetch('/api/admin/calculate-returns', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const d = await res.json()
      setMsg(res.ok ? `✓ Rentabilidades recalculadas (${d.processed}/${d.total})` : `✗ ${d.error}`)
    } catch (e) { setMsg('✗ ' + e) } finally { setBusy(false) }
  }

  return (
    <Card style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <SectionTitle>ETFs y Fondos</SectionTitle>
        <button onClick={() => recalc(null)} disabled={busy} style={{ fontSize: 12, fontWeight: 700, padding: '7px 14px', borderRadius: 8, border: 'none', background: '#6366f1', color: '#fff', cursor: 'pointer' }}>
          {busy ? '…' : 'Recalcular todas'}
        </button>
      </div>
      {msg && <p style={{ fontSize: 12, color: msg.startsWith('✓') ? '#34d399' : msg.startsWith('✗') ? '#f87171' : '#fbbf24', marginBottom: 10 }}>{msg}</p>}

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 640 }}>
          <thead>
            <tr>{['Nombre', 'Tipo', 'TER (%)', 'Benchmark', ''].map(h => (
              <th key={h} style={{ padding: '6px 8px', textAlign: 'left', color: '#4a5270', borderBottom: '1px solid rgba(255,255,255,0.08)', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {funds.map(f => (
              <tr key={f.ticker} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <td style={{ padding: '6px 8px', color: '#c8d0e0' }}>{f.name || f.ticker} <span style={{ color: '#3a4260', fontSize: 10 }}>{f.ticker}</span></td>
                <td style={{ padding: '6px 8px', color: '#8090a8' }}>{f.asset_type === 'fund' ? 'Fondo' : 'ETF'}</td>
                <td style={{ padding: '6px 8px' }}>
                  {editing === f.ticker ? (
                    <input autoFocus type="number" step="0.01" value={draft} onChange={e => setDraft(e.target.value)} onBlur={() => commitTer(f.ticker)} onKeyDown={e => e.key === 'Enter' && commitTer(f.ticker)}
                      style={{ width: 70, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(99,102,241,0.4)', borderRadius: 6, color: '#e0e8f0', fontSize: 12, padding: '4px 6px', outline: 'none' }} />
                  ) : (
                    <span onClick={() => { setEditing(f.ticker); setDraft(f.ter != null ? String(Math.round(f.ter * 100 * 1000) / 1000) : '') }}
                      style={{ cursor: 'pointer', color: f.ter != null ? '#c8d0e0' : '#4a5270', borderBottom: '1px dotted rgba(255,255,255,0.2)' }}>
                      {f.ter != null ? (f.ter * 100).toFixed(2) + '%' : 'editar'}
                    </span>
                  )}
                </td>
                <td style={{ padding: '6px 8px' }}>
                  <select value={f._custom ? '__custom__' : (f.benchmark_ticker || '')} onChange={e => onBenchmark(f.ticker, e.target.value)}
                    style={{ background: '#0d1424', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#c8d0e0', fontSize: 11, padding: '4px 6px', outline: 'none' }}>
                    {BENCHMARKS.map(b => <option key={b.t || 'none'} value={b.t}>{b.n}</option>)}
                  </select>
                  {f._custom && (
                    <input placeholder="ticker yfinance" defaultValue={f.benchmark_ticker || ''} onBlur={e => saveCustomBench(f.ticker, e.target.value.trim(), e.target.value.trim())}
                      style={{ width: 110, marginLeft: 6, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(99,102,241,0.4)', borderRadius: 6, color: '#e0e8f0', fontSize: 11, padding: '4px 6px', outline: 'none' }} />
                  )}
                </td>
                <td style={{ padding: '6px 8px' }}>
                  <button onClick={() => recalc(f.ticker)} disabled={busy} style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(99,102,241,0.3)', background: 'rgba(99,102,241,0.1)', color: '#818cf8', cursor: 'pointer', whiteSpace: 'nowrap' }}>Recalcular</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
