'use client'
import { useState, useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Card, PageTitle, SectionTitle, MetricCard, fmtDate, fmtDateTime } from '@/components/dashboard/ui'

const PAGE = 25

export default function UsuariosClient({ metrics, users }) {
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [detail, setDetail] = useState(null)

  const filtered = useMemo(() => {
    let rows = [...users].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    if (filter !== 'all') rows = rows.filter(u => u.plan === filter)
    const q = search.trim().toLowerCase()
    if (q) rows = rows.filter(u => u.email?.toLowerCase().includes(q))
    return rows
  }, [users, filter, search])

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
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setDetail(null)}>
          <Card style={{ width: '90%', maxWidth: 440 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
              <p style={{ fontSize: 15, fontWeight: 700, color: '#c8d0e0' }}>Detalle de usuario</p>
              <button onClick={() => setDetail(null)} style={{ background: 'none', border: 'none', color: '#4a5270', fontSize: 20, cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ display: 'grid', gap: 10, fontSize: 13 }}>
              {[
                ['Email', detail.email],
                ['Plan', detail.plan === 'premium' ? 'Premium' : 'Free'],
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
          </Card>
        </div>
      )}
    </div>
  )
}

const navBtn = disabled => ({ padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', background: 'transparent', color: disabled ? '#2a3045' : '#8090a8', cursor: disabled ? 'default' : 'pointer', fontSize: 12 })
