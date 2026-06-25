'use client'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'

// Diversificación en los 3 supersectores de Morningstar y, dentro de cada uno,
// el peso de cada sector. Anillo interior = supersectores; exterior = sectores
// (tono del mismo color de su supersector).

const TT = { background: 'var(--bg-elev)', border: '1px solid var(--border-strong)', borderRadius: 8, fontSize: 11 }
const PALETTE = ['var(--accent)', 'var(--positive)', 'var(--warning)', 'var(--negative)', '#60a5fa', '#a78bfa', '#fb923c', '#4ade80', '#f472b6', '#38bdf8', '#facc15', '#22d3ee']

// Diversificación de un nivel (zona, divisa…) con el MISMO estilo que el de
// sectores: donut a la izquierda + leyenda de barras a la derecha.
export function DonutBreakdown({ title, hint, data }) {
  if (!data?.length) return null
  const rows = data.map((d, i) => ({ ...d, color: PALETTE[i % PALETTE.length] }))
  const max = Math.max(...rows.map(r => r.value), 1)
  return (
    <div>
      <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{title}</p>
      {hint && <p style={{ fontSize: 11, color: 'var(--text-faintest)', marginBottom: 10 }}>{hint}</p>}
      <style>{`@media(min-width:680px){.sb-grid{grid-template-columns:220px 1fr!important}}`}</style>
      <div className="sb-grid" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16, alignItems: 'center' }}>
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie data={rows} dataKey="value" cx="50%" cy="50%" innerRadius={48} outerRadius={88} paddingAngle={1} startAngle={90} endAngle={-270}>
              {rows.map((d, i) => <Cell key={i} fill={d.color} fillOpacity={0.85} stroke="var(--bg-elev)" strokeWidth={1} />)}
            </Pie>
            <Tooltip contentStyle={TT} formatter={(v, n) => [`${v.toFixed(1)}%`, n]} />
          </PieChart>
        </ResponsiveContainer>
        <div style={{ display: 'grid', gap: 6 }}>
          {rows.map(r => (
            <div key={r.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 9, height: 9, borderRadius: 2, background: r.color, flexShrink: 0 }} />
              <span style={{ fontSize: 11.5, color: 'var(--text)', width: 140, flexShrink: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</span>
              <div style={{ flex: 1, height: 7, background: 'var(--surface-2)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ width: `${(r.value / max) * 100}%`, height: '100%', background: r.color, opacity: 0.85, borderRadius: 4 }} />
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#a8b3c8', width: 42, textAlign: 'right', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{r.value.toFixed(1)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function SectorBreakdown({ breakdown, title = 'Diversificación por sector', hint = '3 supersectores de Morningstar y el peso de cada sector dentro' }) {
  if (!breakdown?.length) return null

  // Anillo interior: supersectores.
  const inner = breakdown.map(s => ({ name: s.label, value: s.value, color: s.color }))
  // Anillo exterior: sectores, en el MISMO orden de supersectores (para que las
  // arcos alineen), con opacidad decreciente dentro de cada supersector.
  const outer = []
  breakdown.forEach(s => {
    s.sectors.forEach((sec, i) => {
      outer.push({ name: sec.name, value: sec.value, color: s.color, alpha: Math.max(0.4, 0.92 - i * 0.16) })
    })
  })

  return (
    <div>
      <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
        {title}
      </p>
      {hint && <p style={{ fontSize: 11, color: 'var(--text-faintest)', marginBottom: 10 }}>{hint}</p>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16 }}>
        <style>{`@media(min-width:680px){.sb-grid{grid-template-columns:220px 1fr!important}}`}</style>
        <div className="sb-grid" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16, alignItems: 'center' }}>
          {/* Donut de dos anillos */}
          <ResponsiveContainer width="100%" height={210}>
            <PieChart>
              <Pie data={inner} dataKey="value" cx="50%" cy="50%" innerRadius={30} outerRadius={58} startAngle={90} endAngle={-270} paddingAngle={1}>
                {inner.map((d, i) => <Cell key={i} fill={d.color} fillOpacity={0.45} stroke="var(--bg-elev)" strokeWidth={1} />)}
              </Pie>
              <Pie data={outer} dataKey="value" cx="50%" cy="50%" innerRadius={62} outerRadius={90} startAngle={90} endAngle={-270} paddingAngle={0.5}>
                {outer.map((d, i) => <Cell key={i} fill={d.color} fillOpacity={d.alpha} stroke="var(--bg-elev)" strokeWidth={1} />)}
              </Pie>
              <Tooltip contentStyle={TT} formatter={(v, n) => [`${v.toFixed(1)}%`, n]} />
            </PieChart>
          </ResponsiveContainer>

          {/* Leyenda: supersectores con sus sectores */}
          <div style={{ display: 'grid', gap: 14 }}>
            {breakdown.map(s => (
              <div key={s.key}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
                  <span style={{ width: 9, height: 9, borderRadius: 2, background: s.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--text)' }}>{s.label}</span>
                  <span style={{ fontSize: 12.5, fontWeight: 800, color: s.color, fontVariantNumeric: 'tabular-nums' }}>{s.value.toFixed(0)}%</span>
                </div>
                <div style={{ display: 'grid', gap: 5, paddingLeft: 16 }}>
                  {s.sectors.map((sec, i) => {
                    const rel = s.value > 0 ? (sec.value / s.value) * 100 : 0   // peso dentro del supersector
                    const alpha = Math.max(0.4, 0.92 - i * 0.16)
                    return (
                      <div key={sec.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 130, flexShrink: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sec.name}</span>
                        <div style={{ flex: 1, height: 7, background: 'var(--surface-2)', borderRadius: 4, overflow: 'hidden' }}>
                          <div style={{ width: `${rel}%`, height: '100%', background: s.color, opacity: alpha, borderRadius: 4 }} />
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#a8b3c8', width: 42, textAlign: 'right', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{sec.value.toFixed(1)}%</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
