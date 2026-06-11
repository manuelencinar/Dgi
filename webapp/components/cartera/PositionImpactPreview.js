'use client'
import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { enrichPositions, calcSummary, toEUR } from '@/lib/portfolio'

const CARD = { background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(129,140,248,0.18)', borderRadius: 12, padding: 16 }

function fmtEUR(v) { return v != null ? v.toLocaleString('es-ES', { maximumFractionDigits: 0 }) + ' €' : '—' }
function fmtPct(v) { return v != null ? v.toFixed(1) + '%' : '—' }

// Previsualización del impacto de añadir una posición — antes era la pestaña
// "Añadir posición" del simulador. Ahora acompaña al formulario de alta.
// Carga la cartera del usuario una vez y el dividendo de la candidata bajo demanda.
export default function PositionImpactPreview({ ticker, name, currency, shares, price, type = 'buy' }) {
  const [enriched, setEnriched] = useState([])
  const [cand,     setCand]     = useState(null)   // fundamentales de la candidata
  const sb = useMemo(() => createClient(), [])

  // Cartera del usuario (una sola vez)
  useEffect(() => {
    let active = true
    ;(async () => {
      const { data: { user } } = await sb.auth.getUser()
      if (!user) return
      const { data: positions } = await sb.from('positions').select('*').eq('user_id', user.id)
      if (!positions?.length) { if (active) setEnriched([]); return }
      const tks = [...new Set(positions.map(p => p.ticker))]
      const { data: funds } = await sb.from('company_fundamentals')
        .select('ticker,current_price,dps,sector').in('ticker', tks)
      const fundMap = Object.fromEntries((funds || []).map(f => [f.ticker, f]))
      if (active) setEnriched(enrichPositions(positions, fundMap))
    })()
    return () => { active = false }
  }, [sb])

  // Fundamentales de la candidata
  useEffect(() => {
    if (!ticker) { setCand(null); return }
    let active = true
    ;(async () => {
      const { data } = await sb.from('company_fundamentals')
        .select('ticker,dps,sector').eq('ticker', ticker).maybeSingle()
      if (active) setCand(data)
    })()
    return () => { active = false }
  }, [ticker, sb])

  const summary = useMemo(() => calcSummary(enriched), [enriched])

  const sim = useMemo(() => {
    const sh = parseFloat(shares), pr = parseFloat(price)
    if (type !== 'buy' || !ticker || !sh || !pr || sh <= 0 || pr <= 0) return null
    const dps = cand?.dps || 0
    const addedIncome = toEUR(dps * sh, currency)
    const addedValue  = toEUR(pr * sh, currency)
    const newTotalIncome = (summary.totalIncomeEUR || 0) + addedIncome
    const newTotalValue  = (summary.totalValueEUR  || 0) + addedValue
    const newTotalCost   = (summary.totalCostEUR   || 0) + addedValue
    const oldYoC = summary.yieldOnCost
    const newYoC = newTotalCost > 0 ? newTotalIncome / newTotalCost * 100 : null
    const newWeight = newTotalValue > 0 ? addedValue / newTotalValue * 100 : 0

    // Concentración sectorial tras la compra
    const sector = cand?.sector || '—'
    const sectors = {}
    enriched.forEach(p => { sectors[p.sector || '—'] = (sectors[p.sector || '—'] || 0) + (p.valueEUR || 0) })
    sectors[sector] = (sectors[sector] || 0) + addedValue
    const maxSectorPct = newTotalValue > 0 ? Math.max(...Object.values(sectors)) / newTotalValue * 100 : 0
    const divNote = maxSectorPct > 30 ? `Aumenta la concentración en ${sector}` : 'Mejora la diversificación sectorial'

    return { addedIncome, newTotalIncome, oldYoC, newYoC, newWeight, divNote, sector,
      incomePct: summary.totalIncomeEUR > 0 ? addedIncome / summary.totalIncomeEUR * 100 : null }
  }, [type, ticker, shares, price, currency, cand, summary, enriched])

  if (!sim) return null

  const rows = [
    { label: 'Renta anual adicional', value: `+${fmtEUR(sim.addedIncome)}`, sub: sim.incomePct != null ? `+${fmtPct(sim.incomePct)} sobre tu renta actual` : null, col: '#34d399' },
    { label: 'Nueva renta anual total', value: fmtEUR(sim.newTotalIncome), col: '#c8d0e0' },
    { label: 'Yield on cost', value: `${fmtPct(sim.oldYoC)} → ${fmtPct(sim.newYoC)}`, col: '#818cf8' },
    { label: 'Peso de la nueva posición', value: fmtPct(sim.newWeight), col: sim.newWeight > 20 ? '#f87171' : '#fbbf24' },
    { label: 'Diversificación sectorial', value: sim.divNote, col: '#8090a8', small: true },
  ]

  return (
    <div style={{ ...CARD, marginTop: 14 }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: '#818cf8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
        Impacto en tu cartera{name ? ` · ${name}` : ''}
      </p>
      <div style={{ display: 'grid', gap: 8 }}>
        {rows.map(it => (
          <div key={it.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <span style={{ fontSize: 11, color: '#4a5270' }}>{it.label}</span>
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: it.small ? 11 : 13, fontWeight: 700, color: it.col }}>{it.value}</span>
              {it.sub && <p style={{ fontSize: 10, color: it.col }}>{it.sub}</p>}
            </div>
          </div>
        ))}
      </div>
      {!cand?.dps && (
        <p style={{ fontSize: 10, color: '#3a4260', marginTop: 8 }}>Sin datos de dividendo para esta empresa — el impacto en renta puede ser 0.</p>
      )}
    </div>
  )
}
