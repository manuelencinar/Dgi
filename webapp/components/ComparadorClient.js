'use client'
import { useState, useMemo, useRef, useEffect, Fragment } from 'react'
import Link from 'next/link'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Legend } from 'recharts'
import { project10y, paybackYear, getWHT, RADAR_METRICS } from '@/lib/screener'
import { getCountry, streakBadge } from '@/lib/helpers'

const CC = ['#34d399', '#60a5fa', '#f59e0b', '#a78bfa', '#f472b6']

function scoreColor(s) { if (s == null) return '#3a4260'; if (s >= 8) return '#34d399'; if (s >= 6.5) return '#86efac'; if (s >= 5) return '#fbbf24'; if (s >= 3) return '#f97316'; return '#f87171' }
function fmtEUR0(v) { return v == null ? '—' : Math.round(v).toLocaleString('es-ES') + ' €' }
function pct(v, d = 1) { return v == null ? '—' : v.toFixed(d) + '%' }
function x(v, d = 1) { return v == null ? '—' : v.toFixed(d) + 'x' }
function moatBadge(m) { return m === 'wide' ? '🏰 Foso ancho' : m === 'narrow' ? '🧱 Foso estrecho' : null }

// ── Radar multidimensional (geometría idéntica al original) ──────────────────
function MultiRadar({ companies, highlight, onHighlight }) {
  const ms = RADAR_METRICS
  const n = ms.length, cx = 140, cy = 130, r = 95
  const pt = (i, rad) => { const a = (Math.PI * 2 * i / n) - Math.PI / 2; return [cx + rad * Math.cos(a), cy + rad * Math.sin(a)] }

  return (
    <div>
      <svg viewBox="0 0 280 260" style={{ width: '100%', display: 'block' }}>
        {[2, 4, 6, 8, 10].map(l => (
          <polygon key={l} points={Array.from({ length: n }, (_, i) => pt(i, l / 10 * r).join(',')).join(' ')} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
        ))}
        {Array.from({ length: n }, (_, i) => { const [px, py] = pt(i, r); return <line key={i} x1={cx} y1={cy} x2={px} y2={py} stroke="rgba(255,255,255,0.06)" strokeWidth="1" /> })}
        {ms.map((m, i) => {
          const [px, py] = pt(i, r + 16)
          const active = highlight === m.id
          return <text key={i} x={px} y={py} textAnchor="middle" dominantBaseline="middle" fontSize="8" fill={active ? '#818cf8' : '#4a5270'} fontWeight={active ? 700 : 400} fontFamily="Figtree,sans-serif" style={{ cursor: 'pointer' }} onClick={() => onHighlight(active ? null : m.id)}>{m.short}</text>
        })}
        {companies.map((co, ci) => {
          const col = CC[ci] || '#818cf8'
          const poly = ms.map((m, i) => { const [px, py] = pt(i, (co.radar[m.id] || 0) / 10 * r); return px + ',' + py }).join(' ')
          return (
            <g key={co.ticker}>
              <polygon points={poly} fill={col} fillOpacity={0.12} stroke={col} strokeWidth="2" />
              {ms.map((m, i) => { const [px, py] = pt(i, (co.radar[m.id] || 0) / 10 * r); return <circle key={i} cx={px} cy={py} r="3" fill={col} /> })}
            </g>
          )
        })}
      </svg>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', marginTop: 6 }}>
        {companies.map((co, i) => (
          <div key={co.ticker} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: CC[i] }}>
            <div style={{ width: 12, height: 3, borderRadius: 2, background: CC[i] }} />{co.name}
          </div>
        ))}
      </div>
      {/* Valores de la métrica resaltada */}
      {highlight && (
        <div style={{ marginTop: 10, padding: '10px 12px', background: 'rgba(99,102,241,0.06)', borderRadius: 8 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#818cf8', marginBottom: 6 }}>{ms.find(m => m.id === highlight)?.short}</p>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            {companies.map((co, i) => (
              <span key={co.ticker} style={{ fontSize: 12, color: CC[i], fontWeight: 700 }}>{co.name}: {co.radar[highlight] != null ? co.radar[highlight] + '/10' : '—'}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Gráfico de proyección por empresa (idéntico al original) ─────────────────
function ProjChart({ rows, investAmt, color }) {
  if (!rows || !rows.length) return null
  const maxVal = Math.max(...rows.map(r => r.cum), investAmt || 1)
  const W = 300, H = 140, PT = 14, PB = 28, PL = 36, PR = 8
  const cW = W - PL - PR, cH = H - PT - PB, n = rows.length
  const bW = Math.floor(cW / n * 0.55), gap = (cW - bW * n) / (n + 1)
  const payback = rows.findIndex(r => r.cum >= investAmt)
  const ticks = [0, Math.round(maxVal / 2), Math.round(maxVal)]

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }}>
        {ticks.map(t => {
          const y = PT + cH - (t / maxVal) * cH
          return (
            <g key={t}>
              <line x1={PL} y1={y} x2={W - PR} y2={y} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
              <text x={PL - 3} y={y + 3} textAnchor="end" fontSize="8" fill="#3a4260" fontFamily="Figtree,sans-serif">{t >= 1000 ? Math.round(t / 100) / 10 + 'k' : t}</text>
            </g>
          )
        })}
        {investAmt && investAmt <= maxVal && (() => { const y = PT + cH - (investAmt / maxVal) * cH; return <line x1={PL} y1={y} x2={W - PR} y2={y} stroke="rgba(251,191,36,0.5)" strokeWidth="1" strokeDasharray="4 3" /> })()}
        {rows.map((r, i) => {
          const xp = PL + gap + (bW + gap) * i
          const hGross = Math.max((r.gross / maxVal) * cH, 2), hNet = Math.max((r.net / maxVal) * cH, 2)
          const isPB = payback === i
          return (
            <g key={i}>
              <rect x={xp} y={PT + cH - hGross} width={bW} height={hGross} fill="rgba(255,255,255,0.1)" rx="2" />
              <rect x={xp} y={PT + cH - hNet} width={bW} height={hNet} fill={isPB ? '#fbbf24' : '#34d399'} opacity="0.8" rx="2" />
              <text x={xp + bW / 2} y={H - PB + 9} textAnchor="middle" fontSize="7" fill={isPB ? '#fbbf24' : '#4a5270'} fontFamily="Figtree,sans-serif">{r.year}</text>
            </g>
          )
        })}
        <polyline points={rows.map((r, i) => { const xp = PL + gap + (bW + gap) * i + bW / 2, y = PT + cH - (r.cum / maxVal) * cH; return xp + ',' + y }).join(' ')} fill="none" stroke="#818cf8" strokeWidth="1.5" strokeDasharray="3 2" />
      </svg>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 10, marginTop: 4 }}>
        <Leg c="rgba(255,255,255,0.1)" l="Bruto" col="#6a7090" sq />
        <Leg c="#34d399" l="Neto" col="#34d399" sq />
        <Leg c="#818cf8" l="Acumulado neto" col="#818cf8" />
        {investAmt && <Leg c="rgba(251,191,36,0.6)" l="Inversión inicial" col="#fbbf24" />}
      </div>
    </div>
  )
}
function Leg({ c, l, col, sq }) {
  return <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 10, height: sq ? 10 : 3, background: c, borderRadius: 2 }} /><span style={{ color: col }}>{l}</span></div>
}

// ── Tabla detallada ──────────────────────────────────────────────────────────
const TABLE_GROUPS = [
  { group: 'Dividendo', rows: [
    ['Yield actual', co => co.yield, 'high', co => pct(co.yield, 2)],
    ['Yield neto', co => co.yieldNet, 'high', co => pct(co.yieldNet, 2)],
    ['Racha años', co => co.streak, 'high', co => co.streak != null ? co.streak + 'a' : '—'],
    ['CAGR div 5a', co => co.cagr, 'high', co => pct(co.cagr)],
    ['Payout FCF', co => co.payout, 'low', co => pct(co.payout, 0)],
    ['Regla 10/10', co => co.rule1010 ? 1 : 0, 'high', co => co.rule1010 ? '⚡' : '—'],
  ]},
  { group: 'Calidad del negocio', rows: [
    ['ROIC', co => co.roic, 'high', co => pct(co.roic)],
    ['Margen bruto', co => co.grossMargin, 'high', co => pct(co.grossMargin, 0)],
    ['Margen operativo', co => co.opMargin, 'high', co => pct(co.opMargin, 0)],
    ['Margen neto', co => co.netMargin, 'high', co => pct(co.netMargin, 0)],
    ['Revenue CAGR 5a', co => co.revCagr, 'high', co => pct(co.revCagr)],
    ['FCF CAGR 5a', co => co.fcfCagr, 'high', co => pct(co.fcfCagr)],
  ]},
  { group: 'Solidez financiera', rows: [
    ['Deuda neta/EBITDA', co => co.debt, 'low', co => x(co.debt)],
    ['Cobertura intereses', co => co.icov, 'high', co => x(co.icov)],
    ['Ratio corriente', co => co.currentRatio, 'high', co => x(co.currentRatio)],
  ]},
  { group: 'Valoración', rows: [
    ['Precio actual', co => co.price, null, co => co.price != null ? co.price.toLocaleString('es-ES', { maximumFractionDigits: 2 }) + ' ' + co.currency : '—'],
    ['Valor intrínseco', co => co.intrinsic, 'high', co => co.intrinsic != null ? co.intrinsic.toLocaleString('es-ES', { maximumFractionDigits: 2 }) : '—'],
    ['Margen seguridad', co => co.mos, 'high', co => co.mos != null ? (co.mos >= 0 ? '+' : '') + co.mos.toFixed(0) + '%' : '—'],
    ['PER trailing', co => co.pe, 'low', co => x(co.pe)],
    ['EV/EBITDA', co => co.ev, 'low', co => x(co.ev)],
  ]},
  { group: 'Scoring', rows: [
    ['Score DGI', co => co.score, 'high', co => co.score != null ? co.score.toFixed(1) : '—', true],
    ['Score dividendo', co => co.subDividendo, 'high', co => co.subDividendo != null ? co.subDividendo.toFixed(1) : '—'],
    ['Score calidad', co => co.subCalidad, 'high', co => co.subCalidad != null ? co.subCalidad.toFixed(1) : '—'],
    ['Score solidez', co => co.subSolidez, 'high', co => co.subSolidez != null ? co.subSolidez.toFixed(1) : '—'],
    ['Score valoración', co => co.subValoracion, 'high', co => co.subValoracion != null ? co.subValoracion.toFixed(1) : '—'],
  ]},
]

function MetricsTable({ companies }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 480 }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', padding: '8px', color: '#4a5270', borderBottom: '1px solid rgba(255,255,255,0.1)', position: 'sticky', left: 0, background: '#080b14' }}>Métrica</th>
            {companies.map((co, i) => (
              <th key={co.ticker} style={{ textAlign: 'right', padding: '8px', color: CC[i], borderBottom: '1px solid rgba(255,255,255,0.1)', whiteSpace: 'nowrap' }}>
                {getCountry(co.country)?.flag} {co.ticker}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {TABLE_GROUPS.map(g => (
            <Fragment key={g.group}>
              <tr><td colSpan={companies.length + 1} style={{ padding: '7px 8px', fontSize: 10, fontWeight: 700, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.08em', background: 'rgba(99,102,241,0.05)' }}>{g.group}</td></tr>
              {g.rows.map(([label, get, better, fmt, big]) => {
                const vals = companies.map(get).filter(v => v != null && !isNaN(v))
                const best = better === 'high' ? Math.max(...vals) : better === 'low' ? Math.min(...vals) : null
                const worst = better === 'high' ? Math.min(...vals) : better === 'low' ? Math.max(...vals) : null
                return (
                  <tr key={label} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding: '7px 8px', color: '#8090a8', position: 'sticky', left: 0, background: '#080b14' }}>{label}</td>
                    {companies.map((co, i) => {
                      const v = get(co)
                      const isBest = better && vals.length > 1 && v != null && v === best
                      const isWorst = better && vals.length > 1 && v != null && v === worst && best !== worst
                      return (
                        <td key={co.ticker} style={{
                          padding: '7px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums',
                          fontWeight: big ? 800 : (isBest ? 700 : 600),
                          fontSize: big ? 16 : 12,
                          color: big ? scoreColor(co.score) : isBest ? '#34d399' : isWorst ? '#f87171' : '#c8d0e0',
                          background: isBest ? 'rgba(52,211,153,0.08)' : isWorst ? 'rgba(248,113,113,0.06)' : 'transparent',
                        }}>{fmt(co)}</td>
                      )
                    })}
                  </tr>
                )
              })}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Componente principal ─────────────────────────────────────────────────────
export default function ComparadorClient({ initialCompanies = [], options = [], isPremium = false, destWHT = 19 }) {
  const [companies, setCompanies] = useState(initialCompanies)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [investAmt, setInvestAmt] = useState(1000)
  const [highlight, setHighlight] = useState(null)
  const [showUpgrade, setShowUpgrade] = useState(false)
  const captureRef = useRef(null)

  const maxCompanies = isPremium ? 5 : 2

  const reload = async (tickers) => {
    if (!tickers.length) { setCompanies([]); return }
    setLoading(true)
    try {
      // Refrescar precios de Yahoo (archiva en daily_prices) antes de leer los datos
      await fetch('/api/precios', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tickers }) }).catch(() => {})
      const res = await fetch(`/api/comparador?tickers=${encodeURIComponent(tickers.join(','))}`, { cache: 'no-store' })
      const json = await res.json()
      setCompanies(json.companies || [])
    } catch {}
    setLoading(false)
  }

  // Al montar con empresas iniciales (desde ?tickers=), refrescar sus precios
  useEffect(() => {
    if (initialCompanies.length) reload(initialCompanies.map(c => c.ticker))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const addCompany = (ticker) => {
    if (companies.find(c => c.ticker === ticker)) return
    if (companies.length >= maxCompanies) { if (!isPremium) setShowUpgrade(true); return }
    reload([...companies.map(c => c.ticker), ticker])
    setSearch('')
  }
  const removeCompany = (ticker) => reload(companies.map(c => c.ticker).filter(t => t !== ticker))
  const clearAll = () => { setCompanies([]); setSearch('') }

  const results = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (q.length < 2) return []
    const have = new Set(companies.map(c => c.ticker))
    return options.filter(o => !have.has(o[1]) && (o[0].toLowerCase().includes(q) || o[1].toLowerCase().includes(q))).slice(0, 8)
  }, [search, options, companies])

  // Proyecciones (recalcular cuando cambian empresas o importe)
  const projections = useMemo(() => companies.map(co => {
    if (co.yield == null || co.yield <= 0) return null
    const rows = project10y(investAmt, co.yield, co.cagr || 0, getWHT(co.country), destWHT)
    if (!rows) return null
    return { rows, y1: rows[0].net, cum10: rows[9].cum, payback: paybackYear(investAmt, co.yield, co.cagr || 0, getWHT(co.country), destWHT) }
  }), [companies, investAmt, destWHT])

  // Datos del gráfico combinado
  const combinedData = useMemo(() => {
    return Array.from({ length: 10 }, (_, yi) => {
      const point = { year: yi + 1 }
      companies.forEach((co, ci) => { const p = projections[ci]; if (p) point[co.ticker] = p.rows[yi].cum })
      return point
    })
  }, [companies, projections])

  const exportCSV = () => {
    const rows = [['Métrica', ...companies.map(c => c.name)]]
    TABLE_GROUPS.forEach(g => {
      rows.push([g.group])
      g.rows.forEach(([label, , , fmt]) => rows.push([label, ...companies.map(co => fmt(co).replace(/[€%x]/g, '').trim())]))
    })
    const csv = rows.map(r => r.map(c => { const s = c == null ? '' : String(c); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'comparativa.csv'; a.click(); URL.revokeObjectURL(url)
  }

  const exportPNG = async () => {
    if (!captureRef.current) return
    try {
      const html2canvas = (await import('html2canvas')).default
      const canvas = await html2canvas(captureRef.current, { backgroundColor: '#080b14' })
      const a = document.createElement('a'); a.href = canvas.toDataURL('image/png'); a.download = 'comparativa.png'; a.click()
    } catch { alert('La exportación a imagen no está disponible.') }
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px 80px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, color: '#e0e8f0' }}>Comparador de empresas</h1>
        {companies.length > 0 && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={exportCSV} style={miniBtn}>↓ CSV</button>
            <button onClick={exportPNG} style={miniBtn}>↓ PNG</button>
            <button onClick={clearAll} style={{ ...miniBtn, color: '#f87171' }}>✕ Limpiar</button>
          </div>
        )}
      </div>

      {/* Selector */}
      <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: companies.length ? 12 : 0 }}>
          {companies.map((co, i) => (
            <div key={co.ticker} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 20, border: `1px solid ${CC[i]}`, background: `${CC[i]}14` }}>
              <span style={{ width: 18, height: 18, borderRadius: '50%', background: CC[i], color: '#08111a', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: CC[i] }}>{co.ticker}</span>
              <button onClick={() => removeCompany(co.ticker)} style={{ background: 'none', border: 'none', color: CC[i], cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>×</button>
            </div>
          ))}
        </div>
        {companies.length < maxCompanies ? (
          <div style={{ position: 'relative' }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder={`Buscar empresa para comparar (${companies.length}/${maxCompanies})…`}
              style={{ width: '100%', padding: '10px 14px', background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 9, color: '#e0e8f0', fontSize: 13, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
            {results.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, marginTop: 4, background: '#0f1221', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 10, overflow: 'hidden' }}>
                {results.map(o => (
                  <button key={o[1]} onClick={() => addCompany(o[1])} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px', background: 'none', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer', fontFamily: 'inherit' }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#e0e8f0' }}>{o[0]}</span>
                    <span style={{ fontSize: 11, color: '#3a4260', marginLeft: 6 }}>{o[1]} · {o[2]}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <p style={{ fontSize: 12, color: '#4a5270' }}>{isPremium ? 'Máximo 5 empresas alcanzado.' : 'Límite gratuito de 2 empresas.'}</p>
        )}
        {showUpgrade && !isPremium && (
          <div style={{ marginTop: 12, padding: '12px 16px', background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <p style={{ fontSize: 12, color: '#c8d0e0' }}>Compara hasta 5 empresas con radar y proyecciones completas con Premium.</p>
            <Link href="/pricing" style={{ fontSize: 12, fontWeight: 700, color: '#fff', background: '#6366f1', padding: '8px 16px', borderRadius: 8, textDecoration: 'none', flexShrink: 0 }}>Ver Premium →</Link>
          </div>
        )}
      </div>

      {loading && <p style={{ fontSize: 13, color: '#4a5270', textAlign: 'center', padding: 20 }}>Cargando datos…</p>}

      {companies.length === 0 && !loading ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#4a5270' }}>
          <p style={{ fontSize: 14 }}>Busca y selecciona empresas para compararlas lado a lado.</p>
        </div>
      ) : companies.length > 0 && (
        <div ref={captureRef}>
          {/* Radar + combinado */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, marginBottom: 16 }}>
            <div style={{ ...card }}>
              <p style={cardTitle}>Radar comparativo</p>
              <MultiRadar companies={companies} highlight={highlight} onHighlight={setHighlight} />
            </div>
            <div style={{ ...card }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <p style={{ ...cardTitle, marginBottom: 0 }}>Renta acumulada a 10 años</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 11, color: '#4a5270' }}>Inversión</span>
                  <input type="number" value={investAmt} onChange={e => setInvestAmt(Math.max(0, parseInt(e.target.value) || 0))} style={{ width: 80, padding: '5px 8px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#c8d0e0', fontSize: 12, outline: 'none' }} />
                  <span style={{ fontSize: 11, color: '#4a5270' }}>€</span>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={230}>
                <LineChart data={combinedData}>
                  <XAxis dataKey="year" stroke="#4a5270" fontSize={10} />
                  <YAxis stroke="#4a5270" fontSize={10} tickFormatter={v => v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v} />
                  <Tooltip contentStyle={{ background: '#10172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11 }} formatter={(v, n) => [fmtEUR0(v), n]} labelFormatter={l => `Año ${l}`} />
                  <ReferenceLine y={investAmt} stroke="rgba(251,191,36,0.5)" strokeDasharray="4 3" />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {companies.map((co, i) => <Line key={co.ticker} type="monotone" dataKey={co.ticker} name={co.name} stroke={CC[i]} strokeWidth={2} dot={false} />)}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Tabla detallada */}
          <div style={{ ...card, marginBottom: 16 }}>
            <p style={cardTitle}>Métricas comparadas</p>
            <MetricsTable companies={companies} />
          </div>

          {/* Proyecciones individuales */}
          <div style={{ ...card, marginBottom: 16 }}>
            <p style={cardTitle}>Proyección por empresa sobre {fmtEUR0(investAmt)}</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
              {companies.map((co, i) => {
                const p = projections[i]
                return (
                  <div key={co.ticker}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: CC[i], marginBottom: 6 }}>{co.name}</p>
                    {p ? (
                      <>
                        <ProjChart rows={p.rows} investAmt={investAmt} color={CC[i]} />
                        <div style={{ display: 'flex', gap: 12, marginTop: 6, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 11, color: '#8090a8' }}>Año 1: <strong style={{ color: '#34d399' }}>{fmtEUR0(p.y1)}</strong></span>
                          <span style={{ fontSize: 11, color: '#8090a8' }}>10 años: <strong style={{ color: '#86efac' }}>{fmtEUR0(p.cum10)}</strong></span>
                          <span style={{ fontSize: 11, color: p.payback && p.payback <= 10 ? '#fbbf24' : '#4a5270' }}>{p.payback && p.payback <= 10 ? `Recuperación en año ${p.payback}` : 'No se recupera en 10 años'}</span>
                        </div>
                      </>
                    ) : <p style={{ fontSize: 12, color: '#3a4260', padding: '20px 0' }}>Datos insuficientes para proyección</p>}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Tarjetas por empresa */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
            {companies.map((co, i) => (
              <div key={co.ticker} style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${CC[i]}`, borderRadius: 12, padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <span style={{ width: 20, height: 20, borderRadius: '50%', background: CC[i], color: '#08111a', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</span>
                    <p style={{ fontSize: 14, fontWeight: 700, color: CC[i], overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{co.name}</p>
                  </div>
                  <span style={{ fontSize: 22, fontWeight: 900, color: scoreColor(co.score), flexShrink: 0 }}>{co.score != null ? co.score.toFixed(1) : '—'}</span>
                </div>
                {co.intrinsic != null && (
                  <p style={{ fontSize: 12, color: '#8090a8', marginBottom: 8 }}>Valor intrínseco {co.intrinsic.toLocaleString('es-ES', { maximumFractionDigits: 2 })} {co.currency}{co.mos != null && <span style={{ color: co.mos >= 0 ? '#34d399' : '#f87171', fontWeight: 700 }}> ({co.mos >= 0 ? '+' : ''}{co.mos.toFixed(0)}% MoS)</span>}</p>
                )}
                {co.insights.length > 0 && (
                  <div style={{ display: 'grid', gap: 4, marginBottom: 8 }}>
                    {co.insights.map((ins, j) => (
                      <p key={j} style={{ fontSize: 11, color: '#8090a8', display: 'flex', gap: 6 }}><span style={{ color: ins.pos ? '#34d399' : '#f87171' }}>{ins.pos ? '+' : '−'}</span>{ins.v}</p>
                    ))}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                  {moatBadge(co.moat) && <span style={{ fontSize: 10, color: '#86efac', background: 'rgba(52,211,153,0.1)', padding: '2px 7px', borderRadius: 5 }}>{moatBadge(co.moat)}</span>}
                  {streakBadge(co.streak) && <span style={{ fontSize: 10, color: '#fbbf24', background: 'rgba(251,191,36,0.1)', padding: '2px 7px', borderRadius: 5 }}>{streakBadge(co.streak)} {co.streak}a</span>}
                </div>
                <Link href={`/empresa/${encodeURIComponent(co.ticker)}`} style={{ fontSize: 12, fontWeight: 700, color: CC[i], textDecoration: 'none' }}>Ver ficha completa →</Link>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

const card = { background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: 18 }
const cardTitle = { fontSize: 11, fontWeight: 700, color: '#4a5270', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14 }
const miniBtn = { fontSize: 12, fontWeight: 700, padding: '7px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)', color: '#8090a8', cursor: 'pointer', fontFamily: 'inherit' }
