'use client'
import { useState, useEffect, useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend } from 'recharts'
import { createClient } from '@/lib/supabase/client'
import { enrichPositions, calcSummary } from '@/lib/portfolio'
import { calcFI } from '@/lib/portfolio-calc'

const CARD     = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }
const TT_STYLE = { background: 'var(--bg-elev)', border: '1px solid var(--border-strong)', borderRadius: 8, fontSize: 11 }

function fmtEUR(v) { return v != null ? v.toLocaleString('es-ES', { maximumFractionDigits: 0 }) + ' €' : '—' }

function Slider({ label, value, min, max, step = 1, onChange, format }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>{format ? format(value) : value}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width: '100%', accentColor: 'var(--accent)' }}
      />
    </div>
  )
}

function Toggle({ value, onChange, label }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{label}</span>
      <button type="button" onClick={() => onChange(!value)} style={{
        width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
        background: value ? 'rgba(52,211,153,0.7)' : 'var(--border-strong)', position: 'relative',
      }}>
        <span style={{ position: 'absolute', top: 3, left: value ? 22 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
      </button>
    </div>
  )
}

// Simulador de independencia financiera — antes vivía en /cartera/simulador.
// Se cargó aquí (Proyección) al disolver el simulador. Carga su propia cartera.
export default function FISimulator({ isPremium }) {
  const [enriched, setEnriched] = useState([])
  const [loading,  setLoading]  = useState(true)

  const [targetMonthly,  setTargetMonthly]  = useState(2000)
  const [monthlyContrib, setMonthlyContrib] = useState(500)
  const [contribGrowth,  setContribGrowth]  = useState(3)
  const [reinvest,       setReinvest]       = useState(true)

  const summary = useMemo(() => calcSummary(enriched), [enriched])

  useEffect(() => { load() }, [])

  const load = async () => {
    const sb = createClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data: positions } = await sb.from('positions').select('*').eq('user_id', user.id)
    if (!positions?.length) { setEnriched([]); setLoading(false); return }
    const tickers = [...new Set(positions.map(p => p.ticker))]
    const { data: funds } = await sb.from('company_fundamentals')
      .select('ticker,current_price,dps,div_cagr5,fcf_cagr5,sector,country').in('ticker', tickers)
    const fundMap = Object.fromEntries((funds || []).map(f => [f.ticker, f]))
    setEnriched(enrichPositions(positions, fundMap))
    setLoading(false)
  }

  const fi = useMemo(() =>
    calcFI(enriched, summary, { targetMonthly, monthlyContrib, contribGrowthPct: contribGrowth, reinvest }),
    [enriched, summary, targetMonthly, monthlyContrib, contribGrowth, reinvest]
  )

  const chartData = useMemo(() => {
    if (!fi) return []
    const maxY = Math.max(fi.base.yearsToFI ?? 50, fi.conservative.yearsToFI ?? 50) + 5
    return fi.base.trajectory.slice(0, maxY).map((b, i) => ({
      year: b.year,
      base: b.income,
      conservative: fi.conservative.trajectory[i]?.income ?? null,
      optimistic:   fi.optimistic.trajectory[i]?.income ?? null,
    }))
  }, [fi])

  if (isPremium === false) return null
  if (loading) return null
  if (!enriched.length || !fi) return null

  const yearsToFI = fi.base.yearsToFI
  const targetYear = yearsToFI ? new Date().getFullYear() + yearsToFI : null

  return (
    <div style={{ ...CARD, marginTop: 16 }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>🎯 Independencia financiera</p>
      <p style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 16 }}>¿Cuántos años faltan para vivir de tus dividendos? Ajusta tu objetivo y tus aportaciones.</p>

      <div style={{ display: 'grid', gap: 16 }}>
        {/* Headline */}
        <div style={{ ...CARD, background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)', textAlign: 'center' }}>
          {yearsToFI ? (
            <>
              <p style={{ fontSize: 13, color: 'var(--accent)', marginBottom: 6 }}>Con el escenario base</p>
              <p style={{ fontSize: 36, fontWeight: 900, color: 'var(--text)' }}>Faltan <span style={{ color: 'var(--positive)' }}>{yearsToFI} años</span></p>
              <p style={{ fontSize: 13, color: 'var(--text-faint)', marginTop: 4 }}>para tu independencia financiera · Año estimado: {targetYear}</p>
            </>
          ) : (
            <p style={{ fontSize: 16, color: 'var(--text-faint)' }}>Define un objetivo de renta mensual para calcular</p>
          )}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 20, marginTop: 12, flexWrap: 'wrap' }}>
            {fi.capitalNeeded && <div><p style={{ fontSize: 10, color: 'var(--text-faint)' }}>Capital necesario</p><p style={{ fontWeight: 700, color: 'var(--text)' }}>{fmtEUR(fi.capitalNeeded)}</p></div>}
            <div><p style={{ fontSize: 10, color: 'var(--text-faint)' }}>Capital actual</p><p style={{ fontWeight: 700, color: 'var(--accent)' }}>{fmtEUR(fi.capitalCurrent)}</p></div>
            {fi.capitalNeeded && <div><p style={{ fontSize: 10, color: 'var(--text-faint)' }}>Brecha</p><p style={{ fontWeight: 700, color: 'var(--negative)' }}>{fmtEUR(Math.max(0, fi.capitalNeeded - fi.capitalCurrent))}</p></div>}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 260px', gap: 16 }}>
          <style>{`@media(max-width:760px){.fi-grid{grid-template-columns:1fr!important}}`}</style>
          {/* Chart */}
          <div style={CARD}>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-3)" />
                <XAxis dataKey="year" stroke="var(--text-faint)" fontSize={10} label={{ value: 'Año', position: 'insideBottom', offset: -2, fontSize: 10, fill: 'var(--text-faint)' }} />
                <YAxis stroke="var(--text-faint)" fontSize={10} tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}K€` : v + '€'} />
                <Tooltip contentStyle={TT_STYLE} formatter={v => [fmtEUR(v), '']} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <ReferenceLine y={fi.targetAnnual} stroke="var(--warning)" strokeDasharray="5 5" label={{ value: 'Objetivo', fontSize: 10, fill: 'var(--warning)', position: 'right' }} />
                <Line type="monotone" dataKey="conservative" name="Conservador" stroke="var(--negative)" strokeWidth={1.5} dot={false} />
                <Line type="monotone" dataKey="base"         name="Base"        stroke="var(--positive)" strokeWidth={2}   dot={false} />
                <Line type="monotone" dataKey="optimistic"   name="Optimista"   stroke="var(--accent)" strokeWidth={1.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 8, flexWrap: 'wrap' }}>
              {[
                { label: 'Conservador', years: fi.conservative.yearsToFI, col: 'var(--negative)' },
                { label: 'Base', years: fi.base.yearsToFI, col: 'var(--positive)' },
                { label: 'Optimista', years: fi.optimistic.yearsToFI, col: 'var(--accent)' },
              ].map(s => (
                <div key={s.label} style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: 10, color: 'var(--text-faint)' }}>{s.label}</p>
                  <p style={{ fontSize: 16, fontWeight: 800, color: s.col }}>{s.years ? `${s.years}a` : '>50a'}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Controls */}
          <div style={{ ...CARD, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Slider label="Renta mensual objetivo" value={targetMonthly} min={500} max={10000} step={100} onChange={setTargetMonthly} format={v => `${v} €`} />
            <Slider label="Aportación mensual" value={monthlyContrib} min={0} max={5000} step={50} onChange={setMonthlyContrib} format={v => `${v} €`} />
            <Slider label="Crecim. aportación/año" value={contribGrowth} min={0} max={10} step={0.5} onChange={setContribGrowth} format={v => `${v}%`} />
            <Toggle value={reinvest} onChange={setReinvest} label="Reinvertir dividendos" />
          </div>
        </div>
      </div>
    </div>
  )
}
