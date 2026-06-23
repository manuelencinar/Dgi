'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { computeDGIScore } from '@/lib/dgi-score'
import { DICT } from '@/data/dict'

const CARD  = { background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 20 }
const CAT_LABELS = { quality: 'Calidad', dividend: 'Dividendo', financial: 'Solidez', valuation: 'Valoración' }

function scoreColor(s) {
  if (s == null) return '#4a5270'
  return s >= 7.5 ? '#34d399' : s >= 5 ? '#fbbf24' : '#f87171'
}

function ScoreGauge({ value, label, size = 'sm' }) {
  const big = size === 'lg'
  const col = scoreColor(value)
  return (
    <div style={{ textAlign: 'center' }}>
      <p style={{ fontSize: big ? 42 : 28, fontWeight: 900, color: col, lineHeight: 1 }}>{value?.toFixed(1) ?? '—'}</p>
      <p style={{ fontSize: 11, color: '#4a5270', marginTop: 4 }}>{label}</p>
    </div>
  )
}

// Decoy: NO renderiza el contenido real (se calcula solo para premium). Quitar
// el blur o leer el DOM no revela el Score DGI de la cartera.
function PremiumGate() {
  return (
    <div style={{ ...CARD, marginBottom: 16, position: 'relative', minHeight: 220 }}>
      <div style={{ filter: 'blur(6px)', pointerEvents: 'none', userSelect: 'none' }} aria-hidden="true">
        <div style={{ height: 11, width: '40%', background: 'rgba(255,255,255,0.10)', borderRadius: 5, marginBottom: 18 }} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 18 }}>
          <div style={{ height: 72, background: 'rgba(255,255,255,0.04)', borderRadius: 10 }} />
          <div style={{ height: 72, background: 'rgba(255,255,255,0.04)', borderRadius: 10 }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
          {[0, 1, 2, 3].map(i => <div key={i} style={{ height: 48, background: 'rgba(255,255,255,0.04)', borderRadius: 8 }} />)}
        </div>
      </div>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'rgba(8,11,20,0.55)' }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: '#818cf8' }}>Score DGI de la cartera (Premium)</p>
        <Link href="/pricing" style={{ fontSize: 12, fontWeight: 700, color: '#fff', textDecoration: 'none', padding: '7px 18px', background: 'rgba(99,102,241,0.85)', borderRadius: 8 }}>
          Activar Premium →
        </Link>
      </div>
    </div>
  )
}

const BENCHMARKS = [
  { key: 'all',  label: 'Universo DGI',        country: null },
  { key: 'us',   label: 'S&P 500 (EEUU)',       country: 'United States' },
  { key: 'de',   label: 'DAX (Alemania)',        country: 'Germany' },
  { key: 'fr',   label: 'CAC 40 (Francia)',      country: 'France' },
  { key: 'es',   label: 'IBEX 35 (España)',      country: 'Spain' },
  { key: 'gb',   label: 'FTSE 100 (UK)',         country: 'United Kingdom' },
]

export default function PortfolioDGIScore({ enriched, isPremium }) {
  const [data,      setData]      = useState(null)
  const [benchmark, setBenchmark] = useState(null)
  const [selBench,  setSelBench]  = useState('all')
  const [loading,   setLoading]   = useState(true)

  const sb = createClient()

  useEffect(() => {
    if (enriched.length && isPremium) load()   // no calcular para free (gate decoy)
  }, [enriched, isPremium])

  useEffect(() => {
    if (isPremium) loadBenchmark(selBench)
  }, [selBench, isPremium])

  const load = async () => {
    setLoading(true)
    const tickers = enriched.map(e => e.ticker)
    const { data: funds } = await sb
      .from('company_fundamentals')
      .select('ticker,roic,gross_margin,operating_margin,net_margin,roe,roa,revenue_cagr5,fcf_cagr5,debt_ebitda,net_debt_ebitda,current_ratio,interest_coverage,pe_trailing,pe_forward,ev_ebitda,current_price,dps,payout_fcf,payout_eps,sector,industry,country,div_cagr5,div_streak,market_cap_m,price_to_book,eps_trailing,fcf_per_share,income_statement_annual,balance_sheet_annual,cashflow_annual,div_history,net_income_history,fcf_history')
      .in('ticker', tickers)

    const scores = (funds || []).map(f => {
      const pos   = enriched.find(p => p.ticker === f.ticker)
      const entry = DICT.find(d => d[1] === f.ticker)
      const type  = entry?.[6] ?? 'general'
      const divHistory = Array.isArray(f.div_history) ? f.div_history : []
      const streak = f.div_streak ?? 0
      const cagr   = f.div_cagr5 != null ? f.div_cagr5 / 100 : null
      const score  = computeDGIScore({ ...f, divHistory }, streak, cagr, null, type)
      return { ticker: f.ticker, name: pos?.name ?? f.ticker, score, valueEUR: pos?.valueEUR ?? 0 }
    }).filter(s => s.score?.hasData && s.score.total != null)

    if (!scores.length) { setLoading(false); return }

    const totalVal  = scores.reduce((s, r) => s + r.valueEUR, 0)
    const eqScore   = scores.reduce((s, r) => s + (r.score.total ?? 0), 0) / scores.length
    const capScore  = totalVal > 0 ? scores.reduce((s, r) => s + (r.score.total ?? 0) * r.valueEUR / totalVal, 0) : eqScore

    const catScores = {}
    ;['quality','dividend','financial','valuation'].forEach(cat => {
      const vals = scores.map(r => r.score.categories?.find(c => c.key === cat)?.score).filter(v => v != null)
      catScores[cat] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
    })

    const avgYield  = scores.reduce((s, r) => {
      const p = enriched.find(e => e.ticker === r.ticker)
      return s + (p?.currentYield ?? 0)
    }, 0) / scores.length
    const avgCagr   = scores.reduce((s, r) => {
      const f = funds?.find(f => f.ticker === r.ticker)
      return s + ((f?.div_cagr5 ?? 0))
    }, 0) / scores.length
    const avgOm     = (funds || []).reduce((s, f) => s + (f.operating_margin ?? 0), 0) / (funds?.length || 1)
    const avgDebt   = (funds || []).filter(f => f.debt_ebitda != null).reduce((s, f) => s + f.debt_ebitda, 0) / Math.max((funds || []).filter(f => f.debt_ebitda != null).length, 1)

    setData({ eqScore, capScore, catScores, count: scores.length, avgYield, avgCagr, avgOm, avgDebt })
    setLoading(false)
  }

  const loadBenchmark = async (key) => {
    const bm = BENCHMARKS.find(b => b.key === key)
    let q = sb.from('company_fundamentals').select('operating_margin,div_cagr5,debt_ebitda,current_price,dps').not('dps', 'is', null).gt('dps', 0)
    if (bm?.country) q = q.eq('country', bm.country)
    q = q.limit(60)
    const { data: rows } = await q
    if (!rows?.length) { setBenchmark(null); return }
    const valid = rows.filter(r => r.current_price > 0 && r.dps > 0)
    const bYield = valid.reduce((s, r) => s + r.dps / r.current_price * 100, 0) / valid.length
    const bCagr  = rows.filter(r => r.div_cagr5 != null).reduce((s, r) => s + r.div_cagr5, 0) / Math.max(rows.filter(r => r.div_cagr5 != null).length, 1)
    const bOm    = rows.filter(r => r.operating_margin != null).reduce((s, r) => s + r.operating_margin, 0) / Math.max(rows.filter(r => r.operating_margin != null).length, 1)
    const bDebt  = rows.filter(r => r.debt_ebitda != null).reduce((s, r) => s + r.debt_ebitda, 0) / Math.max(rows.filter(r => r.debt_ebitda != null).length, 1)
    setBenchmark({ label: bm.label, bYield, bCagr, bOm, bDebt })
  }

  const inner = (
    <div style={{ ...CARD, padding: 14, marginBottom: 16 }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: '#4a5270', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>Score DGI de la cartera</p>

      {loading ? (
        <p style={{ fontSize: 12, color: '#4a5270' }}>Calculando scores…</p>
      ) : !data ? (
        <p style={{ fontSize: 12, color: '#4a5270' }}>Insuficientes datos de fundamentales para calcular el score.</p>
      ) : (
        <>
          {/* Ponderado por valor (izquierda) + 4 categorías en pequeño (derecha), misma altura */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, alignItems: 'stretch' }}>
            <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 10, padding: '8px 12px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 32, fontWeight: 900, color: scoreColor(data.capScore), lineHeight: 1 }}>{data.capScore?.toFixed(1) ?? '—'}</span>
              <span style={{ fontSize: 10, color: '#4a5270', marginTop: 3, textAlign: 'center' }}>Ponderado por valor</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6 }}>
              {Object.entries(CAT_LABELS).map(([key, label]) => {
                const s = data.catScores[key]
                return (
                  <div key={key} style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 8, padding: '6px 3px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: 14, fontWeight: 800, color: scoreColor(s) }}>{s?.toFixed(1) ?? '—'}</span>
                    <span style={{ fontSize: 8.5, color: '#4a5270', marginTop: 2, textAlign: 'center', lineHeight: 1.1 }}>{label}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Benchmark comparison (plegable, para no agrandar la tarjeta) */}
          <details style={{ marginTop: 12 }}>
            <summary style={{ cursor: 'pointer', fontSize: 11, fontWeight: 700, color: '#4a5270', marginBottom: 10 }}>Comparativa con benchmark</summary>
            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
              <select value={selBench} onChange={e => setSelBench(e.target.value)} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#c8d0e0', fontSize: 11, padding: '4px 8px' }}>
                {BENCHMARKS.map(b => <option key={b.key} value={b.key}>{b.label}</option>)}
              </select>
            </div>
            {benchmark && (() => {
              const rows = [
                { label: 'Yield medio', portfolio: data.avgYield, bench: benchmark.bYield, pct: true, higherBetter: true },
                { label: 'CAGR dividendo', portfolio: data.avgCagr, bench: benchmark.bCagr, pct: true, higherBetter: true },
                { label: 'Margen operativo', portfolio: data.avgOm, bench: benchmark.bOm, pct: true, higherBetter: true },
                { label: 'Deuda/EBITDA', portfolio: data.avgDebt, bench: benchmark.bDebt, pct: false, higherBetter: false },
              ]
              return (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead>
                    <tr>
                      {['Métrica','Mi cartera',benchmark.label,''].map(h => (
                        <th key={h} style={{ padding: '5px 8px', textAlign: h === 'Métrica' ? 'left' : 'right', color: '#4a5270', borderBottom: '1px solid rgba(255,255,255,0.06)', fontWeight: 600 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => {
                      const beats = r.higherBetter ? r.portfolio > r.bench : r.portfolio < r.bench
                      const col   = r.portfolio != null && r.bench != null ? (beats ? '#34d399' : '#f87171') : '#4a5270'
                      return (
                        <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          <td style={{ padding: '6px 8px', color: '#8090a8' }}>{r.label}</td>
                          <td style={{ padding: '6px 8px', textAlign: 'right', color: col, fontWeight: 700 }}>{r.portfolio != null ? r.portfolio.toFixed(1) + (r.pct ? '%' : '×') : '—'}</td>
                          <td style={{ padding: '6px 8px', textAlign: 'right', color: '#4a5270' }}>{r.bench != null ? r.bench.toFixed(1) + (r.pct ? '%' : '×') : '—'}</td>
                          <td style={{ padding: '6px 8px', textAlign: 'right', color: col }}>{r.portfolio != null && r.bench != null ? (beats ? '↑' : '↓') : ''}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )
            })()}
          </details>
        </>
      )}
    </div>
  )

  return isPremium ? inner : <PremiumGate />
}
