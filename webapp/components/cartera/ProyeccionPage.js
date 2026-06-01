'use client'
import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { createClient } from '@/lib/supabase/client'
import { enrichPositions, calcSummary } from '@/lib/portfolio'
import { projectIncome, calcDRIP } from '@/lib/portfolio-calc'
import { monthlyEquivalent } from '@/lib/recurring'

const CARD  = { background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 20 }
const SLIDER_WRAP = { display: 'flex', flexDirection: 'column', gap: 6 }
const LABEL = { fontSize: 11, color: '#4a5270' }

function fmtEUR(v) {
  if (v == null) return '—'
  return v.toLocaleString('es-ES', { maximumFractionDigits: 0 }) + ' €'
}

function Slider({ label, value, min, max, step = 1, onChange, format }) {
  return (
    <div style={SLIDER_WRAP}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={LABEL}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#818cf8' }}>{format ? format(value) : value}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width: '100%', accentColor: '#818cf8' }}
      />
    </div>
  )
}

function PremiumWall() {
  return (
    <div style={{ textAlign: 'center', padding: '60px 20px' }}>
      <p style={{ fontSize: 18, fontWeight: 700, color: '#818cf8', marginBottom: 8 }}>Proyección — solo Premium</p>
      <p style={{ fontSize: 13, color: '#4a5270', marginBottom: 20, maxWidth: 380, margin: '0 auto 20px' }}>
        Accede a la proyección personalizada con CAGR real de cada empresa, tres escenarios y análisis DRIP.
      </p>
      <Link href="/pricing" style={{ padding: '10px 22px', background: 'rgba(99,102,241,0.85)', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
        Activar Premium →
      </Link>
    </div>
  )
}

const TOOLTIP_STYLE = { background: '#10172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11 }

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
    const e = enrichPositions(positions, fundMap, fundsMap)
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

  const keyYears = [5, 10, 15, 20, horizon].filter((y, i, a) => y <= horizon && a.indexOf(y) === i)

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#4a5270' }}>Cargando…</div>

  if (!enriched.length) return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '40px 16px', textAlign: 'center' }}>
      <p style={{ color: '#4a5270', marginBottom: 16 }}>Añade posiciones a tu cartera para ver la proyección.</p>
      <Link href="/cartera" style={{ color: '#818cf8', fontSize: 13 }}>← Ir a la cartera</Link>
    </div>
  )

  if (!isPremium) return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 16px' }}><PremiumWall /></div>
  )

  const baseAtHorizon = proj?.base[horizon - 1]?.income ?? 0

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 16px 64px' }}>
      {/* Headline */}
      <div style={{ ...CARD, marginBottom: 16, background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)' }}>
        <p style={{ fontSize: 13, color: '#818cf8', marginBottom: 4 }}>Escenario base</p>
        <p style={{ fontSize: 22, fontWeight: 900, color: '#c8d0e0' }}>
          Cobrarás <span style={{ color: '#34d399' }}>{fmtEUR(Math.round(baseAtHorizon / 12))}/mes</span> en dividendos en el año {horizon}
        </p>
        <p style={{ fontSize: 11, color: '#4a5270', marginTop: 4 }}>
          Renta anual estimada: {fmtEUR(baseAtHorizon)} · Hoy: {fmtEUR(summary?.totalIncomeEUR)}
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 16, marginBottom: 16 }}>
        {/* Chart */}
        <div style={CARD}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#4a5270', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16 }}>
            Proyección de renta anual
          </p>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="year" stroke="#4a5270" fontSize={10} tickLine={false} label={{ value: 'Año', position: 'insideBottom', offset: -2, fontSize: 10, fill: '#4a5270' }} />
              <YAxis stroke="#4a5270" fontSize={10} tickLine={false} tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}K` : v} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={v => [fmtEUR(v), '']} />
              <Legend wrapperStyle={{ fontSize: 11, color: '#8090a8' }} />
              {rentaObjetivo > 0 && (
                <Area type="monotone" dataKey="objetivo" stroke="#fbbf24" strokeDasharray="5 5" fill="none" data={chartData.map(d => ({ ...d, objetivo: rentaObjetivo }))} />
              )}
              <Area type="monotone" dataKey="conservative" name="Conservador" stroke="#f87171" fill="rgba(248,113,113,0.08)" strokeWidth={1.5} dot={false} />
              <Area type="monotone" dataKey="base"         name="Base"        stroke="#34d399" fill="rgba(52,211,153,0.12)" strokeWidth={2}   dot={false} />
              <Area type="monotone" dataKey="optimistic"   name="Optimista"   stroke="#818cf8" fill="rgba(129,140,248,0.08)" strokeWidth={1.5} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Controls */}
        <div style={{ ...CARD, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#4a5270', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Parámetros</p>
          {recurringMonthly > 0 && (
            <div style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 8, padding: '10px 12px', fontSize: 11 }}>
              <p style={{ color: '#818cf8', fontWeight: 700, marginBottom: 4 }}>Aportaciones combinadas (al mes)</p>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#8090a8' }}><span>⚡ Periódicas a ETFs/fondos</span><span style={{ color: '#a78bfa', fontWeight: 700 }}>{recurringMonthly.toFixed(0)} €</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#8090a8' }}><span>Extra (slider)</span><span style={{ color: '#c8d0e0', fontWeight: 700 }}>{monthly} €</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#8090a8', marginTop: 4, paddingTop: 4, borderTop: '1px solid rgba(255,255,255,0.06)' }}><span>Total</span><span style={{ color: '#34d399', fontWeight: 700 }}>{(recurringMonthly + monthly).toFixed(0)} €</span></div>
            </div>
          )}
          <Slider label="Horizonte" value={horizon} min={5} max={40} onChange={setHorizon} format={v => `${v} años`} />
          <Slider label="Aportación mensual extra" value={monthly} min={0} max={5000} step={50} onChange={setMonthly} format={v => `${v} €`} />
          <Slider label="Crecim. aportación/año" value={monthlyGrowth} min={0} max={10} step={0.5} onChange={setMonthlyGrowth} format={v => `${v}%`} />
          <Slider label="Retención fiscal" value={taxRate} min={0} max={35} onChange={setTaxRate} format={v => `${v}%`} />
          <Slider label="Renta objetivo/año (€)" value={rentaObjetivo} min={0} max={60000} step={500} onChange={setRentaObjetivo} format={v => v > 0 ? fmtEUR(v) : 'Sin objetivo'} />
          {/* Toggle reinvest */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={LABEL}>Reinvertir dividendos</span>
            <button onClick={() => setReinvest(r => !r)} style={{
              width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
              background: reinvest ? 'rgba(52,211,153,0.7)' : 'rgba(255,255,255,0.1)',
              position: 'relative', transition: 'background 0.2s',
            }}>
              <span style={{ position: 'absolute', top: 3, left: reinvest ? 22 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
            </button>
          </div>
        </div>
      </div>

      {/* Key years table */}
      <div style={{ ...CARD, marginBottom: 16 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: '#4a5270', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Valores en años clave</p>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                {['Año','Conservador','Base','Optimista'].map(h => (
                  <th key={h} style={{ padding: '6px 8px', textAlign: h === 'Año' ? 'left' : 'right', color: '#4a5270', borderBottom: '1px solid rgba(255,255,255,0.06)', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {keyYears.filter(y => y <= horizon).map(y => (
                <tr key={y} style={{ background: y === horizon ? 'rgba(99,102,241,0.05)' : 'transparent' }}>
                  <td style={{ padding: '7px 8px', color: '#8090a8', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>Año {y}</td>
                  <td style={{ padding: '7px 8px', textAlign: 'right', color: '#f87171', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>{fmtEUR(proj?.conservative[y - 1]?.income)}</td>
                  <td style={{ padding: '7px 8px', textAlign: 'right', color: '#34d399', fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>{fmtEUR(proj?.base[y - 1]?.income)}</td>
                  <td style={{ padding: '7px 8px', textAlign: 'right', color: '#818cf8', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>{fmtEUR(proj?.optimistic[y - 1]?.income)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* DRIP section */}
      <div style={CARD}>
        <button onClick={() => setShowDRIP(s => !s)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', width: '100%', padding: 0, alignItems: 'center' }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#4a5270', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Análisis DRIP — efecto del reinvestido</p>
          <span style={{ color: '#4a5270', fontSize: 14 }}>{showDRIP ? '▲' : '▼'}</span>
        </button>
        {showDRIP && (
          <div style={{ marginTop: 14 }}>
            {drip.length === 0 ? (
              <p style={{ fontSize: 12, color: '#4a5270' }}>No hay posiciones con dividendo.</p>
            ) : (
              <>
                {/* Bar chart — extra income at Y10 */}
                <p style={{ fontSize: 11, color: '#4a5270', marginBottom: 10 }}>Renta adicional por empresa en año 10 reinvirtiendo dividendos</p>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={drip.map(d => ({ name: d.ticker, extra: d.extraY10 }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="name" stroke="#4a5270" fontSize={10} />
                    <YAxis stroke="#4a5270" fontSize={10} tickFormatter={v => `${v}€`} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} formatter={v => [fmtEUR(v), 'Extra DRIP Y10']} />
                    <Bar dataKey="extra" fill="#818cf8" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>

                <div style={{ overflowX: 'auto', marginTop: 14 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                    <thead>
                      <tr>
                        {['Empresa','Dividendo actual','Acc. adicionales/año','Renta extra Y1','Extra Y5','Extra Y10'].map(h => (
                          <th key={h} style={{ padding: '5px 8px', textAlign: h === 'Empresa' ? 'left' : 'right', color: '#4a5270', borderBottom: '1px solid rgba(255,255,255,0.06)', fontWeight: 600 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {drip.map((d, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          <td style={{ padding: '6px 8px', color: '#c8d0e0' }}>{d.name}</td>
                          <td style={{ padding: '6px 8px', textAlign: 'right', color: '#fbbf24' }}>{fmtEUR(d.annualDiv)}</td>
                          <td style={{ padding: '6px 8px', textAlign: 'right', color: '#8090a8' }}>{d.addSharesY1.toFixed(4)}</td>
                          <td style={{ padding: '6px 8px', textAlign: 'right', color: '#34d399' }}>+{fmtEUR(d.addIncomeY1)}</td>
                          <td style={{ padding: '6px 8px', textAlign: 'right', color: '#818cf8' }}>+{fmtEUR(d.extraY5)}</td>
                          <td style={{ padding: '6px 8px', textAlign: 'right', color: '#818cf8', fontWeight: 700 }}>+{fmtEUR(d.extraY10)}</td>
                        </tr>
                      ))}
                      <tr style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                        <td colSpan={3} style={{ padding: '6px 8px', fontWeight: 700, color: '#c8d0e0' }}>Total cartera</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, color: '#34d399' }}>+{fmtEUR(drip.reduce((s,d)=>s+d.addIncomeY1,0))}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, color: '#818cf8' }}>+{fmtEUR(drip.reduce((s,d)=>s+d.extraY5,0))}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, color: '#818cf8' }}>+{fmtEUR(drip.reduce((s,d)=>s+d.extraY10,0))}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p style={{ fontSize: 10, color: '#2e3a55', marginTop: 8 }}>
                  Los cálculos asumen reinversión al precio actual y crecimiento del CAGR histórico de cada empresa.
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
