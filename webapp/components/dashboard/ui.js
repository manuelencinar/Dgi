// Presentational helpers (sin estado) — usables en server y client components

export function Card({ children, style }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 18, ...style }}>
      {children}
    </div>
  )
}

export function PageTitle({ children, sub }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <h1 style={{ fontSize: 22, fontWeight: 900, color: '#e0e8f0' }}>{children}</h1>
      {sub && <p style={{ fontSize: 13, color: '#4a5270', marginTop: 4 }}>{sub}</p>}
    </div>
  )
}

export function SectionTitle({ children }) {
  return (
    <p style={{ fontSize: 11, fontWeight: 700, color: '#4a5270', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14 }}>
      {children}
    </p>
  )
}

export function MetricCard({ label, value, sub, color = '#c8d0e0' }) {
  return (
    <Card style={{ padding: '16px 18px' }}>
      <p style={{ fontSize: 11, color: '#4a5270', marginBottom: 6 }}>{label}</p>
      <p style={{ fontSize: 26, fontWeight: 900, color, lineHeight: 1 }}>{value}</p>
      {sub && <p style={{ fontSize: 11, color: '#4a5270', marginTop: 6 }}>{sub}</p>}
    </Card>
  )
}

export function StatusDot({ status }) {
  const col = status === 'error' ? '#f87171' : status === 'warn' ? '#fbbf24' : '#34d399'
  return <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: col, marginRight: 6 }} />
}

export function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
}
export function fmtDateTime(d) {
  if (!d) return '—'
  return new Date(d).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}
