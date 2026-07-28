'use client'
import { useMemo } from 'react'
import {
  ResponsiveContainer, BarChart, ComposedChart, Bar, Line, XAxis, YAxis,
  Tooltip, Legend, Cell, CartesianGrid,
} from 'recharts'

const COL = {
  income: '#60a5fa', profit: 'var(--positive)', equity: 'var(--accent)',
  liab: 'var(--negative)', assets: 'var(--warning)', neg: '#ef4444',
}

// ── helpers de datos ────────────────────────────────────────────────────────

// Lee una fila de un estado {columns,data} → { año: valor }
function readRow(stmt, ...labels) {
  const d = stmt?.data, cols = stmt?.columns
  if (!d || !Array.isArray(cols)) return {}
  let arr = null
  for (const l of labels) { if (Array.isArray(d[l])) { arr = d[l]; break } }
  if (!arr) return {}
  const out = {}
  cols.forEach((c, i) => {
    const y = parseInt(String(c).slice(0, 4), 10)
    const v = arr[i]
    if (!isNaN(y) && v != null && !isNaN(v)) out[y] = Number(v)
  })
  return out
}

function sortedYears(...maps) {
  const s = new Set()
  maps.forEach(m => Object.keys(m).forEach(y => s.add(Number(y))))
  return [...s].filter(y => !isNaN(y)).sort((a, b) => a - b)
}

function pctChange(cur, prev) {
  if (cur == null || prev == null || prev === 0) return null
  return ((cur - prev) / Math.abs(prev)) * 100
}

// Unidad coherente por gráfico (no mezcla M y B)
function chartUnit(values) {
  const max = Math.max(0, ...values.filter(v => v != null).map(Math.abs))
  if (max >= 1e6) return { div: 1e6, suffix: ' M', dec: 0 }
  if (max >= 1e3) return { div: 1e3, suffix: ' K', dec: 0 }
  return { div: 1, suffix: '', dec: 0 }
}
function fmtUnit(v, u) {
  if (v == null || isNaN(v)) return '—'
  return (v / u.div).toLocaleString('es-ES', { maximumFractionDigits: u.dec }) + u.suffix
}
function fmtPct(v, d = 1) { return v == null ? '—' : (v > 0 ? '+' : '') + v.toFixed(d) + '%' }

// ── tooltips ────────────────────────────────────────────────────────────────

function box(children) {
  return (
    <div style={{ background: 'var(--bg-elev)', border: '1px solid var(--border-strong)', borderRadius: 8, padding: '8px 11px', fontSize: 11.5, lineHeight: 1.6, boxShadow: '0 4px 16px rgba(0,0,0,0.18)' }}>
      {children}
    </div>
  )
}
const Row = ({ label, value, color }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14 }}>
    <span style={{ color: color || 'var(--text-muted)' }}>{label}</span>
    <span style={{ color: 'var(--text-strong)', fontWeight: 600 }}>{value}</span>
  </div>
)

function ResultsTooltip({ active, payload, unit }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return box(<>
    <p style={{ color: 'var(--text)', fontWeight: 700, marginBottom: 4 }}>{d.year}</p>
    <Row label="Ingresos" value={fmtUnit(d.revenue, unit)} color={COL.income} />
    <Row label="Beneficio neto" value={fmtUnit(d.net_income, unit)} color={d.net_income < 0 ? COL.neg : COL.profit} />
    <Row label="Margen neto" value={d.netMargin != null ? d.netMargin.toFixed(1) + '%' : '—'} />
    <Row label="Var. ingresos" value={fmtPct(d.revChange)} />
  </>)
}

function FcfTooltip({ active, payload, unit }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return box(<>
    <p style={{ color: 'var(--text)', fontWeight: 700, marginBottom: 4 }}>{d.year}</p>
    <Row label="CFO" value={fmtUnit(d.cfo, unit)} color={COL.income} />
    <Row label="FCF" value={fmtUnit(d.fcf, unit)} color={d.fcf < 0 && !d.isUtility ? COL.neg : COL.profit} />
    <Row label="Conversión FCF" value={d.conv != null ? d.conv.toFixed(1) + '%' : '—'} />
    <Row label="Var. FCF" value={fmtPct(d.fcfChange)} />
  </>)
}

function BalanceTooltip({ active, payload, unit }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return box(<>
    <p style={{ color: 'var(--text)', fontWeight: 700, marginBottom: 4 }}>{d.year}</p>
    <Row label="Activo total" value={fmtUnit(d.assets, unit)} color={COL.assets} />
    <Row label="Pasivo total" value={fmtUnit(d.liabilities, unit)} color={COL.liab} />
    <Row label="Patrimonio neto" value={fmtUnit(d.equity, unit)} color={d.equity < 0 ? COL.neg : COL.equity} />
    <Row label="Deuda / activo" value={d.debtRatio != null ? d.debtRatio.toFixed(1) + '%' : '—'} />
    {d.equity < 0 && (
      <p style={{ color: 'var(--warning)', marginTop: 5, maxWidth: 200 }}>Patrimonio neto negativo — habitual en empresas con recompras masivas de acciones.</p>
    )}
  </>)
}

// ── chart shell ─────────────────────────────────────────────────────────────

const axisProps = { tick: { fontSize: 10, fill: 'var(--text-faint)' }, axisLine: { stroke: 'var(--surface-3)' }, tickLine: false }

function ChartCard({ title, data, children }) {
  if (!data || data.length === 0) return null   // gráfico vacío → no se muestra
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 12px 6px' }}>
      <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>{title}</p>
      <div className="stmt-chart"><ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer></div>
    </div>
  )
}

// ── componente principal ────────────────────────────────────────────────────

// Recorta a los últimos N ejercicios (los datos vienen ordenados ascendente por año).
function lastN(arr, n) { return (!n || n === 'max' || arr.length <= n) ? arr : arr.slice(-n) }

export default function StatementCharts({ income, cashflow, balance, type, bankNpl, maxYears = 'max' }) {
  const isBank = Array.isArray(bankNpl)
  const nplData = isBank ? bankNpl.map(h => ({ period: h.period, npl: h.value })) : []
  const isUtility = type === 'utilities'

  const { results, fcf, bal } = useMemo(() => {
    // RESULTADOS
    const rev = readRow(income, 'Ingresos Totales', 'Total Revenue', 'Total Revenues', 'Operating Revenue')
    const ni = readRow(income, 'Beneficio Neto', 'Net Income', 'Net Income Common Stockholders')
    let years = sortedYears(rev, ni)
    const results = years.map((y, idx) => {
      const r = rev[y] ?? null, n = ni[y] ?? null
      return {
        year: y, revenue: r, net_income: n,
        netMargin: r && n != null ? (n / r) * 100 : null,
        revChange: pctChange(r, rev[years[idx - 1]]),
      }
    })

    // FCF
    const cfo = readRow(cashflow, 'Cash Flow Operativo', 'Operating Cash Flow', 'Total Cash From Operating Activities', 'Cash Flow From Continuing Operating Activities')
    const fcfR = readRow(cashflow, 'Flujo de Caja Libre', 'Free Cash Flow')
    const fy = sortedYears(cfo, fcfR)
    const fcf = fy.map((y, idx) => {
      const o = cfo[y] ?? null, f = fcfR[y] ?? null
      return {
        year: y, cfo: o, fcf: f, isUtility,
        conv: o && f != null ? (f / o) * 100 : null,
        fcfChange: pctChange(f, fcfR[fy[idx - 1]]),
      }
    })

    // BALANCE
    const eq = readRow(balance, 'Patrimonio Neto', 'Total Stockholder Equity', 'Stockholders Equity', 'Common Stock Equity')
    const liab = readRow(balance, 'Total Pasivo', 'Total Liabilities Net Minority Interest', 'Total Liabilities')
    const at = readRow(balance, 'Activos Totales', 'Total Assets')
    const by = sortedYears(eq, liab, at)
    const bal = by.map(y => {
      const e = eq[y] ?? null, l = liab[y] ?? null, a = at[y] ?? null
      return { year: y, equity: e, liabilities: l, assets: a, debtRatio: a && l != null ? (l / a) * 100 : null }
    })

    return { results, fcf, bal }
  }, [income, cashflow, balance, isUtility])

  // Recorte según el selector de rango (4 / 8 / Máx) compartido de la pestaña Finanzas.
  const rData = lastN(results, maxYears), fData = lastN(fcf, maxYears), bData = lastN(bal, maxYears)

  const rUnit = chartUnit([...rData.map(d => d.revenue), ...rData.map(d => d.net_income)])
  const fUnit = chartUnit([...fData.map(d => d.cfo), ...fData.map(d => d.fcf)])
  const bUnit = chartUnit([...bData.map(d => d.assets), ...bData.map(d => d.liabilities), ...bData.map(d => d.equity)])

  // Si no hay ningún gráfico con datos, no mostramos el bloque.
  const middleEmpty = isBank ? nplData.length === 0 : fData.length === 0
  if (rData.length === 0 && bData.length === 0 && middleEmpty) return null

  return (
    <div>
      <style>{`
        .stmt-grid { display: grid; grid-template-columns: 1fr; gap: 12px; }
        @media (min-width: 860px) { .stmt-grid { grid-template-columns: 1fr 1fr 1fr; } }
        .stmt-chart { height: 200px; }
        @media (max-width: 768px) { .stmt-chart { height: 160px; } }
      `}</style>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Evolución financiera</p>
      </div>

      <div className="stmt-grid">
        {/* 1 — RESULTADOS */}
        <ChartCard title="Resultados" data={rData}>
          <BarChart data={rData} margin={{ top: 6, right: 4, left: 0, bottom: 0 }} barGap={2}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-2)" vertical={false} />
            <XAxis dataKey="year" {...axisProps} />
            <YAxis {...axisProps} width={42} tickFormatter={v => fmtUnit(v, rUnit)} />
            <Tooltip content={<ResultsTooltip unit={rUnit} />} cursor={{ fill: 'var(--surface-2)' }} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            <Bar dataKey="revenue" name="Ingresos" fill={COL.income} radius={[2, 2, 0, 0]} />
            <Bar dataKey="net_income" name="Beneficio neto" radius={[2, 2, 0, 0]}>
              {rData.map((d, i) => <Cell key={i} fill={d.net_income < 0 ? COL.neg : COL.profit} />)}
            </Bar>
          </BarChart>
        </ChartCard>

        {/* 2 — En banca: evolución del NPL (morosidad, solo si hay datos). Resto: FCF. */}
        {isBank ? (nplData.length > 0 && (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 12px 6px' }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>Morosidad (NPL)</p>
            <div className="stmt-chart"><ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={nplData} margin={{ top: 6, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-2)" vertical={false} />
                <XAxis dataKey="period" {...axisProps} />
                <YAxis {...axisProps} width={42} tickFormatter={v => v + '%'} />
                <Tooltip cursor={{ fill: 'var(--surface-2)' }} contentStyle={{ background: 'var(--bg-elev)', border: '1px solid var(--border-strong)', borderRadius: 8, fontSize: 11 }} formatter={v => [v.toFixed(2) + '%', 'NPL']} />
                <Line dataKey="npl" name="NPL %" stroke="var(--negative)" strokeWidth={2} dot={{ r: 3, fill: 'var(--negative)' }} />
              </ComposedChart>
            </ResponsiveContainer></div>
          </div>
        )) : (
          <ChartCard title="Flujo de caja libre" data={fData}>
            <BarChart data={fData} margin={{ top: 6, right: 4, left: 0, bottom: 0 }} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-2)" vertical={false} />
              <XAxis dataKey="year" {...axisProps} />
              <YAxis {...axisProps} width={42} tickFormatter={v => fmtUnit(v, fUnit)} />
              <Tooltip content={<FcfTooltip unit={fUnit} />} cursor={{ fill: 'var(--surface-2)' }} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="cfo" name="CFO" fill={COL.income} radius={[2, 2, 0, 0]} />
              <Bar dataKey="fcf" name="FCF" radius={[2, 2, 0, 0]}>
                {fData.map((d, i) => <Cell key={i} fill={d.fcf < 0 && !isUtility ? COL.neg : COL.profit} />)}
              </Bar>
            </BarChart>
          </ChartCard>
        )}

        {/* 3 — BALANCE */}
        <ChartCard title="Balance" data={bData}>
          <ComposedChart data={bData} margin={{ top: 6, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-2)" vertical={false} />
            <XAxis dataKey="year" {...axisProps} />
            <YAxis {...axisProps} width={42} tickFormatter={v => fmtUnit(v, bUnit)} />
            <Tooltip content={<BalanceTooltip unit={bUnit} />} cursor={{ fill: 'var(--surface-2)' }} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            <Bar dataKey="equity" name="Patrimonio neto" stackId="balance" radius={[0, 0, 0, 0]}>
              {bData.map((d, i) => <Cell key={i} fill={d.equity < 0 ? COL.neg : COL.equity} />)}
            </Bar>
            <Bar dataKey="liabilities" name="Pasivo total" stackId="balance" fill={COL.liab} radius={[2, 2, 0, 0]} />
            <Line dataKey="assets" name="Activo total" stroke={COL.assets} strokeWidth={2} dot={{ r: 2.5, fill: COL.assets }} />
          </ComposedChart>
        </ChartCard>
      </div>
    </div>
  )
}
