'use client'
import { useMemo } from 'react'
import Link from 'next/link'
import {
  ResponsiveContainer, BarChart, ComposedChart, AreaChart, Bar, Line, Area,
  XAxis, YAxis, Tooltip, Legend, Cell, CartesianGrid, ReferenceLine,
} from 'recharts'
import { computeCDR } from '@/lib/capital-discipline'

const C = {
  blue: '#60a5fa', green: '#34d399', indigo: '#818cf8', red: '#f87171',
  orange: '#fbbf24', neg: '#ef4444', gray: '#6b7280', yellow: '#facc15',
}

// ── helpers ─────────────────────────────────────────────────────────────────
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
function years(...maps) {
  const s = new Set()
  maps.forEach(m => Object.keys(m || {}).forEach(y => s.add(Number(y))))
  return [...s].filter(y => !isNaN(y)).sort((a, b) => a - b)
}
const num = v => (v != null && !isNaN(v)) ? Number(v) : null
function pctChange(cur, prev) { return (cur == null || prev == null || prev === 0) ? null : ((cur - prev) / Math.abs(prev)) * 100 }
function cagr(map) {
  const ys = Object.keys(map).map(Number).filter(y => map[y] > 0).sort((a, b) => a - b)
  if (ys.length < 2) return null
  const yE = ys[ys.length - 1], yS = ys[Math.max(0, ys.length - 6)], n = yE - yS
  return (n > 0 && map[yS] > 0) ? (Math.pow(map[yE] / map[yS], 1 / n) - 1) * 100 : null
}
function chartUnit(vals) {
  const max = Math.max(0, ...vals.filter(v => v != null).map(Math.abs))
  if (max >= 1e9) return { div: 1e9, suffix: 'B', dec: 1 }
  if (max >= 1e6) return { div: 1e6, suffix: 'M', dec: 0 }
  if (max >= 1e3) return { div: 1e3, suffix: 'K', dec: 0 }
  return { div: 1, suffix: '', dec: 0 }
}
const fmtU = (v, u) => (v == null || isNaN(v)) ? '—' : (v / u.div).toLocaleString('es-ES', { maximumFractionDigits: u.dec }) + u.suffix
const fmtMoney = v => { if (v == null || isNaN(v)) return '—'; const a = Math.abs(v); if (a >= 1e9) return (v / 1e9).toLocaleString('es-ES', { maximumFractionDigits: 1 }) + 'B'; if (a >= 1e6) return (v / 1e6).toLocaleString('es-ES', { maximumFractionDigits: 0 }) + 'M'; return v.toLocaleString('es-ES', { maximumFractionDigits: 0 }) }
const fmtPct = (v, d = 1) => v == null ? '—' : (v > 0 ? '+' : '') + v.toFixed(d) + '%'
const fmtNum = (v, d = 2) => v == null ? '—' : v.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d })

const axis = { tick: { fontSize: 10, fill: '#4a5270' }, axisLine: { stroke: 'rgba(255,255,255,0.08)' }, tickLine: false }
const grid = <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />

function tipBox(title, rows, note) {
  return (
    <div style={{ background: 'rgba(13,20,36,0.97)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '8px 11px', fontSize: 11.5, lineHeight: 1.6 }}>
      <p style={{ color: '#c8d0e0', fontWeight: 700, marginBottom: 4 }}>{title}</p>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 14 }}>
          <span style={{ color: r.c || '#8090a8' }}>{r.l}</span>
          <span style={{ color: '#e0e8f0', fontWeight: 600 }}>{r.v}</span>
        </div>
      ))}
      {note && <p style={{ color: '#fbbf24', marginTop: 5, maxWidth: 210 }}>{note}</p>}
    </div>
  )
}

function Section({ title, subtitle, children, height }) {
  return (
    <div>
      <p style={{ fontSize: 11, fontWeight: 700, color: '#4a5270', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: subtitle ? 2 : 10 }}>{title}</p>
      {subtitle && <p style={{ fontSize: 12, color: '#8090a8', marginBottom: 10 }}>{subtitle}</p>}
      {children}
    </div>
  )
}

function Placeholder() {
  return (
    <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 6 }}>
      <p style={{ fontSize: 12, color: '#4a5270', textAlign: 'center' }}>Datos no disponibles.</p>
      <Link href="/dashboard/datos" style={{ fontSize: 11, color: '#818cf8', textDecoration: 'none' }}>Añadir desde la plantilla Excel →</Link>
    </div>
  )
}

function Chart({ children, h = 200 }) {
  return <div className="fin-chart" style={{ ['--h']: `${h}px` }}><ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer></div>
}

// ── extracción base ─────────────────────────────────────────────────────────
function buildFin(income, cashflow, balance, divHistory) {
  const revenue = readRow(income, 'Ingresos Totales', 'Total Revenue', 'Total Revenues', 'Operating Revenue')
  const netIncome = readRow(income, 'Beneficio Neto', 'Net Income', 'Net Income Common Stockholders')
  const ebitda = readRow(income, 'EBITDA', 'Normalized EBITDA')
  const ebit = readRow(income, 'EBIT / Bº Operativo', 'Operating Income', 'Ebit')
  const grossProfit = readRow(income, 'Beneficio Bruto', 'Gross Profit')
  const epsDiluted = readRow(income, 'BPA Diluido', 'Diluted EPS')
  const shares = readRow(income, 'Acciones Medias Diluidas', 'Diluted Average Shares', 'Acciones Medias Básicas', 'Basic Average Shares')
  const interestExp = readRow(income, 'Gasto por Intereses', 'Interest Expense')

  const cfo = readRow(cashflow, 'Cash Flow Operativo', 'Operating Cash Flow', 'Total Cash From Operating Activities')
  const fcf = readRow(cashflow, 'Flujo de Caja Libre', 'Free Cash Flow')
  const dividends = readRow(cashflow, 'Dividendos Pagados', 'Dividends Paid', 'Cash Dividends Paid', 'Common Stock Dividend Paid')
  const buybacks = readRow(cashflow, 'Recompra de Acciones', 'Repurchase Of Capital Stock', 'Common Stock Repurchased')
  const capex = readRow(cashflow, 'Capex', 'Capital Expenditure', 'Capital Expenditures')
  const acquisitions = readRow(cashflow, 'Adquisición de Negocios', 'Purchase Of Business', 'Net Business Purchase And Sale')

  const equity = readRow(balance, 'Patrimonio Neto', 'Total Stockholder Equity', 'Stockholders Equity', 'Common Stock Equity')
  const liabilities = readRow(balance, 'Total Pasivo', 'Total Liabilities Net Minority Interest', 'Total Liabilities')
  const assets = readRow(balance, 'Activos Totales', 'Total Assets')
  const totalDebt = readRow(balance, 'Deuda Total', 'Total Debt')
  const cash = readRow(balance, 'Caja y Equivalentes', 'Cash And Cash Equivalents', 'Cash Cash Equivalents And Short Term Investments')

  const dps = {}
  if (Array.isArray(divHistory)) for (const h of divHistory) { if (!h.isPartial && h.dps != null) dps[h.year] = Number(h.dps) }

  return { revenue, netIncome, ebitda, ebit, grossProfit, epsDiluted, shares, interestExp,
    cfo, fcf, dividends, buybacks, capex, acquisitions, equity, liabilities, assets, totalDebt, cash, dps }
}

// ════════════════════════════════════════════════════════════════════════════
//  KPIs (8 tarjetas) — gratuito
// ════════════════════════════════════════════════════════════════════════════
function KpiCard({ label, value, change, good, secondary }) {
  const col = change == null ? '#4a5270' : good ? '#34d399' : '#f87171'
  const arrow = change == null ? '' : change > 0 ? '▲' : change < 0 ? '▼' : '■'
  return (
    <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '12px 14px' }}>
      <p style={{ fontSize: 10, color: '#4a5270', marginBottom: 6 }}>{label}</p>
      <p style={{ fontSize: 19, fontWeight: 800, color: '#e0e8f0', lineHeight: 1.1, overflowWrap: 'anywhere' }}>{value}</p>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 5, gap: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: col }}>{change == null ? '—' : `${arrow} ${changeStr(change)}`}</span>
        {secondary && <span style={{ fontSize: 10, color: '#4a5270', textAlign: 'right' }}>{secondary}</span>}
      </div>
    </div>
  )
}
function changeStr(c) { return (c.pp ? (c.v > 0 ? '+' : '') + c.v.toFixed(1) + 'pp' : fmtPct(c.v)) }

export function FinanzasKpis({ income, cashflow, balance, divHistory, scalars = {} }) {
  const k = useMemo(() => {
    const f = buildFin(income, cashflow, balance, divHistory)
    const yI = years(f.revenue, f.netIncome)
    const last = yI[yI.length - 1], prev = yI[yI.length - 2]
    const at = (m, y) => y != null ? (m[y] ?? null) : null
    const lastN = (m, n) => { const ys = Object.keys(m).map(Number).sort((a, b) => b - a).slice(0, n); return ys.length ? ys.reduce((s, y) => s + m[y], 0) / ys.length : null }

    const rev = at(f.revenue, last), revP = at(f.revenue, prev)
    const ni = at(f.netIncome, last), niP = at(f.netIncome, prev)
    const eb = at(f.ebitda, last), ebP = at(f.ebitda, prev)
    const fcf = at(f.fcf, last), fcfP = at(f.fcf, prev)
    const nd = (at(f.totalDebt, last) != null && at(f.cash, last) != null) ? at(f.totalDebt, last) - at(f.cash, last) : null
    const ndP = (at(f.totalDebt, prev) != null && at(f.cash, prev) != null) ? at(f.totalDebt, prev) - at(f.cash, prev) : null
    const eps = at(f.epsDiluted, last), epsP = at(f.epsDiluted, prev)

    // ROE/ROA históricos
    const roeMap = {}; const roaMap = {}
    for (const y of years(f.netIncome, f.equity, f.assets)) {
      if (f.netIncome[y] != null && f.equity[y] > 0) roeMap[y] = f.netIncome[y] / f.equity[y] * 100
      if (f.netIncome[y] != null && f.assets[y] > 0) roaMap[y] = f.netIncome[y] / f.assets[y] * 100
    }
    const roe = at(roeMap, last) ?? num(scalars.roe), roeP = at(roeMap, prev)
    const roic = num(scalars.roic_display)

    return [
      { label: 'Ingresos', value: fmtMoney(rev), change: rev != null && revP != null ? { v: pctChange(rev, revP) } : null, good: rev >= revP, secondary: `CAGR 5a ${fmtPct(cagr(f.revenue))}` },
      { label: 'Beneficio neto', value: fmtMoney(ni), change: ni != null && niP != null ? { v: pctChange(ni, niP) } : null, good: ni >= niP, secondary: rev && ni != null ? `Margen ${(ni / rev * 100).toFixed(1)}%` : '—' },
      { label: 'EBITDA', value: fmtMoney(eb), change: eb != null && ebP != null ? { v: pctChange(eb, ebP) } : null, good: eb >= ebP, secondary: rev && eb != null ? `Margen ${(eb / rev * 100).toFixed(1)}%` : '—' },
      { label: 'FCF', value: fmtMoney(fcf), change: fcf != null && fcfP != null ? { v: pctChange(fcf, fcfP) } : null, good: fcf >= fcfP, secondary: fcf != null && ni ? `Conv. ${(fcf / ni * 100).toFixed(0)}%` : '—' },
      { label: 'Deuda neta', value: fmtMoney(nd), change: nd != null && ndP != null ? { v: pctChange(nd, ndP) } : null, good: nd <= ndP, secondary: scalars.net_debt_ebitda != null ? `${Number(scalars.net_debt_ebitda).toFixed(1)}× EBITDA` : (nd != null && eb ? `${(nd / eb).toFixed(1)}× EBITDA` : '—') },
      { label: 'ROE', value: roe != null ? roe.toFixed(1) + '%' : '—', change: roe != null && roeP != null ? { v: roe - roeP, pp: true } : null, good: roe >= roeP, secondary: lastN(roeMap, 3) != null ? `Media 3a ${lastN(roeMap, 3).toFixed(1)}%` : '—' },
      { label: 'ROIC', value: roic != null ? roic.toFixed(1) + '%' : '—', change: null, good: true, secondary: 'roic_display' },
      { label: 'EPS diluido', value: eps != null ? fmtNum(eps) : '—', change: eps != null && epsP != null ? { v: pctChange(eps, epsP) } : null, good: eps >= epsP, secondary: `CAGR 5a ${fmtPct(cagr(f.epsDiluted))}` },
    ]
  }, [income, cashflow, balance, divHistory, scalars])

  return (
    <div>
      <style>{`
        .fin-kpis { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        @media (min-width: 760px) { .fin-kpis { grid-template-columns: repeat(4, 1fr); } }
      `}</style>
      <div className="fin-kpis">
        {k.map((c, i) => <KpiCard key={i} {...c} />)}
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
//  Bloque profundo (premium): márgenes, deuda, rentabilidad, capital, por acción
// ════════════════════════════════════════════════════════════════════════════
function PremiumGate({ children }) {
  return (
    <div style={{ position: 'relative' }}>
      <div style={{ filter: 'blur(5px)', pointerEvents: 'none', userSelect: 'none' }}>{children}</div>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'rgba(8,11,20,0.55)' }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: '#818cf8' }}>Análisis financiero avanzado (Premium)</p>
        <p style={{ fontSize: 12, color: '#4a5270', textAlign: 'center', maxWidth: 280 }}>Márgenes, deuda, rentabilidad histórica, capital allocation y por acción.</p>
        <Link href="/pricing" style={{ fontSize: 12, fontWeight: 700, color: '#fff', textDecoration: 'none', padding: '7px 18px', background: 'rgba(99,102,241,0.85)', borderRadius: 8 }}>Activar Premium →</Link>
      </div>
    </div>
  )
}

export default function FinanzasDeepDive({ income, cashflow, balance, divHistory, currency, scalars = {}, isPremium }) {
  const d = useMemo(() => {
    const f = buildFin(income, cashflow, balance, divHistory)

    // Márgenes
    const margins = years(f.revenue).map(y => ({
      year: y,
      bruto: f.grossProfit[y] != null && f.revenue[y] > 0 ? f.grossProfit[y] / f.revenue[y] * 100 : null,
      operativo: f.ebit[y] != null && f.revenue[y] > 0 ? f.ebit[y] / f.revenue[y] * 100 : null,
      neto: f.netIncome[y] != null && f.revenue[y] > 0 ? f.netIncome[y] / f.revenue[y] * 100 : null,
    }))

    // Deuda
    const debt = years(f.totalDebt, f.cash).map(y => ({
      year: y, deuda: f.totalDebt[y] ?? null, caja: f.cash[y] ?? null,
      neta: (f.totalDebt[y] != null && f.cash[y] != null) ? f.totalDebt[y] - f.cash[y] : null,
    }))
    const intcov = years(f.ebit, f.interestExp).map(y => ({
      year: y, cov: (f.ebit[y] != null && f.interestExp[y] && Math.abs(f.interestExp[y]) > 0) ? f.ebit[y] / Math.abs(f.interestExp[y]) : null,
    })).filter(r => r.cov != null)

    // Rentabilidad
    const profit = years(f.netIncome, f.equity, f.assets).map(y => ({
      year: y,
      roe: f.netIncome[y] != null && f.equity[y] > 0 ? f.netIncome[y] / f.equity[y] * 100 : null,
      roa: f.netIncome[y] != null && f.assets[y] > 0 ? f.netIncome[y] / f.assets[y] * 100 : null,
      roic: null,
    }))
    const roicScalar = num(scalars.roic_display)
    if (roicScalar != null && profit.length) profit[profit.length - 1].roic = roicScalar

    // Capital allocation (CDR compartido — el capex NO entra, ya está en el FCF)
    const cdr = computeCDR(cashflow, balance)
    const capital = (cdr?.byYear || []).map(r => ({
      year: r.year, fcf: r.fcf, dividends: r.div, buybacks: r.buy, acquisitions: r.acq,
      restoPos: r.resto != null && r.resto >= 0 ? r.resto : 0,
      restoNeg: r.resto != null && r.resto < 0 ? r.resto : 0,
      resto: r.resto,
    }))

    // Por acción
    const share = years(f.epsDiluted, f.shares, f.dps).map(y => {
      const sh = f.shares[y] ?? null
      return {
        year: y,
        eps: f.epsDiluted[y] ?? (sh && f.netIncome[y] != null ? f.netIncome[y] / sh : null),
        fcfps: sh && f.fcf[y] != null ? f.fcf[y] / sh : null,
        dps: f.dps[y] ?? null,
        bvps: sh && f.equity[y] != null ? f.equity[y] / sh : null,
      }
    })

    return { margins, debt, intcov, profit, capital, share, f, cdr }
  }, [income, cashflow, balance, divHistory, scalars])

  // tendencias texto
  const marginTrend = trendText(d.margins, 'operativo', 'márgenes')
  const roicNote = (() => {
    const r = d.profit.filter(p => p.roic != null)
    return r.length && r[r.length - 1].roic > 12
      ? 'ROIC sostenidamente superior al coste de capital — señal de ventaja competitiva duradera.' : null
  })()

  const mUnit = chartUnit(d.debt.flatMap(r => [r.deuda, r.caja]))
  const capUnit = chartUnit(d.capital.flatMap(r => [r.dividends, r.buybacks, r.acquisitions, r.fcf]))

  // resúmenes
  const lastDebt = d.debt[d.debt.length - 1]
  const ndNow = lastDebt?.neta
  const fcfNow = d.f.fcf[Object.keys(d.f.fcf).map(Number).sort((a, b) => b - a)[0]]
  const yearsToPay = (ndNow != null && ndNow > 0 && fcfNow > 0) ? (ndNow / fcfNow) : null

  // Capital allocation — métricas del último año + texto de deuda neta
  const ly = d.cdr?.lastYear
  const capMetrics = ly && ly.fcf > 0 ? {
    div: ly.div / ly.fcf * 100,
    shr: (ly.div + ly.buy) / ly.fcf * 100,
    dist: (ly.div + ly.buy + ly.acq) / ly.fcf * 100,
  } : null
  const capOver = capMetrics && (capMetrics.div > 100 || capMetrics.shr > 100 || capMetrics.dist > 100)
  const ndText = netDebtText(d.cdr)

  const shareNote = shareText(d.share)

  const inner = (
    <div style={{ display: 'grid', gap: 22 }}>
      <style>{`
        .fin-chart { height: var(--h, 200px); }
        @media (max-width: 768px) { .fin-chart { height: 160px !important; } }
        .fin-2col { display: grid; grid-template-columns: 1fr; gap: 16px; }
        @media (min-width: 820px) { .fin-2col { grid-template-columns: 1fr 1fr; } }
        .fin-3m { display: grid; grid-template-columns: repeat(3,1fr); gap: 10px; }
      `}</style>

      {/* MÁRGENES */}
      <Section title="Evolución de márgenes">
        {d.margins.length < 1 ? <Placeholder /> : <>
          <Chart h={200}>
            <AreaChart data={d.margins} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
              {grid}
              <XAxis dataKey="year" {...axis} />
              <YAxis {...axis} width={38} domain={[0, 100]} tickFormatter={v => v + '%'} />
              <Tooltip content={({ active, payload }) => active && payload?.length ? tipBox(payload[0].payload.year, [
                { l: 'Margen bruto', v: pctN(payload[0].payload.bruto), c: C.blue },
                { l: 'Margen operativo', v: pctN(payload[0].payload.operativo), c: C.green },
                { l: 'Margen neto', v: pctN(payload[0].payload.neto), c: C.indigo },
              ]) : null} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Area dataKey="bruto" name="Bruto" stroke={C.blue} fill={C.blue} fillOpacity={0.1} strokeWidth={2} dot={{ r: 2 }} connectNulls />
              <Area dataKey="operativo" name="Operativo" stroke={C.green} fill={C.green} fillOpacity={0.1} strokeWidth={2} dot={{ r: 2 }} connectNulls />
              <Area dataKey="neto" name="Neto" stroke={C.indigo} fill={C.indigo} fillOpacity={0.1} strokeWidth={2} dot={{ r: 2 }} connectNulls />
            </AreaChart>
          </Chart>
          {marginTrend && <p style={{ fontSize: 12, color: marginTrend.color, marginTop: 8 }}>{marginTrend.text}</p>}
        </>}
      </Section>

      {/* DEUDA */}
      <Section title="Análisis de la deuda">
        <div className="fin-2col">
          <div>
            <p style={{ fontSize: 11, color: '#8090a8', marginBottom: 6 }}>Deuda vs caja</p>
            {d.debt.length < 1 ? <Placeholder /> : (
              <Chart h={180}>
                <ComposedChart data={d.debt} margin={{ top: 6, right: 6, left: 0, bottom: 0 }} barGap={2}>
                  {grid}
                  <XAxis dataKey="year" {...axis} />
                  <YAxis {...axis} width={42} tickFormatter={v => fmtU(v, mUnit)} />
                  <Tooltip content={({ active, payload }) => active && payload?.length ? tipBox(payload[0].payload.year, [
                    { l: 'Deuda total', v: fmtU(payload[0].payload.deuda, mUnit), c: C.red },
                    { l: 'Caja', v: fmtU(payload[0].payload.caja, mUnit), c: C.green },
                    { l: 'Deuda neta', v: fmtU(payload[0].payload.neta, mUnit), c: payload[0].payload.neta < 0 ? C.green : C.orange },
                  ]) : null} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                  <Bar dataKey="deuda" name="Deuda" fill={C.red} radius={[2, 2, 0, 0]} />
                  <Bar dataKey="caja" name="Caja" fill={C.green} radius={[2, 2, 0, 0]} />
                  <Line dataKey="neta" name="Deuda neta" stroke={C.orange} strokeWidth={2} dot={{ r: 2.5 }} />
                </ComposedChart>
              </Chart>
            )}
          </div>
          <div>
            <p style={{ fontSize: 11, color: '#8090a8', marginBottom: 6 }}>Cobertura de intereses</p>
            {d.intcov.length < 1 ? <Placeholder /> : (
              <Chart h={180}>
                <BarChart data={d.intcov} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
                  {grid}
                  <XAxis dataKey="year" {...axis} />
                  <YAxis {...axis} width={34} tickFormatter={v => v + '×'} />
                  <Tooltip content={({ active, payload }) => active && payload?.length ? tipBox(payload[0].payload.year, [
                    { l: 'Cobertura', v: payload[0].payload.cov.toFixed(1) + '×', c: covColor(payload[0].payload.cov) },
                  ]) : null} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                  <ReferenceLine y={3} stroke="#f87171" strokeDasharray="4 4" strokeOpacity={0.6} />
                  <Bar dataKey="cov" name="Cobertura" radius={[2, 2, 0, 0]}>
                    {d.intcov.map((r, i) => <Cell key={i} fill={covColor(r.cov)} />)}
                  </Bar>
                </BarChart>
              </Chart>
            )}
          </div>
        </div>
        <div className="fin-3m" style={{ marginTop: 14 }}>
          <Mini label="Deuda neta" value={fmtMoney(ndNow)} />
          <Mini label="Deuda neta / EBITDA" value={scalars.net_debt_ebitda != null ? Number(scalars.net_debt_ebitda).toFixed(1) + '×' : '—'} />
          <Mini label="Años para pagarla (FCF)" value={yearsToPay != null ? yearsToPay.toFixed(1) : (ndNow != null && ndNow <= 0 ? 'Caja neta' : '—')} />
        </div>
      </Section>

      {/* RENTABILIDAD */}
      <Section title="Rentabilidad histórica">
        {d.profit.length < 1 ? <Placeholder /> : <>
          <Chart h={200}>
            <AreaChart data={d.profit} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
              {grid}
              <XAxis dataKey="year" {...axis} />
              <YAxis {...axis} width={38} tickFormatter={v => v + '%'} />
              <Tooltip content={({ active, payload }) => active && payload?.length ? tipBox(payload[0].payload.year, [
                { l: 'ROIC', v: pctN(payload[0].payload.roic), c: C.green },
                { l: 'ROE', v: pctN(payload[0].payload.roe), c: C.blue },
                { l: 'ROA', v: pctN(payload[0].payload.roa), c: C.indigo },
              ]) : null} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Area dataKey="roic" name="ROIC" stroke={C.green} fill={C.green} fillOpacity={0.08} strokeWidth={2} dot={{ r: 2.5 }} connectNulls />
              <Area dataKey="roe" name="ROE" stroke={C.blue} fill={C.blue} fillOpacity={0.08} strokeWidth={2} dot={{ r: 2 }} connectNulls />
              <Area dataKey="roa" name="ROA" stroke={C.indigo} fill={C.indigo} fillOpacity={0.08} strokeWidth={2} dot={{ r: 2 }} connectNulls />
            </AreaChart>
          </Chart>
          {roicNote && <p style={{ fontSize: 12, color: '#34d399', marginTop: 8 }}>{roicNote}</p>}
        </>}
      </Section>

      {/* CAPITAL ALLOCATION */}
      <Section title="¿Cómo usa la empresa su dinero?" subtitle="Distribución del flujo de caja libre por año">
        {d.capital.length < 1 ? <Placeholder /> : <>
          <Chart h={220}>
            <ComposedChart data={d.capital} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
              {grid}
              <XAxis dataKey="year" {...axis} />
              <YAxis {...axis} width={42} tickFormatter={v => fmtU(v, capUnit)} />
              <Tooltip content={({ active, payload }) => { if (!active || !payload?.length) return null; const p = payload[0].payload; const pc = x => p.fcf > 0 ? ` (${(x / p.fcf * 100).toFixed(0)}%)` : ''; return tipBox(p.year, [
                { l: 'FCF total', v: fmtU(p.fcf, capUnit), c: C.yellow },
                { l: 'Dividendos', v: fmtU(p.dividends, capUnit) + pc(p.dividends), c: C.green },
                { l: 'Recompras netas', v: fmtU(p.buybacks, capUnit) + pc(p.buybacks), c: C.blue },
                ...(p.acquisitions > 0 ? [{ l: 'Adquisiciones', v: fmtU(p.acquisitions, capUnit) + pc(p.acquisitions), c: C.orange }] : []),
                { l: 'Resto (caja/deuda)', v: fmtU(p.resto, capUnit), c: p.resto < 0 ? C.neg : '#94a3b8' },
              ], p.resto < 0 ? 'Distribución superior al FCF — la diferencia se financió con deuda o caja acumulada.' : null) }} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="dividends" name="Dividendos" stackId="c" fill={C.green} />
              <Bar dataKey="buybacks" name="Recompras" stackId="c" fill={C.blue} />
              <Bar dataKey="acquisitions" name="Adquisiciones" stackId="c" fill={C.orange} />
              <Bar dataKey="restoPos" name="Resto" stackId="c" fill="#94a3b8" radius={[2, 2, 0, 0]} />
              <Bar dataKey="restoNeg" name="Déficit" stackId="c" fill={C.neg} stroke={C.neg} strokeDasharray="3 2" />
              <Line dataKey="fcf" name="FCF" stroke={C.yellow} strokeWidth={2} strokeDasharray="5 4" dot={{ r: 2.5, fill: C.yellow }} />
            </ComposedChart>
          </Chart>
          <div className="fin-3m" style={{ marginTop: 14 }}>
            <Mini label="Dividendo / FCF" value={capMetrics ? capMetrics.div.toFixed(0) + '%' : '—'} color={capMetrics ? band(capMetrics.div, 60, 90) : null} />
            <Mini label="Retribución accionista / FCF" value={capMetrics ? capMetrics.shr.toFixed(0) + '%' : '—'} color={capMetrics ? band(capMetrics.shr, 80, 110) : null} />
            <Mini label="Distribución total / FCF" value={capMetrics ? capMetrics.dist.toFixed(0) + '%' : '—'} color={capMetrics ? band(capMetrics.dist, 90, 120) : null} />
          </div>
          {capOver && ly && (
            <p style={{ fontSize: 12, color: '#fbbf24', marginTop: 8 }}>
              En {ly.year} la empresa distribuyó más de lo que generó — la diferencia fue financiada con deuda o caja acumulada.
            </p>
          )}
          {ndText && <p style={{ fontSize: 12, color: ndText.color, marginTop: 6 }}>{ndText.text}</p>}
        </>}
      </Section>

      {/* POR ACCIÓN */}
      <Section title="Por acción">
        {d.share.length < 1 ? <Placeholder /> : <>
          <Chart h={200}>
            <BarChart data={d.share} margin={{ top: 6, right: 6, left: 0, bottom: 0 }} barGap={1}>
              {grid}
              <XAxis dataKey="year" {...axis} />
              <YAxis {...axis} width={38} tickFormatter={v => fmtNum(v, 0)} />
              <Tooltip content={({ active, payload }) => { if (!active || !payload?.length) return null; const p = payload[0].payload; return tipBox(p.year, [
                { l: 'EPS', v: fmtNum(p.eps), c: C.blue },
                { l: 'FCF/acción', v: fmtNum(p.fcfps), c: C.green },
                { l: 'DPS', v: fmtNum(p.dps), c: C.indigo },
                { l: 'Valor contable/acción', v: fmtNum(p.bvps), c: C.orange },
                { l: 'Payout FCF', v: p.fcfps && p.dps != null ? (p.dps / p.fcfps * 100).toFixed(1) + '%' : '—' },
              ]) }} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="eps" name={`EPS (${currency})`} fill={C.blue} radius={[2, 2, 0, 0]} />
              <Bar dataKey="fcfps" name="FCF/acción" fill={C.green} radius={[2, 2, 0, 0]} />
              <Bar dataKey="dps" name="DPS" fill={C.indigo} radius={[2, 2, 0, 0]} />
              <Bar dataKey="bvps" name="V. contable/acción" fill={C.orange} radius={[2, 2, 0, 0]} />
            </BarChart>
          </Chart>
          {shareNote && <p style={{ fontSize: 12, color: shareNote.color, marginTop: 8 }}>{shareNote.text}</p>}
        </>}
      </Section>
    </div>
  )

  return isPremium ? inner : <PremiumGate>{inner}</PremiumGate>
}

// ── auxiliares de presentación ──────────────────────────────────────────────
function Mini({ label, value, color }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '10px 12px' }}>
      <p style={{ fontSize: 10, color: '#4a5270', marginBottom: 4 }}>{label}</p>
      <p style={{ fontSize: 16, fontWeight: 800, color: color || '#c8d0e0' }}>{value}</p>
    </div>
  )
}
function band(v, g, y) { return v == null ? '#c8d0e0' : v < g ? '#34d399' : v <= y ? '#fbbf24' : '#f87171' }
function netDebtText(cdr) {
  if (!cdr || cdr.netDebtChange == null) return null
  const x = fmtMoney(Math.abs(cdr.netDebtChange))
  const pct = cdr.netDebtChangePct
  if (cdr.netDebtChange < 0) return { color: '#34d399', text: `La deuda neta se ha reducido ${x} en los últimos 4 años — señal de disciplina financiera.` }
  if (pct != null && pct > 50) return { color: '#f87171', text: `La deuda neta ha crecido significativamente (${x}) en los últimos 4 años — las distribuciones pueden estar financiándose con deuda.` }
  if (pct != null && pct > 20) return { color: '#fbbf24', text: `La deuda neta ha crecido ${x} en los últimos 4 años — revisar si las distribuciones son sostenibles.` }
  return { color: '#8090a8', text: `La deuda neta ha crecido ${x} en los últimos 4 años — crecimiento moderado.` }
}
const pctN = v => v == null ? '—' : v.toFixed(1) + '%'
function covColor(v) { return v == null ? '#4a5270' : v > 5 ? '#34d399' : v >= 3 ? '#fbbf24' : '#f87171' }

function trendText(margins, key, what) {
  const valid = margins.filter(m => m[key] != null)
  if (valid.length < 2) return null
  const last = valid[valid.length - 1][key]
  const refIdx = Math.max(0, valid.length - 5)
  const ref = valid[refIdx][key]
  const n = valid.length - 1 - refIdx
  const diff = last - ref
  if (diff > 2) return { color: '#34d399', text: `Los ${what} se han expandido en los últimos ${n} años — señal de mejora del poder de fijación de precios.` }
  if (diff < -2) return { color: '#f87171', text: `Los ${what} se han contraído en los últimos ${n} años — vigilar la presión competitiva.` }
  return { color: '#8090a8', text: `Márgenes estables en los últimos ${n} años.` }
}

function shareText(share) {
  const v = share.filter(s => s.eps != null || s.fcfps != null || s.dps != null)
  if (v.length < 2) return null
  const g = (key) => { const arr = v.filter(s => s[key] != null); if (arr.length < 2) return null; const a = arr[0][key], b = arr[arr.length - 1][key]; return (a && a !== 0) ? (b - a) / Math.abs(a) : null }
  const gE = g('eps'), gF = g('fcfps'), gD = g('dps')
  if (gD != null && gF != null && gD > gF * 1.3) return { color: '#f87171', text: 'El dividendo crece más rápido que el FCF por acción — vigilar la sostenibilidad.' }
  if (gD != null && gE != null && gF != null && gD < Math.min(gE, gF)) return { color: '#34d399', text: 'El dividendo crece con margen de seguridad — hay capacidad para acelerarlo.' }
  if (gE != null && gF != null && Math.abs(gE - gF) > 0.4) return { color: '#8090a8', text: 'Diferencia relevante entre EPS y FCF por acción — revisar la calidad del beneficio contable.' }
  return null
}
