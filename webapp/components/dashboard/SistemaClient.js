'use client'
import { useState, useMemo, useEffect } from 'react'
import { Card, PageTitle, SectionTitle, StatusDot, fmtDateTime } from '@/components/dashboard/ui'

const HEALTH_COL = { ok: 'var(--positive)', warn: 'var(--warning)', stale: 'var(--negative)' }
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
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--surface-2)', fontSize: 13 }}>
      <span style={{ color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 7 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: HEALTH_COL[status] || 'var(--text-faint)', flexShrink: 0 }} />
        {label}
      </span>
      <span style={{ color: HEALTH_COL[status] || 'var(--text-faint)', fontWeight: 600 }}>{ageLabel(age)} · {HEALTH_TXT[status] || '—'}</span>
    </div>
  )

  return (
    <Card style={{ marginBottom: 16 }}>
      <SectionTitle>Salud de los datos</SectionTitle>
      {err && <p style={{ fontSize: 13, color: 'var(--negative)' }}>{err}</p>}
      {!health && !err && <p style={{ fontSize: 13, color: 'var(--text-faint)' }}>Comprobando…</p>}
      {health && (
        <div>
          {health.sources.map(s => <Row key={s.key} label={s.label} status={s.status} age={s.age} />)}
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '14px 0 4px' }}>Índices benchmark</p>
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
              <Row k="Estado" v={<span style={{ color: lastRun.status === 'error' ? 'var(--negative)' : 'var(--positive)' }}><StatusDot status={lastRun.status} />{lastRun.status}</span>} />
              <Row k="Fecha" v={fmtDateTime(lastRun.created_at)} />
              <Row k="Actualizadas" v={runDetails.updated ?? '—'} />
              <Row k="Errores" v={runDetails.failed ?? '—'} />
              {runDetails.duration && <Row k="Duración" v={runDetails.duration} />}
            </div>
          ) : <p style={{ fontSize: 13, color: 'var(--text-faint)' }}>Sin registros de run todavía.</p>}
        </Card>

        <Card>
          <SectionTitle>Estado del sistema</SectionTitle>
          <div style={{ display: 'grid', gap: 8, fontSize: 13 }}>
            <Row k="Supabase" v={<span style={{ color: pingOk ? 'var(--positive)' : 'var(--negative)' }}><StatusDot status={pingOk ? 'ok' : 'error'} />{pingOk ? 'Operativo' : 'Error'}</span>} />
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
          <button onClick={trigger} disabled={busy} style={btn('var(--accent)')}>Lanzar script yfinance ahora</button>
          <button onClick={triggerPrices} disabled={busy} style={btn('var(--positive)', '#062b1f')}>Actualizar precios ahora</button>
          <button onClick={cleanLogs} disabled={busy} style={btn('transparent', 'var(--text-muted)')}>Limpiar logs &gt;90 días</button>
          <button onClick={exportLogs} style={btn('transparent', 'var(--text-muted)')}>Exportar logs CSV</button>
        </div>
        {actionMsg && <p style={{ fontSize: 12, color: actionMsg.startsWith('✓') ? 'var(--positive)' : actionMsg.startsWith('✗') ? 'var(--negative)' : 'var(--warning)', marginTop: 10 }}>{actionMsg}</p>}
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
          <p style={{ fontSize: 13, color: 'var(--text-faint)' }}>Sin eventos registrados. El script de yfinance escribe aquí al terminar cada run.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead><tr>{['Fecha', 'Tipo', 'Descripción', 'Estado'].map(h => (
                <th key={h} style={{ padding: '6px 8px', textAlign: 'left', color: 'var(--text-faint)', borderBottom: '1px solid var(--border)', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
              ))}</tr></thead>
              <tbody>
                {filtered.map(l => (
                  <tr key={l.id} style={{ borderBottom: '1px solid var(--surface-2)' }}>
                    <td style={{ padding: '7px 8px', color: 'var(--text-faint)', whiteSpace: 'nowrap' }}>{fmtDateTime(l.created_at)}</td>
                    <td style={{ padding: '7px 8px', color: 'var(--accent)' }}>{l.event_type}</td>
                    <td style={{ padding: '7px 8px', color: 'var(--text)' }}>{l.description}</td>
                    <td style={{ padding: '7px 8px', color: l.status === 'error' ? 'var(--negative)' : 'var(--positive)' }}>{l.status}</td>
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
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, paddingBottom: 7, borderBottom: '1px solid var(--surface-2)' }}>
      <span style={{ color: 'var(--text-faint)' }}>{k}</span>
      <span style={{ color: 'var(--text)', textAlign: 'right' }}>{v}</span>
    </div>
  )
}
const btn = (bg, color = '#fff') => ({ fontSize: 12, fontWeight: 700, padding: '9px 16px', borderRadius: 8, cursor: 'pointer', border: bg === 'transparent' ? '1px solid var(--border-strong)' : 'none', background: bg === 'transparent' ? 'transparent' : bg, color })
const sel = { background: 'var(--surface-3)', border: '1px solid var(--border-strong)', borderRadius: 6, color: 'var(--text)', fontSize: 12, padding: '5px 8px' }
