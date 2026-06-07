'use client'
import { useState, useMemo } from 'react'
import {
  ResponsiveContainer, BarChart, ComposedChart, Bar, Line, XAxis, YAxis,
  Tooltip, Legend, Cell, CartesianGrid,
} from 'recharts'

const COL = {
  income: '#60a5fa', profit: '#34d399', equity: '#818cf8',
  liab: '#f87171', assets: '#fbbf24', neg: '#ef4444',
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
  if (max >= 1e9) return { div: 1e9, suffix: 'B', dec: 1 }
  if (max >= 1e6) return { div: 1e6, suffix: 'M', dec: 0 }
  if (max >= 1e3) return { div: 1e3, suffix: 'K', dec: 0 }
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
    <div style={{ background: 'rgba(13,20,36,0.97)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '8px 11px', fontSize: 11.5, lineHeight: 1.6 }}>
      {children}
    </div>
  )
}
const Row = ({ label, value, color }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14 }}>
    <span style={{ color: color || '#8090a8' }}>{label}</span>
    <span style={{ color: '#e0e8f0', fontWeight: 600 }}>{value}</span>
  </div>
)

function ResultsTooltip({ active, payload, unit }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return box(<>
    <p style={{ color: '#c8d0e0', fontWeight: 700, marginBottom: 4 }}>{d.year}</p>
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
    <p style={{ color: '#c8d0e0', fontWeight: 700, marginBottom: 4 }}>{d.year}</p>
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
    <p style={{ color: '#c8d0e0', fontWeight: 700, marginBottom: 4 }}>{d.year}</p>
    <Row label="Activo total" value={fmtUnit(d.assets, unit)} color={COL.assets} />
    <Row label="Pasivo total" value={fmtUnit(d.liabilities, unit)} color={COL.liab} />
    <Row label="Patrimonio neto" value={fmtUnit(d.equity, unit)} color={d.equity < 0 ? COL.neg : COL.equity} />
    <Row label="Deuda / activo" value={d.debtRatio != null ? d.debtRatio.toFixed(1) + '%' : '—'} />
    {d.equity < 0 && (
      <p style={{ color: '#fbbf24', marginTop: 5, maxWidth: 200 }}>Patrimonio neto negativo — habitual en empresas con recompras masivas de acciones.</p>
    )}
  </>)
}

// ── chart shell ─────────────────────────────────────────────────────────────

const axisProps = { tick: { fontSize: 10, fill: '#4a5270' }, axisLine: { stroke: 'rgba(255,255,255,0.08)' }, tickLine: false }

function ChartCard({ title, data, children }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '12px 12px 6px' }}>
      <p style={{ fontSize: 12, fontWeight: 700, color: '#c8d0e0', marginBottom: 6 }}>{title}</p>
      {data.length === 0 ? (
        <div className="stmt-chart" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ fontSize: 11, color: '#4a5270', textAlign: 'center', padding: '0 12px' }}>Datos no disponibles — puedes añadirlos desde la plantilla Excel.</p>
        </div>
      ) : (
        <div className="stmt-chart"><ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer></div>
      )}
    </div>
  )
}

// ── componente principal ────────────────────────────────────────────────────

export default function StatementCharts({ income, cashflow, balance, type }) {
  const [period, setPeriod] = useState(8)
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

  const slice = arr => period === 'max' ? arr : arr.slice(-period)
  const rData = slice(results), fData = slice(fcf), bData = slice(bal)

  const rUnit = chartUnit([...rData.map(d => d.revenue), ...rData.map(d => d.net_income)])
  const fUnit = chartUnit([...fData.map(d => d.cfo), ...fData.map(d => d.fcf)])
  const bUnit = chartUnit([...bData.map(d => d.assets), ...bData.map(d => d.liabilities), ...bData.map(d => d.equity)])

  const PERIODS = [{ k: 4, l: '4A' }, { k: 8, l: '8A' }, { k: 'max', l: 'Máx' }]

  return (
    <div>
      <style>{`
        .stmt-grid { display: grid; grid-template-columns: 1fr; gap: 12px; }
        @media (min-width: 860px) { .stmt-grid { grid-template-columns: 1fr 1fr 1fr; } }
        .stmt-chart { height: 200px; }
        @media (max-width: 768px) { .stmt-chart { height: 160px; } }
      `}</style>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: '#4a5270', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Evolución financiera</p>
        <div style={{ display: 'flex', gap: 3, background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 3 }}>
          {PERIODS.map(p => (
            <button key={p.l} onClick={() => setPeriod(p.k)} style={{
              fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
              background: period === p.k ? 'rgba(99,102,241,0.2)' : 'transparent',
              color: period === p.k ? '#818cf8' : '#4a5270',
            }}>{p.l}</button>
          ))}
        </div>
      </div>

      <div className="stmt-grid">
        {/* 1 — RESULTADOS */}
        <ChartCard title="Resultados" data={rData}>
          <BarChart data={rData} margin={{ top: 6, right: 4, left: 0, bottom: 0 }} barGap={2}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
            <XAxis dataKey="year" {...axisProps} />
            <YAxis {...axisProps} width={42} tickFormatter={v => fmtUnit(v, rUnit)} />
            <Tooltip content={<ResultsTooltip unit={rUnit} />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            <Bar dataKey="revenue" name="Ingresos" fill={COL.income} radius={[2, 2, 0, 0]} />
            <Bar dataKey="net_income" name="Beneficio neto" radius={[2, 2, 0, 0]}>
              {rData.map((d, i) => <Cell key={i} fill={d.net_income < 0 ? COL.neg : COL.profit} />)}
            </Bar>
          </BarChart>
        </ChartCard>

        {/* 2 — FCF */}
        <ChartCard title="Flujo de caja libre" data={fData}>
          <BarChart data={fData} margin={{ top: 6, right: 4, left: 0, bottom: 0 }} barGap={2}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
            <XAxis dataKey="year" {...axisProps} />
            <YAxis {...axisProps} width={42} tickFormatter={v => fmtUnit(v, fUnit)} />
            <Tooltip content={<FcfTooltip unit={fUnit} />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            <Bar dataKey="cfo" name="CFO" fill={COL.income} radius={[2, 2, 0, 0]} />
            <Bar dataKey="fcf" name="FCF" radius={[2, 2, 0, 0]}>
              {fData.map((d, i) => <Cell key={i} fill={d.fcf < 0 && !isUtility ? COL.neg : COL.profit} />)}
            </Bar>
          </BarChart>
        </ChartCard>

        {/* 3 — BALANCE */}
        <ChartCard title="Balance" data={bData}>
          <ComposedChart data={bData} margin={{ top: 6, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
            <XAxis dataKey="year" {...axisProps} />
            <YAxis {...axisProps} width={42} tickFormatter={v => fmtUnit(v, bUnit)} />
            <Tooltip content={<BalanceTooltip unit={bUnit} />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
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
