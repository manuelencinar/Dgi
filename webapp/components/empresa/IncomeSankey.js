'use client'
import { useState, useMemo } from 'react'

// Diagrama de Sankey del estado de resultados (SVG propio, layout determinista).
// Estructura fija: Ingresos → Coste de ventas + Beneficio bruto → Beneficio neto +
// Gastos → I+D / Ventas y marketing / G&A / Impuestos y otros. El orden es siempre
// "beneficio arriba, coste/gasto abajo" en todas las columnas → los flujos NO se
// cruzan. Selector de periodo arriba (años; trimestres si hay datos trimestrales).
// Solo para empresas con estructura clásica y beneficio positivo.

const COL = { revenue: '#3b82f6', gross: '#2dd4bf', net: '#34d399', cost: '#fb923c' }
const CHILD_COLORS = ['#f59e0b', '#fbbf24', '#fb923c', '#d97706', '#eab308']

function readAt(stmt, idx, ...labels) {
  const d = stmt?.data
  if (!d) return null
  for (const l of labels) {
    const arr = d[l]
    if (Array.isArray(arr) && arr[idx] != null && !isNaN(arr[idx])) return Number(arr[idx])
  }
  return null
}

function fmtVal(v, currency) {
  if (v == null || isNaN(v)) return '—'
  const cur = currency ? ` ${currency}` : ''
  if (Math.abs(v) >= 1e6) return (v / 1e6).toLocaleString('es-ES', { maximumFractionDigits: 0 }) + ' M' + cur
  if (Math.abs(v) >= 1e3) return (v / 1e3).toLocaleString('es-ES', { maximumFractionDigits: 0 }) + ' K' + cur
  return v.toLocaleString('es-ES', { maximumFractionDigits: 0 }) + cur
}

// Modelo del Sankey para una columna (idx) de un estado {columns,data}.
function buildModel(isa, idx) {
  const revenue = readAt(isa, idx, 'Ingresos Totales', 'Total Revenue', 'Operating Revenue')
  const gross   = readAt(isa, idx, 'Beneficio Bruto', 'Gross Profit')
  const net     = readAt(isa, idx, 'Beneficio Neto', 'Net Income', 'Net Income Common Stockholders')
  if (!(revenue > 0) || !(gross > 0) || gross >= revenue || !(net > 0) || net > gross) return null

  const cost = revenue - gross
  const expenses = gross - net
  if (!(expenses > 0)) return null

  const rnd = readAt(isa, idx, 'Research And Development', 'I+D', 'Investigación y Desarrollo')
  const sm  = readAt(isa, idx, 'Selling And Marketing Expense', 'Gastos de Venta y Marketing')
  const ga  = readAt(isa, idx, 'General And Administrative Expense', 'Gastos Generales y Admin.')
  const sga = readAt(isa, idx, 'Selling General And Administration', 'Gastos Generales y de Administración')

  let children = []
  const add = (name, value) => { if (value > 0 && value < expenses * 1.05) children.push({ name, value }) }
  if (rnd) add('I+D', rnd)
  if (sm && ga) { add('Ventas y marketing', sm); add('Generales y admin.', ga) }
  else if (sga) add('Gen. y comerciales', sga)
  const known = children.reduce((s, c) => s + c.value, 0)
  const residual = expenses - known
  if (residual > expenses * 0.02) children.push({ name: 'Impuestos y otros', value: residual })
  if (!children.length || known > expenses * 1.05) children = [{ name: 'Gastos', value: expenses }]

  return { revenue, gross, net, cost, expenses, children }
}

function periodLabel(col, type) {
  const s = String(col)
  if (type === 'annual') return s.slice(0, 4)
  const yy = s.slice(2, 4), mm = parseInt(s.slice(5, 7), 10)
  const q = mm ? Math.ceil(mm / 3) : '?'
  return `T${q} '${yy}`
}

// Lista de periodos con modelo válido a partir de un estado.
function validPeriods(isa, type) {
  const cols = isa?.columns
  if (!Array.isArray(cols)) return []
  const out = []
  cols.forEach((c, idx) => {
    const model = buildModel(isa, idx)
    if (model) out.push({ key: `${type}-${idx}`, label: periodLabel(c, type), type, model })
  })
  return out
}

function SankeyChart({ model, currency }) {
  const { revenue, gross, net, cost, expenses, children } = model
  const W = 820, TOP = 46, CH = 290, BW = 13, GAP = 12
  const X0 = 120, X1 = 330, X2 = 510, X3 = 690
  const scale = CH / revenue
  const h = v => Math.max(v * scale, 1.5)

  const nIng   = { x: X0, y: TOP, h: h(revenue), color: COL.revenue }
  const nGross = { x: X1, y: TOP, h: h(gross), color: COL.gross }
  const nCost  = { x: X1, y: TOP + h(gross) + GAP, h: h(cost), color: COL.cost }
  const nNet   = { x: X2, y: TOP, h: h(net), color: COL.net }
  const nExp   = { x: X2, y: TOP + h(net) + GAP, h: h(expenses), color: COL.cost }
  let cy = nExp.y
  const childNodes = children.map((c, i) => {
    const node = { x: X3, y: cy, h: h(c.value), color: CHILD_COLORS[i % CHILD_COLORS.length], name: c.name, value: c.value }
    cy += node.h + GAP
    return node
  })
  const H = Math.max(TOP + CH + 24, cy + 10)

  const ribbon = (xL, xR, ys0, ys1, yt0, yt1, color, key) => {
    const xm = (xL + xR) / 2
    const d = `M${xL},${ys0} C${xm},${ys0} ${xm},${yt0} ${xR},${yt0} L${xR},${yt1} C${xm},${yt1} ${xm},${ys1} ${xL},${ys1} Z`
    return <path key={key} d={d} fill={color} fillOpacity={0.32} />
  }

  const ribbons = []
  ribbons.push(ribbon(nIng.x + BW, nGross.x, nIng.y, nIng.y + h(gross), nGross.y, nGross.y + nGross.h, COL.gross, 'i-g'))
  ribbons.push(ribbon(nIng.x + BW, nCost.x, nIng.y + h(gross), nIng.y + nIng.h, nCost.y, nCost.y + nCost.h, COL.cost, 'i-c'))
  ribbons.push(ribbon(nGross.x + BW, nNet.x, nGross.y, nGross.y + h(net), nNet.y, nNet.y + nNet.h, COL.net, 'g-n'))
  ribbons.push(ribbon(nGross.x + BW, nExp.x, nGross.y + h(net), nGross.y + nGross.h, nExp.y, nExp.y + nExp.h, COL.cost, 'g-e'))
  let off = nExp.y
  childNodes.forEach((cn, i) => {
    ribbons.push(ribbon(nExp.x + BW, cn.x, off, off + cn.h, cn.y, cn.y + cn.h, cn.color, `e-${i}`))
    off += cn.h
  })

  const Rect = ({ n }) => <rect x={n.x} y={n.y} width={BW} height={n.h} fill={n.color} rx={2} />
  const Chip = ({ n, label, value }) => {
    const cx = n.x + BW / 2
    const w = Math.max(label.length * 6.2 + 12, 40)
    return (
      <g>
        <rect x={cx - w / 2} y={n.y - 30} width={w} height={17} rx={5} fill={n.color} fillOpacity={0.16} stroke={n.color} strokeOpacity={0.4} />
        <text x={cx} y={n.y - 18.5} textAnchor="middle" fontSize="10.5" fontWeight="700" fill={n.color} fontFamily="Figtree,sans-serif">{label}</text>
        <text x={cx} y={n.y - 1} textAnchor="middle" fontSize="10" fill="var(--text-muted)" fontFamily="Figtree,sans-serif">{fmtVal(value, currency)}</text>
      </g>
    )
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', minWidth: 560, height: 'auto', display: 'block' }}>
      {ribbons}
      <Rect n={nIng} /><Rect n={nGross} /><Rect n={nCost} /><Rect n={nNet} /><Rect n={nExp} />
      {childNodes.map((cn, i) => <Rect key={i} n={cn} />)}
      <text x={nIng.x - 9} y={nIng.y + nIng.h / 2 - 2} textAnchor="end" fontSize="11" fontWeight="700" fill="var(--text-strong)" fontFamily="Figtree,sans-serif">Ingresos</text>
      <text x={nIng.x - 9} y={nIng.y + nIng.h / 2 + 12} textAnchor="end" fontSize="10" fill="var(--text-muted)" fontFamily="Figtree,sans-serif">{fmtVal(revenue, currency)}</text>
      <Chip n={nGross} label="Beneficio bruto" value={gross} />
      <Chip n={nCost} label="Coste de ventas" value={cost} />
      <Chip n={nNet} label="Beneficio neto" value={net} />
      <Chip n={nExp} label="Gastos" value={expenses} />
      {childNodes.map((cn, i) => (
        <g key={i}>
          <text x={cn.x + BW + 8} y={cn.y + cn.h / 2 - 2} textAnchor="start" fontSize="10.5" fontWeight="700" fill="var(--text-strong)" fontFamily="Figtree,sans-serif">{cn.name}</text>
          <text x={cn.x + BW + 8} y={cn.y + cn.h / 2 + 11} textAnchor="start" fontSize="10" fill="var(--text-muted)" fontFamily="Figtree,sans-serif">{fmtVal(cn.value, currency)}</text>
        </g>
      ))}
    </svg>
  )
}

export default function IncomeSankey({ income, incomeQuarterly, currency }) {
  const annual = useMemo(() => validPeriods(income, 'annual'), [income])
  const quarterly = useMemo(() => validPeriods(incomeQuarterly, 'quarterly'), [incomeQuarterly])
  const all = useMemo(() => [...annual, ...quarterly], [annual, quarterly])

  // Por defecto, el año más reciente válido.
  const [sel, setSel] = useState(annual[0]?.key || quarterly[0]?.key || null)
  const current = all.find(p => p.key === sel) || annual[0] || quarterly[0] || null

  if (!annual.length && !quarterly.length) return null   // banca/seguros/REIT/pérdidas → no aplica

  const Chip = ({ p }) => (
    <button onClick={() => setSel(p.key)} style={{
      fontSize: 11.5, fontWeight: sel === p.key ? 700 : 600, padding: '4px 11px', borderRadius: 7,
      border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
      color: sel === p.key ? 'var(--accent)' : 'var(--text-faint)',
      background: sel === p.key ? 'var(--accent-bg)' : 'transparent',
    }}>{p.label}</button>
  )

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, minWidth: 0, maxWidth: '100%', overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          ¿A dónde va el dinero?
        </p>
      </div>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10, lineHeight: 1.5 }}>
        Flujo del periodo: de los ingresos al beneficio neto, pasando por el coste de ventas y los gastos.
      </p>

      {/* Selector de periodo: años y (si hay) trimestres */}
      <div style={{ display: 'flex', gap: 4, overflowX: 'auto', borderBottom: '1px solid var(--border)', paddingBottom: 8, marginBottom: 12, alignItems: 'center' }}>
        {annual.map(p => <Chip key={p.key} p={p} />)}
        {quarterly.length > 0 && <span style={{ width: 1, height: 16, background: 'var(--border-strong)', margin: '0 4px', flexShrink: 0 }} />}
        {quarterly.map(p => <Chip key={p.key} p={p} />)}
      </div>

      <div style={{ width: '100%', overflowX: 'auto' }}>
        {current ? <SankeyChart model={current.model} currency={currency} /> : (
          <p style={{ fontSize: 12, color: 'var(--text-faint)', padding: '20px 0' }}>Sin datos para este periodo.</p>
        )}
      </div>
    </div>
  )
}
