'use client'
import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import PriceChart from '@/components/empresa/PriceChart'
import HealthGauge from '@/components/empresa/HealthGauge'
import DividendBars from '@/components/empresa/DividendBars'
import FinancialTables from '@/components/empresa/FinancialTables'
import KeyMetricsChart from '@/components/empresa/KeyMetricsChart'
import { recomputeValuation } from '@/lib/valuation'

// ── helpers ───────────────────────────────────────────────────────────────

function fmt(v, dec = 2) {
  if (v == null || isNaN(v)) return '—'
  return v.toLocaleString('es-ES', { minimumFractionDigits: dec, maximumFractionDigits: dec })
}
function fmtPct(v) {
  if (v == null) return '—'
  return (v * 100).toFixed(2) + '%'
}
function fmtCap(v) {
  if (v == null) return '—'
  if (v >= 1e9)  return (v / 1e9).toLocaleString('es-ES', { maximumFractionDigits: 1 }) + 'B'
  if (v >= 1e6)  return (v / 1e6).toLocaleString('es-ES', { maximumFractionDigits: 0 }) + 'M'
  return v.toLocaleString('es-ES', { maximumFractionDigits: 0 })
}
function countryFlag(code) {
  if (!code || code.length !== 2) return ''
  return code.toUpperCase().split('').map(c => String.fromCodePoint(c.charCodeAt(0) + 127397)).join('')
}
function scoreColor(s) {
  if (s == null) return '#4a5270'
  if (s >= 7.5) return '#34d399'
  if (s >= 5)   return '#fbbf24'
  return '#f87171'
}
function streakBadge(n) {
  if (!n || n < 5) return null
  if (n >= 50) return { label: 'Aristócrata 50+', color: '#fbbf24' }
  if (n >= 25) return { label: 'Aristócrata',     color: '#fbbf24' }
  if (n >= 10) return { label: 'Campeón DGI',     color: '#86efac' }
  return { label: `${n}a racha`, color: '#818cf8' }
}

// ── premium gate ──────────────────────────────────────────────────────────

function PremiumGate({ label = 'Contenido Premium', hint, children }) {
  return (
    <div style={{ position: 'relative' }}>
      <div style={{ filter: 'blur(5px)', pointerEvents: 'none', userSelect: 'none' }}>
        {children}
      </div>
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 8,
        background: 'rgba(8,11,20,0.55)',
      }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: '#818cf8' }}>{label}</p>
        {hint && <p style={{ fontSize: 12, color: '#4a5270', textAlign: 'center', maxWidth: 260 }}>{hint}</p>}
        <Link href="/pricing" style={{
          fontSize: 12, fontWeight: 700, color: '#fff', textDecoration: 'none',
          padding: '7px 18px', background: 'rgba(99,102,241,0.85)', borderRadius: 8,
        }}>
          Activar Premium →
        </Link>
      </div>
    </div>
  )
}

// ── section wrapper ───────────────────────────────────────────────────────

function Card({ children, style }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 12, padding: '20px', ...style,
    }}>
      {children}
    </div>
  )
}

function SectionTitle({ children }) {
  return (
    <p style={{ fontSize: 11, fontWeight: 700, color: '#4a5270', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14 }}>
      {children}
    </p>
  )
}

// ── 52-week range bar ─────────────────────────────────────────────────────

function Week52Bar({ price, low52, high52, currency }) {
  if (low52 == null || high52 == null || low52 >= high52) return null
  const span    = high52 - low52
  const rawPct  = price != null ? ((price - low52) / span) * 100 : null
  const pct     = rawPct != null ? Math.max(0, Math.min(100, rawPct)) : null
  const barCol  = pct == null ? '#4a5270'
    : pct < 10 ? '#fb923c'                 // muy cerca del mínimo 52s → naranja
    : pct > 90 ? '#fbbf24'                 // muy cerca del máximo 52s → amarillo
    : pct < 30 ? '#f87171' : pct > 70 ? '#34d399' : '#fbbf24'

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 10, color: '#4a5270' }}>Mín 52s · {fmt(low52)} {currency}</span>
        <span style={{ fontSize: 10, color: '#4a5270' }}>Máx 52s · {fmt(high52)} {currency}</span>
      </div>
      <div style={{ position: 'relative', height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3 }}>
        <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${pct ?? 0}%`, background: barCol, borderRadius: 3, transition: 'width 0.5s' }} />
        {pct != null && (
          <div style={{
            position: 'absolute', top: -3, left: `${pct}%`, transform: 'translateX(-50%)',
            width: 12, height: 12, background: barCol, border: '2px solid #080b14', borderRadius: '50%',
          }} />
        )}
      </div>
      {pct != null && (
        <p style={{ fontSize: 10, color: '#4a5270', textAlign: 'center', marginTop: 4 }}>
          Precio actual en el <span style={{ color: barCol, fontWeight: 700 }}>{pct.toFixed(0)}%</span> del rango anual
        </p>
      )}
    </div>
  )
}

// ── health gauge section ──────────────────────────────────────────────────

function HealthSection({ health, type, isPremium }) {
  const typeLabels = {
    banco: 'Banco', aseguradora: 'Aseguradora', reit: 'REIT',
    bdc: 'BDC', utilities: 'Utilities', general: 'General',
  }
  const content = (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <SectionTitle>Salud financiera</SectionTitle>
        <span style={{ fontSize: 10, color: '#4a5270', background: 'rgba(255,255,255,0.04)', padding: '2px 8px', borderRadius: 5 }}>
          {typeLabels[type] || 'General'}
        </span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <HealthGauge score={health} />
      </div>
    </Card>
  )
  return isPremium ? content : (
    <PremiumGate label="Salud financiera" hint="Análisis sector-aware con métricas de deuda, rentabilidad, liquidez y dividendo.">
      {content}
    </PremiumGate>
  )
}

// ── moat section ──────────────────────────────────────────────────────────

function MoatSection({ moat, isPremium }) {
  if (!moat) return null
  const widthColor = { wide: '#34d399', narrow: '#fbbf24', none: '#4a5270' }[moat.width] || '#4a5270'

  const content = (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <SectionTitle>Foso económico</SectionTitle>
        <span style={{
          fontSize: 12, fontWeight: 700, color: widthColor,
          background: `${widthColor}18`, padding: '3px 10px', borderRadius: 6,
        }}>
          {moat.label}
        </span>
      </div>
      {moat.signals?.length > 0 && (
        <div style={{ display: 'grid', gap: 6, marginBottom: moat.negative?.length || moat.sources?.length ? 12 : 0 }}>
          {moat.signals.map((s, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, fontSize: 13, color: '#8090a8', alignItems: 'flex-start' }}>
              <span style={{ color: '#34d399', flexShrink: 0, marginTop: 1 }}>+</span>{s}
            </div>
          ))}
        </div>
      )}
      {moat.negative?.length > 0 && (
        <div style={{ display: 'grid', gap: 6, marginBottom: moat.sources?.length ? 12 : 0 }}>
          {moat.negative.map((s, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, fontSize: 13, color: '#8090a8', alignItems: 'flex-start' }}>
              <span style={{ color: '#f87171', flexShrink: 0, marginTop: 1 }}>−</span>{s}
            </div>
          ))}
        </div>
      )}
      {moat.sources?.length > 0 && (
        <div style={{ marginTop: 10, padding: '10px 12px', background: 'rgba(99,102,241,0.06)', borderRadius: 8 }}>
          <p style={{ fontSize: 10, color: '#4a5270', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Origen del foso</p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {moat.sources.map((s, i) => (
              <span key={i} style={{ fontSize: 11, color: '#818cf8', background: 'rgba(99,102,241,0.1)', padding: '2px 8px', borderRadius: 5 }}>{s}</span>
            ))}
          </div>
        </div>
      )}
      {!moat.signals?.length && !moat.negative?.length && (
        <p style={{ fontSize: 13, color: '#4a5270' }}>Datos insuficientes para detectar foso económico.</p>
      )}
    </Card>
  )
  return isPremium ? content : (
    <PremiumGate label="Foso económico" hint="Señales de ventaja competitiva basadas en ROE, márgenes y racha de dividendos.">
      {content}
    </PremiumGate>
  )
}

// ── dividend section ──────────────────────────────────────────────────────

function DividendSection({ divHistory, streak, cagr, isPremium }) {
  const badge  = streakBadge(streak)
  const fullHistory = [...divHistory].sort((a, b) => a.year - b.year)

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <SectionTitle>Historial de dividendos</SectionTitle>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {cagr != null && (
            <span style={{ fontSize: 12, color: cagr >= 0.05 ? '#34d399' : '#fbbf24', fontWeight: 700 }}>
              CAGR {(cagr * 100).toFixed(1)}%
            </span>
          )}
          {badge && (
            <span style={{ fontSize: 11, fontWeight: 700, color: badge.color, background: `${badge.color}18`, padding: '2px 8px', borderRadius: 5 }}>
              {badge.label}
            </span>
          )}
        </div>
      </div>
      <DividendBars history={fullHistory} />
    </Card>
  )
}

// ── projection section ────────────────────────────────────────────────────

function ProjectionSection({ projection, cagr, isPremium }) {
  if (!projection?.length) return null

  const content = (
    <Card>
      <SectionTitle>
        Proyección dividendo 10 años
        {cagr != null && <span style={{ color: '#818cf8', fontWeight: 400, marginLeft: 6 }}>(CAGR base {(cagr * 100).toFixed(1)}%)</span>}
      </SectionTitle>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 380 }}>
          <thead>
            <tr>
              {['Año', 'Conserv.', 'Base', 'Optimista'].map(h => (
                <th key={h} style={{
                  padding: '6px 8px', textAlign: h === 'Año' ? 'left' : 'right',
                  color: '#4a5270', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.06)',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {projection.map((p, i) => (
              <tr key={p.year} style={{ background: i % 2 ? 'rgba(255,255,255,0.015)' : 'transparent' }}>
                <td style={{ padding: '6px 8px', color: '#8090a8' }}>{p.year}</td>
                <td style={{ padding: '6px 8px', textAlign: 'right', color: '#f87171' }}>{fmt(p.conservative, 3)}</td>
                <td style={{ padding: '6px 8px', textAlign: 'right', color: '#c8d0e0', fontWeight: 700 }}>{fmt(p.base, 3)}</td>
                <td style={{ padding: '6px 8px', textAlign: 'right', color: '#34d399' }}>{fmt(p.optimistic, 3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )

  return isPremium ? content : (
    <PremiumGate label="Proyección dividendo (Premium)" hint="Escenarios conservador, base y optimista a 10 años basados en el CAGR histórico.">
      {content}
    </PremiumGate>
  )
}

// ── valuation bar ─────────────────────────────────────────────────────────

function ValuationBar({ price, iv }) {
  if (!price || !iv || price <= 0 || iv <= 0) return null
  const lo   = Math.min(price, iv) * 0.88
  const hi   = Math.max(price, iv) * 1.12
  const span = hi - lo
  const pPct = Math.max(0, Math.min(100, (price - lo) / span * 100))
  const iPct = Math.max(0, Math.min(100, (iv    - lo) / span * 100))
  const left = Math.min(pPct, iPct), right = Math.max(pPct, iPct)
  const col  = iv > price ? '#34d399' : '#f87171'

  return (
    <div style={{ marginTop: 14, marginBottom: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, fontSize: 10, color: '#4a5270' }}>
        <span>Precio: {price.toLocaleString('es-ES', { maximumFractionDigits: 2 })}</span>
        <span>Val. intrínseco: {iv.toLocaleString('es-ES', { maximumFractionDigits: 2 })}</span>
      </div>
      <div style={{ position: 'relative', height: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 4 }}>
        {/* gap coloreado */}
        <div style={{
          position: 'absolute', top: 0, height: '100%',
          left: `${left}%`, width: `${right - left}%`,
          background: `${col}40`, borderRadius: 4,
        }} />
        {/* marcador precio */}
        <div style={{
          position: 'absolute', top: '50%', left: `${pPct}%`,
          transform: 'translate(-50%,-50%)',
          width: 12, height: 12, borderRadius: '50%',
          background: '#c8d0e0', border: '2px solid #080b14',
        }} />
        {/* marcador IV */}
        <div style={{
          position: 'absolute', top: '50%', left: `${iPct}%`,
          transform: 'translate(-50%,-50%)',
          width: 12, height: 12, borderRadius: '50%',
          background: col, border: '2px solid #080b14',
        }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 9, color: '#4a5270' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#c8d0e0' }} /> Precio actual
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: col }} /> Valor intrínseco
        </span>
      </div>
    </div>
  )
}

// ── valuation input field (editable mode) ─────────────────────────────────

function toDisplay(field, raw) {
  if (raw == null || isNaN(raw)) return ''
  if (field.pct)   return Math.round(raw * 1000) / 10
  if (field.scale) return Math.round(raw / field.scale * 100) / 100
  return Math.round(raw * 10000) / 10000
}
function fromDisplay(field, disp) {
  const num = parseFloat(disp)
  if (isNaN(num)) return 0
  if (field.pct)   return num / 100
  if (field.scale) return num * field.scale
  return num
}

function ValuationField({ field, raw, autoRaw, onChange }) {
  const modified = Math.abs((raw ?? 0) - (autoRaw ?? 0)) > 1e-9
  const disp = toDisplay(field, raw)
  const bg = modified ? 'rgba(251,146,60,0.1)' : 'rgba(255,255,255,0.03)'
  const border = modified ? '1px solid rgba(251,146,60,0.35)' : '1px solid rgba(255,255,255,0.07)'

  return (
    <div style={{ background: bg, border, borderRadius: 8, padding: '8px 10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 10, color: modified ? '#fb923c' : '#4a5270' }}>{field.label}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: modified ? '#fb923c' : '#c8d0e0' }}>
          {disp}{field.unit ? ` ${field.unit}` : ''}
        </span>
      </div>
      {field.type === 'slider' ? (
        <input type="range" min={field.min} max={field.max} step={field.step} value={disp}
          onChange={e => onChange(field.key, fromDisplay(field, e.target.value))}
          style={{ width: '100%', accentColor: modified ? '#fb923c' : '#818cf8' }} />
      ) : (
        <input type="number" value={disp} step="any"
          onChange={e => onChange(field.key, fromDisplay(field, e.target.value))}
          style={{ width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '5px 8px', color: '#c8d0e0', fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
      )}
    </div>
  )
}

// ── dcf + valuation section ───────────────────────────────────────────────

function DCFSection({ dcf, ticker, peTrailing, peForward, evEbitda, isPremium }) {
  const [expanded, setExpanded] = useState(false)
  const [mode, setMode]         = useState('auto')      // 'auto' | 'custom'
  const [custom, setCustom]     = useState(null)        // params object
  const [userNotes, setUserNotes] = useState('')
  const storageKey = `valuation:${ticker}`

  // Cargar inputs personalizados de localStorage
  useEffect(() => {
    if (typeof window === 'undefined' || !dcf?.params) return
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || 'null')
      if (saved?.params) { setCustom(saved.params); setUserNotes(saved.notes || ''); setMode('custom') }
    } catch {}
  }, [ticker])

  // Guardar en localStorage en modo personalizado
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (mode === 'custom' && custom) {
      localStorage.setItem(storageKey, JSON.stringify({ params: custom, notes: userNotes }))
    }
  }, [mode, custom, userNotes])

  const activeParams = mode === 'custom' && custom ? custom : dcf?.params
  const live = useMemo(() => {
    if (!dcf?.available) return null
    if (mode === 'custom' && custom && dcf.engine) return recomputeValuation(dcf.engine, custom, dcf.price)
    return { intrinsicValue: dcf.intrinsicValue, mos: dcf.mos, projection: dcf.projection }
  }, [dcf, mode, custom])

  const iv  = live?.intrinsicValue
  const mos = live?.mos

  const mosCol = mos != null ? (mos > 0.1 ? '#34d399' : mos > -0.1 ? '#fbbf24' : '#f87171') : '#4a5270'
  const mosLbl = mos != null ? (mos > 0.25 ? 'Zona de compra' : mos > 0.05 ? 'Ligero descuento' : mos > -0.1 ? 'Precio justo' : 'Sobrecomprado') : ''

  const enterCustom = () => {
    if (!custom && dcf?.params) setCustom({ ...dcf.params })
    setMode('custom')
  }
  const resetAuto = () => {
    setCustom(dcf?.params ? { ...dcf.params } : null)
    setUserNotes('')
    setMode('auto')
    if (typeof window !== 'undefined') localStorage.removeItem(storageKey)
  }
  const changeParam = (key, val) => setCustom(p => ({ ...(p || dcf.params), [key]: val }))

  const content = (
    <Card>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <SectionTitle>Valoración</SectionTitle>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {mode === 'custom' && (
            <span style={{ fontSize: 10, fontWeight: 700, color: '#fb923c', background: 'rgba(251,146,60,0.12)', padding: '2px 8px', borderRadius: 5 }}>
              Valoración personalizada
            </span>
          )}
          {dcf?.methodLabel && (
            <span style={{ fontSize: 10, fontWeight: 700, color: '#818cf8', background: 'rgba(99,102,241,0.12)', padding: '2px 8px', borderRadius: 5 }}>
              {dcf.methodLabel}
            </span>
          )}
        </div>
      </div>

      {dcf?.available ? (
        <>
          {/* Coherence warnings (antes de los números) */}
          {dcf.warnings?.length > 0 && (
            <div style={{ marginBottom: 12, display: 'grid', gap: 6 }}>
              {dcf.warnings.map((w, i) => (
                <div key={i} style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.25)', borderRadius: 8, padding: '9px 12px', display: 'flex', gap: 8 }}>
                  <span style={{ color: '#fbbf24', flexShrink: 0 }}>⚠</span>
                  <p style={{ fontSize: 11, color: '#fbbf24', lineHeight: 1.5 }}>{w}</p>
                </div>
              ))}
            </div>
          )}

          {/* Valuation numbers */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
            <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '10px 12px' }}>
              <p style={{ fontSize: 10, color: '#4a5270', marginBottom: 3 }}>Valor intrínseco</p>
              <p style={{ fontSize: 18, fontWeight: 800, color: '#c8d0e0' }}>{fmt(iv)}</p>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '10px 12px' }}>
              <p style={{ fontSize: 10, color: '#4a5270', marginBottom: 3 }}>Precio actual</p>
              <p style={{ fontSize: 18, fontWeight: 800, color: '#c8d0e0' }}>{fmt(dcf.price)}</p>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '10px 12px' }}>
              <p style={{ fontSize: 10, color: '#4a5270', marginBottom: 3 }}>Margen seguridad</p>
              <p style={{ fontSize: 18, fontWeight: 800, color: mosCol }}>
                {mos != null ? (mos > 0 ? '+' : '') + (mos * 100).toFixed(1) + '%' : '—'}
              </p>
            </div>
          </div>

          {mosLbl && (
            <div style={{ textAlign: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: mosCol, background: `${mosCol}18`, padding: '3px 10px', borderRadius: 5 }}>{mosLbl}</span>
            </div>
          )}

          <ValuationBar price={dcf.price} iv={iv} />

          {/* Toggle auto/custom */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, gap: 8, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 4, background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 3 }}>
              <button onClick={resetAuto} style={{ fontSize: 11, fontWeight: 700, padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', background: mode === 'auto' ? 'rgba(99,102,241,0.2)' : 'transparent', color: mode === 'auto' ? '#818cf8' : '#4a5270' }}>Automático</button>
              <button onClick={enterCustom} style={{ fontSize: 11, fontWeight: 700, padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', background: mode === 'custom' ? 'rgba(251,146,60,0.2)' : 'transparent', color: mode === 'custom' ? '#fb923c' : '#4a5270' }}>Personalizado</button>
            </div>
            {mode === 'custom' && (
              <button onClick={resetAuto} style={{ fontSize: 11, color: '#4a5270', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                Restablecer valores automáticos
              </button>
            )}
          </div>

          {/* Editable inputs */}
          {mode === 'custom' && dcf.editable?.length > 0 && activeParams && (
            <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8 }}>
              {dcf.editable.map(field => (
                <ValuationField key={field.key} field={field}
                  raw={activeParams[field.key]} autoRaw={dcf.params[field.key]} onChange={changeParam} />
              ))}
            </div>
          )}

          {/* Notas del usuario (modo personalizado) */}
          {mode === 'custom' && (
            <textarea value={userNotes} onChange={e => setUserNotes(e.target.value)}
              placeholder="Anota tu razonamiento (ej: uso revenue_cagr5 negativo porque los ingresos llevan 4 años cayendo)…"
              style={{ marginTop: 8, width: '100%', minHeight: 54, resize: 'vertical', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '8px 10px', color: '#c8d0e0', fontSize: 12, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }} />
          )}

          {/* FCF years for energy */}
          {dcf.fcfYears?.length > 0 && (
            <div style={{ marginTop: 12, padding: '10px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: 8 }}>
              <p style={{ fontSize: 10, color: '#4a5270', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>FCF por año (base normalizada)</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6 }}>
                {dcf.fcfYears.map(y => (
                  <div key={y.year} style={{ textAlign: 'center' }}>
                    <p style={{ fontSize: 10, color: '#4a5270' }}>{y.year}</p>
                    <p style={{ fontSize: 12, fontWeight: 700, color: y.value >= 0 ? '#34d399' : '#f87171' }}>
                      {Math.abs(y.value) >= 1e9 ? (y.value/1e9).toFixed(1)+'B'
                        : Math.abs(y.value) >= 1e6 ? (y.value/1e6).toFixed(0)+'M'
                        : y.value.toFixed(0)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Expandable details */}
          <button onClick={() => setExpanded(e => !e)} style={{
            marginTop: 12, width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8,
            padding: '8px 12px', cursor: 'pointer', color: '#818cf8', fontSize: 11, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span>Ver cálculo detallado</span>
            <span>{expanded ? '▲' : '▼'}</span>
          </button>

          {expanded && (
            <div style={{ marginTop: 8, padding: '12px', background: 'rgba(255,255,255,0.02)', borderRadius: 8 }}>
              {/* Inputs table */}
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, marginBottom: 10 }}>
                <tbody>
                  {dcf.inputs.map((inp, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding: '5px 0', color: inp.danger ? '#f87171' : '#4a5270' }}>{inp.label}</td>
                      <td style={{ padding: '5px 0', color: inp.danger ? '#f87171' : '#c8d0e0', textAlign: 'right', fontWeight: 600 }}>{inp.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Projection table (DCF) */}
              {live?.projection?.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  <p style={{ fontSize: 10, color: '#4a5270', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Proyección FCF descontado (10 años)</p>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                      <thead>
                        <tr>
                          {['Año', 'FCF proyectado', 'FCF descontado'].map(h => (
                            <th key={h} style={{ padding: '4px 6px', textAlign: h === 'Año' ? 'left' : 'right', color: '#4a5270', borderBottom: '1px solid rgba(255,255,255,0.06)', fontWeight: 600 }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {live.projection.map(y => (
                          <tr key={y.year} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                            <td style={{ padding: '4px 6px', color: '#8090a8' }}>{y.year}</td>
                            <td style={{ padding: '4px 6px', textAlign: 'right', color: '#8090a8' }}>{fmtCap(y.cf)}</td>
                            <td style={{ padding: '4px 6px', textAlign: 'right', color: '#c8d0e0' }}>{fmtCap(y.pv)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Notes */}
              {dcf.notes?.map((note, i) => (
                <p key={i} style={{ fontSize: 10, color: '#8090a8', marginBottom: 4 }}>ℹ {note}</p>
              ))}

              {/* Formula explained */}
              <p style={{ fontSize: 10, color: '#4a5270', marginTop: 6, lineHeight: 1.5 }}>
                {dcf.engine === 'ddm'
                  ? 'Se descuentan los dividendos proyectados a 5 años más un valor terminal (modelo de Gordon), al coste de equity.'
                  : dcf.engine === 'affo'
                  ? 'El valor se estima como AFFO por acción (OCF / acciones) multiplicado por un múltiplo objetivo según el tipo de REIT.'
                  : 'Se proyecta el flujo de caja 10 años (dos fases) y se descuenta a valor presente, sumando un valor terminal. El total se divide entre las acciones en circulación.'}
              </p>

              {/* Tooltip / explanation */}
              {dcf.tooltip && (
                <p style={{ fontSize: 10, color: '#4a5270', marginTop: 6, fontStyle: 'italic' }}>{dcf.tooltip}</p>
              )}

              {/* Disclaimer */}
              <p style={{ fontSize: 9, color: '#2e3a55', marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                ⚠ El valor intrínseco es una estimación basada en datos históricos y proyecciones. No constituye asesoramiento financiero.
              </p>
            </div>
          )}
        </>
      ) : (
        <p style={{ fontSize: 12, color: '#4a5270', marginBottom: 12 }}>
          {dcf?.unavailableReason ?? 'Datos insuficientes para calcular el valor intrínseco'}
        </p>
      )}

      {/* Ratios */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 14 }}>
        {[
          { label: 'PER trailing', value: fmt(peTrailing, 1) },
          { label: 'PER forward',  value: fmt(peForward, 1)  },
          { label: 'EV/EBITDA',    value: fmt(evEbitda, 1)   },
        ].map(m => (
          <div key={m.label} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '10px 12px' }}>
            <p style={{ fontSize: 10, color: '#4a5270', marginBottom: 4 }}>{m.label}</p>
            <p style={{ fontSize: 16, fontWeight: 700, color: '#c8d0e0' }}>{m.value}</p>
          </div>
        ))}
      </div>
    </Card>
  )

  return isPremium ? content : (
    <PremiumGate label="Valoración (Premium)" hint="Valor intrínseco, margen de seguridad y múltiplos de valoración adaptados al sector.">
      {content}
    </PremiumGate>
  )
}

// ── insights section ──────────────────────────────────────────────────────

function InsightsSection({ insights, isPremium }) {
  if (!insights?.length) return null
  const typeIcon  = { positive: '↑', neutral: '·', negative: '↓', green: '↑', yellow: '·', red: '↓' }
  const typeColor = { positive: '#34d399', neutral: '#fbbf24', negative: '#f87171', green: '#34d399', yellow: '#fbbf24', red: '#f87171' }
  const catLabel  = { dividendo: 'Dividendo', valoracion: 'Valoración', mercado: 'Empresa' }
  const cats      = [...new Set(insights.map(i => i.cat))]

  const content = (
    <Card>
      <SectionTitle>Análisis automático</SectionTitle>
      <div style={{ display: 'grid', gap: 18 }}>
        {cats.map(cat => (
          <div key={cat}>
            <p style={{ fontSize: 10, fontWeight: 700, color: '#4a5270', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
              {catLabel[cat] || cat}
            </p>
            <div style={{ display: 'grid', gap: 7 }}>
              {insights.filter(i => i.cat === cat).map((ins, idx) => (
                <div key={idx} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <span style={{ color: typeColor[ins.type], fontSize: 13, flexShrink: 0, marginTop: 1, fontWeight: 700 }}>
                    {typeIcon[ins.type]}
                  </span>
                  <p style={{ fontSize: 13, color: '#8090a8', lineHeight: 1.55 }}>{ins.text}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  )

  return isPremium ? content : (
    <PremiumGate label="Análisis automático (Premium)" hint="Insights sobre dividendo, valoración y calidad del negocio generados automáticamente.">
      {content}
    </PremiumGate>
  )
}

// ── dgi score card ────────────────────────────────────────────────────────

function MetricRow({ m }) {
  const barW = m.score != null ? `${(m.score / 10) * 100}%` : '0%'
  const col  = scoreColor(m.score)
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
        <span style={{ fontSize: 11, color: m.available ? '#8090a8' : '#4a5270', flex: 1, minWidth: 0 }}>{m.name}</span>
        {m.tooltip && (
          <span
            title={m.tooltip}
            style={{ fontSize: 9, fontWeight: 700, color: '#4a5270', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '50%', width: 14, height: 14, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'help', flexShrink: 0 }}>?</span>
        )}
        <span style={{ fontSize: 11, color: '#4a5270', width: 36, textAlign: 'right', flexShrink: 0 }}>{m.value}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: col, width: 22, textAlign: 'right', flexShrink: 0 }}>
          {m.score != null ? m.score : '—'}
        </span>
      </div>
      <div style={{ height: 3, background: 'rgba(255,255,255,0.05)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: barW, background: col, borderRadius: 2 }} />
      </div>
    </div>
  )
}

function DGIScoreCard({ dgiScore, isPremium }) {
  if (!dgiScore) return null

  const content = (
    <Card>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <SectionTitle>Score DGI</SectionTitle>
        <span style={{ fontSize: 36, fontWeight: 900, color: scoreColor(dgiScore.total), lineHeight: 1 }}>
          {dgiScore.total ?? '—'}
        </span>
      </div>
      {!dgiScore.hasData && (
        <p style={{ fontSize: 12, color: '#4a5270', marginBottom: 12 }}>Datos insuficientes para calcular el score.</p>
      )}

      {/* Categories */}
      <div style={{ display: 'grid', gap: 16 }}>
        {dgiScore.categories?.map(cat => (
          <div key={cat.key}>
            {/* Category header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#c8d0e0' }}>{cat.name}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 10, color: '#4a5270' }}>{Math.round(cat.weight * 100)}%</span>
                <span style={{ fontSize: 14, fontWeight: 800, color: scoreColor(cat.score) }}>
                  {cat.score?.toFixed(1) ?? '—'}
                </span>
              </div>
            </div>
            {/* Category bar */}
            <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden', marginBottom: 8 }}>
              <div style={{ height: '100%', width: cat.score != null ? `${(cat.score/10)*100}%` : '0%', background: scoreColor(cat.score), borderRadius: 2 }} />
            </div>
            {/* Metrics */}
            <div style={{ paddingLeft: 8, borderLeft: '2px solid rgba(255,255,255,0.04)' }}>
              {cat.metrics?.filter(m => m.available).map(m => <MetricRow key={m.key} m={m} />)}
              {cat.metrics?.filter(m => !m.available).length > 0 && (
                <p style={{ fontSize: 10, color: '#2e3a55', marginTop: 2 }}>
                  {cat.metrics.filter(m => !m.available).length} métrica(s) sin datos — peso redistribuido
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Penalties */}
      {dgiScore.penalties?.length > 0 && (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: '#f87171', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Penalizaciones</p>
          {dgiScore.penalties.map((p, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#f87171', marginBottom: 4 }}>
              <span>{p.reason}</span>
              <span style={{ flexShrink: 0, marginLeft: 8 }}>−{p.amount.toFixed(1)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Methodology */}
      {dgiScore.methodology && (
        <p style={{ fontSize: 10, color: '#2e3a55', marginTop: 12 }}>{dgiScore.methodology}</p>
      )}
    </Card>
  )

  return isPremium ? content : (
    <PremiumGate label="Score DGI (Premium)" hint="Nota 0–10 con desglose completo por categoría y métrica, adaptado al sector.">
      {content}
    </PremiumGate>
  )
}

// ── key ratios sidebar card ───────────────────────────────────────────────

function KeyRatiosCard({ eps, payout, mktCap, updatedAt }) {
  const items = [
    { label: 'EPS',         value: fmt(eps, 2)    },
    { label: 'Payout',      value: payout != null ? `${(payout * 100).toFixed(0)}%` : '—', color: payout > 0.8 ? '#f87171' : payout > 0.6 ? '#fbbf24' : '#34d399' },
    { label: 'Cap. bursátil', value: fmtCap(mktCap) },
  ]
  return (
    <Card>
      <SectionTitle>Métricas clave</SectionTitle>
      <div style={{ display: 'grid', gap: 10 }}>
        {items.map(m => (
          <div key={m.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 8, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            <span style={{ fontSize: 12, color: '#4a5270' }}>{m.label}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: m.color || '#c8d0e0' }}>{m.value}</span>
          </div>
        ))}
      </div>
      {updatedAt && (
        <p style={{ fontSize: 10, color: '#2e3a55', marginTop: 10 }}>
          Actualizado {new Date(updatedAt).toLocaleDateString('es-ES')}
        </p>
      )}
    </Card>
  )
}

// ── ROIC card (reportado vs tangible) ──────────────────────────────────────

function RoicCard({ roicData, isPremium }) {
  if (!roicData) return null

  // Sector sin ROIC → métrica alternativa
  if (roicData.roic_not_applicable) {
    const content = (
      <Card>
        <SectionTitle>Rentabilidad sobre capital</SectionTitle>
        <p style={{ fontSize: 11, color: '#4a5270', marginBottom: 8 }}>{roicData.roic_method}</p>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: '#8090a8' }}>{roicData.alternative_label || '—'}</span>
          <span style={{ fontSize: 18, fontWeight: 800, color: '#818cf8' }}>
            {roicData.alternative_value != null ? roicData.alternative_value.toFixed(1) + '%' : '—'}
          </span>
        </div>
      </Card>
    )
    return isPremium ? content : <PremiumGate label="ROIC (Premium)">{content}</PremiumGate>
  }

  const { roic_reported, roic_tangible, roic_warning, roic_method } = roicData
  if (roic_reported == null && roic_tangible == null) {
    if (roic_method?.startsWith('N/A')) {
      return (
        <Card>
          <SectionTitle>ROIC</SectionTitle>
          <p style={{ fontSize: 13, color: '#4a5270' }}>N/A — balance atípico</p>
        </Card>
      )
    }
    return null
  }

  const col = v => v == null ? '#4a5270' : v >= 15 ? '#34d399' : v >= 8 ? '#fbbf24' : '#f87171'

  const content = (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <SectionTitle>ROIC</SectionTitle>
        {roic_warning && (
          <span title={roic_warning} style={{ fontSize: 13, cursor: 'help' }}>⚠️</span>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '10px 12px' }}>
          <p style={{ fontSize: 10, color: '#4a5270', marginBottom: 3 }}>Reportado</p>
          <p style={{ fontSize: 20, fontWeight: 800, color: col(roic_reported) }}>{roic_reported != null ? roic_reported.toFixed(1) + '%' : '—'}</p>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '10px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
            <p style={{ fontSize: 10, color: '#4a5270' }}>Tangible</p>
            <span title="ROIC excluyendo goodwill e intangibles — refleja mejor la rentabilidad operativa real." style={{ fontSize: 9, color: '#4a5270', cursor: 'help' }}>ⓘ</span>
          </div>
          <p style={{ fontSize: 20, fontWeight: 800, color: col(roic_tangible) }}>{roic_tangible != null ? roic_tangible.toFixed(1) + '%' : '—'}</p>
        </div>
      </div>
      {roic_warning && (
        <p style={{ fontSize: 10, color: '#fbbf24', marginTop: 10, lineHeight: 1.5 }}>⚠ {roic_warning}</p>
      )}
      {roic_method && !roic_warning && roic_method !== 'Precalculado' && (
        <p style={{ fontSize: 10, color: '#2e3a55', marginTop: 10 }}>{roic_method}</p>
      )}
    </Card>
  )

  return isPremium ? content : <PremiumGate label="ROIC (Premium)" hint="Rentabilidad sobre el capital invertido, reportado y tangible.">{content}</PremiumGate>
}

// ── tooltip ───────────────────────────────────────────────────────────────

function Tooltip({ text }) {
  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      <span
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 16, height: 16, borderRadius: '50%', fontSize: 10, fontWeight: 700,
          color: '#4a5270', border: '1px solid rgba(255,255,255,0.1)',
          cursor: 'help', verticalAlign: 'middle', marginLeft: 5,
          userSelect: 'none',
        }}
        title={text}
      >
        ?
      </span>
    </span>
  )
}

// ── buyback section ───────────────────────────────────────────────────────

function BuybackSection({ buybacks }) {
  if (!buybacks) return null

  const { years, streak, avgYield, isCannibal, isActiveBuyback, isDilutive } = buybacks

  const badgeStyle = isCannibal
    ? { color: '#34d399', bg: 'rgba(52,211,153,0.1)', border: 'rgba(52,211,153,0.3)' }
    : isDilutive
    ? { color: '#f87171', bg: 'rgba(248,113,113,0.1)', border: 'rgba(248,113,113,0.3)' }
    : { color: '#818cf8', bg: 'rgba(99,102,241,0.1)', border: 'rgba(99,102,241,0.3)' }

  const tooltipBuyback = 'La empresa usa sus beneficios para recomprar acciones propias, reduciendo las que están en circulación. Cada acción restante vale más. Es una señal de que la dirección confía en que la acción está barata.'
  const tooltipCannibal = 'Empresas que recompran más del 5% de su capitalización anualmente. Charlie Munger y Warren Buffett consideran esto una de las mejores señales de calidad: la dirección te devuelve capital de forma eficiente sin que tengas que hacer nada.'
  const tooltipDilution = 'La empresa emite nuevas acciones, lo que diluye el valor de las que ya tienes. Puede ser necesario para financiar crecimiento, pero reduce tu participación proporcional en el negocio si no compras más acciones.'

  const tooltip = isCannibal ? tooltipCannibal : isDilutive ? tooltipDilution : tooltipBuyback

  const label = isCannibal
    ? 'Caníbal de recompras'
    : isActiveBuyback
    ? 'Recompra activa'
    : isDilutive
    ? 'Dilución activa'
    : 'Sin recompras recientes'

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <SectionTitle>Recompras de acciones</SectionTitle>
        </div>
        {(isCannibal || isActiveBuyback || isDilutive) && (
          <span style={{
            fontSize: 12, fontWeight: 700, color: badgeStyle.color,
            background: badgeStyle.bg, border: `1px solid ${badgeStyle.border}`,
            padding: '3px 10px', borderRadius: 6,
          }}>
            {label}
          </span>
        )}
      </div>

      {/* Summary row */}
      <div style={{ display: 'flex', gap: 20, marginBottom: 16, flexWrap: 'wrap' }}>
        {streak > 0 && (
          <div>
            <p style={{ fontSize: 10, color: '#4a5270', marginBottom: 2 }}>Años consecutivos</p>
            <p style={{ fontSize: 18, fontWeight: 800, color: streak >= 3 ? '#34d399' : '#c8d0e0' }}>{streak}</p>
          </div>
        )}
        {avgYield != null && (
          <div>
            <p style={{ fontSize: 10, color: '#4a5270', marginBottom: 2 }}>Yield recompra medio</p>
            <p style={{ fontSize: 18, fontWeight: 800, color: avgYield > 5 ? '#34d399' : avgYield > 2 ? '#fbbf24' : '#c8d0e0' }}>
              {avgYield.toFixed(1)}%
            </p>
          </div>
        )}
      </div>

      {/* Year by year bars */}
      {years.length > 0 && (
        <div>
          <p style={{ fontSize: 10, color: '#4a5270', marginBottom: 8 }}>Últimos años (M)</p>
          <div style={{ display: 'grid', gap: 6 }}>
            {years.map(y => {
              const absM = y.amount != null ? Math.abs(y.amount) / 1e6 : 0
              const maxM = Math.max(...years.map(z => Math.abs(z.amount ?? 0) / 1e6))
              const barPct = maxM > 0 ? (absM / maxM) * 100 : 0
              const col = y.isBuyback ? '#34d399' : '#f87171'
              return (
                <div key={y.year} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 11, color: '#4a5270', width: 36, flexShrink: 0 }}>{y.year}</span>
                  <div style={{ flex: 1, height: 8, background: 'rgba(255,255,255,0.05)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${barPct}%`, background: col, borderRadius: 4 }} />
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 600, color: col, width: 70, textAlign: 'right', flexShrink: 0 }}>
                    {y.isBuyback ? '−' : '+'}{absM >= 1000
                      ? `${(absM / 1000).toFixed(1)}B`
                      : `${absM.toFixed(0)}M`}
                  </span>
                  {y.yield != null && (
                    <span style={{ fontSize: 10, color: '#4a5270', width: 40, textAlign: 'right', flexShrink: 0 }}>
                      {y.yield.toFixed(1)}%
                    </span>
                  )}
                </div>
              )
            })}
          </div>
          <p style={{ fontSize: 10, color: '#2e3a55', marginTop: 8 }}>
            Verde = recompra · Rojo = emisión · % = yield sobre cap. bursátil
          </p>
        </div>
      )}
    </Card>
  )
}

// ── main component ────────────────────────────────────────────────────────

export default function CompanyDetailPage({
  ticker, name, country, currency, sector, subsector, type,
  isPremium, hasData,
  price, change, changePct,
  dailyPrice, avgCost,
  yld, divRate, low52, high52,
  peTrailing, peForward, evEbitda, eps, payout, mktCap,
  divHistory, cagr, streak, updatedAt,
  health, moat, dcf, projection, dgiScore, insights, roicData,
  badges,
  buybacks,
  revenueHistory, netIncomeHistory, fcfHistory, epsHistory,
  financials,
}) {
  const isUp       = changePct != null ? changePct >= 0 : null
  const changeCol  = isUp === null ? '#8090a8' : isUp ? '#34d399' : '#f87171'
  const changeSign = isUp ? '+' : ''
  const flag       = countryFlag(country)

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 16px 64px' }}>
      <style>{`
        .cdp-main { display: grid; grid-template-columns: 1fr; gap: 16px; }
        @media (min-width: 820px) { .cdp-main { grid-template-columns: 1fr 300px; } }
      `}</style>

      {/* Breadcrumb + comparar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <p style={{ fontSize: 12, color: '#4a5270' }}>
          <Link href="/mercados" style={{ color: '#4a5270', textDecoration: 'none' }}>Mercados</Link>
          {' / '}
          <span style={{ color: '#8090a8' }}>{name}</span>
        </p>
        <Link href={`/comparador?tickers=${encodeURIComponent(ticker)}`} style={{ fontSize: 12, fontWeight: 700, color: '#818cf8', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)', padding: '6px 14px', borderRadius: 8, textDecoration: 'none' }}>
          Comparar con otras →
        </Link>
      </div>

      {/* ── 1. CABECERA ── */}
      <Card style={{ marginBottom: 16 }}>
        {/* Top row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
              <h1 style={{ fontSize: 22, fontWeight: 900, color: '#e0e8f0', lineHeight: 1.15 }}>{name}</h1>
              <span style={{ fontSize: 12, color: '#4a5270', fontWeight: 600 }}>{ticker}</span>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {flag && <span style={{ fontSize: 18 }}>{flag}</span>}
              <span style={{ fontSize: 11, color: '#4a5270', background: 'rgba(255,255,255,0.04)', padding: '2px 8px', borderRadius: 5 }}>{country}</span>
              {sector && <span style={{ fontSize: 11, color: '#818cf8', background: 'rgba(99,102,241,0.1)', padding: '2px 8px', borderRadius: 5 }}>{sector}</span>}
              {subsector && <span style={{ fontSize: 11, color: '#4a5270', background: 'rgba(255,255,255,0.04)', padding: '2px 8px', borderRadius: 5 }}>{subsector}</span>}
              {badges?.map(b => (
                <span key={b.id} style={{ fontSize: 11, fontWeight: 700, color: b.color, background: b.bg, padding: '2px 8px', borderRadius: 5 }} title={b.title}>
                  {b.label}
                </span>
              ))}
              {buybacks?.isCannibal && (
                <span style={{ fontSize: 11, fontWeight: 700, color: '#34d399', background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.3)', padding: '2px 8px', borderRadius: 5 }}>
                  🔥 Caníbal de recompras
                </span>
              )}
            </div>
          </div>

          {/* Price hero */}
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: 42, fontWeight: 900, color: '#e0e8f0', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
              {price != null ? price.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
              <span style={{ fontSize: 16, color: '#4a5270', fontWeight: 400, marginLeft: 6 }}>{currency}</span>
            </p>
            {changePct != null && (
              <p style={{ fontSize: 16, fontWeight: 700, color: changeCol, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
                {changeSign}{changePct.toFixed(2)}%
                {change != null && (
                  <span style={{ fontSize: 13, marginLeft: 8, opacity: 0.75 }}>
                    ({changeSign}{Math.abs(change).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currency})
                  </span>
                )}
              </p>
            )}
            {yld != null && (
              <p style={{ fontSize: 14, color: '#34d399', fontWeight: 700, marginTop: 4 }}>
                Yield {fmtPct(yld)}
                {divRate != null && <span style={{ fontSize: 11, color: '#4a5270', fontWeight: 400, marginLeft: 6 }}>(DPS {fmt(divRate)} {currency})</span>}
              </p>
            )}
            {/* Frescura del precio */}
            {dailyPrice && (
              <p style={{ fontSize: 10, color: '#4a5270', marginTop: 6 }}>
                {dailyPrice.isToday
                  ? `Actualizado hoy ${new Date(dailyPrice.updatedAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`
                  : `Precio de cierre del ${new Date(dailyPrice.date + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}`
                }
              </p>
            )}
          </div>
        </div>

        {/* 52-week bar */}
        <Week52Bar price={price} low52={low52} high52={high52} currency={currency} />

        {!hasData && (
          <div style={{ marginTop: 14, padding: '12px', background: 'rgba(255,255,255,0.02)', borderRadius: 8, textAlign: 'center' }}>
            <p style={{ fontSize: 13, color: '#4a5270' }}>Esta empresa aún no tiene datos fundamentales. Se actualizan semanalmente.</p>
          </div>
        )}
      </Card>

      {/* ── 2. GRÁFICO DE COTIZACIÓN ── */}
      <Card style={{ marginBottom: 16 }}>
        <PriceChart ticker={ticker} currency={currency} avgCost={avgCost} divHistory={divHistory} />
      </Card>

      {/* ── MAIN LAYOUT ── */}
      <div className="cdp-main">

        {/* LEFT COLUMN */}
        <div style={{ display: 'grid', gap: 16 }}>

          {/* ── 3. GAUGE SALUD FINANCIERA ── */}
          <HealthSection health={health} type={type} isPremium={isPremium} />

          {/* ── 4. FOSO ECONÓMICO ── */}
          <MoatSection moat={moat} isPremium={isPremium} />

          {/* ── 5. HISTORIAL DIVIDENDOS ── */}
          <DividendSection divHistory={divHistory} streak={streak} cagr={cagr} isPremium={isPremium} />

          {/* ── 6. RECOMPRAS ── */}
          <BuybackSection buybacks={buybacks} />

          {/* ── 7. DCF Y VALORACIÓN ── */}
          <DCFSection dcf={dcf} ticker={ticker} peTrailing={peTrailing} peForward={peForward} evEbitda={evEbitda} isPremium={isPremium} />

          {/* ── PROYECCIÓN 10 AÑOS ── */}
          <ProjectionSection projection={projection} cagr={cagr} isPremium={isPremium} />

          {/* ── 8. INSIGHTS ── */}
          <InsightsSection insights={insights} isPremium={isPremium} />

          {/* ── MÉTRICAS HISTÓRICAS ── */}
          <Card>
            <SectionTitle>Evolución de métricas clave</SectionTitle>
            <KeyMetricsChart
              revenueHistory={revenueHistory}
              netIncomeHistory={netIncomeHistory}
              fcfHistory={fcfHistory}
              epsHistory={epsHistory}
            />
          </Card>

          {/* ── ESTADOS FINANCIEROS (acordeón) ── */}
          <Card>
            <FinancialTables
              isPremium={isPremium}
              income_statement_annual={financials?.income_statement_annual}
              balance_sheet_annual={financials?.balance_sheet_annual}
              cashflow_annual={financials?.cashflow_annual}
              income_statement_quarterly={financials?.income_statement_quarterly}
              balance_sheet_quarterly={financials?.balance_sheet_quarterly}
              cashflow_quarterly={financials?.cashflow_quarterly}
            />
          </Card>
        </div>

        {/* RIGHT SIDEBAR */}
        <div style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
          {/* ── 10. SCORING DGI ── */}
          <DGIScoreCard dgiScore={dgiScore} isPremium={isPremium} />

          {/* Métricas rápidas */}
          <RoicCard roicData={roicData} isPremium={isPremium} />
          <KeyRatiosCard eps={eps} payout={payout} mktCap={mktCap} updatedAt={updatedAt} />
        </div>
      </div>
    </div>
  )
}
