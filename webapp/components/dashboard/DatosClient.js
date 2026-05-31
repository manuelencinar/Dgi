'use client'
import { useState } from 'react'
import { Card, PageTitle, SectionTitle, fmtDate } from '@/components/dashboard/ui'

const PAGE = 30

function downloadCSV(filename, rows) {
  const csv = rows.map(r => r.map(c => {
    const s = c == null ? '' : String(c)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }).join(',')).join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

function FetchButton({ ticker, onResult }) {
  const [state, setState] = useState('idle') // idle | loading | ok | err
  const [msg, setMsg] = useState('')

  const run = async () => {
    setState('loading'); setMsg('')
    try {
      const res = await fetch('/api/admin/fetch-ticker', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticker }) })
      const data = await res.json()
      if (!res.ok) { setState('err'); setMsg(data.error || 'Error'); return }
      setState('ok'); setMsg(`${data.obtained.length} campos OK`)
      onResult?.(data)
    } catch (e) { setState('err'); setMsg(String(e)) }
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <button onClick={run} disabled={state === 'loading'} style={{
        fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
        border: '1px solid rgba(99,102,241,0.3)', background: 'rgba(99,102,241,0.12)', color: '#818cf8',
      }}>
        {state === 'loading' ? '…' : state === 'ok' ? '✓' : 'Cargar'}
      </button>
      {msg && <span style={{ fontSize: 10, color: state === 'err' ? '#f87171' : '#34d399' }}>{msg}</span>}
    </span>
  )
}

function Paginated({ rows, render, cols }) {
  const [page, setPage] = useState(1)
  const totalPages = Math.ceil(rows.length / PAGE)
  const slice = rows.slice((page - 1) * PAGE, page * PAGE)
  return (
    <>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead><tr>{cols.map(c => <th key={c} style={{ padding: '6px 8px', textAlign: 'left', color: '#4a5270', borderBottom: '1px solid rgba(255,255,255,0.06)', fontWeight: 600, whiteSpace: 'nowrap' }}>{c}</th>)}</tr></thead>
          <tbody>{slice.map(render)}</tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 12 }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={navBtn(page === 1)}>←</button>
          <span style={{ fontSize: 12, color: '#4a5270', alignSelf: 'center' }}>{page}/{totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={navBtn(page === totalPages)}>→</button>
        </div>
      )}
    </>
  )
}
const navBtn = disabled => ({ padding: '5px 12px', borderRadius: 7, border: '1px solid rgba(255,255,255,0.08)', background: 'transparent', color: disabled ? '#2a3045' : '#8090a8', cursor: disabled ? 'default' : 'pointer', fontSize: 12 })

export default function DatosClient({ missing, incomplete, outdated }) {
  const [manualTicker, setManualTicker] = useState('')
  const [manualResult, setManualResult] = useState(null)
  const [manualState, setManualState] = useState('idle')
  const [triggerMsg, setTriggerMsg] = useState('')

  const loadManual = async () => {
    if (!manualTicker.trim()) return
    setManualState('loading'); setManualResult(null)
    try {
      const res = await fetch('/api/admin/fetch-ticker', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticker: manualTicker }) })
      const data = await res.json()
      setManualState(res.ok ? 'ok' : 'err')
      setManualResult(data)
    } catch (e) { setManualState('err'); setManualResult({ error: String(e) }) }
  }

  const triggerAll = async () => {
    setTriggerMsg('Disparando…')
    try {
      const res = await fetch('/api/admin/trigger-github-action', { method: 'POST' })
      const data = await res.json()
      setTriggerMsg(res.ok ? '✓ Workflow disparado en GitHub' : `✗ ${data.error}`)
    } catch (e) { setTriggerMsg(`✗ ${e}`) }
  }

  const exportMissing = () => {
    const rows = [['Ticker', 'Nombre', 'Sector', 'País']]
    missing.forEach(c => rows.push([c.ticker, c.name, c.sector, c.country]))
    downloadCSV('empresas_sin_fundamentales.csv', rows)
  }

  return (
    <div style={{ maxWidth: 1100 }}>
      <PageTitle sub="Gestión de fundamentales y carga de datos">Datos</PageTitle>

      {/* Sección 4: Carga manual (arriba, es la acción más usada) */}
      <Card style={{ marginBottom: 16 }}>
        <SectionTitle>Carga manual desde yfinance</SectionTitle>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input value={manualTicker} onChange={e => setManualTicker(e.target.value)} placeholder="Ticker (ej: AAPL, ITX.MC)"
            onKeyDown={e => e.key === 'Enter' && loadManual()}
            style={{ flex: 1, minWidth: 180, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '9px 12px', color: '#c8d0e0', fontSize: 13, outline: 'none' }} />
          <button onClick={loadManual} disabled={manualState === 'loading'} style={{ padding: '9px 18px', background: 'rgba(99,102,241,0.85)', border: 'none', borderRadius: 8, color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
            {manualState === 'loading' ? 'Cargando…' : 'Cargar fundamentales'}
          </button>
        </div>
        {manualResult && (
          <div style={{ marginTop: 12, padding: '12px', background: 'rgba(255,255,255,0.02)', borderRadius: 8, fontSize: 12 }}>
            {manualResult.error ? (
              <p style={{ color: '#f87171' }}>✗ {manualResult.error}</p>
            ) : (
              <>
                <p style={{ color: '#34d399', marginBottom: 6 }}>✓ {manualResult.name} — {manualResult.obtained.length} campos obtenidos</p>
                <p style={{ color: '#8090a8', fontSize: 11, marginBottom: 4 }}><strong>Obtenidos:</strong> {manualResult.obtained.join(', ')}</p>
                {manualResult.failed?.length > 0 && <p style={{ color: '#fbbf24', fontSize: 11, marginBottom: 4 }}><strong>Vacíos:</strong> {manualResult.failed.join(', ')}</p>}
                <p style={{ color: '#2e3a55', fontSize: 10, marginTop: 6 }}>{manualResult.note}</p>
              </>
            )}
          </div>
        )}
      </Card>

      {/* Sección 1: Sin fundamentales */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
          <SectionTitle>{missing.length.toLocaleString('es-ES')} empresas sin fundamentales</SectionTitle>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={exportMissing} style={ghostBtn}>↓ Exportar CSV</button>
            <button onClick={triggerAll} style={primaryBtn}>Actualizar todas (GitHub)</button>
          </div>
        </div>
        {triggerMsg && <p style={{ fontSize: 12, color: triggerMsg.startsWith('✓') ? '#34d399' : '#fbbf24', marginBottom: 10 }}>{triggerMsg}</p>}
        {missing.length === 0 ? <p style={{ fontSize: 13, color: '#34d399' }}>✓ Todas las empresas del DICT tienen fundamentales.</p> : (
          <Paginated rows={missing} cols={['Ticker', 'Nombre', 'Sector', 'País', '']} render={c => (
            <tr key={c.ticker} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <td style={{ padding: '6px 8px', color: '#818cf8', fontWeight: 700 }}>{c.ticker}</td>
              <td style={{ padding: '6px 8px', color: '#c8d0e0' }}>{c.name}</td>
              <td style={{ padding: '6px 8px', color: '#8090a8' }}>{c.sector}</td>
              <td style={{ padding: '6px 8px', color: '#4a5270' }}>{c.country}</td>
              <td style={{ padding: '6px 8px' }}><FetchButton ticker={c.ticker} /></td>
            </tr>
          )} />
        )}
      </Card>

      {/* Sección 2: Incompletas */}
      <Card style={{ marginBottom: 16 }}>
        <SectionTitle>{incomplete.length.toLocaleString('es-ES')} empresas con datos incompletos</SectionTitle>
        {incomplete.length === 0 ? <p style={{ fontSize: 13, color: '#34d399' }}>✓ Sin datos incompletos.</p> : (
          <Paginated rows={incomplete} cols={['Ticker', 'Nombre', 'Campos que faltan', 'Actualizado', '']} render={c => (
            <tr key={c.ticker} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <td style={{ padding: '6px 8px', color: '#818cf8', fontWeight: 700 }}>{c.ticker}</td>
              <td style={{ padding: '6px 8px', color: '#c8d0e0' }}>{c.name}</td>
              <td style={{ padding: '6px 8px' }}>{c.missingFields.map(f => <span key={f} style={{ fontSize: 10, color: '#f87171', background: 'rgba(248,113,113,0.1)', padding: '1px 6px', borderRadius: 4, marginRight: 4 }}>{f}</span>)}</td>
              <td style={{ padding: '6px 8px', color: '#4a5270' }}>{fmtDate(c.updated_at)}</td>
              <td style={{ padding: '6px 8px' }}><FetchButton ticker={c.ticker} /></td>
            </tr>
          )} />
        )}
      </Card>

      {/* Sección 3: Desactualizadas */}
      <Card>
        <SectionTitle>{outdated.length.toLocaleString('es-ES')} empresas desactualizadas (&gt;30 días)</SectionTitle>
        {outdated.length === 0 ? <p style={{ fontSize: 13, color: '#34d399' }}>✓ Todo actualizado en los últimos 30 días.</p> : (
          <Paginated rows={outdated} cols={['Ticker', 'Nombre', 'Última actualización', '']} render={c => (
            <tr key={c.ticker} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <td style={{ padding: '6px 8px', color: '#818cf8', fontWeight: 700 }}>{c.ticker}</td>
              <td style={{ padding: '6px 8px', color: '#c8d0e0' }}>{c.name}</td>
              <td style={{ padding: '6px 8px', color: '#fbbf24' }}>{fmtDate(c.updated_at)}</td>
              <td style={{ padding: '6px 8px' }}><FetchButton ticker={c.ticker} /></td>
            </tr>
          )} />
        )}
      </Card>
    </div>
  )
}

const ghostBtn = { fontSize: 11, fontWeight: 700, padding: '7px 14px', borderRadius: 8, cursor: 'pointer', border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#8090a8' }
const primaryBtn = { fontSize: 11, fontWeight: 700, padding: '7px 14px', borderRadius: 8, cursor: 'pointer', border: 'none', background: 'rgba(99,102,241,0.85)', color: '#fff' }
