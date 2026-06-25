'use client'
import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts'
import { createClient } from '@/lib/supabase/client'
import { enrichPositions, calcSummary } from '@/lib/portfolio'
import { projectIncome, calcDRIP } from '@/lib/portfolio-calc'
import { monthlyEquivalent } from '@/lib/recurring'
import FISimulator from '@/components/cartera/FISimulator'

const CARD  = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }
const SLIDER_WRAP = { display: 'flex', flexDirection: 'column', gap: 6 }
const LABEL = { fontSize: 11, color: 'var(--text-faint)' }
const CAP = 20   // tope de CAGR del dividendo (MAX_CAGR en portfolio-calc)

function fmtEUR(v) {
  if (v == null) return '—'
  return v.toLocaleString('es-ES', { maximumFractionDigits: 0 }) + ' €'
}
function fmtPct(v) { return v == null || isNaN(v) ? '—' : v.toFixed(1) + '%' }

function Slider({ label, value, min, max, step = 1, onChange, format }) {
  return (
    <div style={SLIDER_WRAP}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={LABEL}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>{format ? format(value) : value}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width: '100%', accentColor: 'var(--accent)' }}
      />
    </div>
  )
}

function PremiumWall() {
  return (
    <div style={{ textAlign: 'center', padding: '60px 20px' }}>
      <p style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent)', marginBottom: 8 }}>Proyección — solo Premium</p>
      <p style={{ fontSize: 13, color: 'var(--text-faint)', marginBottom: 20, maxWidth: 380, margin: '0 auto 20px' }}>
        Accede a la proyección personalizada con CAGR real de cada empresa, tres escenarios y análisis DRIP.
      </p>
      <Link href="/pricing" style={{ padding: '10px 22px', background: 'var(--accent)', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
        Activar Premium →
      </Link>
    </div>
  )
}

const TOOLTIP_STYLE = { background: 'var(--bg-elev)', border: '1px solid var(--border-strong)', borderRadius: 8, fontSize: 11 }

export default function ProyeccionPage({ isPremium }) {
  const router  = useRouter()
  const [enriched, setEnriched]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [summary, setSummary]     = useState(null)

  const [horizon,         setHorizon]         = useState(20)
  const [monthly,         setMonthly]         = useState(300)
  const [recurringMonthly, setRecurringMonthly] = useState(0)
  const [monthlyGrowth,   setMonthlyGrowth]   = useState(3)
  const [reinvest,        setReinvest]        = useState(true)
  const [taxRate,         setTaxRate]         = useState(19)
  const [rentaObjetivo,   setRentaObjetivo]   = useState(0)
  const [showDRIP,        setShowDRIP]        = useState(false)
  const [showRates,       setShowRates]       = useState(false)

  useEffect(() => { load() }, [])

  const load = async () => {
    const sb = createClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data: positions } = await sb.from('positions').select('*').eq('user_id', user.id)
    if (!positions?.length) { setEnriched([]); setLoading(false); return }

    const tickers = [...new Set(positions.map(p => p.ticker))]
    const { data: funds } = await sb
      .from('company_fundamentals')
      .select('ticker,current_price,dps,div_cagr5,sector,industry,country')
      .in('ticker', tickers)

    const fundTickers = [...new Set(positions.filter(p => (p.asset_type || 'stock') !== 'stock').map(p => p.ticker))]
    const [{ data: fundsData }, { data: rec }] = await Promise.all([
      fundTickers.length ? sb.from('funds').select('*').in('ticker', fundTickers) : Promise.resolve({ data: [] }),
      sb.from('recurring_contributions').select('amount_eur, frequency, active').eq('user_id', user.id),
    ])

    const fundMap = Object.fromEntries((funds || []).map(f => [f.ticker, f]))
    const fundsMap = Object.fromEntries((fundsData || []).map(f => [f.ticker, f]))
    // Inyectamos div_cagr5 real en cada posición — la proyección (projectIncome) ya
    // lo espera en p.div_cagr5; sin esto caía al 3% genérico para todas.
    const e = enrichPositions(positions, fundMap, fundsMap).map(p => ({
      ...p, div_cagr5: p.div_cagr5 ?? fundMap[p.ticker]?.div_cagr5 ?? null,
    }))
    setEnriched(e)
    setSummary(calcSummary(e))
    setRecurringMonthly((rec || []).filter(c => c.active).reduce((s, c) => s + monthlyEquivalent(c.amount_eur, c.frequency), 0))
    setLoading(false)
  }

  const proj = useMemo(() => enriched.length ? projectIncome(enriched, {
    horizon, monthly: monthly + recurringMonthly, monthlyGrowthPct: monthlyGrowth, reinvest, taxRate,
  }) : null, [enriched, horizon, monthly, recurringMonthly, monthlyGrowth, reinvest, taxRate])

  const drip = useMemo(() => calcDRIP(enriched), [enriched])

  const chartData = useMemo(() => {
    if (!proj) return []
    return proj.base.map((b, i) => ({
      year: b.year,
      base: b.income,
      conservative: proj.conservative[i].income,
      optimistic:   proj.optimistic[i].income,
    }))
  }, [proj])

  // Tasas de crecimiento del dividendo usadas (MEJORA 5)
  const rates = useMemo(() => enriched
    .filter(p => (p.annualIncomeEUR ?? 0) > 0 || (p.dps ?? 0) > 0)
    .map(p => {
      const has = p.div_cagr5 != null && !isNaN(p.div_cagr5)
      const raw = has ? Number(p.div_cagr5) : 3
      const used = Math.min(Math.max(raw, 0), CAP)
      return { name: p.name, ticker: p.ticker, raw, used, capped: raw > CAP, source: has ? 'Histórico 5 años' : 'Por defecto 3%' }
    })
    .sort((a, b) => b.used - a.used), [enriched])

  // Yield on cost proyectado (MEJORA 3)
  const costTotal = summary?.totalCostEUR ?? 0
  const yocData = useMemo(() => (proj && costTotal > 0)
    ? proj.base.map(b => ({ year: b.year, yoc: b.income / costTotal * 100 }))
    : [], [proj, costTotal])
  const yocToday = costTotal > 0 ? (summary?.totalIncomeEUR ?? 0) / costTotal * 100 : null
  const yocAt = y => (proj && costTotal > 0 && proj.base[y - 1]) ? proj.base[y - 1].income / costTotal * 100 : null

  const keyYears = [5, 10, 15, 20, horizon].filter((y, i, a) => y <= horizon && a.indexOf(y) === i)

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-faint)' }}>Cargando…</div>

  if (!enriched.length) return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '40px 16px', textAlign: 'center' }}>
      <p style={{ color: 'var(--text-faint)', marginBottom: 16 }}>Añade posiciones a tu cartera para ver la proyección.</p>
      <Link href="/cartera" style={{ color: 'var(--accent)', fontSize: 13 }}>← Ir a la cartera</Link>
    </div>
  )

  if (!isPremium) return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 16px' }}><PremiumWall /></div>
  )

  const baseAtHorizon = proj?.base[horizon - 1]?.income ?? 0
  const reinvestText = reinvest ? 'Con reinversión de dividendos' : 'Sin reinversión'

  // ── Headline (MEJORA 1) ──
  let headline = { color: 'var(--positive)', big: <>Cobrarás <span style={{ color: 'var(--positive)' }}>{fmtEUR(Math.round(baseAtHorizon / 12))}/mes</span> en dividendos en el año {horizon}</>, sub: `Escenario base · Renta actual: ${fmtEUR(summary?.totalIncomeEUR)}/año · ${reinvestText}`, accent: false }
  if (rentaObjetivo > 0 && proj) {
    const idx = proj.base.findIndex(b => b.income >= rentaObjetivo)
    if (idx >= 0) {
      headline = { accent: true, big: <>Alcanzarás tu objetivo de <span style={{ color: 'var(--positive-soft)' }}>{fmtEUR(rentaObjetivo)}/año</span> en el año {idx + 1}</>, sub: `Escenario base · Renta actual: ${fmtEUR(summary?.totalIncomeEUR)}/año · ${reinvestText}` }
    } else {
      const pct = rentaObjetivo > 0 ? baseAtHorizon / rentaObjetivo * 100 : 0
      const g = proj.base[horizon - 1] && proj.base[horizon - 2] && proj.base[horizon - 2].income > 0
        ? proj.base[horizon - 1].income / proj.base[horizon - 2].income - 1 : 0
      const extra = g > 0 && baseAtHorizon > 0 ? Math.ceil(Math.log(rentaObjetivo / baseAtHorizon) / Math.log(1 + g)) : null
      headline = { accent: false, big: <>En el año {horizon} estarás al <span style={{ color: 'var(--warning)' }}>{pct.toFixed(0)}%</span> de tu objetivo de {fmtEUR(rentaObjetivo)}/año</>, sub: extra ? `Necesitarías ~${extra} año${extra > 1 ? 's' : ''} más para alcanzarlo · ${reinvestText}` : `${reinvestText}` }
    }
  }

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 16px 64px' }}>
      <style>{`
        .proj-stack { display: flex; flex-direction: column; gap: 16px; margin-bottom: 16px; }
        .proj-slgrid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; }
        @media (max-width: 760px) {
          .proj-params { order: 2; }
          .proj-chart { order: 1; }
        }
      `}</style>

      {/* 1 · Headline */}
      <div style={{ ...CARD, marginBottom: 16, background: headline.accent ? 'rgba(52,211,153,0.08)' : 'rgba(99,102,241,0.06)', border: `1px solid ${headline.accent ? 'rgba(52,211,153,0.3)' : 'rgba(99,102,241,0.2)'}` }}>
        <p style={{ fontSize: 22, fontWeight: 900, color: 'var(--text)', lineHeight: 1.25 }}>{headline.big}</p>
        <p style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 6 }}>{headline.sub}</p>
      </div>

      <div className="proj-stack">
        {/* 2 · Parámetros */}
        <div className="proj-params" style={{ ...CARD }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>Parámetros</p>
          {recurringMonthly > 0 && (
            <div style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 8, padding: '10px 12px', fontSize: 11, marginBottom: 14 }}>
              <p style={{ color: 'var(--accent)', fontWeight: 700, marginBottom: 4 }}>Aportaciones combinadas (al mes)</p>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}><span>⚡ Periódicas a ETFs/fondos</span><span style={{ color: '#a78bfa', fontWeight: 700 }}>{recurringMonthly.toFixed(0)} €</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}><span>Extra (slider)</span><span style={{ color: 'var(--text)', fontWeight: 700 }}>{monthly} €</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', marginTop: 4, paddingTop: 4, borderTop: '1px solid var(--border)' }}><span>Total</span><span style={{ color: 'var(--positive)', fontWeight: 700 }}>{(recurringMonthly + monthly).toFixed(0)} €</span></div>
            </div>
          )}
          <div className="proj-slgrid">
            <Slider label="Horizonte" value={horizon} min={5} max={40} onChange={setHorizon} format={v => `${v} años`} />
            <Slider label="Aportación mensual extra" value={monthly} min={0} max={5000} step={50} onChange={setMonthly} format={v => `${v} €`} />
            <Slider label="Crecim. aportación/año" value={monthlyGrowth} min={0} max={10} step={0.5} onChange={setMonthlyGrowth} format={v => `${v}%`} />
            <Slider label="Retención fiscal" value={taxRate} min={0} max={35} onChange={setTaxRate} format={v => `${v}%`} />
            <Slider label="Renta objetivo/año (€)" value={rentaObjetivo} min={0} max={60000} step={500} onChange={setRentaObjetivo} format={v => v > 0 ? fmtEUR(v) : 'Sin objetivo'} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={LABEL}>Reinvertir dividendos</span>
              <button onClick={() => setReinvest(r => !r)} style={{
                width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
                background: reinvest ? 'rgba(52,211,153,0.7)' : 'var(--border-strong)', position: 'relative', transition: 'background 0.2s',
              }}>
                <span style={{ position: 'absolute', top: 3, left: reinvest ? 22 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
              </button>
            </div>
          </div>

          {/* MEJORA 5 — tasas de crecimiento usadas */}
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
            <button onClick={() => setShowRates(s => !s)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontSize: 11.5, fontWeight: 700, padding: 0 }}>
              Ver tasas de crecimiento usadas {showRates ? '▲' : '▼'}
            </button>
            {showRates && (
              <div style={{ overflowX: 'auto', marginTop: 10 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead><tr>{['Empresa', 'CAGR div usado', 'Fuente'].map(h => (
                    <th key={h} style={{ padding: '5px 8px', textAlign: h === 'Empresa' ? 'left' : h === 'Fuente' ? 'left' : 'right', color: 'var(--text-faint)', borderBottom: '1px solid var(--border)', fontWeight: 600 }}>{h}</th>
                  ))}</tr></thead>
                  <tbody>
                    {rates.map((r, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--surface-2)' }}>
                        <td style={{ padding: '5px 8px', color: 'var(--text)' }}>{r.name} <span style={{ color: 'var(--text-faintest)' }}>{r.ticker}</span></td>
                        <td style={{ padding: '5px 8px', textAlign: 'right', color: r.capped ? 'var(--warning)' : 'var(--positive)', fontWeight: 600, whiteSpace: 'nowrap' }}>{r.capped ? `${r.raw.toFixed(0)}% → cap ${CAP}%` : `${r.used.toFixed(1)}%`}</td>
                        <td style={{ padding: '5px 8px', color: 'var(--text-faint)' }}>{r.source}{r.capped ? ' (cap aplicado)' : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p style={{ fontSize: 10, color: 'var(--text-faintest)', marginTop: 8, lineHeight: 1.5 }}>
                  Es el CAGR inicial. En la proyección se modera progresivamente hacia ~3% a lo largo de {10} años — las empresas no sostienen un crecimiento alto para siempre.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* 3 · Gráfico */}
        <div className="proj-chart" style={CARD}>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16 }}>Proyección de renta anual</p>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-3)" />
              <XAxis dataKey="year" stroke="var(--text-faint)" fontSize={10} tickLine={false} label={{ value: 'Año', position: 'insideBottom', offset: -2, fontSize: 10, fill: 'var(--text-faint)' }} />
              <YAxis stroke="var(--text-faint)" fontSize={10} tickLine={false} tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}K` : v} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={v => [fmtEUR(v), '']} />
              <Legend wrapperStyle={{ fontSize: 11, color: 'var(--text-muted)' }} />
              <Area type="monotone" dataKey="conservative" name="Conservador" stroke="var(--negative)" fill="rgba(248,113,113,0.08)" strokeWidth={1.5} dot={false} />
              <Area type="monotone" dataKey="base"         name="Base"        stroke="var(--positive)" fill="rgba(52,211,153,0.12)" strokeWidth={2}   dot={false} />
              <Area type="monotone" dataKey="optimistic"   name="Optimista"   stroke="var(--accent)" fill="rgba(129,140,248,0.08)" strokeWidth={1.5} dot={false} />
              {rentaObjetivo > 0 && (
                <ReferenceLine y={rentaObjetivo} stroke="var(--warning)" strokeDasharray="6 3" label={{ value: 'Objetivo', position: 'right', fill: 'var(--warning)', fontSize: 11 }} />
              )}
            </AreaChart>
          </ResponsiveContainer>
          <p style={{ fontSize: 10.5, color: 'var(--text-faintest)', marginTop: 8, lineHeight: 1.5 }}>
            Proyección basada en el CAGR histórico real de cada empresa de tu cartera — no en una tasa genérica. El crecimiento se modera año a año hacia una tasa sostenible (~3%): ninguna empresa sostiene un CAGR alto indefinidamente.
          </p>
        </div>
      </div>

      {/* 4 · Valores en años clave */}
      <div style={{ ...CARD, marginBottom: 16 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Valores en años clave</p>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                {['Año','Conservador','Base','Optimista'].map(h => (
                  <th key={h} style={{ padding: '6px 8px', textAlign: h === 'Año' ? 'left' : 'right', color: 'var(--text-faint)', borderBottom: '1px solid var(--border)', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {keyYears.filter(y => y <= horizon).map(y => (
                <tr key={y} style={{ background: y === horizon ? 'rgba(99,102,241,0.05)' : 'transparent' }}>
                  <td style={{ padding: '7px 8px', color: 'var(--text-muted)', borderBottom: '1px solid var(--surface-2)' }}>Año {y}</td>
                  <td style={{ padding: '7px 8px', textAlign: 'right', color: 'var(--negative)', borderBottom: '1px solid var(--surface-2)' }}>{fmtEUR(proj?.conservative[y - 1]?.income)}</td>
                  <td style={{ padding: '7px 8px', textAlign: 'right', color: 'var(--positive)', fontWeight: 700, borderBottom: '1px solid var(--surface-2)' }}>{fmtEUR(proj?.base[y - 1]?.income)}</td>
                  <td style={{ padding: '7px 8px', textAlign: 'right', color: 'var(--accent)', borderBottom: '1px solid var(--surface-2)' }}>{fmtEUR(proj?.optimistic[y - 1]?.income)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 5 · Yield on cost proyectado (MEJORA 3) */}
      <div style={{ ...CARD, marginBottom: 16 }}>
        <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-strong)' }}>Yield on cost proyectado</p>
        <p style={{ fontSize: 11.5, color: 'var(--text-faint)', marginBottom: 14 }}>Cuánto renta tu inversión original con el paso del tiempo</p>
        {costTotal > 0 ? (
          <>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={yocData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-3)" />
                <XAxis dataKey="year" stroke="var(--text-faint)" fontSize={10} tickLine={false} />
                <YAxis stroke="var(--text-faint)" fontSize={10} tickLine={false} tickFormatter={v => `${v.toFixed(0)}%`} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={v => [fmtPct(v), 'YoC']} />
                <Line type="monotone" dataKey="yoc" stroke="var(--positive)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginTop: 14 }}>
              {[['Yield on cost hoy', yocToday], ['Yield on cost año 10', yocAt(10)], ['Yield on cost año 20', yocAt(20)]].map(([l, v]) => (
                <div key={l} style={{ background: 'var(--surface)', borderRadius: 8, padding: '12px 14px' }}>
                  <p style={{ fontSize: 10, color: 'var(--text-faint)', marginBottom: 4 }}>{l}</p>
                  <p style={{ fontSize: 18, fontWeight: 800, color: 'var(--positive)' }}>{fmtPct(v)}</p>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 10.5, color: 'var(--text-faintest)', marginTop: 12, lineHeight: 1.55 }}>
              El yield on cost mide la rentabilidad de tu inversión original — no del precio actual. Una empresa comprada a 50€ que hoy reparte 10€ tiene un yield on cost del 20% independientemente de a cuánto cotice hoy.
            </p>
          </>
        ) : <p style={{ fontSize: 12, color: 'var(--text-faint)' }}>Sin coste de cartera registrado para calcular el yield on cost.</p>}
      </div>

      {/* 6 · Análisis DRIP (solo si se reinvierte) */}
      {reinvest ? (
        <div style={CARD}>
          <button onClick={() => setShowDRIP(s => !s)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', width: '100%', padding: 0, alignItems: 'center' }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Análisis DRIP — efecto del reinvestido</p>
            <span style={{ color: 'var(--text-faint)', fontSize: 14 }}>{showDRIP ? '▲' : '▼'}</span>
          </button>
          {showDRIP && (
            <div style={{ marginTop: 14 }}>
              {drip.length === 0 ? (
                <p style={{ fontSize: 12, color: 'var(--text-faint)' }}>No hay posiciones con dividendo.</p>
              ) : (
                <>
                  <p style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 10 }}>Renta adicional por empresa en año 10 reinvirtiendo dividendos</p>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={drip.map(d => ({ name: d.ticker, extra: d.extraY10 }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-3)" />
                      <XAxis dataKey="name" stroke="var(--text-faint)" fontSize={10} />
                      <YAxis stroke="var(--text-faint)" fontSize={10} tickFormatter={v => `${v}€`} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} formatter={v => [fmtEUR(v), 'Extra DRIP Y10']} />
                      <Bar dataKey="extra" fill="var(--accent)" radius={[4,4,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>

                  <div style={{ overflowX: 'auto', marginTop: 14 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                      <thead>
                        <tr>
                          {['Empresa','Dividendo actual','Acc. adicionales/año','Renta extra Y1','Extra Y5','Extra Y10'].map(h => (
                            <th key={h} style={{ padding: '5px 8px', textAlign: h === 'Empresa' ? 'left' : 'right', color: 'var(--text-faint)', borderBottom: '1px solid var(--border)', fontWeight: 600 }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {drip.map((d, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid var(--surface-2)' }}>
                            <td style={{ padding: '6px 8px', color: 'var(--text)' }}>{d.name}</td>
                            <td style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--warning)' }}>{fmtEUR(d.annualDiv)}</td>
                            <td style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--text-muted)' }}>{d.addSharesY1.toFixed(4)}</td>
                            <td style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--positive)' }}>+{fmtEUR(d.addIncomeY1)}</td>
                            <td style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--accent)' }}>+{fmtEUR(d.extraY5)}</td>
                            <td style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--accent)', fontWeight: 700 }}>+{fmtEUR(d.extraY10)}</td>
                          </tr>
                        ))}
                        <tr style={{ borderTop: '1px solid var(--border-strong)' }}>
                          <td colSpan={3} style={{ padding: '6px 8px', fontWeight: 700, color: 'var(--text)' }}>Total cartera</td>
                          <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, color: 'var(--positive)' }}>+{fmtEUR(drip.reduce((s,d)=>s+d.addIncomeY1,0))}</td>
                          <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, color: 'var(--accent)' }}>+{fmtEUR(drip.reduce((s,d)=>s+d.extraY5,0))}</td>
                          <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, color: 'var(--accent)' }}>+{fmtEUR(drip.reduce((s,d)=>s+d.extraY10,0))}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <p style={{ fontSize: 10, color: 'var(--text-faintest)', marginTop: 8 }}>
                    Los cálculos asumen reinversión al precio actual y crecimiento del CAGR histórico de cada empresa.
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      ) : (
        <div style={{ ...CARD, textAlign: 'center' }}>
          <p style={{ fontSize: 12, color: 'var(--text-faint)' }}>Activa <b style={{ color: 'var(--text-muted)' }}>Reinvertir dividendos</b> en los parámetros para ver el análisis DRIP.</p>
        </div>
      )}

      {/* Independencia financiera — antes en /cartera/simulador */}
      <FISimulator isPremium={isPremium} />
    </div>
  )
}
