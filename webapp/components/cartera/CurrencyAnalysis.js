'use client'
import { useState, useEffect, useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { createClient } from '@/lib/supabase/client'

const CARD    = { background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 20, marginBottom: 16 }
const COLORS  = ['#818cf8','#34d399','#fbbf24','#f87171','#60a5fa','#a78bfa','#fb923c']
const TT_STYLE = { background: '#10172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11 }

function fmt(v, d = 2) { return v == null || isNaN(v) ? '—' : v.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d }) }
function fmtEUR(v) { return v == null ? '—' : v.toLocaleString('es-ES', { maximumFractionDigits: 0 }) + ' €' }

export default function CurrencyAnalysis({ enriched, isPremium }) {
  const [impact,   setImpact]   = useState(0)   // -30 to +30
  const [history,  setHistory]  = useState({})   // { USD: [{month, rate}] }
  const sb = createClient()

  // Agrupar posiciones por divisa (excluir EUR)
  const byCurrency = useMemo(() => {
    const map = {}
    enriched.forEach(p => {
      const cur = p.currency || 'EUR'
      if (cur === 'EUR') return
      if (!map[cur]) map[cur] = { currency: cur, valueEUR: 0, incomeEUR: 0, positions: [] }
      map[cur].valueEUR  += p.valueEUR  ?? 0
      map[cur].incomeEUR += p.annualIncomeEUR ?? 0
      map[cur].positions.push(p.name || p.ticker)
    })
    return Object.values(map).sort((a, b) => b.valueEUR - a.valueEUR)
  }, [enriched])

  const totalFxValueEUR  = useMemo(() => byCurrency.reduce((s, c) => s + c.valueEUR, 0), [byCurrency])
  const totalFxIncomeEUR = useMemo(() => byCurrency.reduce((s, c) => s + c.incomeEUR, 0), [byCurrency])

  const currencies = useMemo(() => byCurrency.map(c => c.currency), [byCurrency])

  useEffect(() => {
    if (!currencies.length || !isPremium) return   // no calcular para free (gate decoy)
    loadHistory(currencies)
  }, [currencies.join(','), isPremium])

  const loadHistory = async (currs) => {
    const cutoff = new Date(); cutoff.setFullYear(cutoff.getFullYear() - 1)
    const { data } = await sb
      .from('exchange_rates')
      .select('base_currency, rate, date')
      .in('base_currency', currs)
      .eq('quote_currency', 'EUR')
      .gte('date', cutoff.toISOString().slice(0, 10))
      .order('date', { ascending: true })

    if (!data?.length) return

    const byPair = {}
    data.forEach(r => {
      const month = r.date.slice(0, 7)
      if (!byPair[r.base_currency]) byPair[r.base_currency] = {}
      byPair[r.base_currency][month] = Number(r.rate)
    })

    const result = {}
    Object.entries(byPair).forEach(([cur, monthMap]) => {
      result[cur] = Object.entries(monthMap)
        .map(([month, rate]) => ({ month, rate }))
        .sort((a, b) => a.month.localeCompare(b.month))
    })
    setHistory(result)
  }

  if (!byCurrency.length) return null

  const impactPct = impact / 100
  const totalValueImpact  = totalFxValueEUR  * impactPct
  const totalIncomeImpact = totalFxIncomeEUR * impactPct

  const inner = (
    <div style={CARD}>
      <p style={{ fontSize: 11, fontWeight: 700, color: '#4a5270', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 16 }}>
        Análisis de exposición a divisa
      </p>

      {/* Simulador de impacto */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <p style={{ fontSize: 12, color: '#8090a8' }}>Simulador de impacto — variación del tipo de cambio</p>
          <span style={{ fontSize: 14, fontWeight: 700, color: impact >= 0 ? '#34d399' : '#f87171' }}>
            {impact >= 0 ? '+' : ''}{impact}%
          </span>
        </div>
        <input
          type="range" min="-30" max="30" step="1" value={impact}
          onChange={e => setImpact(Number(e.target.value))}
          style={{ width: '100%', accentColor: '#818cf8', cursor: 'pointer', marginBottom: 14 }}
        />

        {/* Resumen total */}
        {impact !== 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
            <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '10px 14px' }}>
              <p style={{ fontSize: 10, color: '#4a5270', marginBottom: 4 }}>Impacto total en cartera</p>
              <p style={{ fontSize: 16, fontWeight: 800, color: totalValueImpact >= 0 ? '#34d399' : '#f87171' }}>
                {totalValueImpact >= 0 ? '+' : ''}{fmtEUR(totalValueImpact)}
              </p>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '10px 14px' }}>
              <p style={{ fontSize: 10, color: '#4a5270', marginBottom: 4 }}>Impacto en renta anual</p>
              <p style={{ fontSize: 16, fontWeight: 800, color: totalIncomeImpact >= 0 ? '#34d399' : '#f87171' }}>
                {totalIncomeImpact >= 0 ? '+' : ''}{fmtEUR(totalIncomeImpact)}
              </p>
            </div>
          </div>
        )}

        {/* Tabla por divisa */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                {['Divisa','Exposición actual','% cartera FX',impact !== 0 ? `Impacto (${impact>0?'+':''}${impact}%)` : 'Impacto','Impacto renta'].map(h => (
                  <th key={h} style={{ padding: '6px 8px', textAlign: h === 'Divisa' ? 'left' : 'right', color: '#4a5270', borderBottom: '1px solid rgba(255,255,255,0.06)', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {byCurrency.map((c, i) => {
                const valImpact = c.valueEUR * impactPct
                const incImpact = c.incomeEUR * impactPct
                const pct = totalFxValueEUR > 0 ? c.valueEUR / totalFxValueEUR * 100 : 0
                return (
                  <tr key={c.currency} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding: '7px 8px', fontWeight: 700, color: COLORS[i % COLORS.length] }}>{c.currency}</td>
                    <td style={{ padding: '7px 8px', textAlign: 'right', color: '#c8d0e0' }}>{fmtEUR(c.valueEUR)}</td>
                    <td style={{ padding: '7px 8px', textAlign: 'right', color: '#8090a8' }}>{pct.toFixed(1)}%</td>
                    <td style={{ padding: '7px 8px', textAlign: 'right', color: impact === 0 ? '#4a5270' : valImpact >= 0 ? '#34d399' : '#f87171', fontWeight: impact !== 0 ? 700 : 400 }}>
                      {impact === 0 ? '—' : `${valImpact >= 0 ? '+' : ''}${fmtEUR(valImpact)}`}
                    </td>
                    <td style={{ padding: '7px 8px', textAlign: 'right', color: impact === 0 ? '#4a5270' : incImpact >= 0 ? '#34d399' : '#f87171' }}>
                      {impact === 0 ? '—' : `${incImpact >= 0 ? '+' : ''}${fmtEUR(incImpact)}`}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mini gráficos históricos */}
      {Object.keys(history).length > 0 && (
        <>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#4a5270', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>
            Evolución últimos 12 meses
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
            {currencies.filter(c => history[c]?.length >= 2).map((currency, i) => {
              const data   = history[currency]
              const first  = data[0]?.rate
              const last   = data[data.length - 1]?.rate
              const chg    = first && last ? (last - first) / first * 100 : null
              const color  = COLORS[i % COLORS.length]
              return (
                <div key={currency} style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 8, padding: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color }}>{currency}/EUR</p>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#c8d0e0' }}>{fmt(last, 4)}</span>
                      {chg != null && (
                        <span style={{ fontSize: 11, color: chg >= 0 ? '#34d399' : '#f87171', marginLeft: 6 }}>
                          {chg >= 0 ? '▲' : '▼'}{Math.abs(chg).toFixed(1)}%
                        </span>
                      )}
                    </div>
                  </div>
                  <ResponsiveContainer width="100%" height={60}>
                    <LineChart data={data}>
                      <XAxis dataKey="month" hide />
                      <YAxis domain={['auto', 'auto']} hide />
                      <Tooltip
                        contentStyle={TT_STYLE}
                        formatter={v => [fmt(v, 4), `${currency}/EUR`]}
                        labelFormatter={l => l}
                      />
                      <Line type="monotone" dataKey="rate" stroke={color} dot={false} strokeWidth={1.5} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )

  if (!isPremium) {
    // Decoy: NO se renderiza el análisis real (datos de la cartera del usuario).
    return (
      <div style={{ ...CARD, position: 'relative', minHeight: 200 }}>
        <div style={{ filter: 'blur(6px)', pointerEvents: 'none', userSelect: 'none' }} aria-hidden="true">
          <div style={{ height: 11, width: '38%', background: 'rgba(255,255,255,0.10)', borderRadius: 5, marginBottom: 18 }} />
          <div style={{ height: 120, background: 'rgba(255,255,255,0.04)', borderRadius: 10, marginBottom: 12 }} />
          <div style={{ display: 'grid', gap: 9 }}>
            {[85, 65, 90].map((w, i) => <div key={i} style={{ height: 9, width: `${w}%`, background: 'rgba(255,255,255,0.06)', borderRadius: 4 }} />)}
          </div>
        </div>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'rgba(8,11,20,0.55)' }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#818cf8' }}>Análisis de divisa — Premium</p>
          <a href="/pricing" style={{ fontSize: 12, fontWeight: 700, color: '#fff', textDecoration: 'none', padding: '7px 18px', background: 'rgba(99,102,241,0.85)', borderRadius: 8 }}>Activar Premium →</a>
        </div>
      </div>
    )
  }

  return inner
}
