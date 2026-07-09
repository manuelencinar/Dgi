'use client'
import Link from 'next/link'
import { BarChart, Bar, Cell, XAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { getCountry } from '@/lib/helpers'

const CARD = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }
const GREEN = 'var(--positive)', RED = 'var(--negative)'
const EVENT_ICON = { watchlist_price: '🎯', watchlist_yield: '🎯', watchlist_buyzone: '🟢', dividend_cut: '⚠️', dividend_increase: '📈', recurring: '💰' }

function fmtBig(v) {
  if (v == null) return '—'
  const a = Math.abs(v)
  if (a >= 1e9) return (v / 1e9).toLocaleString('es-ES', { maximumFractionDigits: 1 }) + ' B'
  if (a >= 1e6) return (v / 1e6).toLocaleString('es-ES', { maximumFractionDigits: 0 }) + ' M'
  return v.toLocaleString('es-ES', { maximumFractionDigits: 0 })
}
const fmtPct = v => v == null ? '—' : (v >= 0 ? '+' : '') + v.toFixed(1) + '%'
// Etiqueta de trimestre a partir de la fecha de cierre (mes → T1..T4).
function qLabel(date) {
  const d = new Date(date); if (isNaN(d)) return ''
  const q = Math.floor(d.getMonth() / 3) + 1
  return `${q}T${String(d.getFullYear()).slice(2)}`
}
function timeAgo(date) {
  const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
  if (s < 3600) return `hace ${Math.max(1, Math.floor(s / 60))} min`
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`
  return `hace ${Math.floor(s / 86400)} d`
}
// 'YYYY-MM-DD' → 'mié 15/07' (día de la semana + día/mes)
function fmtDay(iso) {
  const d = new Date(iso + 'T00:00:00'); if (isNaN(d)) return iso
  const dow = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'][d.getDay()]
  return `${dow} ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}

function YoYBadge({ label, v }) {
  if (v == null) return null
  const col = v >= 0 ? GREEN : RED
  return (
    <span style={{ fontSize: 11, color: col, fontWeight: 700 }}>
      <span style={{ color: 'var(--text-faint)', fontWeight: 500 }}>{label} </span>{fmtPct(v)}
      <span style={{ color: 'var(--text-faintest)', fontWeight: 500, fontSize: 9 }}> YoY</span>
    </span>
  )
}

function FeaturedCard({ co }) {
  const c = getCountry(co.cc)
  const data = (co.revSeries || []).map(s => ({ q: qLabel(s.date), val: s.val }))
  const maxIdx = data.length - 1
  return (
    <Link href={`/empresa/${encodeURIComponent(co.t)}`} style={{ textDecoration: 'none' }}>
      <div style={{ ...CARD, height: '100%', transition: 'border-color .15s' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 2 }}>
          <span style={{ fontSize: 15 }}>{c.flag}</span>
          <span style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--text-strong)', lineHeight: 1.2 }}>{co.name}</span>
        </div>
        <p style={{ fontSize: 10.5, color: 'var(--text-faint)', marginBottom: 10 }}>{co.t} · {co.sector || '—'} · resultados {qLabel(co.latestDate)}</p>
        {data.length >= 2 && (
          <div style={{ height: 84, marginBottom: 8 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                <XAxis dataKey="q" tick={{ fontSize: 9, fill: 'var(--text-faint)' }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: 'var(--surface-2)' }}
                  contentStyle={{ background: 'var(--bg-elev)', border: '1px solid var(--border-strong)', borderRadius: 8, fontSize: 11 }}
                  formatter={v => [fmtBig(v), 'Ingresos']} labelStyle={{ color: 'var(--text-muted)' }} />
                <Bar dataKey="val" radius={[3, 3, 0, 0]}>
                  {data.map((_, i) => <Cell key={i} fill={i === maxIdx ? 'var(--accent)' : 'rgba(129,140,248,0.35)'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <YoYBadge label="Ingresos" v={co.revYoY} />
          <YoYBadge label="Beneficio" v={co.incYoY} />
        </div>
      </div>
    </Link>
  )
}

export default function NovedadesClient({ featured, rest, earningsWeek, events, userCC, hasUser }) {
  const c = getCountry(userCC)
  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 16px 64px' }}>
      <h1 style={{ fontSize: 22, fontWeight: 900, color: 'var(--text-strong)', marginBottom: 4 }}>Novedades</h1>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 22 }}>
        Resultados presentados recientemente y cambios destacados. Priorizamos por tamaño y tu mercado ({c.flag} {c.name}) junto a 🇺🇸 EE. UU.
      </p>

      {/* Eventos personales */}
      {hasUser && events?.length > 0 && (
        <div style={{ ...CARD, marginBottom: 22 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>En tu cartera y watchlist</p>
          <div style={{ display: 'grid', gap: 9 }}>
            {events.map((e, i) => (
              <Link key={i} href={e.ticker ? `/empresa/${encodeURIComponent(e.ticker)}` : '/notificaciones'} style={{ textDecoration: 'none' }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 15, flexShrink: 0 }}>{EVENT_ICON[e.type] || '•'}</span>
                  <span style={{ fontSize: 12.5, color: e.read ? 'var(--text-muted)' : 'var(--text)', lineHeight: 1.4, flex: 1 }}>{e.message}</span>
                  <span style={{ fontSize: 10.5, color: 'var(--text-faintest)', flexShrink: 0, whiteSpace: 'nowrap' }}>{timeAgo(e.created_at)}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Presentan resultados esta semana */}
      {earningsWeek?.length > 0 && (
        <div style={{ ...CARD, marginBottom: 22 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>📅 Presentan resultados esta semana</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 9 }}>
            {earningsWeek.map(co => {
              const cc = getCountry(co.cc)
              return (
                <Link key={co.t} href={`/empresa/${encodeURIComponent(co.t)}`} style={{ textDecoration: 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <span style={{ fontSize: 14, flexShrink: 0 }}>{cc.flag}</span>
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{co.name}</span>
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--accent)', flexShrink: 0, whiteSpace: 'nowrap' }}>{fmtDay(co.date)}</span>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {/* Destacados */}
      {featured?.length > 0 ? (
        <>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>Resultados destacados</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12, marginBottom: 24 }}>
            {featured.map(co => <FeaturedCard key={co.t} co={co} />)}
          </div>
        </>
      ) : (
        <div style={{ ...CARD, textAlign: 'center', padding: 32, marginBottom: 24 }}>
          <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>No hay resultados recientes ahora mismo. Vuelve durante la próxima temporada de resultados.</p>
        </div>
      )}

      {/* Resto de reporteros */}
      {rest?.length > 0 && (
        <div style={CARD}>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>Más empresas que han presentado resultados</p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 420 }}>
              <tbody>
                {rest.map(co => {
                  const cc = getCountry(co.cc)
                  return (
                    <tr key={co.t}>
                      <td style={{ padding: '8px 8px 8px 0', borderBottom: '1px solid var(--surface-2)' }}>
                        <Link href={`/empresa/${encodeURIComponent(co.t)}`} style={{ textDecoration: 'none', color: 'var(--text)', fontWeight: 600 }}>
                          {cc.flag} {co.name}
                        </Link>
                        <span style={{ color: 'var(--text-faintest)', fontSize: 10.5 }}> · {qLabel(co.latestDate)}</span>
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid var(--surface-2)', color: co.revYoY == null ? 'var(--text-faint)' : co.revYoY >= 0 ? GREEN : RED, fontWeight: 700, whiteSpace: 'nowrap' }}>
                        {co.revYoY != null ? `Ingresos ${fmtPct(co.revYoY)}` : '—'}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid var(--surface-2)', color: co.incYoY == null ? 'var(--text-faint)' : co.incYoY >= 0 ? GREEN : RED, fontWeight: 700, whiteSpace: 'nowrap' }}>
                        {co.incYoY != null ? `Bº ${fmtPct(co.incYoY)}` : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
