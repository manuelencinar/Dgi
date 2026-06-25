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
        <MetricCard label="Nuevos (7 días)" value={metrics.new7d} color="#34d399" />
        <MetricCard label="Nuevos (30 días)" value={metrics.new30d} color="#34d399" />
        <MetricCard label="Premium activos" value={metrics.premiumTotal} color="#fbbf24" />
        <MetricCard label="Conversión" value={`${metrics.conversion.toFixed(1)}%`} color="#818cf8" />
        <MetricCard label="MRR" value={`${metrics.mrr.toFixed(0)} €`} color="#818cf8" />
      </div>

      {/* Gráfico */}
      <Card style={{ marginBottom: 16 }}>
        <SectionTitle>Nuevos registros por semana (3 meses)</SectionTitle>
        {metrics.weekly.length === 0 ? (
          <p style={{ fontSize: 13, color: '#4a5270' }}>Sin registros en los últimos 3 meses.</p>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={metrics.weekly}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="week" stroke="#4a5270" fontSize={10} />
              <YAxis stroke="#4a5270" fontSize={10} allowDecimals={false} />
              <Tooltip contentStyle={{ background: '#10172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11 }} formatter={v => [v, 'Registros']} />
              <Bar dataKey="count" fill="#818cf8" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>

      {/* Onboarding */}
      {onboarding && onboarding.total > 0 && (
        <Card style={{ marginBottom: 16 }}>
          <SectionTitle>Onboarding</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12 }}>
            <MetricCard label="Tasa de completado" value={onboarding.completionRate != null ? `${onboarding.completionRate.toFixed(0)}%` : '—'} sub={`${onboarding.completed} de ${onboarding.total}`} color="#34d399" />
            <MetricCard label="Completados" value={onboarding.completed} color="#34d399" />
            <MetricCard label="Saltados" value={onboarding.skipped} color="#fbbf24" />
            <MetricCard label="Más abandono" value={onboarding.topAbandonStep != null ? `Paso ${onboarding.topAbandonStep}` : '—'} sub={onboarding.topAbandonCount ? `${onboarding.topAbandonCount} usuarios` : ''} color="#f87171" />
          </div>
        </Card>
      )}

      {/* Retención y cancelaciones */}
      {retention && (
        <Card style={{ marginBottom: 16 }}>
          <SectionTitle>Retención y cancelaciones</SectionTitle>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, marginBottom: 18 }}>
            <MetricCard label="Cancelaciones (30 días)" value={retention.cancelsLastMonth} color="#f87171" />
            <MetricCard label="Usuarios en pausa" value={retention.pausedNow} color="#fbbf24" />
            <MetricCard label="Descuentos activos" value={retention.discountUsed} color="#818cf8" />
            <MetricCard label="MRR recuperado (est.)" value={`${retention.mrrRecovered.toFixed(0)} €`} color="#34d399" />
            <MetricCard
              label="Recuperación a 30 días"
              value={retention.recoveryRate != null ? `${retention.recoveryRate.toFixed(0)}%` : '—'}
              sub={retention.oldCancelsCount ? `${retention.recoveredCount}/${retention.oldCancelsCount} volvieron` : 'Sin datos aún'}
              color="#34d399"
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 16 }}>
            {/* Motivos de cancelación */}
            <div>
              <p style={{ fontSize: 12, color: '#8090a8', marginBottom: 10 }}>Motivos más frecuentes</p>
              {retention.reasons.length === 0 ? (
                <p style={{ fontSize: 13, color: '#4a5270' }}>Sin cancelaciones registradas.</p>
              ) : (
                <ResponsiveContainer width="100%" height={Math.max(140, retention.reasons.length * 34)}>
                  <BarChart data={retention.reasons} layout="vertical" margin={{ left: 10, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                    <XAxis type="number" stroke="#4a5270" fontSize={10} allowDecimals={false} />
                    <YAxis type="category" dataKey="reason" stroke="#4a5270" fontSize={10} width={110} />
                    <Tooltip contentStyle={{ background: '#10172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11 }} formatter={v => [v, 'Cancelaciones']} />
                    <Bar dataKey="count" fill="#f87171" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Tasa de éxito de ofertas */}
            <div>
              <p style={{ fontSize: 12, color: '#8090a8', marginBottom: 10 }}>Éxito de las ofertas de retención</p>
              <div style={{ display: 'grid', gap: 10 }}>
                <OfferBar label="Pausa" pct={retention.pauseSuccess} accepted={retention.pausedNow} color="#fbbf24" />
                <OfferBar label="Descuento 50%" pct={retention.discountSuccess} accepted={retention.discountUsed} color="#818cf8" />
              </div>
              <p style={{ fontSize: 10, color: '#2e3a55', marginTop: 12 }}>
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
                background: filter === v ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.04)', color: filter === v ? '#818cf8' : '#4a5270',
              }}>{l}</button>
            ))}
          </div>
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} placeholder="Buscar email…"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '7px 12px', color: '#c8d0e0', fontSize: 12, outline: 'none', minWidth: 200 }} />
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>{['Email', 'Registro', 'Último acceso', 'Plan', 'Estado', ''].map(h => (
                <th key={h} style={{ padding: '6px 8px', textAlign: 'left', color: '#4a5270', borderBottom: '1px solid rgba(255,255,255,0.06)', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {slice.map(u => (
                <tr key={u.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '7px 8px', color: '#c8d0e0', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</td>
                  <td style={{ padding: '7px 8px', color: '#8090a8' }}>{fmtDate(u.created_at)}</td>
                  <td style={{ padding: '7px 8px', color: '#4a5270' }}>{u.last_sign_in_at ? fmtDate(u.last_sign_in_at) : '—'}</td>
                  <td style={{ padding: '7px 8px' }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: u.plan === 'premium' ? '#fbbf24' : '#4a5270', background: u.plan === 'premium' ? 'rgba(251,191,36,0.12)' : 'rgba(255,255,255,0.04)', padding: '1px 7px', borderRadius: 4 }}>
                      {u.plan === 'premium' ? 'PREMIUM' : 'free'}
                    </span>
                  </td>
                  <td style={{ padding: '7px 8px' }}>
                    <span style={{ fontSize: 11, color: u.confirmed ? '#34d399' : '#fbbf24' }}>{u.confirmed ? 'Verificado' : 'Pendiente'}</span>
                  </td>
                  <td style={{ padding: '7px 8px' }}>
                    <button onClick={() => setDetail(u)} style={{ fontSize: 11, color: '#818cf8', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Ver detalle</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 14 }}>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={navBtn(page === 1)}>← Anterior</button>
            <span style={{ fontSize: 12, color: '#4a5270', alignSelf: 'center' }}>{page}/{totalPages}</span>
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
          <p style={{ fontSize: 15, fontWeight: 700, color: '#c8d0e0' }}>Detalle de usuario</p>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#4a5270', fontSize: 20, cursor: 'pointer' }}>×</button>
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
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, paddingBottom: 8, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <span style={{ color: '#4a5270' }}>{k}</span>
              <span style={{ color: '#c8d0e0', textAlign: 'right', wordBreak: 'break-all', fontSize: k === 'ID' ? 10 : 13 }}>{v}</span>
            </div>
          ))}
        </div>

        {/* Gestión de premium */}
        <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#fbbf24', marginBottom: 12 }}>Gestionar premium</p>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#8090a8', marginBottom: 10, cursor: 'pointer' }}>
            <input type="checkbox" checked={noExpiry} onChange={e => setNoExpiry(e.target.checked)} />
            Sin fecha de caducidad (premium permanente)
          </label>

          {!noExpiry && (
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 11, color: '#4a5270', marginBottom: 5 }}>Premium hasta (incluido)</label>
              <input type="date" value={until} min={new Date().toISOString().slice(0, 10)} onChange={e => setUntil(e.target.value)}
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '7px 12px', color: '#c8d0e0', fontSize: 13, outline: 'none', width: '100%', colorScheme: 'dark' }} />
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={grant} disabled={busy} style={{ flex: 1, minWidth: 140, padding: '9px 14px', borderRadius: 8, border: 'none', background: busy ? 'rgba(251,191,36,0.4)' : '#fbbf24', color: '#1a1205', fontSize: 13, fontWeight: 700, cursor: busy ? 'default' : 'pointer' }}>
              {isPremium ? 'Actualizar premium' : 'Conceder premium'}
            </button>
            {isPremium && (
              <button onClick={revoke} disabled={busy} style={{ padding: '9px 14px', borderRadius: 8, border: '1px solid rgba(248,113,113,0.4)', background: 'transparent', color: '#f87171', fontSize: 13, fontWeight: 600, cursor: busy ? 'default' : 'pointer' }}>
                Revocar
              </button>
            )}
          </div>

          {msg && (
            <p style={{ fontSize: 12, marginTop: 10, color: msg.ok ? '#34d399' : '#f87171' }}>{msg.ok ? '✓ ' : '⚠ '}{msg.text}</p>
          )}
        </div>
      </Card>
    </div>
  )
}

const navBtn = disabled => ({ padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', background: 'transparent', color: disabled ? '#2a3045' : '#8090a8', cursor: disabled ? 'default' : 'pointer', fontSize: 12 })

function OfferBar({ label, pct, accepted, color }) {
  const width = pct != null ? Math.max(2, Math.min(100, pct)) : 0
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
        <span style={{ color: '#8090a8' }}>{label}</span>
        <span style={{ color, fontWeight: 700 }}>{pct != null ? `${pct.toFixed(0)}%` : '—'} <span style={{ color: '#4a5270', fontWeight: 400 }}>({accepted} aceptadas)</span></span>
      </div>
      <div style={{ height: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: `${width}%`, height: '100%', background: color, borderRadius: 4 }} />
      </div>
    </div>
  )
}
