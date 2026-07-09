'use client'
import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, LabelList } from 'recharts'
import { createClient } from '@/lib/supabase/client'
import CompanyLogo from '@/components/CompanyLogo'
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
import OperationsCard from '@/components/cartera/OperationsCard'
import FxRatesWidget from '@/components/cartera/FxRatesWidget'
import CurrencyAnalysis from '@/components/cartera/CurrencyAnalysis'
import PricesFreshnessIndicator from '@/components/PricesFreshnessIndicator'
import WatchlistMini from '@/components/cartera/WatchlistMini'
import UpcomingDividends from '@/components/cartera/UpcomingDividends'

// ── Design tokens ──────────────────────────────────────────────────────────
// padding como variable CSS → en móvil se reduce vía media query (ver cdp-root) sin
// tocar cada ficha (el inline no se puede sobreescribir con CSS normal, pero una var sí).
const CARD   = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 'var(--cdp-pad, 20px)' }
const COLORS = ['var(--accent)','var(--positive)','var(--warning)','var(--negative)','#60a5fa','#a78bfa','#fb923c','var(--positive-soft)','#f472b6','#38bdf8']
const INPUT  = { background: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' }

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
function gainCol(v) { return v == null ? 'var(--text-faint)' : v >= 0 ? 'var(--positive)' : 'var(--negative)' }

// ── Premium gate ───────────────────────────────────────────────────────────
// Decoy: NO renderiza los children reales — solo un esqueleto ficticio. Quitar
// el blur o leer el DOM no revela el análisis premium de la cartera.
function PremiumGate() {
  return (
    <div style={{ position: 'relative', minHeight: 150 }}>
      <div style={{ filter: 'blur(6px)', pointerEvents: 'none', userSelect: 'none', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }} aria-hidden="true">
        <div style={{ height: 11, width: '42%', background: 'var(--border-strong)', borderRadius: 5, marginBottom: 16 }} />
        <div style={{ display: 'grid', gap: 9 }}>
          {[88, 70, 94, 60].map((w, i) => <div key={i} style={{ height: 9, width: `${w}%`, background: 'var(--border)', borderRadius: 4 }} />)}
        </div>
      </div>
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 8,
        background: 'rgba(8,11,20,0.55)',
      }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>Contenido Premium</p>
        <Link href="/pricing" style={{ fontSize: 12, fontWeight: 700, color: '#fff', textDecoration: 'none', padding: '7px 18px', background: 'var(--accent)', borderRadius: 8 }}>
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
          <p style={{ fontWeight: 700, color: 'var(--text)', fontSize: 15 }}>{title}</p>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
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
      <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>{title}</p>
      <ResponsiveContainer width="100%" height={160}>
        <PieChart>
          <Pie data={data} cx="50%" cy="50%" innerRadius={42} outerRadius={68} dataKey="value" paddingAngle={2}>
            {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Pie>
          <Tooltip
            contentStyle={{ background: 'var(--bg-elev)', border: '1px solid var(--border-strong)', borderRadius: 8, fontSize: 11 }}
            formatter={(v, n) => [`${v.toFixed(1)}%`, n]}
          />
        </PieChart>
      </ResponsiveContainer>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px', justifyContent: 'center', marginTop: 6 }}>
        {data.slice(0, 6).map((d, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-muted)' }}>
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

// ── Renta neta por dividendos: Previsión (año actual real + 9 años proyectados) y
//    Años anteriores (solo lo cobrado en el pasado) ──
function IncomeProjectionCard({ enriched, taxRate, whtOverrides, isPremium }) {
  const [view, setView] = useState('forecast')   // 'forecast' | 'past'
  const [byYear, setByYear] = useState(null)
  const sb = createClient()

  const growth = useMemo(() => calcDividendGrowth(enriched), [enriched])
  const proj = useMemo(() => enriched.length ? projectIncome(enriched, { horizon: 10, taxRate, whtOverrides }) : null, [enriched, taxRate, whtOverrides])
  const curYear = new Date().getFullYear()

  // Renta REAL por año natural desde dividends_received (mismos registros que la
  // pestaña Dividendos, con prefill que respeta la fecha de compra).
  useEffect(() => {
    let cancel = false
    ;(async () => {
      const { data: { user } } = await sb.auth.getUser()
      if (!user) { if (!cancel) setByYear([]); return }
      try { await fetch('/api/dividends/prefill', { method: 'POST' }) } catch {}
      const { data } = await sb.from('dividends_received').select('amount, amount_net, date, status').eq('user_id', user.id)
      if (cancel) return
      const map = {}
      const maxYear = new Date().getFullYear() + 12
      for (const d of data || []) {
        const y = d.date ? String(d.date).slice(0, 4) : null
        const yn = Number(y)
        const net = Number(d.amount_net ?? d.amount) || 0
        if (!y || !net || !yn || yn < 2000 || yn > maxYear) continue   // descarta fechas absurdas
        if (!map[y]) map[y] = { year: y, received: 0, pending: 0 }
        if (d.status === 'received') map[y].received += net
        else map[y].pending += net
      }
      const arr = Object.values(map).sort((a, b) => a.year < b.year ? -1 : 1)
        .map(r => ({ year: r.year, received: Math.round(r.received), pending: Math.round(r.pending), total: Math.round(r.received + r.pending) }))
      if (!cancel) setByYear(arr)
    })().catch(() => { if (!cancel) setByYear([]) })
    return () => { cancel = true }
  }, [sb])

  if (!isPremium) return <PremiumGate />
  if (byYear == null) return <div style={{ ...CARD, marginBottom: 16, height: 120, opacity: 0.5 }} />

  // PREVISIÓN: año en curso REAL (cobrado + estimado del año) + los 9 años siguientes
  // PROYECTADOS (ritmo anualizado creciendo con el CAGR real de cada empresa).
  const curReal = byYear.find(r => r.year === String(curYear))
  const forecastData = [{
    year: String(curYear),
    received: curReal?.received ?? 0,
    pending: curReal?.pending ?? (curReal ? 0 : Math.round(proj?.base?.[0]?.net ?? 0)),
    projected: 0,
    total: curReal?.total ?? Math.round(proj?.base?.[0]?.net ?? 0),
  }]
  ;(proj?.base || []).slice(1).forEach((d, i) => {
    forecastData.push({ year: String(curYear + 1 + i), received: 0, pending: 0, projected: Math.round(d.net), total: Math.round(d.net) })
  })

  // AÑOS ANTERIORES: solo lo realmente COBRADO en años pasados.
  const pastData = byYear.filter(r => Number(r.year) < curYear && r.received > 0)
    .map(r => ({ year: r.year, received: r.received, total: r.received }))

  const TabBtn = ({ k, label }) => (
    <button onClick={() => setView(k)} style={{
      fontSize: 12, fontWeight: 700, padding: '5px 13px', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit',
      border: '1px solid ' + (view === k ? 'rgba(52,211,153,0.5)' : 'var(--border-strong)'),
      background: view === k ? 'rgba(52,211,153,0.18)' : 'transparent', color: view === k ? 'var(--positive)' : 'var(--text-muted)',
    }}>{label}</button>
  )
  const Stat = ({ label, value, color }) => (
    <div style={{ flex: 1, minWidth: 150, background: `${color}12`, border: `1px solid ${color}30`, borderRadius: 10, padding: '12px 14px' }}>
      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</p>
      <p style={{ fontSize: 22, fontWeight: 800, color }}>{value}</p>
    </div>
  )
  const lblFmt = v => v >= 1000 ? `${(v / 1000).toFixed(1)}K` : Math.round(v)
  const axisProps = {
    xaxis: { dataKey: 'year', stroke: 'var(--text-muted)', fontSize: 11, tickLine: false, axisLine: { stroke: 'var(--border-strong)' }, height: 24 },
    yaxis: { stroke: 'var(--text-faint)', fontSize: 10, tickLine: false, axisLine: false, tickFormatter: v => v >= 1000 ? `${(v / 1000).toFixed(1)}K` : v, width: 34 },
  }

  return (
    <div style={{ ...CARD, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Renta neta por dividendos, €</p>
        <div style={{ display: 'flex', gap: 6 }}>
          <TabBtn k="forecast" label="Previsión" />
          <TabBtn k="past" label="Años anteriores" />
        </div>
      </div>

      {view === 'forecast' ? (
        <>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={forecastData} margin={{ top: 22, right: 6, left: 2, bottom: 0 }}>
              <XAxis {...axisProps.xaxis} />
              <YAxis {...axisProps.yaxis} />
              <Tooltip contentStyle={{ background: 'var(--bg-elev)', border: '1px solid var(--border-strong)', borderRadius: 8, fontSize: 12 }} cursor={{ fill: 'var(--surface-2)' }}
                formatter={(v, n) => v > 0 ? [fmtEUR(v), n === 'pending' ? 'Estimado del año' : n === 'projected' ? 'Previsión' : 'Cobrado'] : [null, null]} labelFormatter={l => `Año ${l}`} />
              <Bar dataKey="received" stackId="d" fill="var(--positive)" maxBarSize={48} />
              <Bar dataKey="pending" stackId="d" fill="var(--positive)" fillOpacity={0.38} radius={[3, 3, 0, 0]} maxBarSize={48} />
              <Bar dataKey="projected" stackId="d" fill="var(--accent)" fillOpacity={0.55} radius={[3, 3, 0, 0]} maxBarSize={48}>
                <LabelList dataKey="total" position="top" fill="var(--text)" fontSize={9.5} fontWeight={700} formatter={lblFmt} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 2, marginBottom: 14, flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-muted)' }}><span style={{ width: 11, height: 11, background: 'var(--positive)', borderRadius: 2 }} />Cobrado</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-muted)' }}><span style={{ width: 11, height: 11, background: 'var(--positive)', opacity: 0.38, borderRadius: 2 }} />Estimado {curYear}</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-muted)' }}><span style={{ width: 11, height: 11, background: 'var(--accent)', opacity: 0.55, borderRadius: 2 }} />Previsión (crece con el CAGR real)</span>
            <Link href="/cartera/proyeccion" style={{ fontSize: 11, color: 'var(--accent)', textDecoration: 'none', marginLeft: 'auto' }}>Escenarios →</Link>
          </div>
        </>
      ) : (
        <>
          {pastData.length === 0 ? (
            <p style={{ fontSize: 12.5, color: 'var(--text-faint)', padding: '40px 0', textAlign: 'center' }}>Aún no hay dividendos cobrados de años anteriores. Cuando registres o importes cobros pasados, aparecerán aquí.</p>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={pastData} margin={{ top: 22, right: 6, left: 2, bottom: 0 }}>
                <XAxis {...axisProps.xaxis} />
                <YAxis {...axisProps.yaxis} />
                <Tooltip contentStyle={{ background: 'var(--bg-elev)', border: '1px solid var(--border-strong)', borderRadius: 8, fontSize: 12 }} cursor={{ fill: 'var(--surface-2)' }}
                  formatter={v => [fmtEUR(v), 'Cobrado']} labelFormatter={l => `Año ${l}`} />
                <Bar dataKey="received" fill="var(--positive)" radius={[3, 3, 0, 0]} maxBarSize={54}>
                  <LabelList dataKey="received" position="top" fill="var(--text)" fontSize={10} fontWeight={700} formatter={lblFmt} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 2, marginBottom: 14 }}>
            <span style={{ width: 11, height: 11, background: 'var(--positive)', borderRadius: 2 }} />
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Cobrado neto realmente en cada año pasado</span>
          </div>
        </>
      )}

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Stat label="Crecimiento del dividendo · últimos 12 meses" value={growth.g1y != null ? `${growth.g1y >= 0 ? '+' : ''}${growth.g1y.toFixed(1)}%` : '—'} color="var(--positive)" />
        <Stat label="Crecimiento del dividendo · últimos 5 años (anual)" value={growth.g5y != null ? `${growth.g5y.toFixed(1)}%` : '—'} color="var(--accent)" />
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
          <p style={{ fontSize: 9.5, color: 'var(--text-faint)', marginBottom: 2 }}>{it.label}</p>
          <p style={{ fontSize: 17, fontWeight: 800, color: it.col || 'var(--text)', lineHeight: 1.15 }}>{it.value}</p>
          {it.sub && <p style={{ fontSize: 11, fontWeight: 700, color: it.col, marginTop: 1 }}>{it.sub}</p>}
        </div>
      ))}
    </div>
  )
}

// ── Fondo de oportunidad (liquidez) — tarjeta resumen ──────────────────────
// Saldo del fondo + patrimonio total (invertido + liquidez). Se carga aparte.
function CashFundCard({ investedEUR }) {
  const [balance, setBalance] = useState(null)
  useEffect(() => {
    let cancel = false
    fetch('/api/cartera/liquidez').then(r => r.ok ? r.json() : null).then(d => {
      if (cancel || !d) return
      setBalance(Number(d.balance) || 0)
    }).catch(() => {})
    return () => { cancel = true }
  }, [])
  if (balance == null) return null
  const total = (investedEUR || 0) + balance
  return (
    <div style={{ ...CARD, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
      <div>
        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>Fondo de oportunidad</p>
        <p style={{ fontSize: 22, fontWeight: 900, color: 'var(--text-strong)' }}>{fmtEUR(balance, 0)} <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-faint)' }}>de liquidez</span></p>
        <p style={{ fontSize: 11, color: 'var(--text-faintest)', marginTop: 3 }}>Patrimonio total (invertido + liquidez): <b style={{ color: 'var(--text-muted)' }}>{fmtEUR(total, 0)}</b></p>
      </div>
      <Link href="/cartera/liquidez" style={{ padding: '9px 16px', background: 'var(--surface-3)', border: '1px solid var(--border-strong)', borderRadius: 8, color: 'var(--text)', fontSize: 13, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}>
        Gestionar →
      </Link>
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
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>🎯 Fija tu meta de renta pasiva</p>
          <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>Define cuántos dividendos quieres cobrar al año y sigue tu progreso.</p>
        </div>
        <button onClick={() => setEditing(true)} style={{ padding: '8px 16px', background: 'var(--accent)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>Fijar meta</button>
      </div>
    )
  }

  const pct = goal > 0 ? Math.min(100, currentIncome / goal * 100) : 0
  const reached = currentIncome >= goal
  const g = (growthPct ?? 0) / 100
  // ETA solo con crecimiento orgánico del dividendo (sin aportaciones nuevas).
  let etaYears = null
  if (!reached && currentIncome > 0 && g > 0.001) etaYears = Math.log(goal / currentIncome) / Math.log(1 + g)
  const barCol = reached ? 'var(--positive)' : pct >= 50 ? '#60a5fa' : 'var(--accent)'

  return (
    <div style={{ ...CARD, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>🎯 Meta de renta pasiva</p>
        {editing ? (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="number" step="any" value={val} onChange={e => setVal(e.target.value)} placeholder="€/año" style={{ ...INPUT, width: 110, padding: '6px 10px' }} />
            <button onClick={save} style={{ padding: '6px 12px', background: 'var(--accent)', border: 'none', borderRadius: 7, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Guardar</button>
          </div>
        ) : (
          <button onClick={() => setEditing(true)} style={{ background: 'none', border: '1px solid var(--border-strong)', borderRadius: 7, padding: '5px 12px', color: 'var(--text-muted)', fontSize: 11.5, cursor: 'pointer' }}>Editar meta</button>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <span style={{ fontSize: 24, fontWeight: 900, color: 'var(--text-strong)' }}>{fmtEUR(currentIncome)}<span style={{ fontSize: 13, color: 'var(--text-faint)', fontWeight: 700 }}> / {fmtEUR(goal)} al año</span></span>
        <span style={{ fontSize: 18, fontWeight: 800, color: barCol }}>{pct.toFixed(0)}%</span>
      </div>
      <div style={{ height: 10, background: 'var(--border)', borderRadius: 6, overflow: 'hidden', marginBottom: 10 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: barCol, borderRadius: 6, transition: 'width .4s' }} />
      </div>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
        {reached
          ? '🎉 ¡Meta alcanzada! Tu cartera ya genera la renta que te marcaste.'
          : etaYears != null
            ? <>Te faltan <strong style={{ color: 'var(--text)' }}>{fmtEUR(goal - currentIncome)}</strong>. Solo con el crecimiento del dividendo (~{growthPct.toFixed(1)}%/año, sin nuevas aportaciones) la alcanzarías en <strong style={{ color: '#60a5fa' }}>~{etaYears < 1 ? '<1' : Math.round(etaYears)} {etaYears < 1 || Math.round(etaYears) === 1 ? 'año' : 'años'}</strong>.</>
            : <>Te faltan <strong style={{ color: 'var(--text)' }}>{fmtEUR(goal - currentIncome)}</strong>. Aporta y reinvierte para acelerar el objetivo.</>}
      </p>
    </div>
  )
}

// ── Section 2: Positions table ─────────────────────────────────────────────
// Dato compacto para la ficha móvil expandida de cada posición.
function MobileStat({ label, value, sub, color }) {
  return (
    <div>
      <p style={{ fontSize: 10, color: 'var(--text-faint)', marginBottom: 1 }}>{label}</p>
      <p style={{ fontSize: 12.5, fontWeight: 700, color: color || 'var(--text)' }}>{value}</p>
      {sub ? <p style={{ fontSize: 10, color: 'var(--accent)' }}>{sub}</p> : null}
    </div>
  )
}

// Accesor por columna para ordenar la tabla de posiciones (escritorio). '' (acciones) no ordena.
const POS_SORT = {
  'Empresa':    p => (p.name || '').toLowerCase(),
  'Acciones':   p => p.shares,
  'P. Medio':   p => p.avg_cost,
  'Coste real': p => p.avgCostReal,
  'P. Actual':  p => p.currentPrice,
  'Valor':      p => p.valueEUR,
  'Rentab.':    p => p.gainPct,
  'YoC':        p => (p.yieldOnCostReal ?? p.yieldOnCost),
  'Yield':      p => p.currentYield,
  'Renta/año':  p => p.annualIncomeEUR,
  'Cobrado':    p => p.dividendsCollectedEUR,
  'Coste neto': p => p.netCostEUR,
}

function PositionsTable({ enriched, isPremium, onEdit, onDelete }) {
  const FREE_LIMIT = 10
  const [openId, setOpenId] = useState(null)
  const [sort, setSort] = useState({ key: null, dir: 'desc' })

  const onSort = (h) => {
    if (!POS_SORT[h]) return
    setSort(s => s.key === h ? { key: h, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: h, dir: h === 'Empresa' ? 'asc' : 'desc' })
  }
  const sortedRows = useMemo(() => {
    if (!sort.key || !POS_SORT[sort.key]) return enriched
    const acc = POS_SORT[sort.key], dir = sort.dir === 'asc' ? 1 : -1
    return [...enriched].sort((a, b) => {
      const va = acc(a), vb = acc(b)
      const na = va == null || (typeof va === 'number' && Number.isNaN(va))
      const nb = vb == null || (typeof vb === 'number' && Number.isNaN(vb))
      if (na && nb) return 0
      if (na) return 1          // sin dato → siempre al final
      if (nb) return -1
      return (typeof va === 'string' ? va.localeCompare(vb) : va - vb) * dir
    })
  }, [enriched, sort])

  return (
    <div style={{ ...CARD, marginBottom: 16 }}>
      {/* En móvil ocultamos la tabla ancha y mostramos fichas plegables sin scroll horizontal. */}
      <style>{`
        @media(max-width:760px){ .pos-desktop{display:none!important;} }
        @media(min-width:761px){ .pos-mobile{display:none!important;} }
      `}</style>
      <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14 }}>Posiciones</p>
      {enriched.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <p style={{ color: 'var(--text-faint)', fontSize: 14, marginBottom: 8 }}>Empieza tu cartera DGI</p>
          <p style={{ color: 'var(--text-muted)', fontSize: 12.5, marginBottom: 18, maxWidth: 460, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.5 }}>¿No sabes por dónde empezar? Responde 4 preguntas y te proponemos una cartera inicial de empresas DGI a tu medida.</p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/construir-cartera" style={{ padding: '10px 20px', background: 'rgba(52,211,153,0.85)', borderRadius: 8, color: '#06281d', fontSize: 13, fontWeight: 800, textDecoration: 'none' }}>
              🧭 Construir mi cartera desde cero
            </Link>
            <Link href="/cartera/nueva-posicion" style={{ padding: '10px 20px', background: 'var(--accent)', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
              Añadir posición
            </Link>
            <Link href="/cartera/importar" style={{ padding: '10px 20px', background: 'var(--surface-3)', border: '1px solid var(--border-strong)', borderRadius: 8, color: 'var(--text)', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
              ↓ Importar de ING
            </Link>
          </div>
        </div>
      ) : (
       <>
        <div className="pos-desktop" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 860 }}>
            <thead>
              <tr>
                {['Empresa','Acciones','P. Medio','Coste real','P. Actual','Valor','Rentab.','YoC','Yield','Renta/año','Cobrado','Coste neto',''].map(h => {
                  const sortable = !!POS_SORT[h], active = sort.key === h
                  return (
                  <th key={h} onClick={() => onSort(h)} style={{ padding: '6px 8px', textAlign: h === 'Empresa' ? 'left' : 'right', color: active ? 'var(--accent)' : 'var(--text-faint)', fontWeight: 600, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap', cursor: sortable ? 'pointer' : 'default', userSelect: 'none' }} title={
                    h === 'Coste real' ? 'Coste por acción incluyendo comisiones de compra'
                    : h === 'Cobrado' ? 'Dividendos netos cobrados de esta posición (acumulado)'
                    : h === 'Coste neto' ? 'Coste de compra menos dividendos cobrados. Debajo, el YoC real = renta anual / coste neto.'
                    : sortable ? 'Ordenar por esta columna'
                    : undefined}>{h}{active ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}</th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((p, i) => (
                <tr key={p.id} style={{ background: i % 2 ? 'var(--surface)' : 'transparent' }}>
                  <td style={{ padding: '8px', borderBottom: '1px solid var(--surface-2)' }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 0 }}>
                      <CompanyLogo ticker={p.ticker} name={p.name} size={28} rounded={!p.isFund} />
                      <Link href={p.isFund ? `/fondo/${encodeURIComponent(p.ticker)}` : `/empresa/${encodeURIComponent(p.ticker)}`} style={{ textDecoration: 'none', minWidth: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                          {p.name}
                          {p.assetType === 'etf' && <span style={{ fontSize: 9, fontWeight: 700, color: '#60a5fa', background: 'rgba(96,165,250,0.14)', padding: '1px 5px', borderRadius: 4 }}>ETF</span>}
                          {p.assetType === 'fund' && <span style={{ fontSize: 9, fontWeight: 700, color: '#a78bfa', background: 'rgba(167,139,250,0.14)', padding: '1px 5px', borderRadius: 4 }}>Fondo</span>}
                        </p>
                        <p style={{ fontSize: 10, color: 'var(--text-faint)' }}>{p.ticker} · {p.currency}{p.isFund && p.ter != null ? ` · TER ${p.ter}%` : ''}</p>
                      </Link>
                    </div>
                  </td>
                  <td style={{ padding: '8px', textAlign: 'right', color: 'var(--text-muted)', borderBottom: '1px solid var(--surface-2)' }}>{fmt(p.shares, 4)}</td>
                  <td style={{ padding: '8px', textAlign: 'right', color: 'var(--text-muted)', borderBottom: '1px solid var(--surface-2)' }}>{fmt(p.avg_cost)}</td>
                  <td style={{ padding: '8px', textAlign: 'right', color: p.buyCommission > 0 ? 'var(--text)' : 'var(--text-faint)', borderBottom: '1px solid var(--surface-2)' }} title={p.buyCommission > 0 ? `Incluye ${fmt(p.buyCommission)} ${p.currency} de comisiones` : 'Sin comisiones registradas'}>{p.avgCostReal != null ? fmt(p.avgCostReal) : '—'}</td>
                  <td style={{ padding: '8px', textAlign: 'right', color: 'var(--text)', borderBottom: '1px solid var(--surface-2)' }}>{p.currentPrice != null ? fmt(p.currentPrice) : '—'}</td>
                  <td style={{ padding: '8px', textAlign: 'right', color: 'var(--text)', fontWeight: 700, borderBottom: '1px solid var(--surface-2)' }}>{p.valueEUR != null ? fmtEUR(p.valueEUR) : '—'}</td>
                  <td style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid var(--surface-2)' }}>
                    {p.gainPct != null ? (
                      <div>
                        <span style={{ color: gainCol(p.gainPct), fontWeight: 700 }}>{fmtPct(p.gainPct)}</span>
                        <p style={{ fontSize: 10, color: gainCol(p.gainEUR) }}>{p.gainEUR != null ? (p.gainEUR >= 0 ? '+' : '') + fmtEUR(p.gainEUR) : '—'}</p>
                      </div>
                    ) : '—'}
                  </td>
                  <td style={{ padding: '8px', textAlign: 'right', color: 'var(--accent)', borderBottom: '1px solid var(--surface-2)' }} title="Yield on cost sobre el coste real (con comisiones)">{(p.yieldOnCostReal ?? p.yieldOnCost) != null ? (p.yieldOnCostReal ?? p.yieldOnCost).toFixed(2) + '%' : '—'}</td>
                  <td style={{ padding: '8px', textAlign: 'right', color: 'var(--positive)', borderBottom: '1px solid var(--surface-2)' }}>{p.currentYield != null ? p.currentYield.toFixed(2) + '%' : '—'}</td>
                  <td style={{ padding: '8px', textAlign: 'right', color: 'var(--warning)', borderBottom: '1px solid var(--surface-2)' }}>{p.annualIncomeEUR != null ? fmtEUR(p.annualIncomeEUR) : '—'}</td>
                  <td style={{ padding: '8px', textAlign: 'right', color: p.dividendsCollectedEUR > 0 ? 'var(--positive)' : 'var(--text-faint)', borderBottom: '1px solid var(--surface-2)' }}>{p.dividendsCollectedEUR > 0 ? fmtEUR(p.dividendsCollectedEUR) : '—'}</td>
                  <td style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid var(--surface-2)' }} title={p.dividendsCollectedEUR > 0 ? `Compra ${fmtEUR(p.costEUR)} − dividendos ${fmtEUR(p.dividendsCollectedEUR)}` : undefined}>
                    {p.netCostEUR != null ? (
                      <div>
                        <span style={{ color: p.netCostEUR <= 0 ? 'var(--positive)' : 'var(--text)', fontWeight: 700 }}>{fmtEUR(Math.max(0, p.netCostEUR))}</span>
                        <p style={{ fontSize: 10, color: 'var(--accent)' }}>{p.yoCNet == null ? '' : p.yoCNet === Infinity ? 'YoC ✓ recuperada' : `YoC ${p.yoCNet.toFixed(2)}%`}</p>
                      </div>
                    ) : '—'}
                  </td>
                  <td style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid var(--surface-2)', whiteSpace: 'nowrap' }}>
                    <button onClick={() => onEdit(p)} title="Editar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontSize: 14, padding: '2px 4px' }}>✏</button>
                    <button onClick={() => onDelete(p.id)} title="Eliminar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--negative)', fontSize: 14, padding: '2px 4px' }}>🗑</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Móvil: fichas plegables — nombre · valor · plusvalía; al pulsar se ve el resto */}
        <div className="pos-mobile">
          {enriched.map(p => {
            const open = openId === p.id
            const yoc = p.yieldOnCostReal ?? p.yieldOnCost
            return (
              <div key={p.id} style={{ borderBottom: '1px solid var(--surface-2)' }}>
                <button onClick={() => setOpenId(open ? null : p.id)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '11px 2px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                  <CompanyLogo ticker={p.ticker} name={p.name} size={30} rounded={!p.isFund} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: 6 }}>
                      {p.name}
                      {p.assetType === 'etf' && <span style={{ fontSize: 9, fontWeight: 700, color: '#60a5fa', background: 'rgba(96,165,250,0.14)', padding: '1px 5px', borderRadius: 4 }}>ETF</span>}
                      {p.assetType === 'fund' && <span style={{ fontSize: 9, fontWeight: 700, color: '#a78bfa', background: 'rgba(167,139,250,0.14)', padding: '1px 5px', borderRadius: 4 }}>Fondo</span>}
                    </p>
                    <p style={{ fontSize: 10, color: 'var(--text-faint)' }}>{p.ticker} · {p.currency}</p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>{p.valueEUR != null ? fmtEUR(p.valueEUR) : '—'}</p>
                    <p style={{ fontSize: 11.5, fontWeight: 700, color: gainCol(p.gainPct) }}>
                      {p.gainPct != null ? `${fmtPct(p.gainPct)} · ${p.gainEUR >= 0 ? '+' : ''}${fmtEUR(p.gainEUR)}` : '—'}
                    </p>
                  </div>
                  <span style={{ color: 'var(--text-faint)', fontSize: 11, width: 12, textAlign: 'center' }}>{open ? '▾' : '▸'}</span>
                </button>
                {open && (
                  <div style={{ padding: '2px 2px 14px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px 12px' }}>
                      <MobileStat label="Acciones" value={fmt(p.shares, 4)} />
                      <MobileStat label="P. Medio" value={`${fmt(p.avg_cost)} ${p.currency}`} />
                      <MobileStat label="Coste real" value={p.avgCostReal != null ? `${fmt(p.avgCostReal)} ${p.currency}` : '—'} />
                      <MobileStat label="P. Actual" value={p.currentPrice != null ? `${fmt(p.currentPrice)} ${p.currency}` : '—'} />
                      <MobileStat label="YoC" value={yoc != null ? yoc.toFixed(2) + '%' : '—'} color="var(--accent)" />
                      <MobileStat label="Yield" value={p.currentYield != null ? p.currentYield.toFixed(2) + '%' : '—'} color="var(--positive)" />
                      <MobileStat label="Renta/año" value={p.annualIncomeEUR != null ? fmtEUR(p.annualIncomeEUR) : '—'} color="var(--warning)" />
                      <MobileStat label="Cobrado" value={p.dividendsCollectedEUR > 0 ? fmtEUR(p.dividendsCollectedEUR) : '—'} color={p.dividendsCollectedEUR > 0 ? 'var(--positive)' : undefined} />
                      <MobileStat label="Coste neto" value={p.netCostEUR != null ? fmtEUR(Math.max(0, p.netCostEUR)) : '—'} color={p.netCostEUR != null && p.netCostEUR <= 0 ? 'var(--positive)' : undefined} sub={p.yoCNet == null ? '' : p.yoCNet === Infinity ? '✓ recuperada' : `YoC ${p.yoCNet.toFixed(2)}%`} />
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                      <Link href={p.isFund ? `/fondo/${encodeURIComponent(p.ticker)}` : `/empresa/${encodeURIComponent(p.ticker)}`} style={{ flex: 1, textAlign: 'center', padding: '8px 0', background: 'var(--surface-3)', border: '1px solid var(--border-strong)', borderRadius: 7, color: 'var(--text)', fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>Ver ficha</Link>
                      <button onClick={() => onEdit(p)} style={{ flex: 1, padding: '8px 0', background: 'none', border: '1px solid var(--border-strong)', borderRadius: 7, color: 'var(--accent)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>✏ Editar</button>
                      <button onClick={() => onDelete(p.id)} style={{ flex: 1, padding: '8px 0', background: 'none', border: '1px solid var(--border-strong)', borderRadius: 7, color: 'var(--negative)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>🗑 Eliminar</button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
       </>
      )}

      <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
        {!isPremium && enriched.length >= FREE_LIMIT ? (
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: 11, color: 'var(--warning)', marginBottom: 6 }}>Límite del plan gratuito alcanzado (10 posiciones)</p>
            <Link href="/pricing" style={{ padding: '9px 18px', background: 'rgba(251,191,36,0.2)', border: '1px solid rgba(251,191,36,0.4)', borderRadius: 8, color: 'var(--warning)', fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>
              Upgrade a Premium →
            </Link>
          </div>
        ) : (
          <Link href="/cartera/nueva-posicion" style={{ padding: '10px 20px', background: 'var(--accent)', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
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
      <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 16 }}>Análisis de concentración</p>

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
              <span style={{ color: 'var(--warning)', flexShrink: 0 }}>⚠</span>
              <p style={{ fontSize: 12, color: 'var(--warning)' }}>{a}</p>
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
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>Diversificación</p>
          {score?.recommendation && <p style={{ fontSize: 13, color: 'var(--text-muted)', maxWidth: 440 }}>{score.recommendation}</p>}
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <p style={{ fontSize: 42, fontWeight: 900, lineHeight: 1, color: score?.score >= 7 ? 'var(--positive)' : score?.score >= 5 ? 'var(--warning)' : 'var(--negative)' }}>
            {score?.score?.toFixed(1) ?? '—'}
          </p>
          <p style={{ fontSize: 10, color: 'var(--text-faint)' }}>/ 10</p>
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
      <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14 }}>Dividendos en riesgo</p>
      {risks.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--positive)' }}>✓ No se detectan señales de riesgo en los dividendos de tu cartera.</p>
      ) : (
        <>
          <p style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 12 }}>
            Empresas con señales que suelen <strong style={{ color: 'var(--text-muted)' }}>anticipar un recorte</strong> (payout, deuda, cobertura de intereses, caída del FCF). No es una predicción: es <strong style={{ color: 'var(--text-muted)' }}>dónde vigilar</strong>, y cuánta de tu renta depende de cada una.
          </p>
          <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
            {risks.map((p, i) => (
              <div key={i} style={{ padding: '10px 12px', background: 'var(--surface)', borderRadius: 8, borderLeft: `3px solid ${p.worst === 'alto' ? 'var(--negative)' : 'var(--warning)'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{p.name} <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>{p.ticker}</span></p>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>{p.incPct.toFixed(1)}% de tu renta</p>
                </div>
                <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
                  {p.risks.map((r, j) => {
                    const col = r.level === 'alto' ? 'var(--negative)' : 'var(--warning)'
                    return (
                      <div key={j}>
                        <span style={{ fontSize: 10.5, fontWeight: 700, color: col, background: r.level === 'alto' ? 'rgba(248,113,113,0.1)' : 'rgba(251,191,36,0.1)', padding: '2px 7px', borderRadius: 5 }}>
                          {r.label}: {r.value} · {r.level === 'alto' ? 'riesgo alto' : 'a vigilar'}
                        </span>
                        <p style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.45, marginTop: 4 }}>{r.detail}</p>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 11.5, color: riskPct >= 25 ? 'var(--negative)' : 'var(--warning)' }}>
            El <strong>{riskPct.toFixed(0)}%</strong> de tu renta anual proviene de empresas con señales de alerta.
          </p>
          <p style={{ fontSize: 10.5, color: 'var(--text-faintest)', marginTop: 8, lineHeight: 1.45 }}>
            Señales sector-aware: REITs y BDC se miden por AFFO/NII, y banca y aseguradoras por capital y payout sobre beneficio —no por FCF ni deuda/EBITDA, que no les aplican. Su seguridad del dividendo se evalúa en la ficha de cada empresa.
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
        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Coste fiscal estimado</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>Residencia fiscal:</span>
          <select value={country} onChange={e => onCountryChange(e.target.value)} style={{ background: 'var(--surface-3)', border: '1px solid var(--border-strong)', borderRadius: 6, color: 'var(--text)', fontSize: 12, padding: '4px 8px' }}>
            <option value="ES">España</option>
            <option value="OTHER">Otro (referencia)</option>
          </select>
        </div>
      </div>

      {exempt && (
        <div style={{ background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.25)', borderRadius: 8, padding: '10px 12px', marginBottom: 12 }}>
          <p style={{ fontSize: 12, color: 'var(--positive)', fontWeight: 700, marginBottom: 2 }}>Estás exento de IRPF según tus ingresos</p>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>Tus ingresos quedan por debajo del umbral configurado, así que la retención sobre los dividendos <b>españoles</b> se te devolvería en la declaración (tipo efectivo 0%). La retención en origen de dividendos extranjeros se reclama al país de origen.</p>
        </div>
      )}
      {!exempt && incomeMode && (
        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>Tipo del ahorro calculado según tus ingresos y tu renta del ahorro (dividendos anuales). Configúralo en <b>Ajustes → Fiscalidad</b>.</p>
      )}
      {fiscal.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--text-faint)' }}>Añade posiciones con dividendo para ver el análisis fiscal.</p>
      ) : (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, minWidth: 500 }}>
              <thead>
                <tr>
                  {['Empresa','País empresa','Divid. bruto','Retención origen','Retención ES','Divid. neto','Tipo ef.'].map(h => (
                    <th key={h} style={{ padding: '6px 8px', textAlign: h === 'Empresa' ? 'left' : 'right', color: 'var(--text-faint)', fontWeight: 600, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {fiscal.map((f, i) => (
                  <tr key={i} style={{ background: i % 2 ? 'var(--surface)' : 'transparent' }}>
                    <td style={{ padding: '7px 8px', color: 'var(--text)', borderBottom: '1px solid var(--surface-2)' }}>{f.name}</td>
                    <td style={{ padding: '7px 8px', color: 'var(--text-muted)', textAlign: 'right', borderBottom: '1px solid var(--surface-2)' }}>{f.companyCountry}</td>
                    <td style={{ padding: '7px 8px', textAlign: 'right', color: 'var(--text)', borderBottom: '1px solid var(--surface-2)' }}>{fmtEUR(f.gross)}</td>
                    <td style={{ padding: '7px 8px', textAlign: 'right', color: 'var(--negative)', borderBottom: '1px solid var(--surface-2)' }}>-{fmtEUR(f.sourceWH)} ({f.sourceRate.toFixed(1)}%)</td>
                    <td style={{ padding: '7px 8px', textAlign: 'right', color: f.additionalES < -0.005 ? 'var(--positive)' : 'var(--negative)', borderBottom: '1px solid var(--surface-2)' }}>{f.additionalES < -0.005 ? `+${fmtEUR(-f.additionalES)}` : `-${fmtEUR(f.additionalES)}`}</td>
                    <td style={{ padding: '7px 8px', textAlign: 'right', color: 'var(--positive)', fontWeight: 700, borderBottom: '1px solid var(--surface-2)' }}>{fmtEUR(f.net)}</td>
                    <td style={{ padding: '7px 8px', textAlign: 'right', color: 'var(--warning)', borderBottom: '1px solid var(--surface-2)' }}>{f.effectiveRate.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '1px solid var(--border-strong)' }}>
                  <td colSpan={2} style={{ padding: '8px', fontWeight: 700, color: 'var(--text)' }}>Total</td>
                  <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700, color: 'var(--text)' }}>{fmtEUR(totalGross)}</td>
                  <td colSpan={2} />
                  <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700, color: 'var(--positive)' }}>{fmtEUR(totalNet)}</td>
                  <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700, color: 'var(--warning)' }}>
                    {totalGross > 0 ? ((totalGross - totalNet) / totalGross * 100).toFixed(1) + '%' : '—'}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p style={{ fontSize: 10, color: 'var(--text-faintest)', marginTop: 10 }}>
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
  const [commission, setCommission] = useState(position.buyCommission != null ? String(position.buyCommission) : '')
  const [saving, setSaving]   = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true)
    await onSave(position.id, parseFloat(shares), parseFloat(avgCost), commission === '' ? null : (parseFloat(commission) || 0))
    setSaving(false)
    onClose()
  }

  return (
    <Modal onClose={onClose} title={`Editar ${position.name}`}>
      <form onSubmit={submit} style={{ display: 'grid', gap: 14 }}>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 4, display: 'block' }}>Acciones</label>
          <input style={INPUT} type="number" step="any" value={shares} onChange={e => setShares(e.target.value)} required />
        </div>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 4, display: 'block' }}>Precio medio compra ({position.currency})</label>
          <input style={INPUT} type="number" step="any" value={avgCost} onChange={e => setAvgCost(e.target.value)} required />
        </div>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 4, display: 'block' }}>Comisiones de compra ({position.currency})</label>
          <input style={INPUT} type="number" step="any" min="0" placeholder="0.00" value={commission} onChange={e => setCommission(e.target.value)} />
          <p style={{ fontSize: 11, color: 'var(--text-faintest)', marginTop: 5 }}>Comisión total de compraventa + canon de bolsa. Ajusta el coste real y el YoC real de esta posición.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} style={{ padding: '8px 16px', background: 'transparent', border: '1px solid var(--border-strong)', borderRadius: 7, color: 'var(--text-faint)', cursor: 'pointer', fontSize: 12 }}>Cancelar</button>
          <button type="submit" disabled={saving} style={{ padding: '8px 16px', background: 'var(--accent)', border: 'none', borderRadius: 7, color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 12 }}>
            {saving ? 'Guardando…' : 'Guardar'}
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
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>Esta acción eliminará la posición. El historial de transacciones se mantendrá.</p>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onClose} style={{ padding: '8px 16px', background: 'transparent', border: '1px solid var(--border-strong)', borderRadius: 7, color: 'var(--text-faint)', cursor: 'pointer', fontSize: 12 }}>Cancelar</button>
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

    // Tolerante a columnas que aún no existan en BD (payout_affo/payout_nii): si el
    // select falla, reintenta sin ellas. Así no rompe antes de ejecutar el SQL.
    const BASE_COLS = 'ticker, current_price, dps, payout_fcf, payout_eps, debt_ebitda, interest_coverage, fcf_cagr5, div_cagr5, div_history, sector, industry, country'
    const loadStockFunds = async () => {
      if (!stockTickers.length) return []
      let res = await sb.from('company_fundamentals').select(`${BASE_COLS}, payout_affo, payout_nii`).in('ticker', stockTickers)
      if (res.error) res = await sb.from('company_fundamentals').select(BASE_COLS).in('ticker', stockTickers)
      return res.data || []
    }
    const [funds, { data: fundsData }] = await Promise.all([
      loadStockFunds(),
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
      // Comisión: el override manual de la posición (editado desde la cartera)
      // prevalece sobre la suma de comisiones de las transacciones.
      const comm = (p.commission != null && p.commission !== '') ? Number(p.commission) : (commByTicker[p.ticker] || 0)
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

  const handleEdit = async (id, shares, avg_cost, commission) => {
    const { data: { user } } = await sb.auth.getUser()
    const patch = { shares, avg_cost, updated_at: new Date().toISOString() }
    if (commission !== undefined) patch.commission = commission
    // Tolerante a que la columna positions.commission aún no exista en BD: reintenta sin ella.
    let res = await sb.from('positions').update(patch).eq('id', id).eq('user_id', user.id)
    if (res.error && /commission/.test(res.error.message || '')) {
      const { commission: _omit, ...rest } = patch
      await sb.from('positions').update(rest).eq('id', id).eq('user_id', user.id)
    }
    load()
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
        <p style={{ color: 'var(--text-faint)' }}>Cargando cartera…</p>
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
        <h1 style={{ fontSize: 22, fontWeight: 900, color: 'var(--text-strong)' }}>Mi cartera</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <PricesFreshnessIndicator />
          <Link href="/cartera/importar" style={{ padding: '9px 16px', background: 'var(--surface-3)', border: '1px solid var(--border-strong)', borderRadius: 8, color: 'var(--text)', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
            ↓ Importar
          </Link>
          {enriched.length > 0 && (
            <Link href="/cartera/nueva-posicion" style={{ padding: '9px 18px', background: 'var(--accent)', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
              + Añadir posición
            </Link>
          )}
        </div>
      </div>

      {/* Posiciones — lo más importante, arriba del todo */}
      <PositionsTable
        enriched={enriched} isPremium={isPremium}
        onEdit={setEditPos}
        onDelete={setDeleteId}
      />

      {/* FX rates widget — only when portfolio has non-EUR currencies */}
      {enriched.length > 0 && (
        <FxRatesWidget currencies={[...new Set(enriched.map(p => p.currency).filter(Boolean))]} />
      )}

      {/* Section 1: Summary */}
      {enriched.length > 0 && <SummarySection summary={summary} netIncomeEUR={netIncomeEUR} />}

      {/* Fondo de oportunidad — saldo de liquidez + patrimonio total */}
      {enriched.length > 0 && <CashFundCard investedEUR={summary.totalValueEUR} />}

      {/* Meta de renta pasiva — estrella polar */}
      {enriched.length > 0 && <IncomeGoalCard currentIncome={summary.totalIncomeEUR} goal={incomeGoal} growthPct={dividendGrowth?.g5y ?? 0} onSave={saveGoal} />}

      {enriched.length > 0 && <IncomeProjectionCard enriched={enriched} taxRate={destWHT} whtOverrides={whtOverrides} isPremium={isPremium} />}

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

      {/* Operaciones + comisiones (antes en la pestaña Historial) */}
      <OperationsCard isPremium={isPremium} />

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
      {deleteId && <DeleteModal   positionId={deleteId} onClose={() => setDeleteId(null)} onConfirm={handleDelete} />}
    </div>
  )
}
