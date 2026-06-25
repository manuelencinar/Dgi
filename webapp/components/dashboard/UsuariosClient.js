'use client'
import { useState, useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Card, PageTitle, SectionTitle, MetricCard, fmtDate, fmtDateTime } from '@/components/dashboard/ui'

const PAGE = 25

export default function UsuariosClient({ metrics, retention, onboarding, users }) {
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [detail, setDetail] = useState(null)
  const [rows, setRows] = useState(users)

  const filtered = useMemo(() => {
    let list = [...rows].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    if (filter !== 'all') list = list.filter(u => u.plan === filter)
    const q = search.trim().toLowerCase()
    if (q) list = list.filter(u => u.email?.toLowerCase().includes(q))
    return list
  }, [rows, filter, search])

  const totalPages = Math.ceil(filtered.length / PAGE)
  const slice = filtered.slice((page - 1) * PAGE, page * PAGE)

  return (
    <div style={{ maxWidth: 1100 }}>
      <PageTitle sub="Usuarios y métricas de negocio">Usuarios</PageTitle>

      {/* Métricas */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12, marginBottom: 20 }}>
        <MetricCard label="Total registrados" value={metrics.total} />
        <MetricCard label="Nuevos (7 días)" value={metrics.new7d} color="var(--positive)" />
        <MetricCard label="Nuevos (30 días)" value={metrics.new30d} color="var(--positive)" />
        <MetricCard label="Premium activos" value={metrics.premiumTotal} color="var(--warning)" />
        <MetricCard label="Conversión" value={`${metrics.conversion.toFixed(1)}%`} color="var(--accent)" />
        <MetricCard label="MRR" value={`${metrics.mrr.toFixed(0)} €`} color="var(--accent)" />
      </div>

      {/* Gráfico */}
      <Card style={{ marginBottom: 16 }}>
        <SectionTitle>Nuevos registros por semana (3 meses)</SectionTitle>
        {metrics.weekly.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text-faint)' }}>Sin registros en los últimos 3 meses.</p>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={metrics.weekly}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-3)" />
              <XAxis dataKey="week" stroke="var(--text-faint)" fontSize={10} />
              <YAxis stroke="var(--text-faint)" fontSize={10} allowDecimals={false} />
              <Tooltip contentStyle={{ background: 'var(--bg-elev)', border: '1px solid var(--border-strong)', borderRadius: 8, fontSize: 11 }} formatter={v => [v, 'Registros']} />
              <Bar dataKey="count" fill="var(--accent)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>

      {/* Onboarding */}
      {onboarding && onboarding.total > 0 && (
        <Card style={{ marginBottom: 16 }}>
          <SectionTitle>Onboarding</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12 }}>
            <MetricCard label="Tasa de completado" value={onboarding.completionRate != null ? `${onboarding.completionRate.toFixed(0)}%` : '—'} sub={`${onboarding.completed} de ${onboarding.total}`} color="var(--positive)" />
            <MetricCard label="Completados" value={onboarding.completed} color="var(--positive)" />
            <MetricCard label="Saltados" value={onboarding.skipped} color="var(--warning)" />
            <MetricCard label="Más abandono" value={onboarding.topAbandonStep != null ? `Paso ${onboarding.topAbandonStep}` : '—'} sub={onboarding.topAbandonCount ? `${onboarding.topAbandonCount} usuarios` : ''} color="var(--negative)" />
          </div>
        </Card>
      )}

      {/* Retención y cancelaciones */}
      {retention && (
        <Card style={{ marginBottom: 16 }}>
          <SectionTitle>Retención y cancelaciones</SectionTitle>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, marginBottom: 18 }}>
            <MetricCard label="Cancelaciones (30 días)" value={retention.cancelsLastMonth} color="var(--negative)" />
            <MetricCard label="Usuarios en pausa" value={retention.pausedNow} color="var(--warning)" />
            <MetricCard label="Descuentos activos" value={retention.discountUsed} color="var(--accent)" />
            <MetricCard label="MRR recuperado (est.)" value={`${retention.mrrRecovered.toFixed(0)} €`} color="var(--positive)" />
            <MetricCard
              label="Recuperación a 30 días"
              value={retention.recoveryRate != null ? `${retention.recoveryRate.toFixed(0)}%` : '—'}
              sub={retention.oldCancelsCount ? `${retention.recoveredCount}/${retention.oldCancelsCount} volvieron` : 'Sin datos aún'}
              color="var(--positive)"
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 16 }}>
            {/* Motivos de cancelación */}
            <div>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>Motivos más frecuentes</p>
              {retention.reasons.length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--text-faint)' }}>Sin cancelaciones registradas.</p>
              ) : (
                <ResponsiveContainer width="100%" height={Math.max(140, retention.reasons.length * 34)}>
                  <BarChart data={retention.reasons} layout="vertical" margin={{ left: 10, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-3)" horizontal={false} />
                    <XAxis type="number" stroke="var(--text-faint)" fontSize={10} allowDecimals={false} />
                    <YAxis type="category" dataKey="reason" stroke="var(--text-faint)" fontSize={10} width={110} />
                    <Tooltip contentStyle={{ background: 'var(--bg-elev)', border: '1px solid var(--border-strong)', borderRadius: 8, fontSize: 11 }} formatter={v => [v, 'Cancelaciones']} />
                    <Bar dataKey="count" fill="var(--negative)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Tasa de éxito de ofertas */}
            <div>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>Éxito de las ofertas de retención</p>
              <div style={{ display: 'grid', gap: 10 }}>
                <OfferBar label="Pausa" pct={retention.pauseSuccess} accepted={retention.pausedNow} color="var(--warning)" />
                <OfferBar label="Descuento 50%" pct={retention.discountSuccess} accepted={retention.discountUsed} color="var(--accent)" />
              </div>
              <p style={{ fontSize: 10, color: 'var(--text-faintest)', marginTop: 12 }}>
                Tasa = aceptadas / (mostradas + aceptadas). El MRR recuperado es una estimación.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Tabla */}
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {[['all', 'Todos'], ['free', 'Free'], ['premium', 'Premium']].map(([v, l]) => (
              <button key={v} onClick={() => { setFilter(v); setPage(1) }} style={{
                fontSize: 12, fontWeight: filter === v ? 700 : 500, padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
                background: filter === v ? 'rgba(99,102,241,0.2)' : 'var(--surface-2)', color: filter === v ? 'var(--accent)' : 'var(--text-faint)',
              }}>{l}</button>
            ))}
          </div>
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} placeholder="Buscar email…"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: 8, padding: '7px 12px', color: 'var(--text)', fontSize: 12, outline: 'none', minWidth: 200 }} />
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>{['Email', 'Registro', 'Último acceso', 'Plan', 'Estado', ''].map(h => (
                <th key={h} style={{ padding: '6px 8px', textAlign: 'left', color: 'var(--text-faint)', borderBottom: '1px solid var(--border)', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {slice.map(u => (
                <tr key={u.id} style={{ borderBottom: '1px solid var(--surface-2)' }}>
                  <td style={{ padding: '7px 8px', color: 'var(--text)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</td>
                  <td style={{ padding: '7px 8px', color: 'var(--text-muted)' }}>{fmtDate(u.created_at)}</td>
                  <td style={{ padding: '7px 8px', color: 'var(--text-faint)' }}>{u.last_sign_in_at ? fmtDate(u.last_sign_in_at) : '—'}</td>
                  <td style={{ padding: '7px 8px' }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: u.plan === 'premium' ? 'var(--warning)' : 'var(--text-faint)', background: u.plan === 'premium' ? 'rgba(251,191,36,0.12)' : 'var(--surface-2)', padding: '1px 7px', borderRadius: 4 }}>
                      {u.plan === 'premium' ? 'PREMIUM' : 'free'}
                    </span>
                  </td>
                  <td style={{ padding: '7px 8px' }}>
                    <span style={{ fontSize: 11, color: u.confirmed ? 'var(--positive)' : 'var(--warning)' }}>{u.confirmed ? 'Verificado' : 'Pendiente'}</span>
                  </td>
                  <td style={{ padding: '7px 8px' }}>
                    <button onClick={() => setDetail(u)} style={{ fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Ver detalle</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 14 }}>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={navBtn(page === 1)}>← Anterior</button>
            <span style={{ fontSize: 12, color: 'var(--text-faint)', alignSelf: 'center' }}>{page}/{totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={navBtn(page === totalPages)}>Siguiente →</button>
          </div>
        )}
      </Card>

      {/* Modal detalle */}
      {detail && (
        <UserDetailModal
          detail={detail}
          onClose={() => setDetail(null)}
          onUpdated={updated => {
            setRows(rs => rs.map(u => u.id === updated.id ? { ...u, ...updated } : u))
            setDetail(d => d && d.id === updated.id ? { ...d, ...updated } : d)
          }}
        />
      )}
    </div>
  )
}

function UserDetailModal({ detail, onClose, onUpdated }) {
  // Valor por defecto del datepicker: el premium_until actual o 1 año desde hoy
  const defaultDate = () => {
    if (detail.premium_until) return new Date(detail.premium_until).toISOString().slice(0, 10)
    const d = new Date(); d.setFullYear(d.getFullYear() + 1)
    return d.toISOString().slice(0, 10)
  }
  const [until, setUntil] = useState(defaultDate())
  const [noExpiry, setNoExpiry] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  async function call(body, okText) {
    setBusy(true); setMsg(null)
    try {
      const res = await fetch('/api/admin/grant-premium', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: detail.email, ...body }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Error')
      onUpdated({
        id: detail.id,
        plan: json.plan,
        premium_until: json.premium_until || null,
      })
      setMsg({ ok: true, text: okText })
    } catch (e) {
      setMsg({ ok: false, text: e.message })
    } finally { setBusy(false) }
  }

  const grant = () => call({ premiumUntil: noExpiry ? null : new Date(until + 'T23:59:59Z').toISOString() }, 'Premium concedido')
  const revoke = () => call({ revoke: true }, 'Premium revocado')

  const isPremium = detail.plan === 'premium'
  const expiryLabel = detail.premium_until
    ? `Caduca el ${fmtDate(detail.premium_until)}`
    : (isPremium ? 'Sin fecha de caducidad' : '—')

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <Card style={{ width: '90%', maxWidth: 440, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
          <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Detalle de usuario</p>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-faint)', fontSize: 20, cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ display: 'grid', gap: 10, fontSize: 13 }}>
          {[
            ['Email', detail.email],
            ['Plan', isPremium ? 'Premium' : 'Free'],
            ['Premium', expiryLabel],
            ['Estado', detail.confirmed ? 'Verificado' : 'Pendiente de verificar'],
            ['Registro', fmtDateTime(detail.created_at)],
            ['Último acceso', detail.last_sign_in_at ? fmtDateTime(detail.last_sign_in_at) : 'Nunca'],
            ['ID', detail.id],
          ].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, paddingBottom: 8, borderBottom: '1px solid var(--surface-2)' }}>
              <span style={{ color: 'var(--text-faint)' }}>{k}</span>
              <span style={{ color: 'var(--text)', textAlign: 'right', wordBreak: 'break-all', fontSize: k === 'ID' ? 10 : 13 }}>{v}</span>
            </div>
          ))}
        </div>

        {/* Gestión de premium */}
        <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--surface-3)' }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--warning)', marginBottom: 12 }}>Gestionar premium</p>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-muted)', marginBottom: 10, cursor: 'pointer' }}>
            <input type="checkbox" checked={noExpiry} onChange={e => setNoExpiry(e.target.checked)} />
            Sin fecha de caducidad (premium permanente)
          </label>

          {!noExpiry && (
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 11, color: 'var(--text-faint)', marginBottom: 5 }}>Premium hasta (incluido)</label>
              <input type="date" value={until} min={new Date().toISOString().slice(0, 10)} onChange={e => setUntil(e.target.value)}
                style={{ background: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: 8, padding: '7px 12px', color: 'var(--text)', fontSize: 13, outline: 'none', width: '100%', colorScheme: 'dark' }} />
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={grant} disabled={busy} style={{ flex: 1, minWidth: 140, padding: '9px 14px', borderRadius: 8, border: 'none', background: busy ? 'rgba(251,191,36,0.4)' : 'var(--warning)', color: '#1a1205', fontSize: 13, fontWeight: 700, cursor: busy ? 'default' : 'pointer' }}>
              {isPremium ? 'Actualizar premium' : 'Conceder premium'}
            </button>
            {isPremium && (
              <button onClick={revoke} disabled={busy} style={{ padding: '9px 14px', borderRadius: 8, border: '1px solid rgba(248,113,113,0.4)', background: 'transparent', color: 'var(--negative)', fontSize: 13, fontWeight: 600, cursor: busy ? 'default' : 'pointer' }}>
                Revocar
              </button>
            )}
          </div>

          {msg && (
            <p style={{ fontSize: 12, marginTop: 10, color: msg.ok ? 'var(--positive)' : 'var(--negative)' }}>{msg.ok ? '✓ ' : '⚠ '}{msg.text}</p>
          )}
        </div>
      </Card>
    </div>
  )
}

const navBtn = disabled => ({ padding: '6px 14px', borderRadius: 8, border: '1px solid var(--surface-3)', background: 'transparent', color: disabled ? 'var(--text-faintest)' : 'var(--text-muted)', cursor: disabled ? 'default' : 'pointer', fontSize: 12 })

function OfferBar({ label, pct, accepted, color }) {
  const width = pct != null ? Math.max(2, Math.min(100, pct)) : 0
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
        <span style={{ color: 'var(--text-muted)' }}>{label}</span>
        <span style={{ color, fontWeight: 700 }}>{pct != null ? `${pct.toFixed(0)}%` : '—'} <span style={{ color: 'var(--text-faint)', fontWeight: 400 }}>({accepted} aceptadas)</span></span>
      </div>
      <div style={{ height: 8, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: `${width}%`, height: '100%', background: color, borderRadius: 4 }} />
      </div>
    </div>
  )
}
