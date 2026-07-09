'use client'
import { useState, useMemo, useRef, useEffect, Fragment } from 'react'
import Link from 'next/link'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Legend } from 'recharts'
import { project10y, paybackYear, getWHT, RADAR_METRICS } from '@/lib/screener'
import { getCountry, streakBadge, debtEbitdaIsArtifact } from '@/lib/helpers'

const CC = ['var(--positive)', '#60a5fa', '#f59e0b', '#a78bfa', '#f472b6']

function scoreColor(s) { if (s == null) return 'var(--text-faintest)'; if (s >= 8) return 'var(--positive)'; if (s >= 6.5) return 'var(--positive-soft)'; if (s >= 5) return 'var(--warning)'; if (s >= 3) return '#f97316'; return 'var(--negative)' }
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
          <polygon key={l} points={Array.from({ length: n }, (_, i) => pt(i, l / 10 * r).join(',')).join(' ')} fill="none" stroke="var(--surface-3)" strokeWidth="1" />
        ))}
        {Array.from({ length: n }, (_, i) => { const [px, py] = pt(i, r); return <line key={i} x1={cx} y1={cy} x2={px} y2={py} stroke="var(--border)" strokeWidth="1" /> })}
        {ms.map((m, i) => {
          const [px, py] = pt(i, r + 16)
          const active = highlight === m.id
          return <text key={i} x={px} y={py} textAnchor="middle" dominantBaseline="middle" fontSize="8" fill={active ? 'var(--accent)' : 'var(--text-faint)'} fontWeight={active ? 700 : 400} fontFamily="Figtree,sans-serif" style={{ cursor: 'pointer' }} onClick={() => onHighlight(active ? null : m.id)}>{m.short}</text>
        })}
        {companies.map((co, ci) => {
          const col = CC[ci] || 'var(--accent)'
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
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', marginBottom: 6 }}>{ms.find(m => m.id === highlight)?.short}</p>
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
              <line x1={PL} y1={y} x2={W - PR} y2={y} stroke="var(--surface-3)" strokeWidth="1" />
              <text x={PL - 3} y={y + 3} textAnchor="end" fontSize="8" fill="var(--text-faintest)" fontFamily="Figtree,sans-serif">{t >= 1000 ? Math.round(t / 100) / 10 + 'k' : t}</text>
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
              <rect x={xp} y={PT + cH - hGross} width={bW} height={hGross} fill="var(--border-strong)" rx="2" />
              <rect x={xp} y={PT + cH - hNet} width={bW} height={hNet} fill={isPB ? 'var(--warning)' : 'var(--positive)'} opacity="0.8" rx="2" />
              <text x={xp + bW / 2} y={H - PB + 9} textAnchor="middle" fontSize="7" fill={isPB ? 'var(--warning)' : 'var(--text-faint)'} fontFamily="Figtree,sans-serif">{r.year}</text>
            </g>
          )
        })}
        <polyline points={rows.map((r, i) => { const xp = PL + gap + (bW + gap) * i + bW / 2, y = PT + cH - (r.cum / maxVal) * cH; return xp + ',' + y }).join(' ')} fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeDasharray="3 2" />
      </svg>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 10, marginTop: 4 }}>
        <Leg c="var(--border-strong)" l="Bruto" col="var(--text-muted)" sq />
        <Leg c="var(--positive)" l="Neto" col="var(--positive)" sq />
        <Leg c="var(--accent)" l="Acumulado neto" col="var(--accent)" />
        {investAmt && <Leg c="rgba(251,191,36,0.6)" l="Inversión inicial" col="var(--warning)" />}
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
    ['Regla 10/10', co => co.rule1010 ? 1 : 0, 'high', co => co.rule1010 ? '⚡' : '—', false, 'Regla 10/10: yield actual + crecimiento del dividendo (CAGR 5a) ≥ 10. ⚡ = la cumple. Señala empresas con buen equilibrio entre renta hoy y crecimiento futuro.'],
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
    ['Deuda neta/EBITDA', co => co.debt, 'low', co => debtEbitdaIsArtifact(co.debt) ? 'EBITDA≈0' : x(co.debt)],
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
            <th style={{ textAlign: 'left', padding: '8px', color: 'var(--text-faint)', borderBottom: '1px solid var(--border-strong)', position: 'sticky', left: 0, background: 'var(--bg)' }}>Métrica</th>
            {companies.map((co, i) => (
              <th key={co.ticker} style={{ textAlign: 'right', padding: '8px', color: CC[i], borderBottom: '1px solid var(--border-strong)', whiteSpace: 'nowrap' }}>
                {getCountry(co.country)?.flag} {co.ticker}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {TABLE_GROUPS.map(g => (
            <Fragment key={g.group}>
              <tr><td colSpan={companies.length + 1} style={{ padding: '7px 8px', fontSize: 10, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.08em', background: 'rgba(99,102,241,0.05)' }}>{g.group}</td></tr>
              {g.rows.map(([label, get, better, fmt, big, tip]) => {
                const vals = companies.map(get).filter(v => v != null && !isNaN(v))
                const best = better === 'high' ? Math.max(...vals) : better === 'low' ? Math.min(...vals) : null
                const worst = better === 'high' ? Math.min(...vals) : better === 'low' ? Math.max(...vals) : null
                return (
                  <tr key={label} style={{ borderBottom: '1px solid var(--surface-2)' }}>
                    <td style={{ padding: '7px 8px', color: 'var(--text-muted)', position: 'sticky', left: 0, background: 'var(--bg)' }} title={tip || undefined}>{label}{tip && <span style={{ marginLeft: 4, fontSize: 9, color: 'var(--text-faint)', cursor: 'help' }}>ⓘ</span>}</td>
                    {companies.map((co, i) => {
                      const v = get(co)
                      const isBest = better && vals.length > 1 && v != null && v === best
                      const isWorst = better && vals.length > 1 && v != null && v === worst && best !== worst
                      return (
                        <td key={co.ticker} style={{
                          padding: '7px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums',
                          fontWeight: big ? 800 : (isBest ? 700 : 600),
                          fontSize: big ? 16 : 12,
                          color: big ? scoreColor(co.score) : isBest ? 'var(--positive)' : isWorst ? 'var(--negative)' : 'var(--text)',
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
  const [browseOpen, setBrowseOpen] = useState(false)
  const [browseSector, setBrowseSector] = useState('')
  const [browseSub, setBrowseSub] = useState('')
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

  // Peers del MISMO SECTOR de las empresas ya cargadas → sugerencias de un clic
  // (p.ej. desde Munich Re sugiere Hannover Re, AXA, Allianz…).
  const sectorByTicker = useMemo(() => Object.fromEntries(options.map(o => [o[1], o[2]])), [options])
  const peers = useMemo(() => {
    if (!companies.length) return []
    const have = new Set(companies.map(c => c.ticker))
    const secs = new Set(companies.map(c => sectorByTicker[c.ticker]).filter(Boolean))
    if (!secs.size) return []
    return options.filter(o => o[2] && secs.has(o[2]) && !have.has(o[1])).slice(0, 12)
  }, [companies, options, sectorByTicker])

  // ── Explorador por sector / subsector ──────────────────────────────────────
  const sectorList = useMemo(() => [...new Set(options.map(o => o[2]).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [options])
  const subList = useMemo(() => {
    if (!browseSector) return []
    return [...new Set(options.filter(o => o[2] === browseSector).map(o => o[4]).filter(Boolean))].sort((a, b) => a.localeCompare(b))
  }, [options, browseSector])
  const browseCompanies = useMemo(() => {
    if (!browseSector) return []
    return options
      .filter(o => o[2] === browseSector && (!browseSub || o[4] === browseSub))
      .sort((a, b) => a[0].localeCompare(b[0]))
  }, [options, browseSector, browseSub])

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
      // html2canvas no resuelve var(): leemos el valor real del tema activo.
      const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#080b14'
      const canvas = await html2canvas(captureRef.current, { backgroundColor: bg })
      const a = document.createElement('a'); a.href = canvas.toDataURL('image/png'); a.download = 'comparativa.png'; a.click()
    } catch { alert('La exportación a imagen no está disponible.') }
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px 80px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, color: 'var(--text-strong)' }}>Comparador de empresas</h1>
        {companies.length > 0 && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={exportCSV} style={miniBtn}>↓ CSV</button>
            <button onClick={exportPNG} style={miniBtn}>↓ PNG</button>
            <button onClick={clearAll} style={{ ...miniBtn, color: 'var(--negative)' }}>✕ Limpiar</button>
          </div>
        )}
      </div>

      {/* Selector */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: companies.length ? 12 : 0 }}>
          {companies.map((co, i) => (
            <div key={co.ticker} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 20, border: `1px solid ${CC[i]}`, background: `${CC[i]}14` }}>
              <span style={{ width: 18, height: 18, borderRadius: '50%', background: CC[i], color: 'var(--bg-elev)', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: CC[i] }}>{co.ticker}</span>
              <button onClick={() => removeCompany(co.ticker)} style={{ background: 'none', border: 'none', color: CC[i], cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>×</button>
            </div>
          ))}
        </div>
        {companies.length < maxCompanies ? (
          <div style={{ position: 'relative' }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder={`Buscar empresa para comparar (${companies.length}/${maxCompanies})…`}
              style={{ width: '100%', padding: '10px 14px', background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 9, color: 'var(--text-strong)', fontSize: 13, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
            {results.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, marginTop: 4, background: 'var(--bg-elev)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 10, overflow: 'hidden' }}>
                {results.map(o => (
                  <button key={o[1]} onClick={() => addCompany(o[1])} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px', background: 'none', border: 'none', borderBottom: '1px solid var(--surface-2)', cursor: 'pointer', fontFamily: 'inherit' }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-strong)' }}>{o[0]}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-faintest)', marginLeft: 6 }}>{o[1]} · {o[2]}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <p style={{ fontSize: 12, color: 'var(--text-faint)' }}>{isPremium ? 'Máximo 5 empresas alcanzado.' : 'Límite gratuito de 2 empresas.'}</p>
        )}

        {/* Peers del sector — añadir de un clic */}
        {companies.length < maxCompanies && peers.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <p style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 6 }}>Compara con otras de su sector:</p>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {peers.map(o => (
                <button key={o[1]} onClick={() => addCompany(o[1])} title={`${o[0]} · ${o[2]}`} style={{
                  fontSize: 12, padding: '5px 11px', borderRadius: 16, cursor: 'pointer', fontFamily: 'inherit',
                  border: '1px solid rgba(99,102,241,0.25)', background: 'rgba(99,102,241,0.08)', color: '#a5b4fc',
                  maxWidth: 200, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>+ {o[0]}</button>
              ))}
            </div>
          </div>
        )}

        {/* Explorador por sector / subsector */}
        <div style={{ marginTop: 14, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          <button type="button" onClick={() => setBrowseOpen(v => !v)} style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
            {browseOpen ? '▲ Ocultar' : '🔍 Explorar todas las empresas por sector'}
          </button>
          {browseOpen && (
            <div style={{ marginTop: 12 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                <select value={browseSector} onChange={e => { setBrowseSector(e.target.value); setBrowseSub('') }}
                  style={{ flex: '1 1 200px', padding: '9px 12px', background: 'var(--bg-elev)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 9, color: 'var(--text-strong)', fontSize: 13, fontFamily: 'inherit' }}>
                  <option value="">Elige un sector…</option>
                  {sectorList.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <select value={browseSub} onChange={e => setBrowseSub(e.target.value)} disabled={!browseSector}
                  style={{ flex: '1 1 200px', padding: '9px 12px', background: 'var(--bg-elev)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 9, color: browseSector ? 'var(--text-strong)' : 'var(--text-faintest)', fontSize: 13, fontFamily: 'inherit' }}>
                  <option value="">{browseSector ? 'Todos los subsectores' : '—'}</option>
                  {subList.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              {browseSector && (
                <>
                  <p style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 8 }}>
                    {browseCompanies.length} empresas {browseSub ? `en ${browseSub}` : `en ${browseSector}`} · pulsa para añadir (máx {maxCompanies})
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(190px,1fr))', gap: 6, maxHeight: 300, overflowY: 'auto' }}>
                    {browseCompanies.map(o => {
                      const sel = companies.find(c => c.ticker === o[1])
                      return (
                        <button key={o[1]} onClick={() => addCompany(o[1])} disabled={!!sel} title={`${o[0]} · ${o[4] || o[2]}`}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 6, textAlign: 'left', padding: '7px 10px', borderRadius: 8,
                            cursor: sel ? 'default' : 'pointer', fontFamily: 'inherit',
                            border: `1px solid ${sel ? 'rgba(52,211,153,0.4)' : 'var(--surface-3)'}`,
                            background: sel ? 'rgba(52,211,153,0.08)' : 'var(--surface)', opacity: sel ? 0.85 : 1,
                          }}>
                          <span style={{ fontSize: 13, color: sel ? 'var(--positive)' : 'var(--accent)', fontWeight: 700, flexShrink: 0 }}>{sel ? '✓' : '+'}</span>
                          <span style={{ minWidth: 0 }}>
                            <span style={{ display: 'block', fontSize: 12, color: 'var(--text-strong)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o[0]}</span>
                            <span style={{ fontSize: 10, color: 'var(--text-faintest)' }}>{o[1]}</span>
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {showUpgrade && !isPremium && (
          <div style={{ marginTop: 12, padding: '12px 16px', background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <p style={{ fontSize: 12, color: 'var(--text)' }}>Compara hasta 5 empresas con radar y proyecciones completas con Premium.</p>
            <Link href="/pricing" style={{ fontSize: 12, fontWeight: 700, color: '#fff', background: 'var(--accent)', padding: '8px 16px', borderRadius: 8, textDecoration: 'none', flexShrink: 0 }}>Ver Premium →</Link>
          </div>
        )}
      </div>

      {loading && <p style={{ fontSize: 13, color: 'var(--text-faint)', textAlign: 'center', padding: 20 }}>Cargando datos…</p>}

      {companies.length === 0 && !loading ? (
        <div style={{ textAlign: 'center', padding: '40px 20px 50px' }}>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 4 }}>Busca empresas arriba para compararlas lado a lado…</p>
          <p style={{ fontSize: 12.5, color: 'var(--text-faint)', marginBottom: 22 }}>o empieza por una de estas comparativas típicas:</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center', maxWidth: 680, margin: '0 auto' }}>
            {[
              { label: '👑 Aristócratas defensivos', t: ['KO', 'PG', 'JNJ', 'PEP', 'CL'] },
              { label: '💳 Gigantes del pago', t: ['V', 'MA', 'AXP'] },
              { label: '💊 Grandes farmacéuticas', t: ['LLY', 'MRK', 'ABBV', 'NOVN.SW', 'PFE'] },
              { label: '🛢️ Petroleras integradas', t: ['XOM', 'CVX', 'SHEL.L', 'TTE.PA', 'BP.L'] },
              { label: '👜 Lujo europeo', t: ['MC.PA', 'RACE.MI', 'CFR.SS', 'KER.PA'] },
              { label: '💻 Tecnología con dividendo', t: ['MSFT', 'AAPL', 'TXN', 'AVGO', 'CSCO'] },
            ].map(p => (
              <button key={p.label} onClick={() => reload(p.t.slice(0, maxCompanies))} style={{
                fontSize: 12.5, fontWeight: 700, color: 'var(--text)', background: 'rgba(99,102,241,0.1)',
                border: '1px solid rgba(99,102,241,0.25)', borderRadius: 9, padding: '9px 14px', cursor: 'pointer',
              }}>{p.label}</button>
            ))}
          </div>
          {!isPremium && <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 18 }}>En el plan gratuito se comparan 2 empresas; Premium permite hasta 5.</p>}
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
                <div style={{ minWidth: 0 }}>
                  <p style={{ ...cardTitle, marginBottom: 2 }}>Renta acumulada a 10 años</p>
                  <p style={{ fontSize: 10.5, color: 'var(--text-faintest)', margin: 0, lineHeight: 1.3 }}>Solo dividendos netos reinvertidos — sin contar la revalorización del precio. "No se recupera" ≠ pérdida.</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>Inversión</span>
                  <input type="number" value={investAmt} onChange={e => setInvestAmt(Math.max(0, parseInt(e.target.value) || 0))} style={{ width: 80, padding: '5px 8px', background: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: 6, color: 'var(--text)', fontSize: 12, outline: 'none' }} />
                  <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>€</span>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={230}>
                <LineChart data={combinedData}>
                  <XAxis dataKey="year" stroke="var(--text-faint)" fontSize={10} />
                  <YAxis stroke="var(--text-faint)" fontSize={10} tickFormatter={v => v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v} />
                  <Tooltip contentStyle={{ background: 'var(--bg-elev)', border: '1px solid var(--border-strong)', borderRadius: 8, fontSize: 11 }} formatter={(v, n) => [fmtEUR0(v), n]} labelFormatter={l => `Año ${l}`} />
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
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Año 1: <strong style={{ color: 'var(--positive)' }}>{fmtEUR0(p.y1)}</strong></span>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>10 años: <strong style={{ color: 'var(--positive-soft)' }}>{fmtEUR0(p.cum10)}</strong></span>
                          <span style={{ fontSize: 11, color: p.payback && p.payback <= 10 ? 'var(--warning)' : 'var(--text-faint)' }}>{p.payback && p.payback <= 10 ? `Recuperación en año ${p.payback}` : 'No se recupera en 10 años'}</span>
                        </div>
                      </>
                    ) : <p style={{ fontSize: 12, color: 'var(--text-faintest)', padding: '20px 0' }}>Datos insuficientes para proyección</p>}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Tarjetas por empresa */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
            {companies.map((co, i) => (
              <div key={co.ticker} style={{ background: 'var(--surface)', border: `1px solid ${CC[i]}`, borderRadius: 12, padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <span style={{ width: 20, height: 20, borderRadius: '50%', background: CC[i], color: 'var(--bg-elev)', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</span>
                    <p style={{ fontSize: 14, fontWeight: 700, color: CC[i], overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{co.name}</p>
                  </div>
                  <span style={{ fontSize: 22, fontWeight: 900, color: scoreColor(co.score), flexShrink: 0 }}>{co.score != null ? co.score.toFixed(1) : '—'}</span>
                </div>
                {co.intrinsic != null && (
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>Valor intrínseco {co.intrinsic.toLocaleString('es-ES', { maximumFractionDigits: 2 })} {co.currency}{co.mos != null && <span style={{ color: co.mos >= 0 ? 'var(--positive)' : 'var(--negative)', fontWeight: 700 }}> ({co.mos >= 0 ? '+' : ''}{co.mos.toFixed(0)}% MoS)</span>}</p>
                )}
                {co.insights.length > 0 && (
                  <div style={{ display: 'grid', gap: 4, marginBottom: 8 }}>
                    {co.insights.map((ins, j) => (
                      <p key={j} style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', gap: 6 }}><span style={{ color: ins.pos ? 'var(--positive)' : 'var(--negative)' }}>{ins.pos ? '+' : '−'}</span>{ins.v}</p>
                    ))}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                  {moatBadge(co.moat) && <span style={{ fontSize: 10, color: 'var(--positive-soft)', background: 'rgba(52,211,153,0.1)', padding: '2px 7px', borderRadius: 5 }}>{moatBadge(co.moat)}</span>}
                  {streakBadge(co.streak) && <span style={{ fontSize: 10, color: 'var(--warning)', background: 'rgba(251,191,36,0.1)', padding: '2px 7px', borderRadius: 5 }}>{streakBadge(co.streak)} {co.streak}a</span>}
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

const card = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 18 }
const cardTitle = { fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14 }
const miniBtn = { fontSize: 12, fontWeight: 700, padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border-strong)', background: 'var(--surface-2)', color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'inherit' }
