'use client'
import { useMemo } from 'react'
import {
  ResponsiveContainer, ComposedChart, LineChart, Bar, Line, Cell,
  XAxis, YAxis, Tooltip, Legend, CartesianGrid, ReferenceLine,
} from 'recharts'
import { fromHistoryRows, fromLiveStatements, buildQuarterlyModel } from '@/lib/quarterly'

const C = { rev: '#60a5fa', ni: 'var(--positive)', neg: '#f87171', ttm: 'var(--accent)', fcf: '#34d399', op: '#818cf8', net: '#f59e0b' }

function chartUnit(vals) {
  const max = Math.max(0, ...vals.filter(v => v != null).map(Math.abs))
  if (max >= 1e6) return { div: 1e6, suf: ' M' }
  if (max >= 1e3) return { div: 1e3, suf: ' K' }
  return { div: 1, suf: '' }
}
const fmtU = (v, u) => v == null || isNaN(v) ? '—' : (v / u.div).toLocaleString('es-ES', { maximumFractionDigits: 0 }) + u.suf
const fmtPct = (v, d = 1) => v == null || isNaN(v) ? '—' : (v > 0 ? '+' : '') + v.toFixed(d) + '%'
const yoyColor = v => v == null ? 'var(--text-faint)' : v >= 0 ? 'var(--positive)' : 'var(--negative)'

const axis = { tick: { fontSize: 10, fill: 'var(--text-faint)' }, axisLine: { stroke: 'var(--surface-3)' }, tickLine: false }
const grid = <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-2)" vertical={false} />

function tipBox(title, rows) {
  return (
    <div style={{ background: 'var(--bg-elev)', border: '1px solid var(--border-strong)', borderRadius: 8, padding: '8px 11px', fontSize: 11.5, lineHeight: 1.6, boxShadow: '0 4px 16px rgba(0,0,0,0.18)' }}>
      <p style={{ color: 'var(--text)', fontWeight: 700, marginBottom: 4 }}>{title}</p>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 14 }}>
          <span style={{ color: r.c || 'var(--text-muted)' }}>{r.l}</span>
          <span style={{ color: 'var(--text-strong)', fontWeight: 600 }}>{r.v}</span>
        </div>
      ))}
    </div>
  )
}

function Section({ title, subtitle, children }) {
  return (
    <div style={{ marginTop: 6 }}>
      <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', marginBottom: subtitle ? 1 : 8 }}>{title}</p>
      {subtitle && <p style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 8 }}>{subtitle}</p>}
      {children}
    </div>
  )
}

function YoYStat({ label, value, yoy, unit, isEps }) {
  return (
    <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '11px 13px' }}>
      <div style={{ fontSize: 10.5, color: 'var(--text-faint)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-strong)', marginTop: 3 }}>
        {value == null ? '—' : isEps ? value.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : fmtU(value, unit)}
      </div>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: yoyColor(yoy), marginTop: 2 }}>
        {yoy == null ? 'sin comparativa' : `${fmtPct(yoy)} interanual`}
      </div>
    </div>
  )
}

export default function QuarterlyTrends({ historyRows, incomeQuarterly, cashflowQuarterly, currency }) {
  const model = useMemo(() => {
    let qs = fromHistoryRows(historyRows)
    if (qs.length < 2) qs = fromLiveStatements(incomeQuarterly, cashflowQuarterly)
    return buildQuarterlyModel(qs)
  }, [historyRows, incomeQuarterly, cashflowQuarterly])

  if (!model.available) return null   // sin histórico trimestral suficiente → no se muestra

  const q = model.quarters
  const rUnit = chartUnit(q.flatMap(x => [x.revenue, x.netIncome]))
  const tUnit = chartUnit(model.ttmSeries.flatMap(x => [x.revenueTTM, x.fcfTTM]))
  const cur = currency ? ` ${currency}` : ''

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, display: 'grid', gap: 22 }}>
      <style>{`.qt-chart{height:210px}@media(max-width:768px){.qt-chart{height:170px}}
        .qt-2col{display:grid;grid-template-columns:1fr;gap:16px}@media(min-width:820px){.qt-2col{grid-template-columns:1fr 1fr}}
        .qt-3m{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}`}</style>
      <p style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-strong)', margin: '-2px 0 -8px' }}>Evolución trimestral e interanual (YoY)</p>

      {/* 1 — Resumen YoY del último trimestre */}
      <Section title="Último trimestre vs. mismo trimestre del año anterior" subtitle={`Cierre ${model.latest.period}`}>
        <div className="qt-3m">
          <YoYStat label="Ingresos" value={model.latest.revenue} yoy={model.latest.revenueYoY} unit={rUnit} />
          <YoYStat label="Beneficio neto" value={model.latest.netIncome} yoy={model.latest.netIncomeYoY} unit={rUnit} />
          <YoYStat label={`BPA${cur}`} value={model.latest.eps} yoy={model.latest.epsYoY} isEps />
        </div>
        {model.ttm.revenue != null && (
          <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 10 }}>
            <b>Últimos 12 meses (TTM):</b> ingresos {fmtU(model.ttm.revenue, rUnit)}{cur}
            {model.ttm.revenueYoY != null && <span style={{ color: yoyColor(model.ttm.revenueYoY), fontWeight: 700 }}> ({fmtPct(model.ttm.revenueYoY)})</span>}
            {' · '}beneficio {fmtU(model.ttm.netIncome, rUnit)}
            {model.ttm.netIncomeYoY != null && <span style={{ color: yoyColor(model.ttm.netIncomeYoY), fontWeight: 700 }}> ({fmtPct(model.ttm.netIncomeYoY)})</span>}
            {model.ttm.fcf != null && <> · FCF {fmtU(model.ttm.fcf, rUnit)}{model.ttm.fcfYoY != null && <span style={{ color: yoyColor(model.ttm.fcfYoY), fontWeight: 700 }}> ({fmtPct(model.ttm.fcfYoY)})</span>}</>}
          </p>
        )}
      </Section>

      {/* 2 — Ingresos y beneficio por trimestre + línea YoY */}
      <Section title="Ingresos y beneficio por trimestre" subtitle="Barras = trimestre · línea = crecimiento interanual de ingresos">
        <div className="qt-chart">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={q} margin={{ top: 6, right: 6, left: 0, bottom: 0 }} barGap={2}>
              {grid}
              <XAxis dataKey="label" {...axis} />
              <YAxis yAxisId="v" {...axis} width={42} tickFormatter={v => fmtU(v, rUnit)} />
              <YAxis yAxisId="p" orientation="right" {...axis} width={38} tickFormatter={v => v + '%'} />
              <Tooltip content={({ active, payload }) => active && payload?.length ? tipBox(payload[0].payload.label + ' · ' + payload[0].payload.period, [
                { l: 'Ingresos', v: fmtU(payload[0].payload.revenue, rUnit), c: C.rev },
                { l: 'Beneficio neto', v: fmtU(payload[0].payload.netIncome, rUnit), c: C.ni },
                { l: 'Ingresos YoY', v: fmtPct(payload[0].payload.revenueYoY), c: yoyColor(payload[0].payload.revenueYoY) },
                { l: 'Beneficio YoY', v: fmtPct(payload[0].payload.netIncomeYoY), c: yoyColor(payload[0].payload.netIncomeYoY) },
              ]) : null} cursor={{ fill: 'var(--surface-2)' }} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar yAxisId="v" dataKey="revenue" name="Ingresos" fill={C.rev} radius={[2, 2, 0, 0]} />
              <Bar yAxisId="v" dataKey="netIncome" name="Beneficio neto" radius={[2, 2, 0, 0]}>
                {q.map((d, i) => <Cell key={i} fill={d.netIncome < 0 ? C.neg : C.ni} />)}
              </Bar>
              <Line yAxisId="p" dataKey="revenueYoY" name="Ingresos YoY %" stroke={C.net} strokeWidth={2} dot={{ r: 2.5 }} connectNulls />
              <ReferenceLine yAxisId="p" y={0} stroke="var(--border-strong)" strokeDasharray="3 3" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Section>

      <div className="qt-2col">
        {/* 3 — Tendencia TTM */}
        <Section title="Tendencia TTM (últimos 12 meses)" subtitle="Suma móvil de 4 trimestres — momentum entre informes anuales">
          <div className="qt-chart">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={model.ttmSeries.filter(x => x.revenueTTM != null)} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
                {grid}
                <XAxis dataKey="label" {...axis} />
                <YAxis {...axis} width={42} tickFormatter={v => fmtU(v, tUnit)} />
                <Tooltip content={({ active, payload }) => active && payload?.length ? tipBox(payload[0].payload.label, [
                  { l: 'Ingresos TTM', v: fmtU(payload[0].payload.revenueTTM, tUnit), c: C.rev },
                  { l: 'FCF TTM', v: fmtU(payload[0].payload.fcfTTM, tUnit), c: C.fcf },
                  { l: 'Beneficio TTM', v: fmtU(payload[0].payload.netIncomeTTM, tUnit), c: C.ni },
                ]) : null} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Line dataKey="revenueTTM" name="Ingresos" stroke={C.rev} strokeWidth={2} dot={{ r: 2 }} connectNulls />
                <Line dataKey="fcfTTM" name="FCF" stroke={C.fcf} strokeWidth={2} dot={{ r: 2 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Section>

        {/* 4 — Márgenes por trimestre */}
        <Section title="Márgenes por trimestre" subtitle="Operativo y neto sobre ingresos">
          <div className="qt-chart">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={q.filter(x => x.netMargin != null || x.opMargin != null)} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
                {grid}
                <XAxis dataKey="label" {...axis} />
                <YAxis {...axis} width={38} tickFormatter={v => v + '%'} />
                <Tooltip content={({ active, payload }) => active && payload?.length ? tipBox(payload[0].payload.label, [
                  { l: 'Margen operativo', v: fmtPct(payload[0].payload.opMargin), c: C.op },
                  { l: 'Margen neto', v: fmtPct(payload[0].payload.netMargin), c: C.net },
                ]) : null} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Line dataKey="opMargin" name="Operativo" stroke={C.op} strokeWidth={2} dot={{ r: 2 }} connectNulls />
                <Line dataKey="netMargin" name="Neto" stroke={C.net} strokeWidth={2} dot={{ r: 2 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Section>
      </div>
    </div>
  )
}
