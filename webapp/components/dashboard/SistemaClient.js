'use client'
import { useState, useMemo, useEffect } from 'react'
import { Card, PageTitle, SectionTitle, StatusDot, fmtDateTime } from '@/components/dashboard/ui'

const HEALTH_COL = { ok: '#34d399', warn: '#fbbf24', stale: '#f87171' }
const HEALTH_TXT = { ok: 'al día', warn: 'con retraso', stale: 'obsoleto' }
function ageLabel(age) {
  if (age == null) return 'sin datos'
  if (age === 0) return 'hoy'
  if (age === 1) return 'hace 1 día'
  return `hace ${age} días`
}

// Tarjeta de frescura de cada fuente de datos. Comprueba cada benchmark por
// separado (el indicador global no detecta una serie congelada, p.ej. ^GSPC).
function DataHealthCard() {
  const [health, setHealth] = useState(null)
  const [err, setErr] = useState(null)
  useEffect(() => {
    fetch('/api/admin/data-health').then(r => r.json())
      .then(d => d.error ? setErr(d.error) : setHealth(d))
      .catch(e => setErr(String(e)))
  }, [])

  const Row = ({ label, status, age }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: 13 }}>
      <span style={{ color: '#c8d0e0', display: 'flex', alignItems: 'center', gap: 7 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: HEALTH_COL[status] || '#4a5270', flexShrink: 0 }} />
        {label}
      </span>
      <span style={{ color: HEALTH_COL[status] || '#4a5270', fontWeight: 600 }}>{ageLabel(age)} · {HEALTH_TXT[status] || '—'}</span>
    </div>
  )

  return (
    <Card style={{ marginBottom: 16 }}>
      <SectionTitle>Salud de los datos</SectionTitle>
      {err && <p style={{ fontSize: 13, color: '#f87171' }}>{err}</p>}
      {!health && !err && <p style={{ fontSize: 13, color: '#4a5270' }}>Comprobando…</p>}
      {health && (
        <div>
          {health.sources.map(s => <Row key={s.key} label={s.label} status={s.status} age={s.age} />)}
          <p style={{ fontSize: 11, fontWeight: 700, color: '#4a5270', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '14px 0 4px' }}>Índices benchmark</p>
          {health.benchmarks.map(b => <Row key={b.ticker} label={b.ticker} status={b.status} age={b.age} />)}
          {health.worst !== 'ok' && (
            <p style={{ fontSize: 12, color: HEALTH_COL[health.worst], marginTop: 12 }}>
              {health.worst === 'stale' ? '⚠️ Hay datos obsoletos. Lanza "Actualizar precios ahora" o revisa el workflow.' : 'Algún dato va con retraso; se pondrá al día en el próximo run.'}
            </p>
          )}
        </div>
      )}
    </Card>
  )
}

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

export default function SistemaClient({ pingMs, pingOk, lastRun, logs, nextRun }) {
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [actionMsg, setActionMsg] = useState('')
  const [busy, setBusy] = useState(false)

  const types = useMemo(() => [...new Set(logs.map(l => l.event_type))], [logs])
  const filtered = useMemo(() => logs.filter(l =>
    (typeFilter === 'all' || l.event_type === typeFilter) &&
    (statusFilter === 'all' || l.status === statusFilter)
  ), [logs, typeFilter, statusFilter])

  const runDetails = lastRun?.details || {}

  const trigger = async () => {
    setBusy(true); setActionMsg('Disparando workflow…')
    try {
      const res = await fetch('/api/admin/trigger-github-action', { method: 'POST' })
      const data = await res.json()
      setActionMsg(res.ok ? '✓ Workflow disparado en GitHub' : `✗ ${data.error}`)
    } catch (e) { setActionMsg(`✗ ${e}`) } finally { setBusy(false) }
  }

  const triggerPrices = async () => {
    setBusy(true); setActionMsg('Disparando actualización de precios…')
    try {
      const res = await fetch('/api/admin/trigger-prices', { method: 'POST' })
      const data = await res.json()
      setActionMsg(res.ok ? '✓ Actualización de precios disparada en GitHub' : `✗ ${data.error}`)
    } catch (e) { setActionMsg(`✗ ${e}`) } finally { setBusy(false) }
  }

  const cleanLogs = async () => {
    setBusy(true); setActionMsg('Limpiando logs antiguos…')
    try {
      const res = await fetch('/api/admin/clean-logs', { method: 'POST' })
      const data = await res.json()
      setActionMsg(res.ok ? `✓ ${data.deleted} logs eliminados` : `✗ ${data.error}`)
    } catch (e) { setActionMsg(`✗ ${e}`) } finally { setBusy(false) }
  }

  const exportLogs = () => {
    const rows = [['Fecha', 'Tipo', 'Descripción', 'Estado']]
    logs.forEach(l => rows.push([l.created_at, l.event_type, l.description, l.status]))
    downloadCSV('admin_logs.csv', rows)
  }

  return (
    <div style={{ maxWidth: 1100 }}>
      <PageTitle sub="Logs y estado del sistema">Sistema</PageTitle>

      <DataHealthCard />

      {/* Estado actual */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 16, marginBottom: 16 }}>
        <Card>
          <SectionTitle>Último run de yfinance</SectionTitle>
          {lastRun ? (
            <div style={{ display: 'grid', gap: 8, fontSize: 13 }}>
              <Row k="Estado" v={<span style={{ color: lastRun.status === 'error' ? '#f87171' : '#34d399' }}><StatusDot status={lastRun.status} />{lastRun.status}</span>} />
              <Row k="Fecha" v={fmtDateTime(lastRun.created_at)} />
              <Row k="Actualizadas" v={runDetails.updated ?? '—'} />
              <Row k="Errores" v={runDetails.failed ?? '—'} />
              {runDetails.duration && <Row k="Duración" v={runDetails.duration} />}
            </div>
          ) : <p style={{ fontSize: 13, color: '#4a5270' }}>Sin registros de run todavía.</p>}
        </Card>

        <Card>
          <SectionTitle>Estado del sistema</SectionTitle>
          <div style={{ display: 'grid', gap: 8, fontSize: 13 }}>
            <Row k="Supabase" v={<span style={{ color: pingOk ? '#34d399' : '#f87171' }}><StatusDot status={pingOk ? 'ok' : 'error'} />{pingOk ? 'Operativo' : 'Error'}</span>} />
            <Row k="Tiempo de respuesta" v={pingMs != null ? `${pingMs} ms` : '—'} />
            <Row k="Próximo run programado" v="Domingo 6:00 UTC" />
            <Row k="Fecha próximo run" v={fmtDateTime(nextRun)} />
          </div>
        </Card>
      </div>

      {/* Acciones manuales */}
      <Card style={{ marginBottom: 16 }}>
        <SectionTitle>Acciones manuales</SectionTitle>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={trigger} disabled={busy} style={btn('#6366f1')}>Lanzar script yfinance ahora</button>
          <button onClick={triggerPrices} disabled={busy} style={btn('#34d399', '#062b1f')}>Actualizar precios ahora</button>
          <button onClick={cleanLogs} disabled={busy} style={btn('transparent', '#8090a8')}>Limpiar logs &gt;90 días</button>
          <button onClick={exportLogs} style={btn('transparent', '#8090a8')}>Exportar logs CSV</button>
        </div>
        {actionMsg && <p style={{ fontSize: 12, color: actionMsg.startsWith('✓') ? '#34d399' : actionMsg.startsWith('✗') ? '#f87171' : '#fbbf24', marginTop: 10 }}>{actionMsg}</p>}
      </Card>

      {/* Log de eventos */}
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
          <SectionTitle>Log de eventos</SectionTitle>
          <div style={{ display: 'flex', gap: 8 }}>
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={sel}>
              <option value="all">Todos los tipos</option>
              {types.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={sel}>
              <option value="all">Todos los estados</option>
              <option value="ok">OK</option>
              <option value="error">Error</option>
            </select>
          </div>
        </div>
        {filtered.length === 0 ? (
          <p style={{ fontSize: 13, color: '#4a5270' }}>Sin eventos registrados. El script de yfinance escribe aquí al terminar cada run.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead><tr>{['Fecha', 'Tipo', 'Descripción', 'Estado'].map(h => (
                <th key={h} style={{ padding: '6px 8px', textAlign: 'left', color: '#4a5270', borderBottom: '1px solid rgba(255,255,255,0.06)', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
              ))}</tr></thead>
              <tbody>
                {filtered.map(l => (
                  <tr key={l.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding: '7px 8px', color: '#4a5270', whiteSpace: 'nowrap' }}>{fmtDateTime(l.created_at)}</td>
                    <td style={{ padding: '7px 8px', color: '#818cf8' }}>{l.event_type}</td>
                    <td style={{ padding: '7px 8px', color: '#c8d0e0' }}>{l.description}</td>
                    <td style={{ padding: '7px 8px', color: l.status === 'error' ? '#f87171' : '#34d399' }}>{l.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

function Row({ k, v }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, paddingBottom: 7, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <span style={{ color: '#4a5270' }}>{k}</span>
      <span style={{ color: '#c8d0e0', textAlign: 'right' }}>{v}</span>
    </div>
  )
}
const btn = (bg, color = '#fff') => ({ fontSize: 12, fontWeight: 700, padding: '9px 16px', borderRadius: 8, cursor: 'pointer', border: bg === 'transparent' ? '1px solid rgba(255,255,255,0.1)' : 'none', background: bg === 'transparent' ? 'transparent' : bg, color })
const sel = { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#c8d0e0', fontSize: 12, padding: '5px 8px' }
