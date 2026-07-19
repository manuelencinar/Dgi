// Presentational helpers (sin estado) — usables en server y client components

export function Card({ children, style }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, boxShadow: '0 1px 2px rgba(0,0,0,0.12)', ...style }}>
      {children}
    </div>
  )
}

export function PageTitle({ children, sub }) {
  return (
    <div style={{ marginBottom: 22, paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
      <h1 style={{ fontSize: 24, fontWeight: 900, color: 'var(--text-strong)', letterSpacing: '-0.01em' }}>{children}</h1>
      {sub && <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 5 }}>{sub}</p>}
    </div>
  )
}

export function SectionTitle({ children }) {
  return (
    <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14 }}>
      {children}
    </p>
  )
}

export function MetricCard({ label, value, sub, color = 'var(--accent)' }) {
  return (
    <Card style={{ padding: '16px 18px 16px 20px', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: color }} />
      <p style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 7 }}>{label}</p>
      <p style={{ fontSize: 27, fontWeight: 900, color: 'var(--text-strong)', lineHeight: 1 }}>{value}</p>
      {sub && <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 7 }}>{sub}</p>}
    </Card>
  )
}

export function StatusDot({ status }) {
  const col = status === 'error' ? 'var(--negative)' : status === 'warn' ? 'var(--warning)' : 'var(--positive)'
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
