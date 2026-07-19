'use client'
import { useState, useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

const CARD = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 18, marginBottom: 18 }
const ACCENT = 'var(--accent)', GREEN = 'var(--positive)'
const TH = { padding: '8px 8px', textAlign: 'left', fontSize: 10.5, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }
const TD = { padding: '8px 8px', fontSize: 12.5, color: 'var(--text)', borderBottom: '1px solid var(--surface-2)' }

const SECTION_LABELS = {
  screener: 'Screener', cartera: 'Cartera', watchlist: 'Watchlist', comparador: 'Comparador',
  aristocratas: 'Rankings (Aristócratas)', etfs: 'ETFs y Fondos', ficha_empresa: 'Ficha de empresa',
  mercados: 'Mercados', novedades: 'Novedades', construir_cartera: 'Construir cartera', guias: 'Guías', otros: 'Otros',
}
const sectionLabel = s => SECTION_LABELS[s] || s
const fmtDateTime = v => { if (!v) return '—'; const d = new Date(v); return isNaN(d) ? '—' : d.toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) }
const fmtDay = v => { const d = new Date(v + 'T00:00:00'); return isNaN(d) ? v : `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}` }

export default function ActividadClient({ sectionUsage = [], dau = [], accounts = [], days = 30 }) {
  const [sort, setSort] = useState('recent')   // recent | events
  const maxUsers = Math.max(1, ...sectionUsage.map(s => s.usuarios_unicos))
  const chartData = useMemo(() => dau.map(d => ({ fecha: fmtDay(d.fecha), usuarios: d.usuarios_unicos })), [dau])
  const sortedAccounts = useMemo(() => {
    const a = [...accounts]
    if (sort === 'events') a.sort((x, y) => y.eventos - x.eventos)
    else a.sort((x, y) => String(y.ultima_actividad || '').localeCompare(String(x.ultima_actividad || '')))
    return a
  }, [accounts, sort])

  const empty = sectionUsage.length === 0 && accounts.length === 0

  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 20, fontWeight: 900, color: 'var(--text-strong)' }}>Actividad</h1>
        <p style={{ fontSize: 12.5, color: 'var(--text-faint)', marginTop: 2 }}>Uso de la app en los últimos {days} días.</p>
      </div>

      {empty && (
        <div style={{ ...CARD, textAlign: 'center', padding: 30 }}>
          <p style={{ fontSize: 13.5, color: 'var(--text-muted)' }}>Aún no hay eventos registrados. Empezarán a aparecer en cuanto los usuarios naveguen (o ejecuta <code>user_events.sql</code> si no lo has hecho).</p>
        </div>
      )}

      {/* Uso por sección */}
      <div style={CARD}>
        <p style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--text-strong)', marginBottom: 12 }}>Uso por sección</p>
        {sectionUsage.length === 0 ? <p style={{ fontSize: 12.5, color: 'var(--text-faint)' }}>—</p> : (
          <div style={{ display: 'grid', gap: 8 }}>
            {sectionUsage.map(s => (
              <div key={s.section} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ flex: '0 0 170px', fontSize: 12.5, color: 'var(--text)' }}>{sectionLabel(s.section)}</span>
                <div style={{ flex: 1, height: 9, background: 'var(--surface-3)', borderRadius: 5, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${s.usuarios_unicos / maxUsers * 100}%`, background: ACCENT, borderRadius: 5 }} />
                </div>
                <span style={{ flex: '0 0 120px', textAlign: 'right', fontSize: 12, color: 'var(--text-muted)' }}>
                  <strong style={{ color: 'var(--text)' }}>{s.pct.toFixed(0)}%</strong> · {s.usuarios_unicos} usu · {s.eventos} ev
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* DAU */}
      <div style={CARD}>
        <p style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--text-strong)', marginBottom: 12 }}>Usuarios activos por día (DAU)</p>
        <div style={{ height: 230 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 6, right: 10, bottom: 0, left: -18 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-3)" vertical={false} />
              <XAxis dataKey="fecha" tick={{ fontSize: 9, fill: 'var(--text-faint)' }} axisLine={false} tickLine={false} interval={Math.max(0, Math.floor(chartData.length / 10))} />
              <YAxis tick={{ fontSize: 9, fill: 'var(--text-faint)' }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip contentStyle={{ background: 'var(--bg-elev)', border: '1px solid var(--border-strong)', borderRadius: 8, fontSize: 11 }} labelStyle={{ color: 'var(--text-muted)' }} formatter={v => [v, 'Usuarios']} />
              <Line type="monotone" dataKey="usuarios" stroke={GREEN} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Cuentas activas */}
      <div style={CARD}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <p style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--text-strong)' }}>Cuentas activas ({sortedAccounts.length})</p>
          <div style={{ display: 'flex', gap: 4 }}>
            {[['recent', 'Última actividad'], ['events', 'Nº eventos']].map(([k, l]) => (
              <button key={k} onClick={() => setSort(k)} style={{ fontSize: 11, fontWeight: 700, padding: '5px 10px', borderRadius: 7, cursor: 'pointer', border: 'none', background: sort === k ? ACCENT : 'var(--surface-3)', color: sort === k ? '#fff' : 'var(--text-muted)' }}>{l}</button>
            ))}
          </div>
        </div>
        {sortedAccounts.length === 0 ? <p style={{ fontSize: 12.5, color: 'var(--text-faint)' }}>—</p> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620 }}>
              <thead><tr>{['Cuenta', 'Última actividad', 'Eventos', 'Secciones'].map((h, i) => <th key={h} style={{ ...TH, textAlign: i >= 2 ? 'right' : 'left' }}>{h}</th>)}</tr></thead>
              <tbody>
                {sortedAccounts.map(a => (
                  <tr key={a.user_id}>
                    <td style={{ ...TD, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.email || <span style={{ color: 'var(--text-faint)' }}>{a.user_id.slice(0, 8)}…</span>}</td>
                    <td style={{ ...TD, whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>{fmtDateTime(a.ultima_actividad)}</td>
                    <td style={{ ...TD, textAlign: 'right', fontWeight: 700 }}>{a.eventos}</td>
                    <td style={{ ...TD, textAlign: 'right' }}>
                      <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        {(a.secciones_usadas || []).slice(0, 6).map(s => (
                          <span key={s} style={{ fontSize: 9.5, color: 'var(--text-muted)', background: 'var(--surface-2)', padding: '1px 6px', borderRadius: 4 }}>{sectionLabel(s)}</span>
                        ))}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
