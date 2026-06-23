'use client'
import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, LabelList } from 'recharts'
import { createClient } from '@/lib/supabase/client'
import {
  enrichPositions, calcSummary, calcConcentration, calcAlerts,
  calcDiversificationScore, calcDividendRisks, calcFiscal, calcSectorBreakdown, calcGeoBreakdown, calcProfileFit, calcDividendGrowth,
} from '@/lib/portfolio'
import { projectIncome } from '@/lib/portfolio-calc'
import { DEFAULT_PROFILE, INVESTOR_PROFILES } from '@/lib/supersectors'
import { resolveDestWHT, isExemptUser } from '@/lib/fiscal-es'
import SectorBreakdown, { DonutBreakdown } from '@/components/cartera/SectorBreakdown'
import InvestorProfile from '@/components/cartera/InvestorProfile'
import PortfolioDGIScore from '@/components/cartera/PortfolioDGIScore'
import PortfolioEvolution from '@/components/cartera/PortfolioEvolution'
import CompanyDetector from '@/components/cartera/CompanyDetector'
import RecurringSection from '@/components/cartera/RecurringSection'
import FxRatesWidget from '@/components/cartera/FxRatesWidget'
import CurrencyAnalysis from '@/components/cartera/CurrencyAnalysis'
import PricesFreshnessIndicator from '@/components/PricesFreshnessIndicator'
import WatchlistMini from '@/components/cartera/WatchlistMini'
import UpcomingDividends from '@/components/cartera/UpcomingDividends'

// ── Design tokens ──────────────────────────────────────────────────────────
// padding como variable CSS → en móvil se reduce vía media query (ver cdp-root) sin
// tocar cada ficha (el inline no se puede sobreescribir con CSS normal, pero una var sí).
const CARD   = { background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 'var(--cdp-pad, 20px)' }
const COLORS = ['#818cf8','#34d399','#fbbf24','#f87171','#60a5fa','#a78bfa','#fb923c','#4ade80','#f472b6','#38bdf8']
const INPUT  = { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 12px', color: '#c8d0e0', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' }

function fmt(v, d = 2) {
  if (v == null || isNaN(v)) return '—'
  return v.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d })
}
function fmtPct(v) { return v == null ? '—' : (v >= 0 ? '+' : '') + v.toFixed(2) + '%' }
function fmtEUR(v) {
  if (v == null) return '—'
  if (Math.abs(v) >= 1000) return v.toLocaleString('es-ES', { maximumFractionDigits: 0 }) + ' €'
  return v.toLocaleString('es-ES', { maximumFractionDigits: 2 }) + ' €'
}
function gainCol(v) { return v == null ? '#4a5270' : v >= 0 ? '#34d399' : '#f87171' }

// ── Premium gate ───────────────────────────────────────────────────────────
// Decoy: NO renderiza los children reales — solo un esqueleto ficticio. Quitar
// el blur o leer el DOM no revela el análisis premium de la cartera.
function PremiumGate() {
  return (
    <div style={{ position: 'relative', minHeight: 150 }}>
      <div style={{ filter: 'blur(6px)', pointerEvents: 'none', userSelect: 'none', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 20 }} aria-hidden="true">
        <div style={{ height: 11, width: '42%', background: 'rgba(255,255,255,0.10)', borderRadius: 5, marginBottom: 16 }} />
        <div style={{ display: 'grid', gap: 9 }}>
          {[88, 70, 94, 60].map((w, i) => <div key={i} style={{ height: 9, width: `${w}%`, background: 'rgba(255,255,255,0.06)', borderRadius: 4 }} />)}
        </div>
      </div>
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 8,
        background: 'rgba(8,11,20,0.55)',
      }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: '#818cf8' }}>Contenido Premium</p>
        <Link href="/pricing" style={{ fontSize: 12, fontWeight: 700, color: '#fff', textDecoration: 'none', padding: '7px 18px', background: 'rgba(99,102,241,0.85)', borderRadius: 8 }}>
          Activar Premium →
        </Link>
      </div>
    </div>
  )
}

// ── Modal ──────────────────────────────────────────────────────────────────
function Modal({ onClose, title, children }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div style={{ ...CARD, minWidth: 300, maxWidth: 420, width: '90%' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
          <p style={{ fontWeight: 700, color: '#c8d0e0', fontSize: 15 }}>{title}</p>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#4a5270', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  )
}

// ── Donut chart ────────────────────────────────────────────────────────────
function DonutChart({ data, title }) {
  if (!data?.length) return null
  return (
    <div style={{ textAlign: 'center' }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: '#4a5270', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>{title}</p>
      <ResponsiveContainer width="100%" height={160}>
        <PieChart>
          <Pie data={data} cx="50%" cy="50%" innerRadius={42} outerRadius={68} dataKey="value" paddingAngle={2}>
            {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Pie>
          <Tooltip
            contentStyle={{ background: '#10172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11 }}
            formatter={(v, n) => [`${v.toFixed(1)}%`, n]}
          />
        </PieChart>
      </ResponsiveContainer>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px', justifyContent: 'center', marginTop: 6 }}>
        {data.slice(0, 6).map((d, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#8090a8' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: COLORS[i % COLORS.length], flexShrink: 0 }} />
            {d.name}: {d.value.toFixed(0)}%
          </div>
        ))}
      </div>
    </div>
  )
}

// Último crecimiento anual real del dividendo (de div_history): el del último año
// completo registrado. Devuelve % o null.
function lastDivGrowth(hist) {
  if (!Array.isArray(hist)) return null
  const full = hist.filter(h => h && !h.isPartial && h.dps != null).sort((a, b) => a.year - b.year)
  const last = full[full.length - 1]
  return last && last.growth != null && !isNaN(last.growth) ? Number(last.growth) * 100 : null
}

// ── Renta por dividendos: anual (pasado cobrado / futuro estimado) + crecimiento ──
function IncomeProjectionCard({ enriched, taxRate, isPremium }) {
  const [dir, setDir] = useState('fwd')         // 'bwd' (cobrado) | 'fwd' (estimado)
  const [received, setReceived] = useState(null)
  const sb = createClient()

  const proj = useMemo(() => enriched.length ? projectIncome(enriched, { horizon: 10, taxRate }) : null, [enriched, taxRate])
  const growth = useMemo(() => calcDividendGrowth(enriched), [enriched])
  const yr0 = new Date().getFullYear()
  const fwdData = (proj?.base || []).map(d => ({ year: String(yr0 + d.year - 1), income: d.net }))

  // Histórico cobrado por año (para BWD) — se carga al pulsar Pasado.
  useEffect(() => {
    if (dir !== 'bwd' || received != null) return
    let cancel = false
    sb.auth.getUser().then(({ data: { user } }) => {
      if (!user) { setReceived([]); return }
      return sb.from('dividends_received').select('amount, amount_net, date').eq('user_id', user.id).then(({ data }) => {
        if (cancel) return
        const byYear = {}
        for (const d of data || []) { const y = d.date ? String(d.date).slice(0, 4) : null; const net = d.amount_net ?? d.amount; if (y && net != null) byYear[y] = (byYear[y] || 0) + Number(net) }
        setReceived(Object.entries(byYear).sort((a, b) => a[0] < b[0] ? -1 : 1).map(([year, income]) => ({ year, income: Math.round(income) })))
      })
    })
    return () => { cancel = true }
  }, [dir, received, sb])

  if (!fwdData.length) return null
  if (!isPremium) return <PremiumGate />

  const data = dir === 'bwd' ? (received || []) : fwdData
  const legend = dir === 'bwd' ? 'Cobrado' : 'Estimado'
  const Stat = ({ label, value, color }) => (
    <div style={{ flex: 1, minWidth: 150, background: `${color}12`, border: `1px solid ${color}30`, borderRadius: 10, padding: '12px 14px' }}>
      <p style={{ fontSize: 11, color: '#8090a8', marginBottom: 4 }}>{label}</p>
      <p style={{ fontSize: 22, fontWeight: 800, color }}>{value}</p>
    </div>
  )
  const TogBtn = ({ k, label }) => (
    <button onClick={() => setDir(k)} style={{
      fontSize: 12, fontWeight: 700, padding: '5px 14px', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit',
      border: '1px solid ' + (dir === k ? 'rgba(52,211,153,0.5)' : 'rgba(255,255,255,0.1)'),
      background: dir === k ? 'rgba(52,211,153,0.18)' : 'transparent', color: dir === k ? '#34d399' : '#8090a8',
    }}>{label}</button>
  )
  return (
    <div style={{ ...CARD, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, flexWrap: 'wrap', gap: 8 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: '#4a5270', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Renta anual neta por dividendos, €</p>
        <div style={{ display: 'flex', gap: 6 }}>
          <TogBtn k="bwd" label="Pasado" />
          <TogBtn k="fwd" label="Futuro" />
        </div>
      </div>

      {dir === 'bwd' && received != null && received.length === 0 ? (
        <p style={{ fontSize: 12.5, color: '#4a5270', padding: '30px 0', textAlign: 'center' }}>Aún no hay dividendos cobrados registrados. Regístralos o impórtalos de tu bróker para ver tu historial de renta.</p>
      ) : (
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={data} margin={{ top: 22, right: 6, left: 2, bottom: 0 }}>
            <XAxis dataKey="year" stroke="#8090a8" fontSize={10} tickLine={false} axisLine={{ stroke: 'rgba(255,255,255,0.15)' }} angle={-90} textAnchor="end" height={42} interval={0} />
            <YAxis stroke="#4a5270" fontSize={10} tickLine={false} axisLine={false} tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(1)}K` : v} width={34} />
            <Tooltip contentStyle={{ background: '#10172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }} formatter={v => [fmtEUR(v), dir === 'bwd' ? 'Cobrado' : 'Estimado']} labelFormatter={l => l} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
            <Bar dataKey="income" fill="#e2e8f5" radius={[3, 3, 0, 0]} maxBarSize={46}>
              <LabelList dataKey="income" position="top" fill="#c8d0e0" fontSize={10} fontWeight={700} formatter={v => v >= 1000 ? `${(v / 1000).toFixed(1)}K` : Math.round(v)} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 2, marginBottom: 14 }}>
        <span style={{ width: 11, height: 11, background: '#e2e8f5', borderRadius: 2 }} />
        <span style={{ fontSize: 11, color: '#8090a8' }}>{legend} (neto){dir === 'fwd' ? ' · escenario base, CAGR real de cada empresa' : ''}</span>
        <Link href="/cartera/proyeccion" style={{ fontSize: 11, color: '#818cf8', textDecoration: 'none', marginLeft: 'auto' }}>Detalle y escenarios →</Link>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Stat label="Crecimiento del dividendo · últimos 12 meses" value={growth.g1y != null ? `${growth.g1y >= 0 ? '+' : ''}${growth.g1y.toFixed(1)}%` : '—'} color="#34d399" />
        <Stat label="Crecimiento del dividendo · últimos 5 años (anual)" value={growth.g5y != null ? `${growth.g5y.toFixed(1)}%` : '—'} color="#818cf8" />
      </div>
    </div>
  )
}

// ── Section 1: Summary ─────────────────────────────────────────────────────
function SummarySection({ summary, netIncomeEUR }) {
  const items = [
    { label: 'Valor total', value: fmtEUR(summary.totalValueEUR), sub: null },
    { label: 'Rentabilidad', value: fmtEUR(summary.gainEUR), sub: fmtPct(summary.gainPct), col: gainCol(summary.gainPct) },
    { label: 'Renta anual neta', value: fmtEUR(netIncomeEUR ?? summary.totalIncomeEUR), sub: null },
    { label: 'YoC medio', value: summary.yieldOnCost != null ? summary.yieldOnCost.toFixed(2) + '%' : '—', sub: null },
  ]
  return (
    <div className="summary-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8, marginBottom: 16 }}>
      <style>{`@media(min-width:600px){.summary-grid{grid-template-columns:repeat(4,1fr)!important}}`}</style>
      {items.map(it => (
        <div key={it.label} style={{ ...CARD, padding: '8px 11px' }}>
          <p style={{ fontSize: 9.5, color: '#4a5270', marginBottom: 2 }}>{it.label}</p>
          <p style={{ fontSize: 17, fontWeight: 800, color: it.col || '#c8d0e0', lineHeight: 1.15 }}>{it.value}</p>
          {it.sub && <p style={{ fontSize: 11, fontWeight: 700, color: it.col, marginTop: 1 }}>{it.sub}</p>}
        </div>
      ))}
    </div>
  )
}

// ── Meta de renta pasiva (estrella polar) ──────────────────────────────────
// Renta anual actual vs objetivo, progreso y ETA solo con el crecimiento del
// dividendo (sin nuevas aportaciones → estimación conservadora).
function IncomeGoalCard({ currentIncome, goal, growthPct, onSave }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(goal ?? '')
  useEffect(() => { setVal(goal ?? '') }, [goal])

  const save = () => {
    const n = Number(val)
    onSave(!isNaN(n) && n > 0 ? n : null)
    setEditing(false)
  }

  if (!goal && !editing) {
    return (
      <div style={{ ...CARD, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#c8d0e0' }}>🎯 Fija tu meta de renta pasiva</p>
          <p style={{ fontSize: 11.5, color: '#6b7693', marginTop: 2 }}>Define cuántos dividendos quieres cobrar al año y sigue tu progreso.</p>
        </div>
        <button onClick={() => setEditing(true)} style={{ padding: '8px 16px', background: 'rgba(99,102,241,0.85)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>Fijar meta</button>
      </div>
    )
  }

  const pct = goal > 0 ? Math.min(100, currentIncome / goal * 100) : 0
  const reached = currentIncome >= goal
  const g = (growthPct ?? 0) / 100
  // ETA solo con crecimiento orgánico del dividendo (sin aportaciones nuevas).
  let etaYears = null
  if (!reached && currentIncome > 0 && g > 0.001) etaYears = Math.log(goal / currentIncome) / Math.log(1 + g)
  const barCol = reached ? '#34d399' : pct >= 50 ? '#60a5fa' : '#818cf8'

  return (
    <div style={{ ...CARD, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: '#4a5270', textTransform: 'uppercase', letterSpacing: '0.1em' }}>🎯 Meta de renta pasiva</p>
        {editing ? (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="number" step="any" value={val} onChange={e => setVal(e.target.value)} placeholder="€/año" style={{ ...INPUT, width: 110, padding: '6px 10px' }} />
            <button onClick={save} style={{ padding: '6px 12px', background: 'rgba(99,102,241,0.85)', border: 'none', borderRadius: 7, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Guardar</button>
          </div>
        ) : (
          <button onClick={() => setEditing(true)} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 7, padding: '5px 12px', color: '#8090a8', fontSize: 11.5, cursor: 'pointer' }}>Editar meta</button>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <span style={{ fontSize: 24, fontWeight: 900, color: '#e0e8f0' }}>{fmtEUR(currentIncome)}<span style={{ fontSize: 13, color: '#4a5270', fontWeight: 700 }}> / {fmtEUR(goal)} al año</span></span>
        <span style={{ fontSize: 18, fontWeight: 800, color: barCol }}>{pct.toFixed(0)}%</span>
      </div>
      <div style={{ height: 10, background: 'rgba(255,255,255,0.06)', borderRadius: 6, overflow: 'hidden', marginBottom: 10 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: barCol, borderRadius: 6, transition: 'width .4s' }} />
      </div>
      <p style={{ fontSize: 12, color: '#8090a8', lineHeight: 1.5 }}>
        {reached
          ? '🎉 ¡Meta alcanzada! Tu cartera ya genera la renta que te marcaste.'
          : etaYears != null
            ? <>Te faltan <strong style={{ color: '#c8d0e0' }}>{fmtEUR(goal - currentIncome)}</strong>. Solo con el crecimiento del dividendo (~{growthPct.toFixed(1)}%/año, sin nuevas aportaciones) la alcanzarías en <strong style={{ color: '#60a5fa' }}>~{etaYears < 1 ? '<1' : Math.round(etaYears)} {etaYears < 1 || Math.round(etaYears) === 1 ? 'año' : 'años'}</strong>.</>
            : <>Te faltan <strong style={{ color: '#c8d0e0' }}>{fmtEUR(goal - currentIncome)}</strong>. Aporta y reinvierte para acelerar el objetivo.</>}
      </p>
    </div>
  )
}

// ── Section 2: Positions table ─────────────────────────────────────────────
function PositionsTable({ enriched, isPremium, onEdit, onDividend, onDelete }) {
  const FREE_LIMIT = 10

  return (
    <div style={{ ...CARD, marginBottom: 16 }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: '#4a5270', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14 }}>Posiciones</p>
      {enriched.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <p style={{ color: '#4a5270', fontSize: 14, marginBottom: 8 }}>Empieza tu cartera DGI</p>
          <p style={{ color: '#6b7693', fontSize: 12.5, marginBottom: 18, maxWidth: 460, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.5 }}>¿No sabes por dónde empezar? Responde 4 preguntas y te proponemos una cartera inicial de empresas DGI a tu medida.</p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/construir-cartera" style={{ padding: '10px 20px', background: 'rgba(52,211,153,0.85)', borderRadius: 8, color: '#06281d', fontSize: 13, fontWeight: 800, textDecoration: 'none' }}>
              🧭 Construir mi cartera desde cero
            </Link>
            <Link href="/cartera/nueva-posicion" style={{ padding: '10px 20px', background: 'rgba(99,102,241,0.85)', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
              Añadir posición
            </Link>
            <Link href="/cartera/importar" style={{ padding: '10px 20px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: '#c8d0e0', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
              ⭳ Importar de ING
            </Link>
          </div>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 860 }}>
            <thead>
              <tr>
                {['Empresa','Acciones','P. Medio','Coste real','P. Actual','Valor','Rentab.','YoC','Yield','Renta/año','Cobrado','Coste neto',''].map(h => (
                  <th key={h} style={{ padding: '6px 8px', textAlign: h === 'Empresa' ? 'left' : 'right', color: '#4a5270', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.06)', whiteSpace: 'nowrap' }} title={
                    h === 'Coste real' ? 'Coste por acción incluyendo comisiones de compra'
                    : h === 'Cobrado' ? 'Dividendos netos cobrados de esta posición (acumulado)'
                    : h === 'Coste neto' ? 'Coste de compra menos dividendos cobrados. Debajo, el YoC real = renta anual / coste neto.'
                    : undefined}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {enriched.map((p, i) => (
                <tr key={p.id} style={{ background: i % 2 ? 'rgba(255,255,255,0.015)' : 'transparent' }}>
                  <td style={{ padding: '8px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <Link href={p.isFund ? `/fondo/${encodeURIComponent(p.ticker)}` : `/empresa/${encodeURIComponent(p.ticker)}`} style={{ textDecoration: 'none' }}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: '#c8d0e0', display: 'flex', alignItems: 'center', gap: 6 }}>
                        {p.name}
                        {p.assetType === 'etf' && <span style={{ fontSize: 9, fontWeight: 700, color: '#60a5fa', background: 'rgba(96,165,250,0.14)', padding: '1px 5px', borderRadius: 4 }}>ETF</span>}
                        {p.assetType === 'fund' && <span style={{ fontSize: 9, fontWeight: 700, color: '#a78bfa', background: 'rgba(167,139,250,0.14)', padding: '1px 5px', borderRadius: 4 }}>Fondo</span>}
                      </p>
                      <p style={{ fontSize: 10, color: '#4a5270' }}>{p.ticker} · {p.currency}{p.isFund && p.ter != null ? ` · TER ${p.ter}%` : ''}</p>
                    </Link>
                  </td>
                  <td style={{ padding: '8px', textAlign: 'right', color: '#8090a8', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>{fmt(p.shares, 4)}</td>
                  <td style={{ padding: '8px', textAlign: 'right', color: '#8090a8', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>{fmt(p.avg_cost)}</td>
                  <td style={{ padding: '8px', textAlign: 'right', color: p.buyCommission > 0 ? '#c8d0e0' : '#4a5270', borderBottom: '1px solid rgba(255,255,255,0.04)' }} title={p.buyCommission > 0 ? `Incluye ${fmt(p.buyCommission)} ${p.currency} de comisiones` : 'Sin comisiones registradas'}>{p.avgCostReal != null ? fmt(p.avgCostReal) : '—'}</td>
                  <td style={{ padding: '8px', textAlign: 'right', color: '#c8d0e0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>{p.currentPrice != null ? fmt(p.currentPrice) : '—'}</td>
                  <td style={{ padding: '8px', textAlign: 'right', color: '#c8d0e0', fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>{p.valueEUR != null ? fmtEUR(p.valueEUR) : '—'}</td>
                  <td style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    {p.gainPct != null ? (
                      <div>
                        <span style={{ color: gainCol(p.gainPct), fontWeight: 700 }}>{fmtPct(p.gainPct)}</span>
                        <p style={{ fontSize: 10, color: gainCol(p.gainEUR) }}>{p.gainEUR != null ? (p.gainEUR >= 0 ? '+' : '') + fmtEUR(p.gainEUR) : '—'}</p>
                      </div>
                    ) : '—'}
                  </td>
                  <td style={{ padding: '8px', textAlign: 'right', color: '#818cf8', borderBottom: '1px solid rgba(255,255,255,0.04)' }} title="Yield on cost sobre el coste real (con comisiones)">{(p.yieldOnCostReal ?? p.yieldOnCost) != null ? (p.yieldOnCostReal ?? p.yieldOnCost).toFixed(2) + '%' : '—'}</td>
                  <td style={{ padding: '8px', textAlign: 'right', color: '#34d399', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>{p.currentYield != null ? p.currentYield.toFixed(2) + '%' : '—'}</td>
                  <td style={{ padding: '8px', textAlign: 'right', color: '#fbbf24', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>{p.annualIncomeEUR != null ? fmtEUR(p.annualIncomeEUR) : '—'}</td>
                  <td style={{ padding: '8px', textAlign: 'right', color: p.dividendsCollectedEUR > 0 ? '#34d399' : '#4a5270', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>{p.dividendsCollectedEUR > 0 ? fmtEUR(p.dividendsCollectedEUR) : '—'}</td>
                  <td style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid rgba(255,255,255,0.04)' }} title={p.dividendsCollectedEUR > 0 ? `Compra ${fmtEUR(p.costEUR)} − dividendos ${fmtEUR(p.dividendsCollectedEUR)}` : undefined}>
                    {p.netCostEUR != null ? (
                      <div>
                        <span style={{ color: p.netCostEUR <= 0 ? '#34d399' : '#c8d0e0', fontWeight: 700 }}>{fmtEUR(Math.max(0, p.netCostEUR))}</span>
                        <p style={{ fontSize: 10, color: '#818cf8' }}>{p.yoCNet == null ? '' : p.yoCNet === Infinity ? 'YoC ✓ recuperada' : `YoC ${p.yoCNet.toFixed(2)}%`}</p>
                      </div>
                    ) : '—'}
                  </td>
                  <td style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid rgba(255,255,255,0.04)', whiteSpace: 'nowrap' }}>
                    <button onClick={() => onEdit(p)} title="Editar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#818cf8', fontSize: 14, padding: '2px 4px' }}>✏</button>
                    <button onClick={() => onDividend(p)} title="Registrar dividendo" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#34d399', fontSize: 14, padding: '2px 4px' }}>$</button>
                    <button onClick={() => onDelete(p.id)} title="Eliminar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f87171', fontSize: 14, padding: '2px 4px' }}>🗑</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
        {!isPremium && enriched.length >= FREE_LIMIT ? (
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: 11, color: '#fbbf24', marginBottom: 6 }}>Límite del plan gratuito alcanzado (10 posiciones)</p>
            <Link href="/pricing" style={{ padding: '9px 18px', background: 'rgba(251,191,36,0.2)', border: '1px solid rgba(251,191,36,0.4)', borderRadius: 8, color: '#fbbf24', fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>
              Upgrade a Premium →
            </Link>
          </div>
        ) : (
          <Link href="/cartera/nueva-posicion" style={{ padding: '10px 20px', background: 'rgba(99,102,241,0.85)', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
            + Añadir posición
          </Link>
        )}
      </div>
    </div>
  )
}

// ── Section 3: Concentration ───────────────────────────────────────────────
function ConcentrationSection({ concentration, sectorBreakdown, geoBreakdown, alerts, isPremium }) {
  const inner = (
    <div style={{ ...CARD, marginBottom: 16 }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: '#4a5270', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 16 }}>Análisis de concentración</p>

      {/* Diversificación por supersectores de Morningstar (sector + detalle) */}
      <div style={{ marginBottom: 20 }}>
        <SectorBreakdown breakdown={sectorBreakdown} />
      </div>

      {/* Zona geográfica (continente → país, dos anillos) y divisa (un nivel) */}
      <div style={{ display: 'grid', gap: 20, marginBottom: 16 }}>
        <SectorBreakdown breakdown={geoBreakdown} title="Diversificación por zona geográfica" hint="Continentes y el peso de cada país dentro" />
        <DonutBreakdown title="Por divisa" data={concentration.byCurrency} />
      </div>
      {alerts.length > 0 && (
        <div style={{ display: 'grid', gap: 8 }}>
          {alerts.map((a, i) => (
            <div key={i} style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', borderRadius: 8, padding: '10px 14px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <span style={{ color: '#fbbf24', flexShrink: 0 }}>⚠</span>
              <p style={{ fontSize: 12, color: '#fbbf24' }}>{a}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
  return isPremium ? inner : <PremiumGate />
}

// ── Section 4: Diversification score ──────────────────────────────────────
function DiversificationSection({ score, isPremium }) {
  const inner = (
    <div style={{ ...CARD, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#4a5270', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>Diversificación</p>
          {score?.recommendation && <p style={{ fontSize: 13, color: '#8090a8', maxWidth: 440 }}>{score.recommendation}</p>}
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <p style={{ fontSize: 42, fontWeight: 900, lineHeight: 1, color: score?.score >= 7 ? '#34d399' : score?.score >= 5 ? '#fbbf24' : '#f87171' }}>
            {score?.score?.toFixed(1) ?? '—'}
          </p>
          <p style={{ fontSize: 10, color: '#4a5270' }}>/ 10</p>
        </div>
      </div>
    </div>
  )
  return isPremium ? inner : <PremiumGate />
}

// ── Perfil de inversor (supersectores) ─────────────────────────────────────
function InvestorProfileSection({ fit, profileKey, onChange, isPremium }) {
  const inner = (
    <div style={{ ...CARD, marginBottom: 16 }}>
      <InvestorProfile fit={fit} profileKey={profileKey} onChange={onChange} />
    </div>
  )
  return isPremium ? inner : <PremiumGate />
}

// ── Section 5: Dividend risk ───────────────────────────────────────────────
function DividendRiskSection({ risks, totalIncomeEUR, isPremium }) {
  const riskIncome = risks.reduce((s, p) => s + (p.annualIncomeEUR ?? 0), 0)
  const riskPct    = totalIncomeEUR > 0 ? riskIncome / totalIncomeEUR * 100 : 0

  const inner = (
    <div style={{ ...CARD, marginBottom: 16 }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: '#4a5270', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14 }}>Dividendos en riesgo</p>
      {risks.length === 0 ? (
        <p style={{ fontSize: 13, color: '#34d399' }}>✓ No se detectan señales de riesgo en los dividendos de tu cartera.</p>
      ) : (
        <>
          <p style={{ fontSize: 11.5, color: '#6b7693', lineHeight: 1.5, marginBottom: 12 }}>
            Empresas con señales que suelen <strong style={{ color: '#8090a8' }}>anticipar un recorte</strong> (payout, deuda, cobertura de intereses, caída del FCF). No es una predicción: es <strong style={{ color: '#8090a8' }}>dónde vigilar</strong>, y cuánta de tu renta depende de cada una.
          </p>
          <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
            {risks.map((p, i) => (
              <div key={i} style={{ padding: '10px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: 8, borderLeft: `3px solid ${p.worst === 'alto' ? '#f87171' : '#fbbf24'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: '#c8d0e0' }}>{p.name} <span style={{ fontSize: 10, color: '#4a5270' }}>{p.ticker}</span></p>
                  <p style={{ fontSize: 11, color: '#8090a8', flexShrink: 0 }}>{p.incPct.toFixed(1)}% de tu renta</p>
                </div>
                <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
                  {p.risks.map((r, j) => {
                    const col = r.level === 'alto' ? '#f87171' : '#fbbf24'
                    return (
                      <div key={j}>
                        <span style={{ fontSize: 10.5, fontWeight: 700, color: col, background: r.level === 'alto' ? 'rgba(248,113,113,0.1)' : 'rgba(251,191,36,0.1)', padding: '2px 7px', borderRadius: 5 }}>
                          {r.label}: {r.value} · {r.level === 'alto' ? 'riesgo alto' : 'a vigilar'}
                        </span>
                        <p style={{ fontSize: 11, color: '#6b7693', lineHeight: 1.45, marginTop: 4 }}>{r.detail}</p>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 11.5, color: riskPct >= 25 ? '#f87171' : '#fbbf24' }}>
            El <strong>{riskPct.toFixed(0)}%</strong> de tu renta anual proviene de empresas con señales de alerta.
          </p>
        </>
      )}
    </div>
  )
  return isPremium ? inner : <PremiumGate />
}

// ── Section 6: Fiscal ──────────────────────────────────────────────────────
function FiscalSection({ fiscal, country, onCountryChange, isPremium, exempt = false, incomeMode = false }) {
  const totalGross = fiscal.reduce((s, f) => s + f.gross, 0)
  const totalNet   = fiscal.reduce((s, f) => s + f.net, 0)

  const countries = ['ES','DE','FR','IT','PT','GB','US','OTHER']

  const inner = (
    <div style={{ ...CARD, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: '#4a5270', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Coste fiscal estimado</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: '#4a5270' }}>Residencia fiscal:</span>
          <select value={country} onChange={e => onCountryChange(e.target.value)} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#c8d0e0', fontSize: 12, padding: '4px 8px' }}>
            <option value="ES">España</option>
            <option value="OTHER">Otro (referencia)</option>
          </select>
        </div>
      </div>

      {exempt && (
        <div style={{ background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.25)', borderRadius: 8, padding: '10px 12px', marginBottom: 12 }}>
          <p style={{ fontSize: 12, color: '#34d399', fontWeight: 700, marginBottom: 2 }}>Estás exento de IRPF según tus ingresos</p>
          <p style={{ fontSize: 11, color: '#8090a8', lineHeight: 1.5 }}>Tus ingresos quedan por debajo del umbral configurado, así que la retención sobre los dividendos <b>españoles</b> se te devolvería en la declaración (tipo efectivo 0%). La retención en origen de dividendos extranjeros se reclama al país de origen.</p>
        </div>
      )}
      {!exempt && incomeMode && (
        <p style={{ fontSize: 11, color: '#8090a8', marginBottom: 12 }}>Tipo del ahorro calculado según tus ingresos y tu renta del ahorro (dividendos anuales). Configúralo en <b>Ajustes → Fiscalidad</b>.</p>
      )}
      {fiscal.length === 0 ? (
        <p style={{ fontSize: 13, color: '#4a5270' }}>Añade posiciones con dividendo para ver el análisis fiscal.</p>
      ) : (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, minWidth: 500 }}>
              <thead>
                <tr>
                  {['Empresa','País empresa','Divid. bruto','Retención origen','Retención ES','Divid. neto','Tipo ef.'].map(h => (
                    <th key={h} style={{ padding: '6px 8px', textAlign: h === 'Empresa' ? 'left' : 'right', color: '#4a5270', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.06)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {fiscal.map((f, i) => (
                  <tr key={i} style={{ background: i % 2 ? 'rgba(255,255,255,0.015)' : 'transparent' }}>
                    <td style={{ padding: '7px 8px', color: '#c8d0e0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>{f.name}</td>
                    <td style={{ padding: '7px 8px', color: '#8090a8', textAlign: 'right', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>{f.companyCountry}</td>
                    <td style={{ padding: '7px 8px', textAlign: 'right', color: '#c8d0e0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>{fmtEUR(f.gross)}</td>
                    <td style={{ padding: '7px 8px', textAlign: 'right', color: '#f87171', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>-{fmtEUR(f.sourceWH)} ({f.sourceRate.toFixed(1)}%)</td>
                    <td style={{ padding: '7px 8px', textAlign: 'right', color: f.additionalES < -0.005 ? '#34d399' : '#f87171', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>{f.additionalES < -0.005 ? `+${fmtEUR(-f.additionalES)}` : `-${fmtEUR(f.additionalES)}`}</td>
                    <td style={{ padding: '7px 8px', textAlign: 'right', color: '#34d399', fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>{fmtEUR(f.net)}</td>
                    <td style={{ padding: '7px 8px', textAlign: 'right', color: '#fbbf24', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>{f.effectiveRate.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                  <td colSpan={2} style={{ padding: '8px', fontWeight: 700, color: '#c8d0e0' }}>Total</td>
                  <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700, color: '#c8d0e0' }}>{fmtEUR(totalGross)}</td>
                  <td colSpan={2} />
                  <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700, color: '#34d399' }}>{fmtEUR(totalNet)}</td>
                  <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700, color: '#fbbf24' }}>
                    {totalGross > 0 ? ((totalGross - totalNet) / totalGross * 100).toFixed(1) + '%' : '—'}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p style={{ fontSize: 10, color: '#2e3a55', marginTop: 10 }}>
            Los cálculos son orientativos y no tienen en cuenta acuerdos de doble imposición ni situaciones personales específicas. Consulta con un asesor fiscal.
          </p>
        </>
      )}
    </div>
  )
  return isPremium ? inner : <PremiumGate />
}

// ── Edit modal ─────────────────────────────────────────────────────────────
function EditModal({ position, onClose, onSave }) {
  const [shares,  setShares]  = useState(String(position.shares))
  const [avgCost, setAvgCost] = useState(String(position.avg_cost))
  const [saving, setSaving]   = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true)
    await onSave(position.id, parseFloat(shares), parseFloat(avgCost))
    setSaving(false)
    onClose()
  }

  return (
    <Modal onClose={onClose} title={`Editar ${position.name}`}>
      <form onSubmit={submit} style={{ display: 'grid', gap: 14 }}>
        <div>
          <label style={{ fontSize: 11, color: '#4a5270', marginBottom: 4, display: 'block' }}>Acciones</label>
          <input style={INPUT} type="number" step="any" value={shares} onChange={e => setShares(e.target.value)} required />
        </div>
        <div>
          <label style={{ fontSize: 11, color: '#4a5270', marginBottom: 4, display: 'block' }}>Precio medio compra ({position.currency})</label>
          <input style={INPUT} type="number" step="any" value={avgCost} onChange={e => setAvgCost(e.target.value)} required />
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} style={{ padding: '8px 16px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7, color: '#4a5270', cursor: 'pointer', fontSize: 12 }}>Cancelar</button>
          <button type="submit" disabled={saving} style={{ padding: '8px 16px', background: 'rgba(99,102,241,0.85)', border: 'none', borderRadius: 7, color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 12 }}>
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ── Dividend modal ─────────────────────────────────────────────────────────
function DividendModal({ position, onClose, onSave }) {
  const [amount,    setAmount]    = useState('')
  const [amountNet, setAmountNet] = useState('')
  const [date,      setDate]      = useState(new Date().toISOString().slice(0, 10))
  const [saving, setSaving]       = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true)
    await onSave(position.ticker, parseFloat(amount), amountNet ? parseFloat(amountNet) : null, date)
    setSaving(false)
    onClose()
  }

  return (
    <Modal onClose={onClose} title={`Dividendo cobrado — ${position.name}`}>
      <form onSubmit={submit} style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label style={{ fontSize: 11, color: '#4a5270', marginBottom: 4, display: 'block' }}>Importe bruto ({position.currency})</label>
            <input style={INPUT} type="number" step="any" min="0" placeholder="120.00" value={amount} onChange={e => setAmount(e.target.value)} required />
          </div>
          <div>
            <label style={{ fontSize: 11, color: '#4a5270', marginBottom: 4, display: 'block' }}>Importe neto (opcional)</label>
            <input style={INPUT} type="number" step="any" min="0" placeholder="97.00" value={amountNet} onChange={e => setAmountNet(e.target.value)} />
          </div>
        </div>
        <div>
          <label style={{ fontSize: 11, color: '#4a5270', marginBottom: 4, display: 'block' }}>Fecha de cobro</label>
          <input style={INPUT} type="date" value={date} onChange={e => setDate(e.target.value)} required />
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} style={{ padding: '8px 16px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7, color: '#4a5270', cursor: 'pointer', fontSize: 12 }}>Cancelar</button>
          <button type="submit" disabled={saving} style={{ padding: '8px 16px', background: 'rgba(52,211,153,0.8)', border: 'none', borderRadius: 7, color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 12 }}>
            {saving ? 'Guardando…' : 'Registrar'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ── Delete confirmation ────────────────────────────────────────────────────
function DeleteModal({ positionId, onClose, onConfirm }) {
  return (
    <Modal onClose={onClose} title="Eliminar posición">
      <p style={{ fontSize: 13, color: '#8090a8', marginBottom: 16 }}>Esta acción eliminará la posición. El historial de transacciones se mantendrá.</p>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onClose} style={{ padding: '8px 16px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7, color: '#4a5270', cursor: 'pointer', fontSize: 12 }}>Cancelar</button>
        <button onClick={() => { onConfirm(positionId); onClose() }} style={{ padding: '8px 16px', background: 'rgba(248,113,113,0.8)', border: 'none', borderRadius: 7, color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 12 }}>
          Sí, eliminar
        </button>
      </div>
    </Modal>
  )
}

// ── Main component ─────────────────────────────────────────────────────────
export default function PortfolioPage({ isPremium }) {
  const router  = useRouter()
  const [enriched, setEnriched]       = useState([])
  const [loading, setLoading]         = useState(true)
  const [editPos,   setEditPos]       = useState(null)
  const [divPos,    setDivPos]        = useState(null)
  const [deleteId,  setDeleteId]      = useState(null)
  const [fiscalCountry, setFiscal]    = useState('ES')

  const sb = createClient()

  const load = async () => {
    setLoading(true)
    const { data: { user } } = await sb.auth.getUser()
    if (!user) { router.push('/login'); return }

    const [{ data: positions }, { data: txs }, { data: divsRec }] = await Promise.all([
      sb.from('positions').select('*').eq('user_id', user.id),
      sb.from('transactions').select('*').eq('user_id', user.id),
      sb.from('dividends_received').select('ticker, amount, amount_net').eq('user_id', user.id),
    ])
    if (!positions?.length) { setEnriched([]); setLoading(false); return }

    // Comisiones de broker acumuladas por ticker (solo compras), en la divisa de la operación
    const commByTicker = {}
    ;(txs || []).forEach(t => {
      if (t.type === 'sell') return
      commByTicker[t.ticker] = (commByTicker[t.ticker] || 0) + (Number(t.commission) || 0)
    })

    // Dividendos NETOS cobrados acumulados por ticker (en EUR, como el resto de la
    // cartera). Sirven para el coste neto efectivo = coste de compra − cobrado.
    const divByTicker = {}
    ;(divsRec || []).forEach(d => {
      const v = Number(d.amount_net ?? d.amount) || 0
      divByTicker[d.ticker] = (divByTicker[d.ticker] || 0) + v
    })

    const stockTickers = [...new Set(positions.filter(p => (p.asset_type || 'stock') === 'stock').map(p => p.ticker))]
    const fundTickers  = [...new Set(positions.filter(p => (p.asset_type || 'stock') !== 'stock').map(p => p.ticker))]

    const [{ data: funds }, { data: fundsData }] = await Promise.all([
      stockTickers.length ? sb.from('company_fundamentals')
        .select('ticker, current_price, dps, payout_fcf, debt_ebitda, interest_coverage, fcf_cagr5, div_cagr5, div_history, sector, industry, country')
        .in('ticker', stockTickers) : Promise.resolve({ data: [] }),
      fundTickers.length ? sb.from('funds').select('*').in('ticker', fundTickers) : Promise.resolve({ data: [] }),
    ])

    const fundMap  = Object.fromEntries((funds || []).map(f => [f.ticker, f]))
    const fundsMap = Object.fromEntries((fundsData || []).map(f => [f.ticker, f]))

    // Precios frescos: el endpoint sirve de daily_prices y refresca de Yahoo los
    // tickers desactualizados (en una sola llamada), archivándolos. Así la cartera
    // muestra el precio actual sin tener que visitar la ficha de cada empresa.
    let dailyPricesMap = {}
    try {
      const res  = await fetch('/api/precios', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tickers: [...stockTickers, ...fundTickers] }),
      })
      const json = await res.json().catch(() => ({}))
      dailyPricesMap = json.prices || {}
    } catch {}

    // Inyectar precios frescos en fundMap y fundsMap
    for (const ticker of Object.keys(dailyPricesMap)) {
      const dp = dailyPricesMap[ticker]
      if (dp?.price == null) continue
      if (fundMap[ticker])  fundMap[ticker]  = { ...fundMap[ticker],  current_price: dp.price }
      if (fundsMap[ticker]) fundsMap[ticker] = { ...fundsMap[ticker], current_price: dp.price }
    }

    // Coste real por acción (incluye comisiones de compra) + YoC sobre coste real
    const enr = enrichPositions(positions, fundMap, fundsMap).map(p => {
      const comm = commByTicker[p.ticker] || 0
      const shares = Number(p.shares) || 0
      const avgCostReal = shares > 0 ? (Number(p.avg_cost) * shares + comm) / shares : p.avg_cost
      const yieldOnCostReal = (avgCostReal > 0 && p.dps != null) ? p.dps / avgCostReal * 100 : null
      // Coste neto efectivo = coste de compra (EUR) − dividendos netos cobrados.
      // YoC real = renta anual / coste neto (la rentabilidad sobre lo que de verdad
      // sigues teniendo en riesgo una vez recuperados dividendos).
      const dividendsCollectedEUR = divByTicker[p.ticker] || 0
      const netCostEUR = p.costEUR != null ? p.costEUR - dividendsCollectedEUR : null
      const yoCNet = (netCostEUR == null || p.annualIncomeEUR == null) ? null
        : netCostEUR <= 0 ? Infinity
        : p.annualIncomeEUR / netCostEUR * 100
      const f = fundMap[p.ticker]
      return {
        ...p, buyCommission: comm, avgCostReal, yieldOnCostReal,
        dividendsCollectedEUR, netCostEUR, yoCNet,
        div_cagr5: p.div_cagr5 ?? f?.div_cagr5 ?? null,
        divG1y: lastDivGrowth(f?.div_history),
      }
    })
    setEnriched(enr)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const handleEdit = async (id, shares, avg_cost) => {
    const { data: { user } } = await sb.auth.getUser()
    await sb.from('positions').update({ shares, avg_cost, updated_at: new Date().toISOString() }).eq('id', id).eq('user_id', user.id)
    load()
  }

  const handleDividend = async (ticker, amount, amount_net, date) => {
    const { data: { user } } = await sb.auth.getUser()
    await sb.from('dividends_received').insert({ user_id: user.id, ticker, amount, amount_net, date })
  }

  const handleDelete = async (id) => {
    const { data: { user } } = await sb.auth.getUser()
    await sb.from('positions').delete().eq('id', id).eq('user_id', user.id)
    load()
  }

  // Perfil de inversor elegido — guardado en los ajustes del usuario (user_settings
  // vía /api/ajustes), para que quede asociado a la cuenta desde cualquier dispositivo.
  const [profile, setProfile] = useState(DEFAULT_PROFILE)
  const [taxSettings, setTaxSettings] = useState(null)
  const [whtOverrides, setWhtOverrides] = useState(null)
  const [incomeGoal, setIncomeGoal] = useState(null)
  useEffect(() => {
    let cancel = false
    fetch('/api/ajustes').then(r => r.ok ? r.json() : null).then(d => {
      const p = d?.settings?.investor_profile
      if (cancel) return
      if (p && INVESTOR_PROFILES[p]) setProfile(p)
      if (d?.settings) setTaxSettings(d.settings)
      if (d?.settings?.wht_overrides && typeof d.settings.wht_overrides === 'object') setWhtOverrides(d.settings.wht_overrides)
      if (d?.settings?.income_goal != null) setIncomeGoal(Number(d.settings.income_goal))
    }).catch(() => {})
    return () => { cancel = true }
  }, [])
  const saveGoal = (g) => {
    setIncomeGoal(g)   // optimista
    fetch('/api/ajustes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ income_goal: g }),
    }).catch(() => {})
  }
  const changeProfile = (k) => {
    if (!INVESTOR_PROFILES[k]) return
    setProfile(k)   // optimista
    fetch('/api/ajustes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ investor_profile: k }),
    }).catch(() => {})
  }

  const summary       = useMemo(() => calcSummary(enriched), [enriched])
  const dividendGrowth = useMemo(() => calcDividendGrowth(enriched), [enriched])
  // Tipo efectivo del ahorro español: en modo "por ingresos" se calcula con la
  // renta del ahorro real del usuario (= sus dividendos anuales). 0 si está exento.
  const destWHT       = useMemo(() => resolveDestWHT(taxSettings, summary.totalIncomeEUR), [taxSettings, summary.totalIncomeEUR])
  const concentration = useMemo(() => calcConcentration(enriched), [enriched])
  const sectorBreakdown = useMemo(() => calcSectorBreakdown(enriched), [enriched])
  const geoBreakdown    = useMemo(() => calcGeoBreakdown(enriched), [enriched])
  const profileFit    = useMemo(() => calcProfileFit(enriched, profile), [enriched, profile])
  const alerts        = useMemo(() => calcAlerts(enriched, concentration), [enriched, concentration])
  const divScore      = useMemo(() => calcDiversificationScore(enriched, profile), [enriched, profile])
  const divRisks      = useMemo(() => calcDividendRisks(enriched, summary.totalIncomeEUR), [enriched, summary])
  const fiscal        = useMemo(() => calcFiscal(enriched, whtOverrides, destWHT), [enriched, whtOverrides, destWHT])
  const netIncomeEUR  = useMemo(() => (fiscal || []).reduce((s, r) => s + (r.net || 0), 0), [fiscal])

  if (loading) {
    return (
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '40px 16px', textAlign: 'center' }}>
        <p style={{ color: '#4a5270' }}>Cargando cartera…</p>
      </div>
    )
  }

  return (
    <div className="cdp-root" style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 16px 64px' }}>
      {/* Compactar en móvil: menos padding interno y menos separación entre fichas. */}
      <style>{`@media(max-width:640px){
        .cdp-root{--cdp-pad:13px;}
        .cdp-root>div{margin-bottom:10px!important;}
      }`}</style>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, color: '#e0e8f0' }}>Mi cartera</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <PricesFreshnessIndicator />
          <Link href="/cartera/importar" style={{ padding: '9px 16px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: '#c8d0e0', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
            ⭳ Importar
          </Link>
          {enriched.length > 0 && (
            <Link href="/cartera/nueva-posicion" style={{ padding: '9px 18px', background: 'rgba(99,102,241,0.85)', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
              + Añadir posición
            </Link>
          )}
        </div>
      </div>

      {/* Posiciones — lo más importante, arriba del todo */}
      <PositionsTable
        enriched={enriched} isPremium={isPremium}
        onEdit={setEditPos}
        onDividend={setDivPos}
        onDelete={setDeleteId}
      />

      {/* FX rates widget — only when portfolio has non-EUR currencies */}
      {enriched.length > 0 && (
        <FxRatesWidget currencies={[...new Set(enriched.map(p => p.currency).filter(Boolean))]} />
      )}

      {/* Section 1: Summary */}
      {enriched.length > 0 && <SummarySection summary={summary} netIncomeEUR={netIncomeEUR} />}

      {/* Meta de renta pasiva — estrella polar */}
      {enriched.length > 0 && <IncomeGoalCard currentIncome={summary.totalIncomeEUR} goal={incomeGoal} growthPct={dividendGrowth?.g5y ?? 0} onSave={saveGoal} />}

      {enriched.length > 0 && <IncomeProjectionCard enriched={enriched} taxRate={destWHT} isPremium={isPremium} />}

      {/* Evolución del patrimonio — debajo del resumen, antes de las posiciones */}
      {enriched.length > 0 && <PortfolioEvolution isPremium={isPremium} summary={summary} />}

      {/* Module 1: Score DGI de la cartera con benchmark */}
      {enriched.length > 0 && <PortfolioDGIScore enriched={enriched} isPremium={isPremium} />}

      {/* Module 2: Detector de empresas que encajan */}
      {enriched.length > 0 && <CompanyDetector enriched={enriched} isPremium={isPremium} />}

      {/* Próximos cobros de dividendo */}
      {enriched.length > 0 && <UpcomingDividends />}

      {/* Mini watchlist — empresas seguidas más próximas a su objetivo */}
      <WatchlistMini />

      {/* Aportaciones periódicas */}
      <RecurringSection />

      {enriched.length > 0 && (
        <>
          {/* Section 3: Concentration */}
          <ConcentrationSection concentration={concentration} sectorBreakdown={sectorBreakdown} geoBreakdown={geoBreakdown} alerts={alerts} isPremium={isPremium} />

          {/* Perfil de inversor: reparto por supersectores vs objetivo */}
          <InvestorProfileSection fit={profileFit} profileKey={profile} onChange={changeProfile} isPremium={isPremium} />

          {/* Section 4: Diversification score */}
          <DiversificationSection score={divScore} isPremium={isPremium} />

          {/* Section 5: Dividend risk */}
          <DividendRiskSection risks={divRisks} totalIncomeEUR={summary.totalIncomeEUR} isPremium={isPremium} />

          {/* Section 6: Fiscal */}
          <FiscalSection fiscal={fiscal} country={fiscalCountry} onCountryChange={setFiscal} isPremium={isPremium} exempt={isExemptUser(taxSettings)} incomeMode={taxSettings?.tax_mode === 'income'} />

          {/* Section 7: Currency analysis with FX impact simulator */}
          <CurrencyAnalysis enriched={enriched} isPremium={isPremium} />
        </>
      )}

      {/* Modals */}
      {editPos  && <EditModal     position={editPos}    onClose={() => setEditPos(null)}  onSave={handleEdit} />}
      {divPos   && <DividendModal position={divPos}     onClose={() => setDivPos(null)}   onSave={handleDividend} />}
      {deleteId && <DeleteModal   positionId={deleteId} onClose={() => setDeleteId(null)} onConfirm={handleDelete} />}
    </div>
  )
}
