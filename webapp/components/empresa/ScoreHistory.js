// Sparkline de la evolución del Score DGI — detecta deterioro/mejora silenciosa.
// data: [{ date: 'YYYY-MM-DD', score: number }] ascendente. SVG puro (sin estado).
function color(s) {
  if (s == null) return 'var(--text-faintest)'
  if (s >= 8) return 'var(--positive)'; if (s >= 6.5) return 'var(--positive-soft)'
  if (s >= 5) return 'var(--warning)'; if (s >= 3) return '#f97316'; return 'var(--negative)'
}
function fmtDate(d) {
  try { return new Date(d).toLocaleDateString('es-ES', { month: 'short', year: '2-digit' }) } catch { return d }
}

export default function ScoreHistory({ data = [] }) {
  const pts = (data || []).filter(p => p && p.score != null).map(p => ({ date: p.date, score: Number(p.score) }))

  if (pts.length < 2) {
    return (
      <p style={{ fontSize: 10.5, color: 'var(--text-faint)', marginTop: 8, marginBottom: 2 }}>
        📈 Evolución del Score DGI: aún acumulando histórico — se registra una nota por semana.
      </p>
    )
  }

  const W = 240, H = 46, PAD = 4
  const scores = pts.map(p => p.score)
  let lo = Math.min(...scores), hi = Math.max(...scores)
  if (hi - lo < 1) { lo = Math.max(0, lo - 0.5); hi = Math.min(10, hi + 0.5) }
  const span = hi - lo || 1
  const x = i => PAD + (i / (pts.length - 1)) * (W - 2 * PAD)
  const y = s => PAD + (1 - (s - lo) / span) * (H - 2 * PAD)
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.score).toFixed(1)}`).join(' ')

  const first = pts[0].score, last = pts[pts.length - 1].score
  const delta = Math.round((last - first) * 10) / 10
  const dColor = delta > 0 ? 'var(--positive)' : delta < 0 ? 'var(--negative)' : 'var(--text-muted)'
  const lineColor = color(last)

  return (
    <div style={{ marginTop: 10, marginBottom: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Evolución del Score DGI</span>
        <span style={{ fontSize: 11, fontWeight: 800, color: dColor }}>
          {delta > 0 ? '+' : ''}{delta.toFixed(1)} <span style={{ color: 'var(--text-faintest)', fontWeight: 600 }}>({pts.length} sem.)</span>
        </span>
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: 'block' }}>
        <polyline points={pts.map((p, i) => `${x(i)},${y(p.score)}`).join(' ')} fill="none" stroke={lineColor} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(pts.length - 1)} cy={y(last)} r="2.4" fill={lineColor} />
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--text-faintest)', marginTop: 2 }}>
        <span>{fmtDate(pts[0].date)} · {first.toFixed(1)}</span>
        <span>{fmtDate(pts[pts.length - 1].date)} · {last.toFixed(1)}</span>
      </div>
    </div>
  )
}
