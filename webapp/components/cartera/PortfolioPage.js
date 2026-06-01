'use client'
import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { createClient } from '@/lib/supabase/client'
import {
  enrichPositions, calcSummary, calcConcentration, calcAlerts,
  calcDiversificationScore, calcDividendRisks, calcFiscal,
} from '@/lib/portfolio'
import PortfolioDGIScore from '@/components/cartera/PortfolioDGIScore'
import CompanyDetector from '@/components/cartera/CompanyDetector'
import RecurringSection from '@/components/cartera/RecurringSection'
import FxRatesWidget from '@/components/cartera/FxRatesWidget'
import CurrencyAnalysis from '@/components/cartera/CurrencyAnalysis'

// ── Design tokens ──────────────────────────────────────────────────────────
const CARD   = { background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 20 }
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
function PremiumGate({ children }) {
  return (
    <div style={{ position: 'relative' }}>
      <div style={{ filter: 'blur(5px)', pointerEvents: 'none', userSelect: 'none' }}>{children}</div>
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

// ── Section 1: Summary ─────────────────────────────────────────────────────
function SummarySection({ summary }) {
  const items = [
    { label: 'Valor total', value: fmtEUR(summary.totalValueEUR), sub: null },
    { label: 'Rentabilidad', value: fmtEUR(summary.gainEUR), sub: fmtPct(summary.gainPct), col: gainCol(summary.gainPct) },
    { label: 'Renta anual estimada', value: fmtEUR(summary.totalIncomeEUR), sub: null },
    { label: 'Yield on cost medio', value: summary.yieldOnCost != null ? summary.yieldOnCost.toFixed(2) + '%' : '—', sub: null },
  ]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10, marginBottom: 16 }}>
      <style>{`@media(min-width:600px){.summary-grid{grid-template-columns:repeat(4,1fr)!important}}`}</style>
      {items.map(it => (
        <div key={it.label} style={{ ...CARD, padding: '14px 16px' }}>
          <p style={{ fontSize: 10, color: '#4a5270', marginBottom: 4 }}>{it.label}</p>
          <p style={{ fontSize: 20, fontWeight: 800, color: it.col || '#c8d0e0' }}>{it.value}</p>
          {it.sub && <p style={{ fontSize: 12, fontWeight: 700, color: it.col, marginTop: 2 }}>{it.sub}</p>}
        </div>
      ))}
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
          <p style={{ color: '#4a5270', fontSize: 14, marginBottom: 16 }}>Añade tu primera posición para empezar a analizar tu cartera</p>
          <Link href="/cartera/nueva-posicion" style={{ padding: '10px 20px', background: 'rgba(99,102,241,0.85)', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
            Añadir primera posición
          </Link>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 700 }}>
            <thead>
              <tr>
                {['Empresa','Acciones','P. Medio','P. Actual','Valor','Rentab.','YoC','Yield','Renta/año',''].map(h => (
                  <th key={h} style={{ padding: '6px 8px', textAlign: h === 'Empresa' ? 'left' : 'right', color: '#4a5270', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.06)', whiteSpace: 'nowrap' }}>{h}</th>
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
                  <td style={{ padding: '8px', textAlign: 'right', color: '#818cf8', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>{p.yieldOnCost != null ? p.yieldOnCost.toFixed(2) + '%' : '—'}</td>
                  <td style={{ padding: '8px', textAlign: 'right', color: '#34d399', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>{p.currentYield != null ? p.currentYield.toFixed(2) + '%' : '—'}</td>
                  <td style={{ padding: '8px', textAlign: 'right', color: '#fbbf24', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>{p.annualIncomeEUR != null ? fmtEUR(p.annualIncomeEUR) : '—'}</td>
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
function ConcentrationSection({ concentration, alerts, isPremium }) {
  const inner = (
    <div style={{ ...CARD, marginBottom: 16 }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: '#4a5270', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 16 }}>Análisis de concentración</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 16 }}>
        <DonutChart data={concentration.bySector}   title="Por sector" />
        <DonutChart data={concentration.byZone}     title="Por zona geográfica" />
        <DonutChart data={concentration.byCurrency} title="Por divisa" />
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
  return isPremium ? inner : <PremiumGate>{inner}</PremiumGate>
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
  return isPremium ? inner : <PremiumGate>{inner}</PremiumGate>
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
          <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
            {risks.map((p, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: 8, flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 700, color: '#c8d0e0' }}>{p.name} <span style={{ fontSize: 10, color: '#4a5270' }}>{p.ticker}</span></p>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                    {p.risks.map((r, j) => (
                      <span key={j} style={{ fontSize: 10, fontWeight: 700, color: r.level === 'alto' ? '#f87171' : '#fbbf24', background: r.level === 'alto' ? 'rgba(248,113,113,0.1)' : 'rgba(251,191,36,0.1)', padding: '2px 7px', borderRadius: 5 }}>
                        {r.label}
                      </span>
                    ))}
                  </div>
                </div>
                <p style={{ fontSize: 11, color: '#4a5270', flexShrink: 0 }}>{p.incPct.toFixed(1)}% de la renta</p>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 11, color: '#fbbf24' }}>
            El {riskPct.toFixed(0)}% de tu renta anual proviene de empresas con señales de alerta.
          </p>
        </>
      )}
    </div>
  )
  return isPremium ? inner : <PremiumGate>{inner}</PremiumGate>
}

// ── Section 6: Fiscal ──────────────────────────────────────────────────────
function FiscalSection({ fiscal, country, onCountryChange, isPremium }) {
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
                    <td style={{ padding: '7px 8px', textAlign: 'right', color: '#f87171', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>-{fmtEUR(f.additionalES)}</td>
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
  return isPremium ? inner : <PremiumGate>{inner}</PremiumGate>
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

    const { data: positions } = await sb.from('positions').select('*').eq('user_id', user.id)
    if (!positions?.length) { setEnriched([]); setLoading(false); return }

    const stockTickers = [...new Set(positions.filter(p => (p.asset_type || 'stock') === 'stock').map(p => p.ticker))]
    const fundTickers  = [...new Set(positions.filter(p => (p.asset_type || 'stock') !== 'stock').map(p => p.ticker))]

    const [{ data: funds }, { data: fundsData }] = await Promise.all([
      stockTickers.length ? sb.from('company_fundamentals')
        .select('ticker, current_price, dps, payout_fcf, debt_ebitda, interest_coverage, fcf_cagr5, sector, industry, country')
        .in('ticker', stockTickers) : Promise.resolve({ data: [] }),
      fundTickers.length ? sb.from('funds').select('*').in('ticker', fundTickers) : Promise.resolve({ data: [] }),
    ])

    const fundMap  = Object.fromEntries((funds || []).map(f => [f.ticker, f]))
    const fundsMap = Object.fromEntries((fundsData || []).map(f => [f.ticker, f]))
    setEnriched(enrichPositions(positions, fundMap, fundsMap))
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

  const summary       = useMemo(() => calcSummary(enriched), [enriched])
  const concentration = useMemo(() => calcConcentration(enriched), [enriched])
  const alerts        = useMemo(() => calcAlerts(enriched, concentration), [enriched, concentration])
  const divScore      = useMemo(() => calcDiversificationScore(enriched), [enriched])
  const divRisks      = useMemo(() => calcDividendRisks(enriched, summary.totalIncomeEUR), [enriched, summary])
  const fiscal        = useMemo(() => calcFiscal(enriched), [enriched])

  if (loading) {
    return (
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '40px 16px', textAlign: 'center' }}>
        <p style={{ color: '#4a5270' }}>Cargando cartera…</p>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 16px 64px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, color: '#e0e8f0' }}>Mi cartera</h1>
        {enriched.length > 0 && (
          <Link href="/cartera/nueva-posicion" style={{ padding: '9px 18px', background: 'rgba(99,102,241,0.85)', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
            + Añadir posición
          </Link>
        )}
      </div>

      {/* FX rates widget — only when portfolio has non-EUR currencies */}
      {enriched.length > 0 && (
        <FxRatesWidget currencies={[...new Set(enriched.map(p => p.currency).filter(Boolean))]} />
      )}

      {/* Section 1: Summary */}
      {enriched.length > 0 && <SummarySection summary={summary} />}

      {/* Module 1: Score DGI de la cartera con benchmark */}
      {enriched.length > 0 && <PortfolioDGIScore enriched={enriched} isPremium={isPremium} />}

      {/* Module 2: Detector de empresas que encajan */}
      {enriched.length > 0 && <CompanyDetector enriched={enriched} isPremium={isPremium} />}

      {/* Section 2: Positions */}
      <PositionsTable
        enriched={enriched} isPremium={isPremium}
        onEdit={setEditPos}
        onDividend={setDivPos}
        onDelete={setDeleteId}
      />

      {/* Aportaciones periódicas */}
      <RecurringSection />

      {enriched.length > 0 && (
        <>
          {/* Section 3: Concentration */}
          <ConcentrationSection concentration={concentration} alerts={alerts} isPremium={isPremium} />

          {/* Section 4: Diversification score */}
          <DiversificationSection score={divScore} isPremium={isPremium} />

          {/* Section 5: Dividend risk */}
          <DividendRiskSection risks={divRisks} totalIncomeEUR={summary.totalIncomeEUR} isPremium={isPremium} />

          {/* Section 6: Fiscal */}
          <FiscalSection fiscal={fiscal} country={fiscalCountry} onCountryChange={setFiscal} isPremium={isPremium} />

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
