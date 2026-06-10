'use client'
import { useState, useEffect, useMemo } from 'react'
import { ComposedChart, Bar, Line, Area, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts'

const CARD = { background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 20 }
const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const BLUE = '#60a5fa', GREEN = '#34d399', ORANGE = '#fbbf24', RED = '#f87171'

const fmtEUR = (v, d = 0) => v == null || isNaN(v) ? '—' : Number(v).toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d }) + ' €'
const fmtPct = v => v == null || isNaN(v) ? '—' : (v >= 0 ? '+' : '') + Number(v).toFixed(1) + '%'
const axisEUR = v => Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : Math.abs(v) >= 1e3 ? Math.round(v / 1e3) + 'K' : String(v)

export default function PortfolioEvolution({ isPremium, currentValueEUR = null }) {
  const nowYear = new Date().getFullYear()
  const [year, setYear] = useState(nowYear)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState('eur')     // 'eur' | 'pct'
  const [showDivs, setShowDivs] = useState(true)
  const [height, setHeight] = useState(280)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(max-width: 640px)')
    const apply = () => setHeight(mq.matches ? 220 : 280)
    apply(); mq.addEventListener?.('change', apply)
    return () => mq.removeEventListener?.('change', apply)
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/cartera/evolucion?year=${year}`)
      .then(r => r.json())
      .then(d => { if (!cancelled) { setData(d); if (d?.flags?.hasDividends === false) setShowDivs(false); else setShowDivs(true) } })
      .catch(() => { if (!cancelled) setData(null) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [year])

  // Para el año en curso, el valor del mes actual = el valor real de la cartera
  // (el mismo que muestra el resumen), para que el gráfico y los KPIs cuadren.
  const overrideCurrent = isCurrentYearOverride(year, nowYear, currentValueEUR)

  const chartData = useMemo(() => {
    if (!data?.months) return []
    const lastIdx = lastDataIndex(data.months)
    return data.months.map((mo, idx) => {
      let mv = mo.marketValue
      if (overrideCurrent != null && idx === lastIdx) mv = overrideCurrent
      const inv = mo.investedCapital
      const has = mv != null && inv != null && !mo.noData
      const retPct = has && inv > 0 ? (mv - inv) / inv * 100 : 0
      const divPct = has && inv > 0 ? (mo.dividendsAccum || 0) / inv * 100 : 0
      return {
        name: MONTHS[mo.m - 1],
        mv: has ? mv : 0, inv: has ? inv : null,
        bandBase: has ? Math.min(mv, inv) : null,
        gain: has ? Math.max(mv - inv, 0) : 0,
        loss: has ? Math.max(inv - mv, 0) : 0,
        retPct, divAccum: mo.dividendsAccum || 0, divMonth: mo.dividendsMonth || 0, divPct,
        positive: has ? mv >= inv : true, noData: !has,
      }
    })
  }, [data, overrideCurrent])

  const hasDivs = data?.flags?.hasDividends
  const years = data?.years || [nowYear]

  // KPIs: si tenemos el valor real de la cartera (año en curso), prevalece sobre
  // el estimado del API para que el "Valor actual" coincida con el resumen.
  const k = useMemo(() => {
    const base = data?.kpis
    if (!base) return null
    if (overrideCurrent == null) return base
    const inv = base.investedTotal || 0
    const latentGain = overrideCurrent - inv
    const startVal = data.months?.find(mo => mo.marketValue != null && mo.marketValue > 0)?.marketValue ?? null
    return {
      ...base,
      currentValue: overrideCurrent,
      latentGain,
      latentPct: inv > 0 ? latentGain / inv * 100 : null,
      totalReturnPct: inv > 0 ? (latentGain + (base.dividendsAllTime || 0)) / inv * 100 : null,
      valueChangeEUR: startVal != null ? overrideCurrent - startVal : null,
      valueChangePct: startVal ? (overrideCurrent - startVal) / startVal * 100 : null,
      beatsSP500: base.sp500Pct != null && inv > 0 ? ((latentGain + (base.dividendsAllTime || 0)) / inv * 100) > base.sp500Pct : false,
    }
  }, [data, overrideCurrent])

  return (
    <div style={{ ...CARD, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: '#4a5270', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Evolución del patrimonio</p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {isPremium && (
            <div style={{ display: 'flex', gap: 3 }}>
              {[['eur', '€ Valor'], ['pct', '% Rentab.']].map(([v, l]) => (
                <button key={v} onClick={() => setMode(v)} style={btn(mode === v)}>{l}</button>
              ))}
            </div>
          )}
          <select value={year} onChange={e => setYear(Number(e.target.value))} disabled={!isPremium}
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7, padding: '6px 10px', color: isPremium ? '#c8d0e0' : '#4a5270', fontSize: 12, outline: 'none', cursor: isPremium ? 'pointer' : 'not-allowed' }}>
            {(isPremium ? years : [nowYear]).map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {/* KPIs */}
      {k && (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${isPremium ? 4 : 3}, 1fr)`, gap: 10, marginBottom: 16 }}>
          <Kpi label="Valor actual" value={fmtEUR(k.currentValue)} sub={k.valueChangeEUR != null ? `${k.valueChangeEUR >= 0 ? '+' : ''}${fmtEUR(k.valueChangeEUR)} · ${fmtPct(k.valueChangePct)}` : null} subCol={k.valueChangeEUR >= 0 ? GREEN : RED} col="#e0e8f0" />
          <Kpi label="Capital invertido" value={fmtEUR(k.investedTotal)} sub="Coste medio ponderado" col="#c8d0e0" />
          <Kpi label="Ganancia latente" value={(k.latentGain >= 0 ? '+' : '') + fmtEUR(k.latentGain)} sub={fmtPct(k.latentPct)} subCol={k.latentGain >= 0 ? GREEN : RED} col={k.latentGain >= 0 ? GREEN : RED} />
          {isPremium && (
            <Kpi label="Rentabilidad total" value={fmtPct(k.totalReturnPct)} col={k.totalReturnPct >= 0 ? GREEN : RED}
              badge={k.beatsSP500 ? '🏆 Superas al S&P 500' : null} sub={k.sp500Pct != null ? `S&P 500: ${fmtPct(k.sp500Pct)}` : 'Incluye dividendos'} />
          )}
        </div>
      )}

      {loading ? (
        <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4a5270', fontSize: 13 }}>Calculando evolución…</div>
      ) : data?.flags?.empty || !chartData.length ? (
        <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4a5270', fontSize: 14 }}>Sin operaciones en {year}</div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={height}>
            <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="name" stroke="#4a5270" fontSize={10} tickLine={false} />
              <YAxis stroke="#4a5270" fontSize={10} tickLine={false} tickFormatter={mode === 'pct' ? (v => `${v}%`) : axisEUR} />
              <Tooltip content={<EvoTooltip year={year} mode={mode} hasDivs={hasDivs} />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />

              {mode === 'eur' ? (
                <>
                  <Bar dataKey="mv" radius={[3, 3, 0, 0]} maxBarSize={48}>
                    {chartData.map((d, i) => <Cell key={i} fill={d.noData ? 'rgba(255,255,255,0.05)' : d.positive ? BLUE : RED} fillOpacity={0.85} />)}
                  </Bar>
                  {/* Banda gain/loss entre valor y capital (verde si valor>capital, roja si <) */}
                  <Area dataKey="bandBase" stackId="band" stroke="none" fill="none" fillOpacity={0} isAnimationActive={false} />
                  <Area dataKey="gain" stackId="band" stroke="none" fill={GREEN} fillOpacity={0.16} isAnimationActive={false} />
                  <Area dataKey="loss" stackId="band" stroke="none" fill={RED} fillOpacity={0.16} isAnimationActive={false} />
                  <Line dataKey="inv" stroke={GREEN} strokeWidth={2} dot={{ r: 2.5, fill: GREEN }} isAnimationActive={false} connectNulls />
                  {hasDivs && showDivs && <Line dataKey="divAccum" stroke={ORANGE} strokeWidth={1.5} strokeDasharray="5 4" dot={{ r: 2, fill: ORANGE }} isAnimationActive={false} />}
                </>
              ) : (
                <>
                  <ReferenceLine y={0} stroke={GREEN} strokeWidth={1.5} />
                  <Bar dataKey="retPct" radius={[3, 3, 0, 0]} maxBarSize={48}>
                    {chartData.map((d, i) => <Cell key={i} fill={d.noData ? 'rgba(255,255,255,0.05)' : d.retPct >= 0 ? GREEN : RED} fillOpacity={0.85} />)}
                  </Bar>
                  {hasDivs && showDivs && <Line dataKey="divPct" stroke={ORANGE} strokeWidth={1.5} strokeDasharray="5 4" dot={{ r: 2, fill: ORANGE }} isAnimationActive={false} />}
                </>
              )}
            </ComposedChart>
          </ResponsiveContainer>

          {/* Leyenda */}
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 8, fontSize: 10.5, color: '#4a5270', alignItems: 'center' }}>
            <span><span style={{ display: 'inline-block', width: 10, height: 10, background: BLUE, borderRadius: 2, marginRight: 5 }} />Valor de mercado</span>
            <span><span style={{ display: 'inline-block', width: 12, height: 0, borderTop: `2px solid ${GREEN}`, marginRight: 5, verticalAlign: 'middle' }} />Capital invertido</span>
            {hasDivs && (
              <button onClick={() => setShowDivs(s => !s)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: showDivs ? '#fbbf24' : '#3a4260', fontSize: 10.5, padding: 0, display: 'inline-flex', alignItems: 'center' }}>
                <span style={{ display: 'inline-block', width: 12, height: 0, borderTop: `2px dashed ${ORANGE}`, marginRight: 5, verticalAlign: 'middle', opacity: showDivs ? 1 : 0.4 }} />Dividendos acumulados {showDivs ? '' : '(oculto)'}
              </button>
            )}
          </div>

          {data?.flags?.usedFallback && (
            <p style={{ fontSize: 9.5, color: '#2e3a55', marginTop: 8 }}>
              Algunos meses usan el precio de compra como estimación — los precios históricos se cargan progresivamente.
            </p>
          )}
        </>
      )}
    </div>
  )
}

// Valor real de la cartera a usar como override del mes actual (solo año en curso)
function isCurrentYearOverride(year, nowYear, currentValueEUR) {
  return year === nowYear && currentValueEUR != null && !isNaN(currentValueEUR) ? Math.round(currentValueEUR) : null
}
// Índice del último mes con datos (no futuro)
function lastDataIndex(months) {
  let idx = -1
  months.forEach((mo, i) => { if (!mo.noData && mo.marketValue != null) idx = i })
  return idx
}

const btn = active => ({
  padding: '5px 11px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 11,
  background: active ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.04)',
  color: active ? '#818cf8' : '#4a5270', fontWeight: active ? 700 : 400,
})

function Kpi({ label, value, sub, subCol, col, badge }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 8, padding: '12px 14px', border: '1px solid rgba(255,255,255,0.05)' }}>
      <p style={{ fontSize: 10, color: '#4a5270', marginBottom: 4 }}>{label}</p>
      <p style={{ fontSize: 18, fontWeight: 800, color: col }}>{value}</p>
      {badge && <p style={{ fontSize: 9.5, fontWeight: 700, color: '#fbbf24', marginTop: 3 }}>{badge}</p>}
      {sub && <p style={{ fontSize: 10, color: subCol || '#3a4260', marginTop: 3 }}>{sub}</p>}
    </div>
  )
}

function EvoTooltip({ active, payload, label, year, mode, hasDivs }) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  if (!d) return null
  if (d.noData) return (
    <div style={{ background: '#10172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 12px', fontSize: 11 }}>
      <p style={{ color: '#c8d0e0', fontWeight: 700 }}>{label} {year}</p>
      <p style={{ color: '#4a5270' }}>Sin datos para este mes</p>
    </div>
  )
  const gain = d.mv - d.inv
  const gainPct = d.inv > 0 ? gain / d.inv * 100 : 0
  const totalRet = d.inv > 0 ? (gain + d.divAccum) / d.inv * 100 : 0
  return (
    <div style={{ background: '#10172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '10px 13px', fontSize: 11.5, minWidth: 200 }}>
      <p style={{ color: '#c8d0e0', fontWeight: 700, marginBottom: 6 }}>{label} {year}</p>
      <Row label="Valor de mercado" val={fmtEUR(d.mv)} col="#60a5fa" />
      <Row label="Capital invertido" val={fmtEUR(d.inv)} col="#34d399" />
      <Row label="Ganancia latente" val={`${gain >= 0 ? '+' : ''}${fmtEUR(gain)} (${fmtPct(gainPct)})`} col={gain >= 0 ? '#34d399' : '#f87171'} />
      {hasDivs && d.divMonth > 0 && <Row label="Dividendos del mes" val={fmtEUR(d.divMonth, 2)} col="#fbbf24" />}
      {hasDivs && d.divAccum > 0 && <Row label="Dividendos acumulados" val={fmtEUR(d.divAccum, 2)} col="#fbbf24" />}
      <Row label="Rentab. total (con div.)" val={fmtPct(totalRet)} col="#818cf8" />
    </div>
  )
}
function Row({ label, val, col }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, marginBottom: 2 }}>
      <span style={{ color: '#8090a8' }}>{label}</span>
      <span style={{ color: col || '#c8d0e0', fontWeight: 600 }}>{val}</span>
    </div>
  )
}
