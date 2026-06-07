'use client'
import { useState, useMemo, Fragment } from 'react'
import { Card, SectionTitle } from '@/components/dashboard/ui'

const PAGE = 25
const STATUS = { sin: { l: 'Sin fundamentales', c: '#f87171' }, incompletos: { l: 'Incompletos', c: '#fbbf24' }, desactualizados: { l: 'Desactualizados', c: '#fb923c' }, ok: { l: 'OK', c: '#34d399' } }
const TYPES = ['general', 'banco', 'aseguradora', 'reit', 'bdc', 'utilities']
const inputStyle = { background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(99,102,241,0.4)', borderRadius: 5, padding: '4px 6px', color: '#e0e8f0', fontSize: 12, outline: 'none', width: '100%', fontFamily: 'inherit' }

function downloadCSV(name, rows) {
  const csv = rows.map(r => r.map(c => { const s = c == null ? '' : String(c); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }).join(',')).join('\n')
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }))
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url)
}

// Celda editable (texto o select). Guarda al perder foco / Enter.
function Cell({ value, options, validate, onSave, color }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(value)
  const [state, setState] = useState(null) // 'ok' | 'err' | null
  const commit = async () => {
    setEditing(false)
    if (val === value) return
    if (validate && !validate(val)) { setState('err'); setTimeout(() => setState(null), 2000); return }
    const ok = await onSave(val)
    setState(ok ? 'ok' : 'err'); setTimeout(() => setState(null), 2000)
    if (!ok) setVal(value)
  }
  if (editing) {
    return options ? (
      <select autoFocus value={val} onChange={e => setVal(e.target.value)} onBlur={commit}
        onKeyDown={e => e.key === 'Enter' && commit()} style={inputStyle}>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    ) : (
      <input autoFocus value={val} onChange={e => setVal(e.target.value)} onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setVal(value); setEditing(false) } }} style={inputStyle} />
    )
  }
  return (
    <span onClick={() => { setVal(value); setEditing(true) }} title="Clic para editar" style={{ cursor: 'pointer', color: color || '#c8d0e0', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      {value || <span style={{ color: '#4a5270' }}>—</span>}
      {state === 'ok' && <span style={{ color: '#34d399' }}>✓</span>}
      {state === 'err' && <span style={{ color: '#f87171' }}>✗</span>}
    </span>
  )
}

export default function EmpresasAdminClient({ companies: initial, sectors, countries }) {
  const [rows, setRows] = useState(initial || [])
  const [q, setQ] = useState('')
  const [fSector, setFSector] = useState('')
  const [fCountry, setFCountry] = useState('')
  const [fStatus, setFStatus] = useState('')
  const [page, setPage] = useState(1)
  const [sel, setSel] = useState(() => new Set())
  const [confirmDel, setConfirmDel] = useState(null) // ticker
  const [delInfo, setDelInfo] = useState(null) // {users}
  const [bulkSector, setBulkSector] = useState('')
  const [renaming, setRenaming] = useState(null) // ticker
  const [newTicker, setNewTicker] = useState('')
  const [msg, setMsg] = useState(null)
  const [loading, setLoading] = useState(() => new Set())

  const loadFund = async (ticker) => {
    setLoading(s => new Set(s).add(ticker))
    try { const res = await fetch('/api/admin/fetch-ticker', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticker }) }); if (res.ok) setRow(ticker, { status: 'ok' }) } catch {}
    finally { setLoading(s => { const n = new Set(s); n.delete(ticker); return n }) }
  }

  const [triggering, setTriggering] = useState(false)
  const triggerAll = async () => {
    if (!confirm('Dispara el run completo de yfinance en GitHub (procesa todo el DICT, ~1 h). Incluye las empresas nuevas. ¿Continuar?')) return
    setTriggering(true); setMsg(null)
    try {
      const res = await fetch('/api/admin/trigger-github-action', { method: 'POST' })
      const d = await res.json()
      setMsg(res.ok ? { t: 'ok', m: '✓ Workflow disparado en GitHub — los fundamentales completos llegarán en ~1 h' } : { t: 'err', m: d.error || 'Error' })
    } catch (e) { setMsg({ t: 'err', m: String(e) }) } finally { setTriggering(false) }
  }

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase()
    return rows.filter(r =>
      (!ql || r.ticker.toLowerCase().includes(ql) || (r.name || '').toLowerCase().includes(ql)) &&
      (!fSector || r.sector === fSector) &&
      (!fCountry || r.country === fCountry) &&
      (!fStatus || r.status === fStatus)
    )
  }, [rows, q, fSector, fCountry, fStatus])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE))
  const pageRows = filtered.slice((page - 1) * PAGE, page * PAGE)

  const setRow = (ticker, patch) => setRows(rs => rs.map(r => r.ticker === ticker ? { ...r, ...patch } : r))

  // Guarda un campo (name/sector/country) vía dict_overrides (upsert completo)
  const saveField = async (row, field, value) => {
    const merged = { ...row, [field]: value }
    try {
      const res = await fetch('/api/admin/dict', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        action: 'add', ticker: merged.ticker, name: merged.name, country: merged.country, currency: merged.currency, sector: merged.sector, subsector: merged.subsector, type: merged.type,
      }) })
      if (!res.ok) return false
      setRow(row.ticker, { [field]: value }); return true
    } catch { return false }
  }

  const renameTicker = async (row) => {
    const nt = newTicker.trim().toUpperCase()
    setRenaming(null); setNewTicker('')
    if (!nt || nt === row.ticker) return
    if (!/^[A-Z0-9.\-]+$/.test(nt)) { setMsg({ t: 'err', m: 'Ticker inválido' }); return }
    setMsg({ t: 'info', m: `Migrando ${row.ticker} → ${nt}…` })
    try {
      const res = await fetch('/api/admin/dict', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        oldTicker: row.ticker, newTicker: nt, name: row.name, country: row.country, currency: row.currency, sector: row.sector, subsector: row.subsector, type: row.type,
      }) })
      const j = await res.json()
      if (!res.ok) { setMsg({ t: 'err', m: j.error || 'Error' }); return }
      setRows(rs => rs.map(r => r.ticker === row.ticker ? { ...r, ticker: nt } : r))
      setMsg({ t: 'ok', m: `${row.ticker} → ${nt} migrado en todas las tablas` })
    } catch (e) { setMsg({ t: 'err', m: String(e) }) }
  }

  const openDelete = async (ticker) => {
    setConfirmDel(ticker); setDelInfo(null)
    try { const r = await fetch(`/api/admin/dict?action=positions&ticker=${encodeURIComponent(ticker)}`); setDelInfo(await r.json()) } catch { setDelInfo({ users: 0 }) }
  }
  const doDelete = async (ticker) => {
    setConfirmDel(null)
    try {
      const res = await fetch('/api/admin/dict', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'remove', ticker, purge: true }) })
      if (res.ok) { setRows(rs => rs.filter(r => r.ticker !== ticker)); setSel(s => { const n = new Set(s); n.delete(ticker); return n }) }
      else setMsg({ t: 'err', m: 'No se pudo eliminar' })
    } catch { setMsg({ t: 'err', m: 'Error al eliminar' }) }
  }

  const toggle = ticker => setSel(s => { const n = new Set(s); n.has(ticker) ? n.delete(ticker) : n.add(ticker); return n })
  const allOnPage = pageRows.every(r => sel.has(r.ticker)) && pageRows.length > 0
  const toggleAll = () => setSel(s => { const n = new Set(s); if (allOnPage) pageRows.forEach(r => n.delete(r.ticker)); else pageRows.forEach(r => n.add(r.ticker)); return n })

  const bulkDelete = async () => {
    if (!confirm(`¿Eliminar ${sel.size} empresas? Se conservará el historial de posiciones/transacciones.`)) return
    for (const t of sel) { try { await fetch('/api/admin/dict', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'remove', ticker: t, purge: true }) }) } catch {} }
    setRows(rs => rs.filter(r => !sel.has(r.ticker))); setSel(new Set())
  }
  const bulkChangeSector = async () => {
    if (!bulkSector) return
    for (const t of sel) { const row = rows.find(r => r.ticker === t); if (row) await saveField(row, 'sector', bulkSector) }
    setSel(new Set()); setBulkSector('')
  }
  const exportSel = () => {
    const list = sel.size ? rows.filter(r => sel.has(r.ticker)) : filtered
    downloadCSV('empresas.csv', [['ticker', 'nombre', 'sector', 'pais', 'tipo', 'estado'], ...list.map(r => [r.ticker, r.name, r.sector, r.country, r.type, STATUS[r.status]?.l])])
  }

  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <SectionTitle>Empresas ({filtered.length.toLocaleString('es-ES')})</SectionTitle>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={exportSel} style={ghost}>↓ Exportar CSV</button>
          <button onClick={triggerAll} disabled={triggering} style={{ ...ghost, color: '#818cf8', borderColor: 'rgba(99,102,241,0.3)' }}>
            {triggering ? '…' : '↻ Actualizar fundamentales (GitHub)'}
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <input value={q} onChange={e => { setQ(e.target.value); setPage(1) }} placeholder="Buscar nombre o ticker" style={{ ...filterStyle, flex: 1, minWidth: 160 }} />
        <select value={fSector} onChange={e => { setFSector(e.target.value); setPage(1) }} style={filterStyle}><option value="">Sector: todos</option>{sectors.map(s => <option key={s} value={s}>{s}</option>)}</select>
        <select value={fCountry} onChange={e => { setFCountry(e.target.value); setPage(1) }} style={filterStyle}><option value="">País: todos</option>{countries.map(c => <option key={c} value={c}>{c}</option>)}</select>
        <select value={fStatus} onChange={e => { setFStatus(e.target.value); setPage(1) }} style={filterStyle}><option value="">Estado: todos</option><option value="sin">Sin fundamentales</option><option value="incompletos">Incompletos</option><option value="desactualizados">Desactualizados</option><option value="ok">OK</option></select>
      </div>

      {msg && <p style={{ fontSize: 12, color: msg.t === 'ok' ? '#34d399' : msg.t === 'err' ? '#f87171' : '#8090a8', marginBottom: 10 }}>{msg.m}</p>}

      {/* Barra de acciones masivas */}
      {sel.size > 0 && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '10px 12px', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#818cf8' }}>{sel.size} seleccionadas</span>
          <select value={bulkSector} onChange={e => setBulkSector(e.target.value)} style={filterStyle}><option value="">Cambiar sector a…</option>{sectors.map(s => <option key={s} value={s}>{s}</option>)}</select>
          <button onClick={bulkChangeSector} disabled={!bulkSector} style={ghost}>Aplicar</button>
          <button onClick={exportSel} style={ghost}>Exportar CSV</button>
          <button onClick={bulkDelete} style={{ ...ghost, color: '#f87171', borderColor: 'rgba(248,113,113,0.3)' }}>Eliminar todas</button>
          <button onClick={() => setSel(new Set())} style={{ ...ghost, marginLeft: 'auto' }}>Limpiar</button>
        </div>
      )}

      {/* Tabla */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 760 }}>
          <thead><tr>
            <th style={th}><input type="checkbox" checked={allOnPage} onChange={toggleAll} /></th>
            {['Ticker', 'Nombre', 'Sector', 'País', 'Tipo', 'Estado', ''].map(h => <th key={h} style={th}>{h}</th>)}
          </tr></thead>
          <tbody>
            {pageRows.map(r => (
              <Fragment key={r.ticker}>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={td}><input type="checkbox" checked={sel.has(r.ticker)} onChange={() => toggle(r.ticker)} /></td>
                  <td style={{ ...td, fontWeight: 700 }}>
                    {renaming === r.ticker ? (
                      <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                        <input autoFocus value={newTicker} onChange={e => setNewTicker(e.target.value.toUpperCase())} onKeyDown={e => e.key === 'Enter' && renameTicker(r)} style={{ ...inputStyle, width: 90 }} />
                        <button onClick={() => renameTicker(r)} style={miniBtn('#34d399')}>✓</button>
                        <button onClick={() => { setRenaming(null); setNewTicker('') }} style={miniBtn('#8090a8')}>✗</button>
                      </span>
                    ) : (
                      <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}>
                        <span style={{ color: '#818cf8' }}>{r.ticker}</span>
                        <button onClick={() => { setRenaming(r.ticker); setNewTicker(r.ticker) }} title="Cambiar ticker" style={miniBtn('#4a5270')}>✎</button>
                      </span>
                    )}
                  </td>
                  <td style={td}><Cell value={r.name} onSave={v => saveField(r, 'name', v)} /></td>
                  <td style={td}><Cell value={r.sector} options={sectors} onSave={v => saveField(r, 'sector', v)} color="#8090a8" /></td>
                  <td style={td}><Cell value={r.country} options={countries} onSave={v => saveField(r, 'country', v)} color="#4a5270" /></td>
                  <td style={td}><Cell value={r.type} options={TYPES} onSave={v => saveField(r, 'type', v)} color="#4a5270" /></td>
                  <td style={td}><span style={{ fontSize: 10, fontWeight: 700, color: STATUS[r.status]?.c, background: `${STATUS[r.status]?.c}18`, padding: '2px 7px', borderRadius: 5 }}>{STATUS[r.status]?.l}</span></td>
                  <td style={td}>
                    <button onClick={() => loadFund(r.ticker)} disabled={loading.has(r.ticker)} title="Cargar de yfinance" style={miniBtn('#818cf8')}>{loading.has(r.ticker) ? '…' : '⤓'}</button>
                    <button onClick={() => openDelete(r.ticker)} title="Eliminar" style={miniBtn('#f87171')}>🗑</button>
                  </td>
                </tr>
                {confirmDel === r.ticker && (
                  <tr><td colSpan={8} style={{ padding: '10px 12px', background: 'rgba(248,113,113,0.06)' }}>
                    <p style={{ fontSize: 12, color: '#c8d0e0', marginBottom: delInfo?.users ? 4 : 8 }}>¿Eliminar <b>{r.name}</b>? Esta empresa dejó de cotizar.</p>
                    {delInfo?.users > 0 && <p style={{ fontSize: 11, color: '#fbbf24', marginBottom: 8 }}>⚠ {delInfo.users} usuario(s) la tienen en cartera — sus posiciones históricas se conservarán pero no verán datos actualizados.</p>}
                    <button onClick={() => doDelete(r.ticker)} style={{ ...ghost, color: '#f87171', borderColor: 'rgba(248,113,113,0.3)', marginRight: 6 }}>Sí, eliminar</button>
                    <button onClick={() => setConfirmDel(null)} style={ghost}>Cancelar</button>
                  </td></tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 12, alignItems: 'center' }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={ghost}>←</button>
          <span style={{ fontSize: 12, color: '#4a5270' }}>{page}/{totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={ghost}>→</button>
        </div>
      )}
    </Card>
  )
}

const th = { padding: '6px 8px', textAlign: 'left', color: '#4a5270', borderBottom: '1px solid rgba(255,255,255,0.08)', fontWeight: 600, whiteSpace: 'nowrap' }
const td = { padding: '6px 8px', whiteSpace: 'nowrap' }
const filterStyle = { background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7, padding: '7px 9px', color: '#c8d0e0', fontSize: 12, outline: 'none', fontFamily: 'inherit' }
const ghost = { fontSize: 11, fontWeight: 700, padding: '6px 12px', borderRadius: 7, cursor: 'pointer', border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#8090a8' }
const miniBtn = c => ({ fontSize: 12, padding: '2px 6px', borderRadius: 5, cursor: 'pointer', border: 'none', background: 'transparent', color: c })
