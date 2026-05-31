'use client'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend } from 'recharts'
import { createClient } from '@/lib/supabase/client'
import { enrichPositions, calcSummary, toEUR } from '@/lib/portfolio'
import { calcFI } from '@/lib/portfolio-calc'
import { DICT } from '@/data/dict'

const CARD     = { background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 20 }
const INPUT    = { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '9px 12px', color: '#c8d0e0', fontSize: 13, outline: 'none', boxSizing: 'border-box' }
const TT_STYLE = { background: '#10172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11 }

function fmtEUR(v) { return v != null ? v.toLocaleString('es-ES', { maximumFractionDigits: 0 }) + ' €' : '—' }
function fmtPct(v) { return v != null ? v.toFixed(1) + '%' : '—' }

function Slider({ label, value, min, max, step = 1, onChange, format }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, color: '#4a5270' }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#818cf8' }}>{format ? format(value) : value}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width: '100%', accentColor: '#818cf8' }}
      />
    </div>
  )
}

function Toggle({ value, onChange, label }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: 11, color: '#4a5270' }}>{label}</span>
      <button onClick={() => onChange(!value)} style={{
        width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
        background: value ? 'rgba(52,211,153,0.7)' : 'rgba(255,255,255,0.1)', position: 'relative',
      }}>
        <span style={{ position: 'absolute', top: 3, left: value ? 22 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
      </button>
    </div>
  )
}

function PremiumWall() {
  return (
    <div style={{ textAlign: 'center', padding: '60px 20px' }}>
      <p style={{ fontSize: 18, fontWeight: 700, color: '#818cf8', marginBottom: 8 }}>Simulador — solo Premium</p>
      <p style={{ fontSize: 13, color: '#4a5270', marginBottom: 20, maxWidth: 380, margin: '0 auto 20px' }}>
        Simula añadir posiciones, impacto de recortes y calcula tu independencia financiera.
      </p>
      <Link href="/pricing" style={{ padding: '10px 22px', background: 'rgba(99,102,241,0.85)', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
        Activar Premium →
      </Link>
    </div>
  )
}

// ── Tab 1: Añadir posición ─────────────────────────────────────────────────
function TabAddPosition({ enriched, summary }) {
  const [query,    setQuery]    = useState('')
  const [results,  setResults]  = useState([])
  const [selected, setSelected] = useState(null)
  const [newFund,  setNewFund]  = useState(null)
  const [shares,   setShares]   = useState(100)
  const [price,    setPrice]    = useState(0)
  const sb = createClient()

  const search = useCallback((q) => {
    setQuery(q)
    if (!q.trim()) { setResults([]); return }
    const l = q.toLowerCase()
    setResults(DICT.filter(d => d[0].toLowerCase().includes(l) || d[1].toLowerCase().includes(l)).slice(0, 6).map(d => ({ ticker: d[1], name: d[0], currency: d[3] })))
  }, [])

  const selectCompany = async (item) => {
    setSelected(item)
    setQuery(item.name)
    setResults([])
    const { data } = await sb.from('company_fundamentals')
      .select('ticker,current_price,dps,div_cagr5,sector,payout_fcf,debt_ebitda,interest_coverage,fcf_cagr5,industry,country')
      .eq('ticker', item.ticker).maybeSingle()
    setNewFund(data)
    setPrice(data?.current_price ?? 0)
  }

  const simulation = useMemo(() => {
    if (!selected || !shares || !price || !newFund) return null

    const currency = selected.currency
    const dps = newFund.dps || 0
    const addedIncomeEUR = toEUR(dps * shares, currency)
    const addedValueEUR  = toEUR(price * shares, currency)
    const newTotalIncome = (summary.totalIncomeEUR || 0) + addedIncomeEUR
    const newTotalValue  = (summary.totalValueEUR  || 0) + addedValueEUR
    const newTotalCost   = (summary.totalCostEUR   || 0) + toEUR(price * shares, currency)

    const oldYoC = summary.yieldOnCost
    const newYoC = newTotalCost > 0 ? newTotalIncome / newTotalCost * 100 : null

    const oldPositions = enriched.length
    const newWeight    = newTotalValue > 0 ? addedValueEUR / newTotalValue * 100 : 0

    // Sector change
    const sector = newFund.sector || '—'
    const sectors = {}
    enriched.forEach(p => { sectors[p.sector || '—'] = (sectors[p.sector || '—'] || 0) + (p.valueEUR || 0) })
    sectors[sector] = (sectors[sector] || 0) + addedValueEUR
    const maxSectorPct = newTotalValue > 0 ? Math.max(...Object.values(sectors)) / newTotalValue * 100 : 0
    const divConc = maxSectorPct > 30 ? 'Aumenta la concentración en ' + sector : 'Mejora la diversificación sectorial'

    return {
      addedIncomeEUR, incomeChangePct: summary.totalIncomeEUR > 0 ? addedIncomeEUR / summary.totalIncomeEUR * 100 : null,
      newTotalIncome, oldYoC, newYoC,
      newWeight, divConc, sector,
    }
  }, [selected, shares, price, newFund, enriched, summary])

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ position: 'relative' }}>
          <label style={{ fontSize: 11, color: '#4a5270', marginBottom: 4, display: 'block' }}>Empresa</label>
          <input style={{ ...INPUT, width: '100%' }} placeholder="Busca por nombre o ticker…" value={query} onChange={e => search(e.target.value)} autoComplete="off" />
          {results.length > 0 && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, background: '#10172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, marginTop: 4, overflow: 'hidden' }}>
              {results.map(r => (
                <button key={r.ticker} type="button" onClick={() => selectCompany(r)} style={{ display: 'flex', justifyContent: 'space-between', width: '100%', padding: '9px 12px', background: 'none', border: 'none', cursor: 'pointer', color: '#c8d0e0', fontSize: 12, textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <span>{r.name}</span><span style={{ color: '#4a5270' }}>{r.ticker}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div>
          <label style={{ fontSize: 11, color: '#4a5270', marginBottom: 4, display: 'block' }}>Acciones a comprar</label>
          <input style={{ ...INPUT, width: '100%' }} type="number" min="1" value={shares} onChange={e => setShares(Number(e.target.value))} />
        </div>
        <div>
          <label style={{ fontSize: 11, color: '#4a5270', marginBottom: 4, display: 'block' }}>Precio por acción {selected ? `(${selected.currency})` : ''}</label>
          <input style={{ ...INPUT, width: '100%' }} type="number" step="any" value={price} onChange={e => setPrice(Number(e.target.value))} />
        </div>
        {selected && (
          <Link href={`/cartera/nueva-posicion?ticker=${encodeURIComponent(selected.ticker)}&shares=${shares}&price=${price}`}
            style={{ padding: '10px', background: 'rgba(99,102,241,0.85)', borderRadius: 8, color: '#fff', fontSize: 12, fontWeight: 700, textDecoration: 'none', textAlign: 'center' }}>
            Añadir a cartera →
          </Link>
        )}
      </div>

      {/* Impact */}
      {simulation ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#4a5270', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Impacto estimado</p>
          {[
            { label: 'Renta anual adicional', value: `+${fmtEUR(simulation.addedIncomeEUR)}`, sub: simulation.incomeChangePct != null ? `+${fmtPct(simulation.incomeChangePct)}` : null, col: '#34d399' },
            { label: 'Nueva renta anual total', value: fmtEUR(simulation.newTotalIncome), col: '#c8d0e0' },
            { label: 'Yield on cost anterior', value: fmtPct(simulation.oldYoC), col: '#8090a8' },
            { label: 'Yield on cost nuevo', value: fmtPct(simulation.newYoC), col: '#818cf8' },
            { label: 'Peso de la nueva posición', value: fmtPct(simulation.newWeight), col: simulation.newWeight > 20 ? '#f87171' : '#fbbf24' },
            { label: 'Diversificación sectorial', value: simulation.divConc, col: '#8090a8', small: true },
          ].map(it => (
            <div key={it.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '8px 10px', background: 'rgba(255,255,255,0.02)', borderRadius: 8 }}>
              <span style={{ fontSize: 11, color: '#4a5270', maxWidth: 150 }}>{it.label}</span>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: it.small ? 11 : 14, fontWeight: 700, color: it.col }}>{it.value}</span>
                {it.sub && <p style={{ fontSize: 11, color: it.col }}>{it.sub}</p>}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2e3a55', fontSize: 13 }}>
          Selecciona una empresa para ver el impacto
        </div>
      )}
    </div>
  )
}

// ── Tab 2: Recorte de dividendo ────────────────────────────────────────────
function TabDividendCut({ enriched, summary }) {
  const [selectedTicker, setSelectedTicker] = useState('')
  const [cutPct,     setCutPct]     = useState(50)
  const [autoMode,   setAutoMode]   = useState(false)

  const selected = enriched.find(p => p.ticker === selectedTicker)
  const atRisk   = enriched.filter(p => (p.payoutFCF || 0) > 80)

  const manualImpact = useMemo(() => {
    if (!selected || !selected.annualIncomeEUR) return null
    const lost = selected.annualIncomeEUR * cutPct / 100
    const newTotal = (summary.totalIncomeEUR || 0) - lost
    const pctLost  = summary.totalIncomeEUR > 0 ? lost / summary.totalIncomeEUR * 100 : 0
    const newYoC   = summary.totalCostEUR   > 0 ? newTotal / summary.totalCostEUR * 100 : null
    return { lost, newTotal, pctLost, newYoC }
  }, [selected, cutPct, summary])

  const autoImpact = useMemo(() => {
    const totalLost = atRisk.reduce((s, p) => s + (p.annualIncomeEUR || 0) * 0.50, 0)
    const newTotal  = (summary.totalIncomeEUR || 0) - totalLost
    const pctLost   = summary.totalIncomeEUR > 0 ? totalLost / summary.totalIncomeEUR * 100 : 0
    return { totalLost, newTotal, pctLost, affected: atRisk.map(p => p.name) }
  }, [atRisk, summary])

  return (
    <div>
      <Toggle value={autoMode} onChange={setAutoMode} label="Simular recorte automático (50% en empresas con payout FCF >80%)" />

      {!autoMode ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginTop: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ fontSize: 11, color: '#4a5270', marginBottom: 6, display: 'block' }}>Empresa</label>
              <select value={selectedTicker} onChange={e => setSelectedTicker(e.target.value)} style={{ ...INPUT, width: '100%' }}>
                <option value="">Selecciona empresa…</option>
                {enriched.filter(p => p.annualIncomeEUR > 0).map(p => (
                  <option key={p.ticker} value={p.ticker}>{p.name}</option>
                ))}
              </select>
            </div>
            <Slider label="Porcentaje de recorte" value={cutPct} min={10} max={100} step={5} onChange={setCutPct} format={v => `${v}%`} />
          </div>
          {manualImpact && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#4a5270', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Impacto</p>
              {[
                { label: 'Dividendo perdido', value: `-${fmtEUR(manualImpact.lost)}`, col: '#f87171' },
                { label: 'Nueva renta anual', value: fmtEUR(manualImpact.newTotal), col: '#c8d0e0' },
                { label: '% de renta total perdida', value: `-${fmtPct(manualImpact.pctLost)}`, col: '#f87171' },
                { label: 'Nuevo yield on cost', value: fmtPct(manualImpact.newYoC), col: '#818cf8' },
              ].map(it => (
                <div key={it.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 10px', background: 'rgba(255,255,255,0.02)', borderRadius: 8 }}>
                  <span style={{ fontSize: 11, color: '#4a5270' }}>{it.label}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: it.col }}>{it.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div>
            <p style={{ fontSize: 12, color: '#fbbf24', marginBottom: 10 }}>
              {atRisk.length} empresa{atRisk.length !== 1 ? 's' : ''} con payout FCF {'>'} 80%:
            </p>
            {atRisk.map(p => (
              <div key={p.ticker} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 10px', background: 'rgba(248,113,113,0.06)', borderRadius: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: '#c8d0e0' }}>{p.name}</span>
                <span style={{ fontSize: 11, color: '#fbbf24' }}>Payout: {p.payoutFCF?.toFixed(0)}%</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#4a5270', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Impacto agregado</p>
            {[
              { label: 'Dividendo perdido total', value: `-${fmtEUR(autoImpact.totalLost)}`, col: '#f87171' },
              { label: 'Nueva renta anual', value: fmtEUR(autoImpact.newTotal), col: '#c8d0e0' },
              { label: '% de renta total perdida', value: `-${fmtPct(autoImpact.pctLost)}`, col: '#f87171' },
            ].map(it => (
              <div key={it.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 10px', background: 'rgba(255,255,255,0.02)', borderRadius: 8 }}>
                <span style={{ fontSize: 11, color: '#4a5270' }}>{it.label}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: it.col }}>{it.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Tab 3: Reinversión DRIP ────────────────────────────────────────────────
function TabDRIP({ enriched, summary }) {
  const [horizon, setHorizon] = useState(10)

  const drip = useMemo(() => enriched.filter(p => p.annualIncomeEUR > 0).map(p => {
    const priceEUR = toEUR(p.currentPrice || p.avg_cost || 1, p.currency)
    const addSharesY1 = priceEUR > 0 ? (p.annualIncomeEUR || 0) / priceEUR : 0
    const addIncomeY1 = addSharesY1 * toEUR(p.dps || 0, p.currency)
    return { ...p, addSharesY1, addIncomeY1 }
  }), [enriched])

  const chartData = useMemo(() => {
    if (!drip.length) return []
    const data = []
    let sharesMap = Object.fromEntries(drip.map(p => [p.ticker, p.shares]))
    let dpsMap    = Object.fromEntries(drip.map(p => [p.ticker, p.dps || 0]))

    for (let y = 1; y <= horizon; y++) {
      let incDrip = 0, incNoDrip = 0
      drip.forEach(p => {
        const cagr = Math.min(Math.max((p.div_cagr5 || 3) / 100, 0), 0.20)
        dpsMap[p.ticker] *= (1 + cagr)
        const divEUR = toEUR(dpsMap[p.ticker] * sharesMap[p.ticker], p.currency)
        incDrip += divEUR
        incNoDrip += toEUR(dpsMap[p.ticker] * p.shares, p.currency)
        const priceEUR = toEUR(p.currentPrice || p.avg_cost || 1, p.currency)
        if (priceEUR > 0) sharesMap[p.ticker] += divEUR / priceEUR
      })
      data.push({ year: y, drip: Math.round(incDrip), sin: Math.round(incNoDrip) })
    }
    return data
  }, [drip, horizon])

  const diff = chartData.length > 0 ? chartData[chartData.length - 1].drip - chartData[chartData.length - 1].sin : 0

  return (
    <div>
      <Slider label="Horizonte" value={horizon} min={1} max={20} onChange={setHorizon} format={v => `${v} años`} />

      <div style={{ marginTop: 16, marginBottom: 16 }}>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="year" stroke="#4a5270" fontSize={10} />
            <YAxis stroke="#4a5270" fontSize={10} tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}K` : v} />
            <Tooltip contentStyle={TT_STYLE} formatter={v => [fmtEUR(v), '']} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="drip" name="Con reinversión" stroke="#34d399" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="sin"  name="Sin reinversión" stroke="#f87171" strokeWidth={1.5} dot={false} strokeDasharray="4 4" />
          </LineChart>
        </ResponsiveContainer>
        {diff > 0 && (
          <p style={{ fontSize: 12, color: '#34d399', textAlign: 'center', marginTop: 8 }}>
            La reinversión genera <strong>{fmtEUR(diff)}</strong> más al año {horizon}
          </p>
        )}
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr>
              {['Empresa','Dividendo actual','Acc. adicionales Y1','Renta extra Y1'].map(h => (
                <th key={h} style={{ padding: '5px 8px', textAlign: h === 'Empresa' ? 'left' : 'right', color: '#4a5270', borderBottom: '1px solid rgba(255,255,255,0.06)', fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {drip.map((p, i) => (
              <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <td style={{ padding: '6px 8px', color: '#c8d0e0' }}>{p.name}</td>
                <td style={{ padding: '6px 8px', textAlign: 'right', color: '#fbbf24' }}>{fmtEUR(p.annualIncomeEUR)}</td>
                <td style={{ padding: '6px 8px', textAlign: 'right', color: '#8090a8' }}>{p.addSharesY1.toFixed(4)}</td>
                <td style={{ padding: '6px 8px', textAlign: 'right', color: '#34d399' }}>+{fmtEUR(p.addIncomeY1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── FI Simulator ───────────────────────────────────────────────────────────
function FISimulator({ enriched, summary }) {
  const [targetMonthly,    setTargetMonthly]    = useState(2000)
  const [monthlyContrib,   setMonthlyContrib]   = useState(500)
  const [contribGrowth,    setContribGrowth]    = useState(3)
  const [reinvest,         setReinvest]         = useState(true)

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

  if (!fi) return <p style={{ color: '#4a5270', fontSize: 13 }}>Añade posiciones para simular la independencia financiera.</p>

  const yearsToFI = fi.base.yearsToFI
  const targetYear = yearsToFI ? new Date().getFullYear() + yearsToFI : null

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      {/* Headline */}
      <div style={{ ...CARD, background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)', textAlign: 'center' }}>
        {yearsToFI ? (
          <>
            <p style={{ fontSize: 13, color: '#818cf8', marginBottom: 6 }}>Con el escenario base</p>
            <p style={{ fontSize: 36, fontWeight: 900, color: '#c8d0e0' }}>Faltan <span style={{ color: '#34d399' }}>{yearsToFI} años</span></p>
            <p style={{ fontSize: 13, color: '#4a5270', marginTop: 4 }}>para tu independencia financiera · Año estimado: {targetYear}</p>
          </>
        ) : (
          <p style={{ fontSize: 16, color: '#4a5270' }}>Define un objetivo de renta mensual para calcular</p>
        )}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 20, marginTop: 12, flexWrap: 'wrap' }}>
          {fi.capitalNeeded && <div><p style={{ fontSize: 10, color: '#4a5270' }}>Capital necesario</p><p style={{ fontWeight: 700, color: '#c8d0e0' }}>{fmtEUR(fi.capitalNeeded)}</p></div>}
          <div><p style={{ fontSize: 10, color: '#4a5270' }}>Capital actual</p><p style={{ fontWeight: 700, color: '#818cf8' }}>{fmtEUR(fi.capitalCurrent)}</p></div>
          {fi.capitalNeeded && <div><p style={{ fontSize: 10, color: '#4a5270' }}>Brecha</p><p style={{ fontWeight: 700, color: '#f87171' }}>{fmtEUR(Math.max(0, fi.capitalNeeded - fi.capitalCurrent))}</p></div>}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 260px', gap: 16 }}>
        {/* Chart */}
        <div style={CARD}>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="year" stroke="#4a5270" fontSize={10} label={{ value: 'Año', position: 'insideBottom', offset: -2, fontSize: 10, fill: '#4a5270' }} />
              <YAxis stroke="#4a5270" fontSize={10} tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}K€` : v + '€'} />
              <Tooltip contentStyle={TT_STYLE} formatter={v => [fmtEUR(v), '']} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <ReferenceLine y={fi.targetAnnual} stroke="#fbbf24" strokeDasharray="5 5" label={{ value: 'Objetivo', fontSize: 10, fill: '#fbbf24', position: 'right' }} />
              <Line type="monotone" dataKey="conservative" name="Conservador" stroke="#f87171" strokeWidth={1.5} dot={false} />
              <Line type="monotone" dataKey="base"         name="Base"        stroke="#34d399" strokeWidth={2}   dot={false} />
              <Line type="monotone" dataKey="optimistic"   name="Optimista"   stroke="#818cf8" strokeWidth={1.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 8, flexWrap: 'wrap' }}>
            {[
              { label: 'Conservador', years: fi.conservative.yearsToFI, col: '#f87171' },
              { label: 'Base', years: fi.base.yearsToFI, col: '#34d399' },
              { label: 'Optimista', years: fi.optimistic.yearsToFI, col: '#818cf8' },
            ].map(s => (
              <div key={s.label} style={{ textAlign: 'center' }}>
                <p style={{ fontSize: 10, color: '#4a5270' }}>{s.label}</p>
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
  )
}

// ── Main ──────────────────────────────────────────────────────────────────
export default function SimuladorPage({ isPremium }) {
  const router  = useRouter()
  const [enriched, setEnriched] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [tab, setTab]           = useState('add')

  const summary = useMemo(() => calcSummary(enriched), [enriched])

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
      .select('ticker,current_price,dps,div_cagr5,payout_fcf,debt_ebitda,interest_coverage,fcf_cagr5,sector,industry,country')
      .in('ticker', tickers)

    const fundMap = Object.fromEntries((funds || []).map(f => [f.ticker, f]))
    setEnriched(enrichPositions(positions, fundMap))
    setLoading(false)
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#4a5270' }}>Cargando…</div>

  if (!enriched.length) return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '40px 16px', textAlign: 'center' }}>
      <p style={{ color: '#4a5270', marginBottom: 16 }}>Añade posiciones para usar el simulador.</p>
      <Link href="/cartera" style={{ color: '#818cf8', fontSize: 13 }}>← Ir a la cartera</Link>
    </div>
  )

  if (!isPremium) return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 16px' }}><PremiumWall /></div>
  )

  const TABS = [
    { key: 'add',   label: 'Añadir posición' },
    { key: 'cut',   label: 'Recorte dividendo' },
    { key: 'drip',  label: 'Reinversión DRIP' },
    { key: 'fi',    label: '🎯 Independencia financiera' },
  ]

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 16px 64px' }}>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '7px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: tab === t.key ? 700 : 500,
            background: tab === t.key ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.04)',
            color: tab === t.key ? '#818cf8' : '#4a5270',
          }}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={CARD}>
        {tab === 'add'  && <TabAddPosition enriched={enriched} summary={summary} />}
        {tab === 'cut'  && <TabDividendCut enriched={enriched} summary={summary} />}
        {tab === 'drip' && <TabDRIP enriched={enriched} summary={summary} />}
        {tab === 'fi'   && <FISimulator enriched={enriched} summary={summary} />}
      </div>
    </div>
  )
}
