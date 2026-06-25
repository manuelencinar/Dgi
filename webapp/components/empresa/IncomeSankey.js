'use client'
import { ResponsiveContainer, Sankey, Tooltip, Layer, Rectangle } from 'recharts'

// Diagrama de Sankey del estado de resultados: cómo fluye el dinero desde los
// Ingresos hasta el Beneficio neto, pasando por el coste de ventas y los gastos.
// Solo para empresas con estructura clásica (ingresos→coste→bruto→neto); banca,
// seguros y REITs no la tienen → no se muestra.

const COL = {
  revenue: '#3b82f6',   // azul
  gross: '#2dd4bf',     // turquesa
  net: '#34d399',       // verde
  cost: '#fb923c',      // naranja
  expense: '#f59e0b',   // ámbar
}

function readLatest(stmt, ...labels) {
  const d = stmt?.data
  if (!d) return null
  for (const l of labels) {
    const arr = d[l]
    if (Array.isArray(arr)) { for (const v of arr) { if (v != null && !isNaN(v)) return Number(v) } }
  }
  return null
}

// Importes en millones (M), como el resto de la app.
function fmtVal(v, currency) {
  if (v == null || isNaN(v)) return '—'
  const cur = currency ? ` ${currency}` : ''
  if (Math.abs(v) >= 1e6) return (v / 1e6).toLocaleString('es-ES', { maximumFractionDigits: 0 }) + ' M' + cur
  if (Math.abs(v) >= 1e3) return (v / 1e3).toLocaleString('es-ES', { maximumFractionDigits: 0 }) + ' K' + cur
  return v.toLocaleString('es-ES', { maximumFractionDigits: 0 }) + cur
}

function buildData(isa) {
  const revenue = readLatest(isa, 'Ingresos Totales', 'Total Revenue', 'Operating Revenue')
  const gross   = readLatest(isa, 'Beneficio Bruto', 'Gross Profit')
  const net     = readLatest(isa, 'Beneficio Neto', 'Net Income', 'Net Income Common Stockholders')
  // Solo tiene sentido con la estructura clásica y resultado positivo.
  if (!(revenue > 0) || !(gross > 0) || gross >= revenue || !(net > 0) || net > gross) return null

  const cost = revenue - gross            // coste de ventas (garantiza Ingresos = coste + bruto)
  const expenses = gross - net            // todo lo que hay entre bruto y neto
  if (!(expenses > 0)) return null

  const rnd = readLatest(isa, 'Research And Development', 'I+D', 'Investigación y Desarrollo')
  const sm  = readLatest(isa, 'Selling And Marketing Expense', 'Gastos de Venta y Marketing')
  const ga  = readLatest(isa, 'General And Administrative Expense', 'Gastos Generales y Admin.')
  const sga = readLatest(isa, 'Selling General And Administration', 'Gastos Generales y de Administración')

  // Hijos de "Gastos" (cada uno > 0 y que no se pase del total).
  const children = []
  const add = (name, value) => { if (value > 0 && value < expenses * 1.05) children.push({ name, value }) }
  if (rnd) add('I+D', rnd)
  if (sm && ga) { add('Ventas y marketing', sm); add('Generales y admin.', ga) }
  else if (sga) add('Generales y comerciales', sga)
  const known = children.reduce((s, c) => s + c.value, 0)
  const residual = expenses - known
  if (residual > expenses * 0.02) children.push({ name: 'Impuestos y otros', value: residual })
  // Si los conocidos se pasan del total (datos raros) → un único nodo de gastos.
  const expChildren = known <= expenses * 1.05 && children.length ? children : [{ name: 'Gastos operativos', value: expenses }]

  // Nodos: 0 Ingresos · 1 Coste · 2 Bruto · 3 Neto · 4 Gastos · 5+ hijos
  const nodes = [
    { name: 'Ingresos', color: COL.revenue },
    { name: 'Coste de ventas', color: COL.cost },
    { name: 'Beneficio bruto', color: COL.gross },
    { name: 'Beneficio neto', color: COL.net },
    { name: 'Gastos', color: COL.expense },
    ...expChildren.map(c => ({ name: c.name, color: COL.expense })),
  ]
  const links = [
    { source: 0, target: 1, value: cost },
    { source: 0, target: 2, value: gross },
    { source: 2, target: 3, value: net },
    { source: 2, target: 4, value: expenses },
    ...expChildren.map((c, i) => ({ source: 4, target: 5 + i, value: c.value })),
  ]
  return { nodes, links }
}

function makeNode(currency) {
  return function Node({ x, y, width, height, index, payload, containerWidth }) {
    const cw = containerWidth || 720
    const leftHalf = x < cw / 2
    const lx = leftHalf ? x + width + 8 : x - 8
    const anchor = leftHalf ? 'start' : 'end'
    const name = payload.name?.length > 20 ? payload.name.slice(0, 19) + '…' : payload.name
    return (
      <Layer key={`node-${index}`}>
        <Rectangle x={x} y={y} width={width} height={height} fill={payload.color || '#818cf8'} radius={2} />
        <text x={lx} y={y + height / 2 - 3} textAnchor={anchor} fontSize="11" fontWeight="700" fill="var(--text-strong)" fontFamily="Figtree,sans-serif">{name}</text>
        <text x={lx} y={y + height / 2 + 11} textAnchor={anchor} fontSize="10" fill="var(--text-muted)" fontFamily="Figtree,sans-serif">{fmtVal(payload.value, currency)}</text>
      </Layer>
    )
  }
}

function LinkShape({ sourceX, sourceY, sourceControlX, targetControlX, targetX, targetY, linkWidth, index, payload }) {
  const color = payload?.target?.color || '#8090a8'
  const d = `M${sourceX},${sourceY} C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`
  return <path d={d} fill="none" stroke={color} strokeWidth={Math.max(1, linkWidth)} strokeOpacity={0.3} key={`link-${index}`} />
}

export default function IncomeSankey({ income, currency }) {
  const data = buildData(income)
  if (!data) return null

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>
        ¿A dónde va el dinero?
      </p>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.5 }}>
        Flujo del último ejercicio: de los ingresos al beneficio neto, pasando por el coste de ventas y los gastos.
      </p>
      <div style={{ width: '100%', height: 340 }}>
        <ResponsiveContainer width="100%" height="100%">
          <Sankey
            data={data}
            node={makeNode(currency)}
            link={<LinkShape />}
            nodePadding={26}
            nodeWidth={12}
            margin={{ top: 10, right: 120, bottom: 10, left: 90 }}
          >
            <Tooltip
              formatter={(v) => fmtVal(v, currency)}
              contentStyle={{ background: 'var(--bg-elev)', border: '1px solid var(--border-strong)', borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: 'var(--text)' }}
            />
          </Sankey>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
