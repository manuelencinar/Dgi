'use client'
import { useState, useEffect, useMemo } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import PriceChart from '@/components/empresa/PriceChart'
import DividendBars from '@/components/empresa/DividendBars'
import FinancialTables from '@/components/empresa/FinancialTables'
import StatementCharts from '@/components/empresa/StatementCharts'
import FinanzasDeepDive, { FinanzasKpis } from '@/components/empresa/FinanzasSections'
import FollowButton from '@/components/watchlist/FollowButton'
import ScoreHistory from '@/components/empresa/ScoreHistory'
import AnalystEstimates from '@/components/empresa/AnalystEstimates'
import IncomeSankey from '@/components/empresa/IncomeSankey'
import CompanyLogo from '@/components/CompanyLogo'
import LocalPrice from '@/components/LocalPrice'
import HealthTwoLevel, { Semaforo } from '@/components/empresa/HealthPanel'
import InsiderCard from '@/components/empresa/InsiderCard'
import { recomputeValuation } from '@/lib/valuation'
import { dividendTierInfo, dividendTrend, dividendTrendBadges } from '@/lib/helpers'
import { project10y, paybackYear, netYield, getWHT, effectiveDivTax } from '@/lib/screener'

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
  if (v >= 1e6)  return (v / 1e6).toLocaleString('es-ES', { maximumFractionDigits: 0 }) + ' M'
  return v.toLocaleString('es-ES', { maximumFractionDigits: 0 })
}
function countryFlag(code) {
  if (!code || code.length !== 2) return ''
  return code.toUpperCase().split('').map(c => String.fromCodePoint(c.charCodeAt(0) + 127397)).join('')
}
function scoreColor(s) {
  if (s == null) return 'var(--text-faint)'
  if (s >= 7.5) return 'var(--positive)'
  if (s >= 5)   return 'var(--warning)'
  return 'var(--negative)'
}
function streakBadge(n) {
  const t = dividendTierInfo(n)
  if (t) return { emoji: t.emoji, label: t.name, color: t.color }
  const v = parseInt(n)
  if (!isNaN(v) && v >= 5) return { emoji: '', label: `${v}a racha`, color: 'var(--accent)' }
  return null
}

const DEFAULT_DEST_WHT = 19   // fallback si el usuario no tiene residencia fiscal guardada

// ── premium gate ──────────────────────────────────────────────────────────

// Gate premium. IMPORTANTE: NO renderiza datos reales — solo un esqueleto
// ficticio difuminado. Así, aunque el usuario quite el filter:blur por DevTools
// o lea el HTML, no hay contenido premium en el DOM ni en el payload del cliente.
function PremiumGate({ label = 'Contenido Premium', hint }) {
  return (
    <div style={{ position: 'relative', minHeight: 150 }}>
      <div style={{ filter: 'blur(6px)', pointerEvents: 'none', userSelect: 'none' }} aria-hidden="true">
        <Card>
          <div style={{ height: 12, width: '42%', background: 'var(--border-strong)', borderRadius: 5, marginBottom: 16 }} />
          <div style={{ display: 'grid', gap: 10, marginBottom: 16 }}>
            {[82, 64, 90, 55].map((w, i) => (
              <div key={i} style={{ height: 10, width: `${w}%`, background: 'var(--border)', borderRadius: 5 }} />
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={{ height: 46, background: 'var(--surface-3)', borderRadius: 8 }} />
            <div style={{ height: 46, background: 'var(--surface-3)', borderRadius: 8 }} />
          </div>
        </Card>
      </div>
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 8, background: 'rgba(8,11,20,0.55)',
      }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>{label}</p>
        {hint && <p style={{ fontSize: 12, color: 'var(--text-faint)', textAlign: 'center', maxWidth: 260 }}>{hint}</p>}
        <Link href="/pricing" style={{
          fontSize: 12, fontWeight: 700, color: '#fff', textDecoration: 'none',
          padding: '7px 18px', background: 'var(--accent)', borderRadius: 8,
        }}>Activar Premium →</Link>
      </div>
    </div>
  )
}

// ── section wrapper ───────────────────────────────────────────────────────

function Card({ children, style }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 12, padding: '20px', minWidth: 0, ...style,
    }}>{children}</div>
  )
}

function SectionTitle({ children }) {
  return (
    <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14 }}>
      {children}
    </p>
  )
}

// ── 52-week range bar ─────────────────────────────────────────────────────

function Week52Bar({ price, low52, high52, currency, compact }) {
  if (low52 == null || high52 == null || low52 >= high52) return null
  const span    = high52 - low52
  const rawPct  = price != null ? ((price - low52) / span) * 100 : null
  const pct     = rawPct != null ? Math.max(0, Math.min(100, rawPct)) : null
  const barCol  = pct == null ? 'var(--text-faint)'
    : pct < 10 ? '#fb923c' : pct > 90 ? 'var(--warning)'
    : pct < 30 ? 'var(--negative)' : pct > 70 ? 'var(--positive)' : 'var(--warning)'

  return (
    <div style={{ marginTop: compact ? 0 : 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>Mín 52s · {fmt(low52)} {currency}</span>
        <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>Máx 52s · {fmt(high52)} {currency}</span>
      </div>
      <div style={{ position: 'relative', height: 6, background: 'var(--border)', borderRadius: 3 }}>
        <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${pct ?? 0}%`, background: barCol, borderRadius: 3, transition: 'width 0.5s' }} />
        {pct != null && (
          <div style={{
            position: 'absolute', top: -3, left: `${pct}%`, transform: 'translateX(-50%)',
            width: 12, height: 12, background: barCol, border: '2px solid var(--bg)', borderRadius: '50%',
          }} />
        )}
      </div>
      {pct != null && !compact && (
        <p style={{ fontSize: 10, color: 'var(--text-faint)', textAlign: 'center', marginTop: 4 }}>
          Precio actual en el <span style={{ color: barCol, fontWeight: 700 }}>{pct.toFixed(0)}%</span> del rango anual
        </p>
      )}
    </div>
  )
}

// ── compact metric card ───────────────────────────────────────────────────

function MiniMetric({ label, value, sub, color }) {
  return (
    <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '12px 14px', minWidth: 0, overflow: 'hidden' }}>
      <p style={{ fontSize: 10, color: 'var(--text-faint)', marginBottom: 4 }}>{label}</p>
      <p style={{ fontSize: 18, fontWeight: 800, color: color || 'var(--text)', lineHeight: 1.15, overflowWrap: 'anywhere' }}>{value}</p>
      {sub && <p style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 3, overflowWrap: 'anywhere' }}>{sub}</p>}
    </div>
  )
}

// ── moat section (full) ────────────────────────────────────────────────────

function MoatSection({ moat, isPremium }) {
  if (!isPremium) return <PremiumGate label="Foso económico" hint="Señales de ventaja competitiva basadas en ROE, márgenes y racha de dividendos." />
  if (!moat) return null
  const widthColor = { wide: 'var(--positive)', narrow: 'var(--warning)', none: 'var(--text-faint)' }[moat.width] || 'var(--text-faint)'
  const content = (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <SectionTitle>Foso económico</SectionTitle>
        <span style={{ fontSize: 12, fontWeight: 700, color: widthColor, background: `${widthColor}18`, padding: '3px 10px', borderRadius: 6 }}>
          {moat.label}
        </span>
      </div>
      {moat.signals?.length > 0 && (
        <div style={{ display: 'grid', gap: 6, marginBottom: moat.negative?.length || moat.sources?.length ? 12 : 0 }}>
          {moat.signals.map((s, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, fontSize: 13, color: 'var(--text-muted)', alignItems: 'flex-start' }}>
              <span style={{ color: 'var(--positive)', flexShrink: 0, marginTop: 1 }}>+</span>{s}
            </div>
          ))}
        </div>
      )}
      {moat.negative?.length > 0 && (
        <div style={{ display: 'grid', gap: 6, marginBottom: moat.sources?.length ? 12 : 0 }}>
          {moat.negative.map((s, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, fontSize: 13, color: 'var(--text-muted)', alignItems: 'flex-start' }}>
              <span style={{ color: 'var(--negative)', flexShrink: 0, marginTop: 1 }}>−</span>{s}
            </div>
          ))}
        </div>
      )}
      {moat.sources?.length > 0 && (
        <div style={{ marginTop: 10, padding: '10px 12px', background: 'rgba(99,102,241,0.06)', borderRadius: 8 }}>
          <p style={{ fontSize: 10, color: 'var(--text-faint)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Origen del foso</p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {moat.sources.map((s, i) => (
              <span key={i} style={{ fontSize: 11, color: 'var(--accent)', background: 'rgba(99,102,241,0.1)', padding: '2px 8px', borderRadius: 5 }}>{s}</span>
            ))}
          </div>
        </div>
      )}
      {!moat.signals?.length && !moat.negative?.length && (
        <p style={{ fontSize: 13, color: 'var(--text-faint)' }}>Datos insuficientes para detectar foso económico.</p>
      )}
    </Card>
  )
  return content
}

// ── dividend history section ───────────────────────────────────────────────

function DividendHistorySection({ divHistory, streak, cagr, currency }) {
  const [showOlder, setShowOlder] = useState(false)
  const [count, setCount] = useState(5)             // móvil 5 · escritorio 10
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(min-width: 820px)')
    const apply = () => setCount(mq.matches ? 10 : 5)
    apply()
    mq.addEventListener?.('change', apply)
    return () => mq.removeEventListener?.('change', apply)
  }, [])
  const badge       = streakBadge(streak)
  const fullHistory = [...divHistory].sort((a, b) => a.year - b.year)
  const chartHistory = fullHistory.slice(-count)    // últimos N años en el gráfico
  const older        = fullHistory.slice(0, -count) // años anteriores → listado desplegable
  const startYear   = streak > 0 ? new Date().getFullYear() - streak : null
  const trendBadges = streak > 0 ? [] : dividendTrendBadges(dividendTrend(divHistory))

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <SectionTitle>Historial de dividendos</SectionTitle>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {cagr != null && (
            <span style={{ fontSize: 12, color: cagr >= 0.05 ? 'var(--positive)' : 'var(--warning)', fontWeight: 700 }}>
              CAGR {(cagr * 100).toFixed(1)}%
            </span>
          )}
          {badge && (
            <span style={{ fontSize: 11, fontWeight: 700, color: badge.color, background: `${badge.color}18`, padding: '2px 8px', borderRadius: 5 }}>
              {badge.emoji ? badge.emoji + ' ' : ''}{badge.label}
            </span>
          )}
        </div>
      </div>
      {startYear ? (
        <p style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 12 }}>
          {streak} años consecutivos subiendo el dividendo · racha desde ~{startYear}
        </p>
      ) : trendBadges.length > 0 ? (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {trendBadges.map(b => (
            <span key={b.kind} title={b.title} style={{ fontSize: 11, fontWeight: 700, color: b.color, background: `${b.color}18`, padding: '3px 9px', borderRadius: 6 }}>
              {b.emoji} {b.title}
            </span>
          ))}
        </div>
      ) : null}
      <DividendBars history={chartHistory} />
      {older.length > 0 && (
        <>
          <button onClick={() => setShowOlder(s => !s)} style={{
            marginTop: 12, width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '8px 12px', cursor: 'pointer', color: 'var(--accent)', fontSize: 11, fontWeight: 700,
          }}>
            {showOlder ? 'Ocultar años anteriores ▲' : `Ver años anteriores (${older.length}) ▼`}
          </button>
          {showOlder && (
            <div style={{ marginTop: 10, maxHeight: 260, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    <th style={{ padding: '6px 8px', textAlign: 'left', color: 'var(--text-faint)', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>Año</th>
                    <th style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--text-faint)', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>DPS bruto</th>
                  </tr>
                </thead>
                <tbody>
                  {[...older].reverse().map((h, i) => (
                    <tr key={h.year} style={{ background: i % 2 ? 'var(--surface)' : 'transparent' }}>
                      <td style={{ padding: '6px 8px', color: 'var(--text-muted)' }}>{h.year}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--text)', fontWeight: 600 }}>
                        {h.dps != null ? `${fmt(h.dps, 3)} ${currency}` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Card>
  )
}

// ── upcoming payments (estimated) ──────────────────────────────────────────

function fmtDateEs(d) {
  if (!d) return null
  try { return new Date(d + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) } catch { return null }
}

// Formatea un timestamp ISO completo (no_dividend_confirmed_at) a fecha es-ES.
function fmtStampEs(d) {
  if (!d) return null
  try { const dt = new Date(d); return isNaN(dt) ? null : dt.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) } catch { return null }
}

// Banner informativo cuando no hay historial de dividendo que mostrar.
//   'none'    no reparte (gris) · 'unknown' sin verificar (gris) · 'pending' reparte pero falta dato (ámbar)
function DividendBanner({ state, date }) {
  const stamp = fmtStampEs(date)
  const CFG = {
    none: {
      color: 'var(--text-muted)', bg: 'rgba(107,118,147,0.08)', border: 'rgba(107,118,147,0.22)', icon: '○',
      title: 'Esta empresa no reparte dividendo actualmente',
      sub: stamp ? `Verificado el ${stamp}` : 'Muchas empresas de calidad reinvierten todo su beneficio en el negocio en lugar de repartirlo.',
    },
    unknown: {
      color: 'var(--text-muted)', bg: 'rgba(107,118,147,0.08)', border: 'rgba(107,118,147,0.22)', icon: '○',
      title: 'Sin datos de dividendo disponibles',
      sub: 'Todavía no hemos verificado la política de dividendo de esta empresa.',
    },
    pending: {
      color: 'var(--warning)', bg: 'rgba(251,191,36,0.08)', border: 'rgba(251,191,36,0.25)', icon: '⏳',
      title: 'Datos de dividendo pendientes de actualizar',
      sub: 'La empresa reparte dividendo pero todavía no disponemos del importe.',
    },
  }
  const c = CFG[state] || CFG.unknown
  return (
    <Card style={{ background: c.bg, border: `1px solid ${c.border}` }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <span style={{ fontSize: 20, color: c.color, lineHeight: 1.1 }}>{c.icon}</span>
        <div>
          <p style={{ fontSize: 14, fontWeight: 700, color: c.color, marginBottom: 4 }}>{c.title}</p>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>{c.sub}</p>
        </div>
      </div>
    </Card>
  )
}

// Bloque compacto y prominente del próximo dividendo (resumen, visible en free).
function NextDividendCard({ nextExDate, payments, currency, onSeeAll }) {
  const exLabel = fmtDateEs(nextExDate)
  const nextPay = payments?.[0]
  if (!exLabel && !nextPay?.payLabel) return null
  const Item = ({ label, value, sub, color }) => (
    <div style={{ minWidth: 110 }}>
      <p style={{ fontSize: 10.5, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>{label}</p>
      <p style={{ fontSize: 16, fontWeight: 800, color: color || 'var(--text-strong)', lineHeight: 1.1 }}>{value}</p>
      {sub && <p style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 2 }}>{sub}</p>}
    </div>
  )
  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <SectionTitle>Próximo dividendo</SectionTitle>
        {onSeeAll && <button onClick={onSeeAll} style={{ fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}>Ver detalle →</button>}
      </div>
      <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
        {exLabel && <Item label="Fecha ex-dividendo" value={exLabel} color="var(--positive)" />}
        {nextPay?.payLabel && <Item label="Fecha de pago" value={nextPay.payLabel} sub={nextPay.confirmed ? 'confirmado' : 'estimado'} />}
        {nextPay?.gross != null && <Item label={`Importe/acción (${currency})`} value={fmt(nextPay.gross, 3)} sub={nextPay.net != null ? `neto ~${fmt(nextPay.net, 3)}` : null} />}
      </div>
    </Card>
  )
}

function UpcomingPayments({ payments, currency, nextExDate, originWHT = 0, destWHT = DEFAULT_DEST_WHT, isDomestic = false }) {
  const exLabel = fmtDateEs(nextExDate)
  const effWHT = Math.round(effectiveDivTax(originWHT, destWHT, isDomestic) * 10) / 10
  const capped = !isDomestic && originWHT > 15   // se topa el crédito al 15%
  return (
    <Card>
      <SectionTitle>Próximos pagos</SectionTitle>
      {exLabel && (
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
          Próxima fecha <b style={{ color: 'var(--text)' }}>ex-dividendo</b>: {exLabel}
        </p>
      )}
      {payments?.length ? (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  {['Fecha de pago', `Bruto (${currency})`, `Neto (${currency})`, ''].map((h, i) => (
                    <th key={i} style={{ padding: '6px 8px', textAlign: i === 0 ? 'left' : i === 3 ? 'right' : 'right', color: 'var(--text-faint)', fontWeight: 600, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {payments.map((p, i) => (
                  <tr key={i} style={{ background: i % 2 ? 'var(--surface)' : 'transparent' }}>
                    <td style={{ padding: '7px 8px', color: 'var(--text)', whiteSpace: 'nowrap' }}>
                      {p.payLabel || '—'}
                      {p.exLabel && <span style={{ display: 'block', fontSize: 9.5, color: 'var(--text-faint)' }}>ex {p.exLabel}</span>}
                    </td>
                    <td style={{ padding: '7px 8px', textAlign: 'right', color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>{p.gross != null ? fmt(p.gross, 3) : '—'}</td>
                    <td style={{ padding: '7px 8px', textAlign: 'right', color: 'var(--positive)', fontWeight: 700, whiteSpace: 'nowrap' }}>{p.net != null ? fmt(p.net, 3) : '—'}</td>
                    <td style={{ padding: '7px 8px', textAlign: 'right' }}>
                      {p.confirmed
                        ? <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--positive)', background: 'rgba(52,211,153,0.12)', padding: '1px 7px', borderRadius: 5, whiteSpace: 'nowrap' }}>Confirmado</span>
                        : <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Estimado</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ fontSize: 10, color: 'var(--text-faintest)', marginTop: 8, lineHeight: 1.5 }}>
            <b style={{ color: 'var(--text-faintest)' }}>Neto</b> tras retención efectiva del <b style={{ color: 'var(--text-faintest)' }}>{effWHT}%</b> {isDomestic ? `(impuesto español ${destWHT}%)` : capped ? `(origen ${originWHT}%, del que solo se acredita el 15% máx. legal contra el ${destWHT}% español; el exceso no es deducible)` : `(origen ${originWHT}% acreditado contra el ${destWHT}% español)`}.
            Las fechas confirmadas las declara la empresa; el resto se estiman sumando a la fecha ex-dividendo los días de pago típicos del mercado, y los importes se proyectan según la frecuencia y el histórico.
          </p>
        </>
      ) : (
        <p style={{ fontSize: 12, color: 'var(--text-faint)' }}>Sin histórico suficiente para estimar los próximos pagos.</p>
      )}
    </Card>
  )
}

// ── renta projection €X (editable) ─────────────────────────────────────────

function RentaProjection({ yld, cagr, country, currency, dpsScenarios, destWHT = DEFAULT_DEST_WHT }) {
  const [amount, setAmount] = useState(1000)
  const yieldPct  = yld != null ? yld * 100 : null
  const growthPct = cagr != null ? cagr * 100 : 0
  const originWHT = getWHT(country)
  const isDomestic = country === 'ES'

  const rows = useMemo(() => {
    if (!yieldPct) return null
    return project10y(amount || 0, yieldPct, growthPct, originWHT, destWHT, isDomestic)
  }, [amount, yieldPct, growthPct, originWHT, destWHT, isDomestic])
  const payback = useMemo(() => yieldPct ? paybackYear(amount || 0, yieldPct, growthPct, originWHT, destWHT, isDomestic) : null, [amount, yieldPct, growthPct, originWHT, destWHT, isDomestic])

  const maxGross = rows ? Math.max(...rows.map(r => r.gross)) : 0

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <SectionTitle>Proyección de renta a 10 años</SectionTitle>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>Inversión</span>
          <input type="number" value={amount} min={0} step={100}
            onChange={e => setAmount(parseFloat(e.target.value) || 0)}
            style={{ width: 92, background: 'rgba(0,0,0,0.25)', border: '1px solid var(--border-strong)', borderRadius: 6, padding: '5px 8px', color: 'var(--text)', fontSize: 12, outline: 'none' }} />
          <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{currency}</span>
        </div>
      </div>

      {rows ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 14 }}>
            <MiniMetric label="Renta año 1 (neta)" value={`${fmt(rows[0].net)} ${currency}`} color="var(--positive)" />
            <MiniMetric label="Total 10 años (neto)" value={`${fmt(rows[9].cum)} ${currency}`} color="var(--accent)" />
            <MiniMetric label="Recuperación" value={payback ? `Año ${payback}` : '+10 años'} />
          </div>

          {/* Barras bruto (gris) + neto (verde) por año */}
          <div style={{ display: 'grid', gap: 5, marginBottom: 12 }}>
            {rows.map(r => (
              <div key={r.year} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 10, color: 'var(--text-faint)', width: 24, flexShrink: 0 }}>{r.year}</span>
                <div style={{ flex: 1, position: 'relative', height: 12, background: 'var(--surface-2)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', inset: 0, width: `${maxGross ? (r.gross / maxGross) * 100 : 0}%`, background: 'var(--border-strong)' }} />
                  <div style={{ position: 'absolute', inset: 0, width: `${maxGross ? (r.net / maxGross) * 100 : 0}%`, background: 'rgba(52,211,153,0.55)' }} />
                </div>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', width: 64, textAlign: 'right', flexShrink: 0 }}>{fmt(r.net)} {currency}</span>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 10, color: 'var(--text-faintest)' }}>
            Barra gris: dividendo bruto · verde: neto tras retención ({Math.round(effectiveDivTax(originWHT, destWHT, isDomestic) * 10) / 10}%{!isDomestic && originWHT > 15 ? ', crédito por doble imposición topado al 15%' : ''}). Crecimiento del dividendo moderado año a año.
          </p>

          {/* Escenarios DPS conservador/base/optimista (migrado) */}
          {dpsScenarios?.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <p style={{ fontSize: 10, color: 'var(--text-faint)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                Dividendo por acción proyectado ({currency})
              </p>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    {['Año', 'Conserv.', 'Base', 'Optimista'].map(h => (
                      <th key={h} style={{ padding: '6px 8px', textAlign: h === 'Año' ? 'left' : 'right', color: 'var(--text-faint)', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dpsScenarios.map((p, i) => (
                    <tr key={p.year} style={{ background: i % 2 ? 'var(--surface)' : 'transparent' }}>
                      <td style={{ padding: '6px 8px', color: 'var(--text-muted)' }}>{p.year}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--negative)' }}>{fmt(p.conservative, 3)}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--text)', fontWeight: 700 }}>{fmt(p.base, 3)}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--positive)' }}>{fmt(p.optimistic, 3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        <p style={{ fontSize: 12, color: 'var(--text-faint)' }}>Sin dividendo: no se puede proyectar la renta.</p>
      )}
    </Card>
  )
}

// ── valuation field (editable) ─────────────────────────────────────────────

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
  const bg = modified ? 'rgba(251,146,60,0.1)' : 'var(--surface-2)'
  const border = modified ? '1px solid rgba(251,146,60,0.35)' : '1px solid var(--border)'
  return (
    <div style={{ background: bg, border, borderRadius: 8, padding: '8px 10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 10, color: modified ? '#fb923c' : 'var(--text-faint)' }}>{field.label}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: modified ? '#fb923c' : 'var(--text)' }}>
          {disp}{field.unit ? ` ${field.unit}` : ''}
        </span>
      </div>
      {field.type === 'slider' ? (
        <input type="range" min={field.min} max={field.max} step={field.step} value={disp}
          onChange={e => onChange(field.key, fromDisplay(field, e.target.value))}
          style={{ width: '100%', accentColor: modified ? '#fb923c' : 'var(--accent)' }} />
      ) : (
        <input type="number" value={disp} step="any"
          onChange={e => onChange(field.key, fromDisplay(field, e.target.value))}
          style={{ width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-strong)', borderRadius: 6, padding: '5px 8px', color: 'var(--text)', fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
      )}
    </div>
  )
}

// ── valuation bar ──────────────────────────────────────────────────────────

function ValuationBar({ price, iv }) {
  if (!price || !iv || price <= 0 || iv <= 0) return null
  const lo   = Math.min(price, iv) * 0.88
  const hi   = Math.max(price, iv) * 1.12
  const span = hi - lo
  const pPct = Math.max(0, Math.min(100, (price - lo) / span * 100))
  const iPct = Math.max(0, Math.min(100, (iv    - lo) / span * 100))
  const left = Math.min(pPct, iPct), right = Math.max(pPct, iPct)
  const col  = iv > price ? 'var(--positive)' : 'var(--negative)'
  return (
    <div style={{ marginTop: 14, marginBottom: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, fontSize: 10, color: 'var(--text-faint)' }}>
        <span>Precio: {price.toLocaleString('es-ES', { maximumFractionDigits: 2 })}</span>
        <span>Val. intrínseco: {iv.toLocaleString('es-ES', { maximumFractionDigits: 2 })}</span>
      </div>
      <div style={{ position: 'relative', height: 8, background: 'var(--border)', borderRadius: 4 }}>
        <div style={{ position: 'absolute', top: 0, height: '100%', left: `${left}%`, width: `${right - left}%`, background: `${col}40`, borderRadius: 4 }} />
        <div style={{ position: 'absolute', top: '50%', left: `${pPct}%`, transform: 'translate(-50%,-50%)', width: 12, height: 12, borderRadius: '50%', background: 'var(--text)', border: '2px solid var(--bg)' }} />
        <div style={{ position: 'absolute', top: '50%', left: `${iPct}%`, transform: 'translate(-50%,-50%)', width: 12, height: 12, borderRadius: '50%', background: col, border: '2px solid var(--bg)' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 9, color: 'var(--text-faint)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: 'var(--text)' }} /> Precio actual
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: col }} /> Valor intrínseco
        </span>
      </div>
    </div>
  )
}

// ── DCF / valuation section ────────────────────────────────────────────────

function DCFSection({ dcf, ticker, isPremium, ma200 }) {
  const [expanded, setExpanded] = useState(false)
  const [mode, setMode]         = useState('auto')
  const [custom, setCustom]     = useState(null)
  const [userNotes, setUserNotes] = useState('')
  const storageKey = `valuation:${ticker}`

  useEffect(() => {
    if (typeof window === 'undefined' || !dcf?.params) return
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || 'null')
      if (saved?.params) { setCustom(saved.params); setUserNotes(saved.notes || ''); setMode('custom') }
    } catch {}
  }, [ticker])

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
  const mosCol = mos != null ? (mos > 0.1 ? 'var(--positive)' : mos > -0.1 ? 'var(--warning)' : 'var(--negative)') : 'var(--text-faint)'
  const mosLbl = mos != null ? (mos > 0.25 ? 'Zona de compra' : mos > 0.05 ? 'Ligero descuento' : mos > -0.1 ? 'Precio justo' : 'Sobrecomprado') : ''

  const enterCustom = () => { if (!custom && dcf?.params) setCustom({ ...dcf.params }); setMode('custom') }
  const resetAuto = () => {
    setCustom(dcf?.params ? { ...dcf.params } : null); setUserNotes(''); setMode('auto')
    if (typeof window !== 'undefined') localStorage.removeItem(storageKey)
  }
  const changeParam = (key, val) => setCustom(p => ({ ...(p || dcf.params), [key]: val }))

  // El usuario free no recibe el cálculo (solo el MoS como teaser en el resumen).
  if (!isPremium) return <PremiumGate label="Valoración (Premium)" hint="Valor intrínseco, margen de seguridad y cálculo detallado adaptado al sector." />

  const content = (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <SectionTitle>Valor intrínseco</SectionTitle>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {mode === 'custom' && (
            <span style={{ fontSize: 10, fontWeight: 700, color: '#fb923c', background: 'rgba(251,146,60,0.12)', padding: '2px 8px', borderRadius: 5 }}>Personalizada</span>
          )}
          {dcf?.methodLabel && (
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', background: 'rgba(99,102,241,0.12)', padding: '2px 8px', borderRadius: 5 }}>{dcf.methodLabel}</span>
          )}
        </div>
      </div>

      {dcf?.available ? (
        <>
          {dcf.warnings?.length > 0 && (
            <div style={{ marginBottom: 12, display: 'grid', gap: 6 }}>
              {dcf.warnings.map((w, i) => (
                <div key={i} style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.25)', borderRadius: 8, padding: '9px 12px', display: 'flex', gap: 8 }}>
                  <span style={{ color: 'var(--warning)', flexShrink: 0 }}>⚠</span>
                  <p style={{ fontSize: 11, color: 'var(--warning)', lineHeight: 1.5 }}>{w}</p>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
            <div style={{ background: 'var(--surface-2)', borderRadius: 8, padding: '10px 12px' }}>
              <p style={{ fontSize: 10, color: 'var(--text-faint)', marginBottom: 3 }}>Valor intrínseco</p>
              <p style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>{fmt(iv)}</p>
            </div>
            <div style={{ background: 'var(--surface-2)', borderRadius: 8, padding: '10px 12px' }}>
              <p style={{ fontSize: 10, color: 'var(--text-faint)', marginBottom: 3 }}>Precio actual</p>
              <p style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>{fmt(dcf.price)}</p>
            </div>
            <div style={{ background: 'var(--surface-2)', borderRadius: 8, padding: '10px 12px' }}>
              <p style={{ fontSize: 10, color: 'var(--text-faint)', marginBottom: 3 }}>Margen seguridad</p>
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

          {(() => {
            if (ma200 == null || !(dcf.price > 0) || !(ma200 > 0)) return null
            const dist = (dcf.price - ma200) / ma200 * 100
            const below = dist <= 0
            const col = below ? 'var(--positive)' : 'var(--text-muted)'
            return (
              <div title="Media móvil de 200 sesiones — referencia técnica de tendencia/entrada" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, background: 'var(--surface-2)', borderRadius: 8, padding: '10px 12px' }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Media móvil 200 sesiones (MM200) · {fmt(ma200)}</span>
                <span style={{ fontSize: 12, fontWeight: 800, color: col }}>
                  {Math.abs(dist).toFixed(1)}% <span style={{ fontWeight: 600, color: 'var(--text-faint)' }}>{below ? 'por debajo' : 'por encima'}</span>
                </span>
              </div>
            )
          })()}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, gap: 8, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 4, background: 'var(--surface-2)', borderRadius: 8, padding: 3 }}>
              <button onClick={resetAuto} style={{ fontSize: 11, fontWeight: 700, padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', background: mode === 'auto' ? 'rgba(99,102,241,0.2)' : 'transparent', color: mode === 'auto' ? 'var(--accent)' : 'var(--text-faint)' }}>Automático</button>
              <button onClick={enterCustom} style={{ fontSize: 11, fontWeight: 700, padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', background: mode === 'custom' ? 'rgba(251,146,60,0.2)' : 'transparent', color: mode === 'custom' ? '#fb923c' : 'var(--text-faint)' }}>Personalizado</button>
            </div>
            {mode === 'custom' && (
              <button onClick={resetAuto} style={{ fontSize: 11, color: 'var(--text-faint)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                Restablecer valores automáticos
              </button>
            )}
          </div>

          {mode === 'custom' && dcf.editable?.length > 0 && activeParams && (
            <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8 }}>
              {dcf.editable.map(field => (
                <ValuationField key={field.key} field={field} raw={activeParams[field.key]} autoRaw={dcf.params[field.key]} onChange={changeParam} />
              ))}
            </div>
          )}

          {mode === 'custom' && (
            <textarea value={userNotes} onChange={e => setUserNotes(e.target.value)}
              placeholder="Anota tu razonamiento…"
              style={{ marginTop: 8, width: '100%', minHeight: 54, resize: 'vertical', background: 'var(--surface-2)', border: '1px solid var(--surface-3)', borderRadius: 8, padding: '8px 10px', color: 'var(--text)', fontSize: 12, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }} />
          )}

          {dcf.fcfYears?.length > 0 && (
            <div style={{ marginTop: 12, padding: '10px 12px', background: 'var(--surface)', borderRadius: 8 }}>
              <p style={{ fontSize: 10, color: 'var(--text-faint)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>FCF por año (base normalizada)</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6 }}>
                {dcf.fcfYears.map(y => (
                  <div key={y.year} style={{ textAlign: 'center' }}>
                    <p style={{ fontSize: 10, color: 'var(--text-faint)' }}>{y.year}</p>
                    <p style={{ fontSize: 12, fontWeight: 700, color: y.value >= 0 ? 'var(--positive)' : 'var(--negative)' }}>
                      {Math.abs(y.value) >= 1e6 ? (y.value/1e6).toLocaleString('es-ES', { maximumFractionDigits: 0 })+' M' : y.value.toFixed(0)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button onClick={() => setExpanded(e => !e)} style={{
            marginTop: 12, width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8,
            padding: '8px 12px', cursor: 'pointer', color: 'var(--accent)', fontSize: 11, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span>Ver cálculo detallado</span>
            <span>{expanded ? '▲' : '▼'}</span>
          </button>

          {expanded && (
            <div style={{ marginTop: 8, padding: '12px', background: 'var(--surface)', borderRadius: 8 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, marginBottom: 10 }}>
                <tbody>
                  {dcf.inputs.map((inp, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--surface-2)' }}>
                      <td style={{ padding: '5px 0', color: inp.danger ? 'var(--negative)' : 'var(--text-faint)' }}>{inp.label}</td>
                      <td style={{ padding: '5px 0', color: inp.danger ? 'var(--negative)' : 'var(--text)', textAlign: 'right', fontWeight: 600 }}>{inp.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {live?.projection?.length > 0 && (
                <div style={{ marginBottom: 10, overflowX: 'auto' }}>
                  <p style={{ fontSize: 10, color: 'var(--text-faint)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Proyección FCF descontado (10 años)</p>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                    <thead>
                      <tr>
                        {['Año', 'FCF proyectado', 'FCF descontado'].map(h => (
                          <th key={h} style={{ padding: '4px 6px', textAlign: h === 'Año' ? 'left' : 'right', color: 'var(--text-faint)', borderBottom: '1px solid var(--border)', fontWeight: 600 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {live.projection.map(y => (
                        <tr key={y.year} style={{ borderBottom: '1px solid var(--surface-2)' }}>
                          <td style={{ padding: '4px 6px', color: 'var(--text-muted)' }}>{y.year}</td>
                          <td style={{ padding: '4px 6px', textAlign: 'right', color: 'var(--text-muted)' }}>{fmtCap(y.cf)}</td>
                          <td style={{ padding: '4px 6px', textAlign: 'right', color: 'var(--text)' }}>{fmtCap(y.pv)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {dcf.notes?.map((note, i) => (
                <p key={i} style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>ℹ {note}</p>
              ))}
              <p style={{ fontSize: 9, color: 'var(--text-faintest)', marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--surface-2)' }}>
                ⚠ El valor intrínseco es una estimación basada en datos históricos y proyecciones. No constituye asesoramiento financiero.
              </p>
            </div>
          )}
        </>
      ) : (
        <p style={{ fontSize: 12, color: 'var(--text-faint)' }}>
          {dcf?.unavailableReason ?? 'Datos insuficientes para calcular el valor intrínseco'}
        </p>
      )}
    </Card>
  )

  return content
}

// ── valuation multiples grid ───────────────────────────────────────────────

function MultiplesGrid({ valuationMetrics, isPremium }) {
  if (!isPremium) return <PremiumGate label="Múltiplos (Premium)" hint="PER, EV/EBITDA y precio/valor contable con puntuación por sector." />
  if (!valuationMetrics?.length) return null
  // Reutiliza las métricas de valoración del Score DGI (pe, pef, eveb, pb) con su color
  const wanted = ['pe', 'pef', 'eveb', 'pb']
  const cards = wanted.map(k => valuationMetrics.find(m => m.key === k)).filter(Boolean)
  if (!cards.length) return null

  const content = (
    <Card>
      <SectionTitle>Múltiplos de valoración</SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10 }}>
        {cards.map(m => (
          <div key={m.key} style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
              <span style={{ fontSize: 10, color: 'var(--text-faint)', flex: 1 }}>{m.name}</span>
              <span title={m.tooltip} style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-faint)', border: '1px solid var(--border-strong)', borderRadius: '50%', width: 14, height: 14, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'help', flexShrink: 0 }}>?</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>{m.value}</span>
              {m.score != null && (
                <span style={{ fontSize: 12, fontWeight: 700, color: scoreColor(m.score) }}>{m.score}/10</span>
              )}
            </div>
          </div>
        ))}
      </div>
      <p style={{ fontSize: 10, color: 'var(--text-faintest)', marginTop: 10 }}>Puntuación 0–10 según los umbrales del sector.</p>
    </Card>
  )
  return content
}

// ── PER history chart ──────────────────────────────────────────────────────

// Gráfico genérico de historial de un múltiplo (PER o EV/EBITDA) vs su media y
// el valor actual, con veredicto barata/cara frente a su propia historia.
function ValuationHistoryChart({ history, current, isPremium, title, noun, note, gateHint, showGate = true }) {
  if (!isPremium) return showGate ? <PremiumGate label={`${title} (Premium)`} hint={gateHint} /> : null
  const data = (history || []).filter(d => d.val != null)
  if (data.length < 2) return null
  const mean = data.reduce((s, d) => s + d.val, 0) / data.length

  const W = 320, H = 120, padX = 28, padY = 16
  const series = current != null ? [...data, { year: 'Hoy', val: current }] : data
  const vals = series.map(d => d.val)
  const min = Math.min(...vals), max = Math.max(...vals)
  const span = max - min || 1
  const x = i => padX + (i / (series.length - 1)) * (W - padX * 2)
  const y = v => padY + (1 - (v - min) / span) * (H - padY * 2)
  const pts = series.map((d, i) => `${x(i).toFixed(1)},${y(d.val).toFixed(1)}`).join(' ')
  const curY = current != null ? y(current) : null

  return (
    <Card>
      <SectionTitle>{title}</SectionTitle>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>
        {curY != null && <line x1={padX} y1={curY} x2={W - padX} y2={curY} stroke="var(--accent)" strokeWidth="1" strokeDasharray="4 4" opacity="0.6" />}
        <polyline points={pts} fill="none" stroke="var(--warning)" strokeWidth="2" />
        {series.map((d, i) => (
          <g key={i}>
            <circle cx={x(i)} cy={y(d.val)} r="3" fill={d.year === 'Hoy' ? 'var(--accent)' : 'var(--warning)'} />
            <text x={x(i)} y={H - 3} textAnchor="middle" fontSize="8" fill="var(--text-faint)">{d.year}</text>
          </g>
        ))}
      </svg>
      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 10 }}>
        {noun} medio histórico: <span style={{ color: 'var(--warning)', fontWeight: 700 }}>{mean.toFixed(1)}×</span>
        {current != null && <> · {noun} actual: <span style={{ color: current <= mean ? 'var(--positive)' : 'var(--negative)', fontWeight: 700 }}>{current.toFixed(1)}×</span></>}
      </p>
      {current != null && mean > 0 && (() => {
        const pct = (current / mean - 1) * 100
        const cheap = pct <= -10, exp = pct >= 10
        return (
          <p style={{ fontSize: 12, fontWeight: 600, color: cheap ? 'var(--positive)' : exp ? 'var(--negative)' : 'var(--warning)', marginTop: 6 }}>
            {cheap ? `Cotiza un ${Math.abs(pct).toFixed(0)}% por debajo de su ${noun} medio — barata frente a su propia historia.`
              : exp ? `Cotiza un ${pct.toFixed(0)}% por encima de su ${noun} medio — cara frente a su propia historia.`
              : `Cotiza en línea con su ${noun} medio histórico.`}
          </p>
        )
      })()}
      {note && <p style={{ fontSize: 10, color: 'var(--text-faintest)', marginTop: 4 }}>{note}</p>}
    </Card>
  )
}

// ── Valoración por múltiples métodos (triangulación) ────────────────────────
function ValuationMethodsPanel({ vm, currency, price, isPremium }) {
  if (!isPremium) return <PremiumGate label="Valoración por métodos (Premium)" hint="Triangulación del valor justo con DCF, reversión de yield, DDM, múltiplo sectorial y EPV." />
  if (!vm || !vm.methods?.length || !(price > 0)) return null
  const fmtV = v => v == null ? '—' : `${v.toLocaleString('es-ES', { maximumFractionDigits: 2 })} ${currency}`
  const fmtPctSigned = m => m == null ? '—' : `${m >= 0 ? '+' : ''}${(m * 100).toFixed(0)}%`
  const col = m => m == null ? 'var(--text-muted)' : m > 0.1 ? 'var(--positive)' : m > -0.1 ? 'var(--warning)' : 'var(--negative)'
  // Consenso = mediana de los valores justos.
  const fairs = vm.methods.map(m => m.value).sort((a, b) => a - b)
  const mid = Math.floor(fairs.length / 2)
  const consensus = fairs.length % 2 ? fairs[mid] : (fairs[mid - 1] + fairs[mid]) / 2
  const consMos = (consensus - price) / price
  const CAP = 60   // tope visual del % para la barra
  const ig = vm.implied
  const histG = vm.histFcfG ?? vm.histRevG

  return (
    <Card>
      <SectionTitle>Valoración por métodos · triangulación</SectionTitle>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.5 }}>
        Valor justo estimado por varios métodos. Cuando coinciden, más fiable; cuando divergen, conviene entender por qué.
      </p>
      <div style={{ display: 'grid', gap: 9 }}>
        {vm.methods.map((m, i) => {
          const pct = Math.max(-CAP, Math.min(CAP, (m.mos ?? 0) * 100))
          return (
            <div key={i}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 3 }}>
                <span style={{ fontSize: 12.5, color: 'var(--text)', fontWeight: 600 }}>{m.label}{m.note && <span style={{ fontSize: 10.5, color: 'var(--text-faint)', fontWeight: 400 }}> · {m.note}</span>}</span>
                <span style={{ fontSize: 12.5, color: 'var(--text)', whiteSpace: 'nowrap' }}>{fmtV(m.value)} <span style={{ color: col(m.mos), fontWeight: 700 }}>({fmtPctSigned(m.mos)})</span></span>
              </div>
              {/* barra centrada: derecha verde (infravalorada), izquierda roja (sobrevalorada) */}
              <div style={{ position: 'relative', height: 5, background: 'var(--surface-3)', borderRadius: 3 }}>
                <div style={{ position: 'absolute', left: '50%', top: -1, bottom: -1, width: 1, background: 'var(--border-strong)' }} />
                <div style={{ position: 'absolute', top: 0, bottom: 0, borderRadius: 3, background: col(m.mos),
                  left: pct >= 0 ? '50%' : `${50 + pct / CAP * 50}%`, width: `${Math.abs(pct) / CAP * 50}%` }} />
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--surface-3)' }}>
        <p style={{ fontSize: 13, color: 'var(--text)' }}>
          Consenso (mediana): <b>{fmtV(consensus)}</b> · <span style={{ color: col(consMos), fontWeight: 700 }}>{fmtPctSigned(consMos)}</span> vs precio actual ({fmtV(price)}).
        </p>
        {ig && histG != null && (
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.5 }}>
            <b style={{ color: 'var(--text)' }}>Crecimiento implícito:</b> al precio actual el mercado descuenta {ig.floor ? '<−20%' : ig.ceil ? '>40%' : `~${(ig.impliedG * 100).toFixed(0)}%`}/año de FCF, frente a un histórico del {histG.toFixed(0)}%.
            {!ig.floor && !ig.ceil && (ig.impliedG * 100 > histG + 2 ? ' Expectativas exigentes.' : ig.impliedG * 100 < histG - 2 ? ' Expectativas conservadoras — margen si el crecimiento se mantiene.' : ' Expectativas en línea con su historia.')}
          </p>
        )}
      </div>
      <p style={{ fontSize: 10, color: 'var(--text-faintest)', marginTop: 10 }}>Estimaciones orientativas; ningún método sustituye al análisis del negocio. El DCF y EPV no aplican a banca/seguros/REITs.</p>
    </Card>
  )
}

// ── insights section ───────────────────────────────────────────────────────

function InsightsSection({ insights, isPremium, limit, onlyStrong, title = 'Análisis automático' }) {
  if (!isPremium) return <PremiumGate label="Análisis automático (Premium)" hint="Insights sobre dividendo, valoración y calidad del negocio." />
  if (!insights?.length) return null
  const typeIcon  = { positive: '↑', neutral: '·', negative: '↓', green: '↑', yellow: '·', red: '↓' }
  const typeColor = { positive: 'var(--positive)', neutral: 'var(--warning)', negative: 'var(--negative)', green: 'var(--positive)', yellow: 'var(--warning)', red: 'var(--negative)' }
  const catLabel  = { dividendo: 'Dividendo', valoracion: 'Valoración', mercado: 'Calidad' }

  let list = insights
  if (onlyStrong) list = list.filter(i => ['positive', 'negative', 'green', 'red'].includes(i.type))
  if (limit) list = list.slice(0, limit)
  if (!list.length) return null

  const grouped = !limit && !onlyStrong
  const cats = grouped ? [...new Set(list.map(i => i.cat))] : null

  const body = grouped ? (
    <div style={{ display: 'grid', gap: 18 }}>
      {cats.map(cat => (
        <div key={cat}>
          <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>{catLabel[cat] || cat}</p>
          <div style={{ display: 'grid', gap: 7 }}>
            {list.filter(i => i.cat === cat).map((ins, idx) => (
              <div key={idx} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span style={{ color: typeColor[ins.type], fontSize: 13, flexShrink: 0, marginTop: 1, fontWeight: 700 }}>{typeIcon[ins.type]}</span>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.55 }}>{ins.text}</p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  ) : (
    <div style={{ display: 'grid', gap: 8 }}>
      {list.map((ins, idx) => (
        <div key={idx} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <span style={{ color: typeColor[ins.type], fontSize: 13, flexShrink: 0, marginTop: 1, fontWeight: 700 }}>{typeIcon[ins.type]}</span>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.55 }}>{ins.text}</p>
        </div>
      ))}
    </div>
  )

  const content = <Card><SectionTitle>{title}</SectionTitle>{body}</Card>
  return content
}

// ── Fortalezas y riesgos (capa narrativa en lenguaje llano) ─────────────────
// Reparte los insights tipados en dos columnas legibles: fortalezas (positive)
// y riesgos (negative). El "qué significa esto" por encima de los números crudos.
function StrengthsRisks({ insights, onSeeAll }) {
  if (!insights?.length) return null
  const pos = insights.filter(i => i.type === 'positive' || i.type === 'green')
  const neg = insights.filter(i => i.type === 'negative' || i.type === 'red')
  if (!pos.length && !neg.length) return null

  const Col = ({ title, color, bg, bullet, items, empty }) => (
    <div style={{ flex: 1, minWidth: 250 }}>
      <p style={{ fontSize: 11, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>{bullet} {title} {items.length > 0 && <span style={{ color: 'var(--text-faint)', fontWeight: 600 }}>· {items.length}</span>}</p>
      {items.length ? (
        <div style={{ display: 'grid', gap: 7 }}>
          {items.slice(0, 6).map((ins, i) => (
            <div key={i} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', background: bg, borderRadius: 8, padding: '8px 11px' }}>
              <span style={{ color, fontSize: 12, fontWeight: 800, flexShrink: 0, marginTop: 1 }}>{bullet}</span>
              <p style={{ fontSize: 12.5, color: 'var(--text)', lineHeight: 1.5 }}>{ins.text}</p>
            </div>
          ))}
        </div>
      ) : <p style={{ fontSize: 12, color: 'var(--text-faint)' }}>{empty}</p>}
    </div>
  )

  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <SectionTitle>Fortalezas y riesgos</SectionTitle>
        {onSeeAll && <button onClick={onSeeAll} style={{ fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}>Ver análisis completo →</button>}
      </div>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        <Col title="Fortalezas" color="var(--positive)" bg="rgba(52,211,153,0.06)" bullet="✓" items={pos} empty="Sin fortalezas destacadas con los datos disponibles." />
        <Col title="Riesgos"    color="var(--negative)" bg="rgba(248,113,113,0.06)" bullet="✕" items={neg} empty="Sin riesgos relevantes detectados." />
      </div>
    </Card>
  )
}

// ── Inversión en I+D (farmacéuticas / salud) ────────────────────────────────
const RD_VERDICT = {
  desarrollo: 'Inversión muy alta', excelente: 'Fuerte inversión', solida: 'Inversión sólida',
  moderada: 'Inversión moderada', baja: 'Inversión baja',
}
function RDCard({ rd, isPremium }) {
  if (!rd) return null
  if (!isPremium) return <PremiumGate label="Inversión en I+D (Premium)" hint="Qué % de los ingresos destina a I+D y si renueva su pipeline." />
  const trendTxt = rd.trend === 'up' ? '↑ creciente' : rd.trend === 'down' ? '↓ decreciente' : rd.trend === 'flat' ? '→ estable' : null
  const maxBar = Math.max(...rd.ratios, 25)
  return (
    <Card>
      <SectionTitle>Inversión en I+D · pipeline futuro</SectionTitle>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
        <span style={{ fontSize: 30, fontWeight: 900, color: rd.color, lineHeight: 1 }}>{rd.latest.toFixed(1)}%</span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>de los ingresos</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: rd.color, background: `${rd.color}1a`, padding: '2px 8px', borderRadius: 5 }}>{RD_VERDICT[rd.verdict]}</span>
      </div>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.55, marginBottom: 12 }}>{rd.phrase.charAt(0).toUpperCase() + rd.phrase.slice(1)}</p>
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 12, color: 'var(--text-muted)', marginBottom: rd.ratios.length > 1 ? 14 : 0 }}>
        {rd.years >= 2 && <span>Media {rd.years} años: <b style={{ color: 'var(--text)' }}>{rd.avg.toFixed(1)}%</b></span>}
        {trendTxt && <span>Tendencia: <b style={{ color: 'var(--text)' }}>{trendTxt}</b></span>}
      </div>
      {rd.ratios.length > 1 && (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 56 }}>
          {[...rd.ratios].reverse().map((v, i) => (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{ width: '100%', maxWidth: 34, height: `${Math.max(6, v / maxBar * 44)}px`, background: i === rd.ratios.length - 1 ? rd.color : 'var(--border-strong)', borderRadius: 3 }} title={`${v.toFixed(1)}%`} />
              <span style={{ fontSize: 9, color: 'var(--text-faint)' }}>{v.toFixed(0)}%</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

// ── DGI score card ─────────────────────────────────────────────────────────

function MetricRow({ m }) {
  const barW = m.score != null ? `${(m.score / 10) * 100}%` : '0%'
  const col  = scoreColor(m.score)
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
        <span style={{ fontSize: 11, color: m.available ? 'var(--text-muted)' : 'var(--text-faint)', flex: 1, minWidth: 0 }}>{m.name}</span>
        {m.tooltip && (
          <span title={m.tooltip} style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-faint)', border: '1px solid var(--border-strong)', borderRadius: '50%', width: 14, height: 14, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'help', flexShrink: 0 }}>?</span>
        )}
        <span style={{ fontSize: 11, color: 'var(--text-faint)', width: 44, textAlign: 'right', flexShrink: 0 }}>{m.value}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: col, width: 22, textAlign: 'right', flexShrink: 0 }}>{m.score != null ? m.score : '—'}</span>
      </div>
      <div style={{ height: 3, background: 'var(--surface-3)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: barW, background: col, borderRadius: 2 }} />
      </div>
    </div>
  )
}

function CategoryBars({ categories }) {
  if (!categories?.length) return null
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {categories.map(cat => (
        <div key={cat.key}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{cat.name}</span>
            <span style={{ fontSize: 12, fontWeight: 800, color: scoreColor(cat.score) }}>{cat.score?.toFixed(1) ?? '—'}</span>
          </div>
          <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: cat.score != null ? `${(cat.score/10)*100}%` : '0%', background: scoreColor(cat.score), borderRadius: 2 }} />
          </div>
        </div>
      ))}
    </div>
  )
}

// Seguridad del dividendo (0–100): riesgo de recorte ANTES de que pase. Complementa
// al Score DGI (calidad) y al detector de recortes (reactivo).
function SafetyCard({ safety, isPremium }) {
  if (!isPremium) return <PremiumGate label="Seguridad del dividendo (Premium)" hint="Nota 0–100 del riesgo de recorte: payout, balance, historial y tendencia del dividendo." />
  if (!safety?.available) return null
  const { score, grade, color, factors } = safety
  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <SectionTitle>Seguridad del dividendo</SectionTitle>
        <div style={{ textAlign: 'right' }}>
          <span style={{ fontSize: 36, fontWeight: 900, color, lineHeight: 1 }}>{score}</span>
          <span style={{ fontSize: 14, color: 'var(--text-faint)', fontWeight: 700 }}>/100</span>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <span style={{ fontSize: 11, fontWeight: 800, color, background: color + '1f', padding: '2px 10px', borderRadius: 20 }}>{grade}</span>
      </div>
      <p style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.55, marginBottom: 14 }}>
        Estima el <strong style={{ color: 'var(--text-muted)' }}>riesgo de recorte</strong> del dividendo de forma anticipada, ponderando payout, solidez del balance, historial y tendencia (con umbrales por sector).
        <span style={{ color: 'var(--text-faintest)' }}> Verde ≥70 · amarillo 50–70 · rojo &lt;50.</span>
      </p>
      {/* Dimensiones de la seguridad sin exponer pesos, umbrales ni la subnota
          exacta (metodología propietaria). */}
      <div style={{ display: 'grid', gap: 11 }}>
        {factors.map(f => (
          <div key={f.label}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text)' }}>{f.label}</span>
              <span style={{ fontSize: 10.5, fontWeight: 700, color: safetyBarColor(f.score) }}>{f.score >= 70 ? 'Sólido' : f.score >= 50 ? 'Vigilar' : 'Riesgo'}</span>
            </div>
            <div style={{ height: 5, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ width: `${f.score}%`, height: '100%', background: safetyBarColor(f.score), borderRadius: 3 }} />
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}
function safetyBarColor(s) { return s >= 70 ? 'var(--positive)' : s >= 50 ? 'var(--warning)' : 'var(--negative)' }

function DGIScoreCard({ dgiScore, isPremium, compact, scoreHistory }) {
  if (!isPremium) return <PremiumGate label="Score DGI (Premium)" hint="Nota 0–10 con desglose completo por categoría y métrica." />
  if (!dgiScore) return null

  if (compact) {
    return (
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <SectionTitle>Score DGI</SectionTitle>
          <span style={{ fontSize: 32, fontWeight: 900, color: scoreColor(dgiScore.total), lineHeight: 1 }}>{dgiScore.total ?? '—'}</span>
        </div>
        <CategoryBars categories={dgiScore.categories} />
      </Card>
    )
  }

  const content = (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <SectionTitle>Score DGI</SectionTitle>
        <span style={{ fontSize: 36, fontWeight: 900, color: scoreColor(dgiScore.total), lineHeight: 1 }}>{dgiScore.total ?? '—'}</span>
      </div>
      {!dgiScore.hasData && <p style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 12 }}>Datos insuficientes para calcular el score.</p>}
      <p style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.55, marginBottom: 4 }}>
        Nota de <strong style={{ color: 'var(--text-muted)' }}>0 a 10</strong> que combina, ponderadas según el sector ({dgiScore.sectorLabel || 'general'}), cuatro dimensiones —
        <strong style={{ color: 'var(--text-muted)' }}> calidad del negocio, dividendo, solidez financiera y valoración</strong>. Se le restan penalizaciones por riesgos y se suman bonificaciones por tendencias positivas.
        <span style={{ color: 'var(--text-faintest)' }}> Verde ≥6,5 · amarillo 5–6,5 · rojo &lt;5.</span>
      </p>
      <ScoreHistory data={scoreHistory} />

      {/* Solo las 4 dimensiones con su nota — sin el desglose métrica a métrica ni
          los pesos exactos (metodología propietaria, no se expone). */}
      <div style={{ display: 'grid', gap: 12 }}>
        {dgiScore.categories?.map(cat => (
          <div key={cat.key}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)' }}>{cat.name}</span>
              <span style={{ fontSize: 14, fontWeight: 800, color: scoreColor(cat.score) }}>{cat.score?.toFixed(1) ?? '—'}</span>
            </div>
            <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: cat.score != null ? `${(cat.score/10)*100}%` : '0%', background: scoreColor(cat.score), borderRadius: 2 }} />
            </div>
            {cat.noDividend && (
              <p style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 5 }}>Esta empresa no reparte dividendo — la categoría puntúa 0.</p>
            )}
          </div>
        ))}
      </div>

      {dgiScore.penalties?.length > 0 && (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--negative)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Riesgos que penalizan la nota</p>
          {dgiScore.penalties.map((p, i) => (
            <div key={i} style={{ fontSize: 11, color: 'var(--negative)', marginBottom: 4 }}>· {p.reason}</div>
          ))}
        </div>
      )}

      {dgiScore.bonuses?.length > 0 && (
        <div style={{ marginTop: 14, padding: '12px 14px', background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.18)', borderRadius: 8 }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--positive)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Tendencias positivas que suman</p>
          {dgiScore.bonuses.map((b, i) => (
            <div key={i} title={b.tooltip} style={{ fontSize: 11.5, color: '#8fe9c4', marginBottom: 4 }}>↑ {b.label}</div>
          ))}
          <p style={{ fontSize: 10, color: 'var(--text-faintest)', marginTop: 8 }}>Señales de que el negocio está mejorando estructuralmente.</p>
        </div>
      )}
      {dgiScore.noDividend && (
        <p style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
          Esta empresa no reparte dividendo — la categoría Dividendo puntúa 0. No es necesariamente una mala inversión: muchas empresas de calidad reinvierten su beneficio en lugar de repartirlo.
        </p>
      )}
      {dgiScore.methodology && <p style={{ fontSize: 10, color: 'var(--text-faintest)', marginTop: 12 }}>{dgiScore.methodology}</p>}
    </Card>
  )
  return content
}

// ── ROIC card ──────────────────────────────────────────────────────────────

function RoicCard({ roicData, isPremium }) {
  if (!isPremium) return <PremiumGate label="ROIC (Premium)" hint="Rentabilidad sobre el capital invertido, reportado y tangible." />
  if (!roicData) return null
  if (roicData.roic_not_applicable) {
    const content = (
      <Card>
        <SectionTitle>Rentabilidad sobre capital</SectionTitle>
        <p style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 8 }}>{roicData.roic_method}</p>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{roicData.alternative_label || '—'}</span>
          <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--accent)' }}>{roicData.alternative_value != null ? roicData.alternative_value.toFixed(1) + '%' : '—'}</span>
        </div>
      </Card>
    )
    return content
  }
  const { roic_reported, roic_tangible, roic_warning, roic_method } = roicData
  if (roic_reported == null && roic_tangible == null) {
    if (roic_method?.startsWith('N/A')) {
      return <Card><SectionTitle>ROIC</SectionTitle><p style={{ fontSize: 13, color: 'var(--text-faint)' }}>N/A — balance atípico</p></Card>
    }
    return null
  }
  const col = v => v == null ? 'var(--text-faint)' : v > 60 ? '#fb923c' : v >= 15 ? 'var(--positive)' : v >= 8 ? 'var(--warning)' : 'var(--negative)'
  const content = (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <SectionTitle>ROIC</SectionTitle>
        {roic_warning && <span title={roic_warning} style={{ fontSize: 13, cursor: 'help' }}>⚠️</span>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div style={{ background: 'var(--surface-2)', borderRadius: 8, padding: '10px 12px' }}>
          <p style={{ fontSize: 10, color: 'var(--text-faint)', marginBottom: 3 }}>Reportado</p>
          <p style={{ fontSize: 20, fontWeight: 800, color: col(roic_reported) }}>{roic_reported != null ? roic_reported.toFixed(1) + '%' : '—'}</p>
        </div>
        <div style={{ background: 'var(--surface-2)', borderRadius: 8, padding: '10px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
            <p style={{ fontSize: 10, color: 'var(--text-faint)' }}>Tangible</p>
            <span title="ROIC excluyendo goodwill e intangibles." style={{ fontSize: 9, color: 'var(--text-faint)', cursor: 'help' }}>ⓘ</span>
          </div>
          <p style={{ fontSize: 20, fontWeight: 800, color: col(roic_tangible) }}>{roic_tangible != null ? roic_tangible.toFixed(1) + '%' : '—'}</p>
        </div>
      </div>

      {/* Explicación reportado vs tangible */}
      <div style={{ marginTop: 12, padding: '11px 13px', background: 'rgba(99,102,241,0.06)', borderRadius: 8, lineHeight: 1.55 }}>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
          <span style={{ color: 'var(--text)', fontWeight: 700 }}>Reportado:</span> rentabilidad sobre <b>todo</b> el capital invertido, incluyendo el goodwill y los intangibles pagados en adquisiciones.
        </p>
        <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          <span style={{ color: 'var(--text)', fontWeight: 700 }}>Tangible:</span> excluye goodwill e intangibles, así que mide la rentabilidad del negocio operativo <b>real</b>, sin el precio pagado por comprar otras empresas.
        </p>
        {roic_reported != null && roic_tangible != null && (
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
            {roic_tangible - roic_reported > 5
              ? <>Aquí el tangible es bastante mayor: buena parte del capital es goodwill de adquisiciones — un ROIC reportado bajo puede deberse a haber pagado caro por comprar crecimiento (riesgo de deterioro).</>
              : Math.abs(roic_tangible - roic_reported) <= 5
              ? <>Aquí ambos son parecidos: el capital apenas incluye goodwill, señal de crecimiento mayormente orgánico.</>
              : <>Aquí el reportado supera al tangible, algo poco habitual; suele indicar intangibles negativos o un balance atípico.</>}
          </p>
        )}
        <p style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 6 }}>
          Para puntuar siempre adoptamos el <b>más bajo</b> de los dos (criterio conservador).
        </p>
      </div>

      {roic_warning && <p style={{ fontSize: 10, color: 'var(--warning)', marginTop: 10, lineHeight: 1.5 }}>⚠ {roic_warning}</p>}
      {roic_method && !roic_warning && roic_method !== 'Precalculado' && <p style={{ fontSize: 10, color: 'var(--text-faintest)', marginTop: 10 }}>{roic_method}</p>}
    </Card>
  )
  return content
}

// ── bank metrics card ──────────────────────────────────────────────────────
// Línea de cambio a 1 y 3 años. lowerBetter → mejora (verde) cuando baja.
function BankDelta({ chg, lowerBetter }) {
  if (!chg || (chg.d1 == null && chg.d3 == null)) return null
  const unit = chg.pct ? '%' : ' pp'
  const fmt = d => d == null ? '–' : (d >= 0 ? '+' : '') + d.toFixed(chg.pct ? 0 : 2) + unit
  const col = d => d == null ? 'var(--text-faint)' : d === 0 ? 'var(--text-muted)' : ((lowerBetter ? d < 0 : d > 0) ? 'var(--positive)' : 'var(--negative)')
  return (
    <p style={{ fontSize: 9.5, color: 'var(--text-faint)', marginTop: 3, display: 'flex', gap: 8 }}>
      <span>1a <b style={{ color: col(chg.d1) }}>{fmt(chg.d1)}</b></span>
      <span>3a <b style={{ color: col(chg.d3) }}>{fmt(chg.d3)}</b></span>
    </p>
  )
}

function BankMetricsCard({ m }) {
  if (!m) return null
  const c = m.changes || {}
  const fp = v => (v == null || isNaN(v)) ? '–' : v.toFixed(2) + '%'
  const effColor = m.efficiency == null ? 'var(--text)' : m.efficiency < 50 ? 'var(--positive)' : m.efficiency < 60 ? 'var(--warning)' : 'var(--negative)'
  const items = [
    { label: 'BPA diluido', value: m.epsDiluted != null ? m.epsDiluted.toLocaleString('es-ES', { maximumFractionDigits: 2 }) : '–', chg: c.eps },
    { label: 'CAGR BPA 5a', value: fp(m.epsCagr5), color: m.epsCagr5 != null ? (m.epsCagr5 >= 0 ? 'var(--positive)' : 'var(--negative)') : null },
    { label: 'NIM (aprox.)', value: fp(m.nim), hint: 'Margen neto de intereses ≈ Ingresos netos por intereses / Activos totales (proxy comparable entre bancos, sobre activos totales).', chg: c.nim },
    { label: 'ROTE', value: fp(m.rote), hint: 'Retorno sobre capital tangible = Beneficio neto / (Patrimonio − fondo de comercio − intangibles).', chg: c.rote },
    { label: 'Eficiencia', value: fp(m.efficiency), color: effColor, hint: 'Costes operativos / ingresos netos bancarios. Menor es mejor (por debajo del 50% es excelente).', chg: c.efficiency, lowerBetter: true },
    { label: 'NPL (morosidad)', value: m.npl != null ? fp(m.npl) : '–', sub: m.npl != null ? m.nplPeriod : 'manual — pendiente', color: m.npl != null ? (m.npl < 3 ? 'var(--positive)' : m.npl < 6 ? 'var(--warning)' : 'var(--negative)') : 'var(--text-faint)', chg: m.npl != null ? c.npl : null, lowerBetter: true },
    { label: 'CET1', value: m.cet1 != null ? fp(m.cet1) : '–', sub: m.cet1 != null ? m.cet1Period : 'manual — pendiente', color: m.cet1 == null ? 'var(--text-faint)' : m.cet1 >= 14 ? 'var(--positive)' : m.cet1 >= 12 ? 'var(--positive-soft)' : m.cet1 >= 10 ? 'var(--warning)' : 'var(--negative)', chg: m.cet1 != null ? c.cet1 : null, hint: 'Capital de máxima calidad / activos ponderados por riesgo. Mínimo saludable >12%. Manual.' },
  ]
  return (
    <Card>
      <SectionTitle>Métricas bancarias</SectionTitle>
      <style>{`.bank-m{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}@media(min-width:560px){.bank-m{grid-template-columns:repeat(3,1fr)}}`}</style>
      <div className="bank-m">
        {items.map(it => (
          <div key={it.label} style={{ background: 'var(--surface-2)', borderRadius: 8, padding: '10px 12px' }} title={it.hint || ''}>
            <p style={{ fontSize: 10, color: 'var(--text-faint)', marginBottom: 3 }}>{it.label}{it.hint ? ' ⓘ' : ''}</p>
            <p style={{ fontSize: 18, fontWeight: 800, color: it.color || 'var(--text)' }}>{it.value}</p>
            {it.sub && <p style={{ fontSize: 9.5, color: 'var(--text-faint)', marginTop: 1 }}>{it.sub}</p>}
            <BankDelta chg={it.chg} lowerBetter={it.lowerBetter} />
          </div>
        ))}
      </div>
    </Card>
  )
}

// ── insurer metrics card ───────────────────────────────────────────────────
function InsurerMetricsCard({ m }) {
  if (!m) return null
  const c = m.changes || {}
  const fp = v => (v == null || isNaN(v)) ? '–' : v.toFixed(2) + '%'
  const fn = v => (v == null || isNaN(v)) ? '–' : v.toLocaleString('es-ES', { maximumFractionDigits: 0 })
  // combined < 100 = beneficio técnico (verde); >100 rojo.
  const combColor = m.combined == null ? 'var(--text)' : m.combined < 95 ? 'var(--positive)' : m.combined <= 100 ? 'var(--warning)' : 'var(--negative)'
  const items = [
    { label: 'Combined ratio', value: m.combined != null ? fp(m.combined) : '–', sub: m.combined != null ? m.combinedPeriod : 'manual — pendiente', color: combColor, chg: m.combined != null ? c.combined : null, lowerBetter: true, hint: 'Siniestralidad + gastos / primas. Por debajo de 100% el negocio técnico gana dinero. Manual.' },
    { label: 'Loss ratio', value: m.loss != null ? fp(m.loss) : '–', chg: m.loss != null ? c.loss : null, lowerBetter: true, hint: 'Siniestros / primas. Manual.' },
    { label: 'Expense ratio', value: m.expense != null ? fp(m.expense) : '–', chg: m.expense != null ? c.expense : null, lowerBetter: true, hint: 'Gastos / primas. Manual.' },
    { label: 'Investment yield', value: fp(m.investmentYield), chg: c.investmentYield, hint: 'Ingresos por inversiones / inversiones financieras (aprox.).' },
    { label: 'GWP (primas)', value: fn(m.gwp), sub: m.gwpCagr5 != null ? `CAGR 5a ${m.gwpCagr5 >= 0 ? '+' : ''}${m.gwpCagr5.toFixed(1)}%` : null, chg: c.gwp, hint: 'Primas brutas emitidas (aprox. = ingresos totales).' },
    { label: 'ROTE', value: fp(m.rote), chg: c.rote, hint: 'Retorno sobre capital tangible = Beneficio neto / (Patrimonio − fondo de comercio − intangibles).' },
    { label: 'Solvencia', value: m.solvency != null ? fp(m.solvency) : '–', sub: m.solvency != null ? m.solvencyPeriod : 'manual — pendiente', color: m.solvency == null ? 'var(--text-faint)' : m.solvency >= 180 ? 'var(--positive)' : m.solvency >= 130 ? 'var(--warning)' : 'var(--negative)', chg: m.solvency != null ? c.solvency : null, hint: 'Solvencia II (Europa) o RBC (EEUU). Mínimo regulatorio 100%. Manual.' },
  ]
  return (
    <Card>
      <SectionTitle>Métricas de aseguradora</SectionTitle>
      <style>{`.ins-m{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}@media(min-width:560px){.ins-m{grid-template-columns:repeat(3,1fr)}}`}</style>
      <div className="ins-m">
        {items.map(it => (
          <div key={it.label} style={{ background: 'var(--surface-2)', borderRadius: 8, padding: '10px 12px' }} title={it.hint || ''}>
            <p style={{ fontSize: 10, color: 'var(--text-faint)', marginBottom: 3 }}>{it.label}{it.hint ? ' ⓘ' : ''}</p>
            <p style={{ fontSize: 18, fontWeight: 800, color: it.color || 'var(--text)' }}>{it.value}</p>
            {it.sub && <p style={{ fontSize: 9.5, color: 'var(--text-faint)', marginTop: 1 }}>{it.sub}</p>}
            <BankDelta chg={it.chg} lowerBetter={it.lowerBetter} />
          </div>
        ))}
      </div>
    </Card>
  )
}

// ── REIT metrics card ──────────────────────────────────────────────────────
function ReitMetricsCard({ m, currency }) {
  if (!m) return null
  const fp = v => (v == null || isNaN(v)) ? '–' : v.toFixed(2) + '%'
  const fx = v => (v == null || isNaN(v)) ? '–' : v.toFixed(1) + '×'
  const fps = v => (v == null || isNaN(v)) ? '–' : v.toLocaleString('es-ES', { maximumFractionDigits: 2 }) + (currency ? ' ' + currency : '')
  const payColor = m.payoutAffo == null ? 'var(--text)' : m.payoutAffo < 85 ? 'var(--positive)' : m.payoutAffo < 100 ? 'var(--warning)' : 'var(--negative)'
  const items = [
    { label: 'Payout AFFO', value: m.payoutAffo != null ? fp(m.payoutAffo) : '–', color: payColor, hint: 'Dividendo / AFFO. Por debajo del 85% es saludable. La métrica correcta de sostenibilidad en REITs (no el payout sobre EPS).' },
    { label: 'AFFO / acción', value: fps(m.affoPerShare), hint: 'FFO − capex de mantenimiento estimado (según sub-tipo).' },
    { label: 'FFO / acción', value: fps(m.ffoPerShare), hint: 'Beneficio neto + amortización, por acción.' },
    { label: 'CAGR FFO 5a', value: fp(m.ffoCagr5), color: m.ffoCagr5 != null ? (m.ffoCagr5 >= 0 ? 'var(--positive)' : 'var(--negative)') : null },
    { label: 'P / AFFO', value: fx(m.pAffo), hint: 'Equivalente al PER pero sobre AFFO.' },
    { label: 'P / FFO', value: fx(m.pFfo) },
  ]
  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, flexWrap: 'wrap', gap: 6 }}>
        <SectionTitle>Métricas REIT (FFO / AFFO)</SectionTitle>
        {m.subtypeLabel && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', background: 'rgba(99,102,241,0.12)', padding: '2px 8px', borderRadius: 5 }}>{m.subtypeLabel} · mant. {m.maintPct}%</span>}
      </div>
      <style>{`.reit-m{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}@media(min-width:560px){.reit-m{grid-template-columns:repeat(3,1fr)}}`}</style>
      <div className="reit-m">
        {items.map(it => (
          <div key={it.label} style={{ background: 'var(--surface-2)', borderRadius: 8, padding: '10px 12px' }} title={it.hint || ''}>
            <p style={{ fontSize: 10, color: 'var(--text-faint)', marginBottom: 3 }}>{it.label}{it.hint ? ' ⓘ' : ''}</p>
            <p style={{ fontSize: 18, fontWeight: 800, color: it.color || 'var(--text)' }}>{it.value}</p>
          </div>
        ))}
      </div>
      <p style={{ fontSize: 10, color: 'var(--text-faintest)', marginTop: 10, lineHeight: 1.5 }}>
        En REITs la amortización de inmuebles hunde el beneficio contable, por eso se usa el FFO (beneficio + amortización) y el AFFO (FFO − capex de mantenimiento). El AFFO es la base correcta del payout y de la valoración (P/AFFO).
      </p>
    </Card>
  )
}

// ── energy oil-breakeven card ──────────────────────────────────────────────
function EnergyBreakevenCard({ be }) {
  if (!be) return null
  const fx = v => v == null ? '–' : '$' + v.toFixed(0)
  const cb = be.cashflow, pb = be.production
  const beColor = v => v > 80 ? 'var(--negative)' : v > 65 ? 'var(--warning)' : 'var(--positive)'
  return (
    <Card>
      <SectionTitle>Sensibilidad al crudo</SectionTitle>
      {(cb?.reliable || pb?.reliable) ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10 }}>
            <div style={{ background: 'var(--surface-2)', borderRadius: 8, padding: '10px 12px' }}>
              <p style={{ fontSize: 10, color: 'var(--text-faint)', marginBottom: 3 }}>Breakeven capex + dividendo</p>
              <p style={{ fontSize: 19, fontWeight: 800, color: cb?.reliable ? beColor(cb.breakeven) : 'var(--text-faint)' }}>{cb?.reliable ? fx(cb.breakeven) : '–'}</p>
              <p style={{ fontSize: 9.5, color: 'var(--text-faint)', marginTop: 1 }}>WTI · cubre inversión y dividendo</p>
            </div>
            <div style={{ background: 'var(--surface-2)', borderRadius: 8, padding: '10px 12px' }}>
              <p style={{ fontSize: 10, color: 'var(--text-faint)', marginBottom: 3 }}>Breakeven de producción</p>
              <p style={{ fontSize: 19, fontWeight: 800, color: pb?.reliable ? beColor(pb.breakeven) : 'var(--text-faint)' }}>{pb?.reliable ? fx(pb.breakeven) : '–'}</p>
              <p style={{ fontSize: 9.5, color: 'var(--text-faint)', marginTop: 1 }}>WTI · deja de ganar dinero</p>
            </div>
          </div>
          <p style={{ fontSize: 10, color: 'var(--text-faintest)', marginTop: 10, lineHeight: 1.55 }}>
            Estimado por regresión del margen y del flujo de caja frente al precio medio anual del WTI (fiabilidad R² {cb?.reliable ? (cb.r2 * 100).toFixed(0) : pb ? (pb.r2 * 100).toFixed(0) : '—'}%, {(cb || pb).points} años; Brent ≈ WTI + 4-5$). El breakeven de <b style={{ color: 'var(--text-faint)' }}>capex + dividendo</b> es el que importa para la sostenibilidad del dividendo: por debajo de ese crudo, la empresa no cubre su inversión y el dividendo con la caja y tiene que endeudarse. Usa el capex total (incluye crecimiento), por eso es más conservador que el breakeven oficial de la compañía.
          </p>
        </>
      ) : (
        <p style={{ fontSize: 12, color: 'var(--text-faint)', lineHeight: 1.5 }}>
          No se puede estimar un breakeven fiable del crudo para esta empresa (negocio diversificado —refino, gas, química— o pocos años de histórico). Su rentabilidad no sigue de forma limpia el precio del petróleo.
        </p>
      )}
    </Card>
  )
}

// ── buyback section ────────────────────────────────────────────────────────

function BuybackSection({ buybacks }) {
  if (!buybacks) return null
  const { years, streak, avgYield, isCannibal, isActiveBuyback, isDilutive } = buybacks
  const badgeStyle = isCannibal
    ? { color: 'var(--positive)', bg: 'rgba(52,211,153,0.1)', border: 'rgba(52,211,153,0.3)' }
    : isDilutive
    ? { color: 'var(--negative)', bg: 'rgba(248,113,113,0.1)', border: 'rgba(248,113,113,0.3)' }
    : { color: 'var(--accent)', bg: 'rgba(99,102,241,0.1)', border: 'rgba(99,102,241,0.3)' }
  const label = isCannibal ? 'Caníbal de recompras' : isActiveBuyback ? 'Recompra activa' : isDilutive ? 'Dilución activa' : 'Sin recompras recientes'

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <SectionTitle>Recompras de acciones</SectionTitle>
        {(isCannibal || isActiveBuyback || isDilutive) && (
          <span style={{ fontSize: 12, fontWeight: 700, color: badgeStyle.color, background: badgeStyle.bg, border: `1px solid ${badgeStyle.border}`, padding: '3px 10px', borderRadius: 6 }}>{label}</span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 20, marginBottom: 16, flexWrap: 'wrap' }}>
        {streak > 0 && (
          <div>
            <p style={{ fontSize: 10, color: 'var(--text-faint)', marginBottom: 2 }}>Años consecutivos</p>
            <p style={{ fontSize: 18, fontWeight: 800, color: streak >= 3 ? 'var(--positive)' : 'var(--text)' }}>{streak}</p>
          </div>
        )}
        {avgYield != null && (
          <div>
            <p style={{ fontSize: 10, color: 'var(--text-faint)', marginBottom: 2 }}>Yield recompra medio</p>
            <p style={{ fontSize: 18, fontWeight: 800, color: avgYield > 5 ? 'var(--positive)' : avgYield > 2 ? 'var(--warning)' : 'var(--text)' }}>{avgYield.toFixed(1)}%</p>
          </div>
        )}
      </div>
      {years.length > 0 && (
        <div>
          <p style={{ fontSize: 10, color: 'var(--text-faint)', marginBottom: 8 }}>Últimos años (M)</p>
          <div style={{ display: 'grid', gap: 6 }}>
            {years.map(y => {
              const absM = y.amount != null ? Math.abs(y.amount) / 1e6 : 0
              const maxM = Math.max(...years.map(z => Math.abs(z.amount ?? 0) / 1e6))
              const barPct = maxM > 0 ? (absM / maxM) * 100 : 0
              const col = y.isBuyback ? 'var(--positive)' : 'var(--negative)'
              return (
                <div key={y.year} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-faint)', width: 36, flexShrink: 0 }}>{y.year}</span>
                  <div style={{ flex: 1, height: 8, background: 'var(--surface-3)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${barPct}%`, background: col, borderRadius: 4 }} />
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 600, color: col, width: 70, textAlign: 'right', flexShrink: 0 }}>
                    {y.isBuyback ? '−' : '+'}{`${absM.toLocaleString('es-ES', { maximumFractionDigits: 0 })} M`}
                  </span>
                  {y.yield != null && <span style={{ fontSize: 10, color: 'var(--text-faint)', width: 40, textAlign: 'right', flexShrink: 0 }}>{y.yield.toFixed(1)}%</span>}
                </div>
              )
            })}
          </div>
          <p style={{ fontSize: 10, color: 'var(--text-faintest)', marginTop: 8 }}>Verde = recompra · Rojo = emisión · % = yield sobre cap. bursátil</p>
        </div>
      )}
    </Card>
  )
}

// ── tabs config ────────────────────────────────────────────────────────────

const TABS = [
  { id: 'resumen',    label: 'Resumen' },
  { id: 'dividendo',  label: 'Dividendo' },
  { id: 'finanzas',   label: 'Finanzas' },
  { id: 'valoracion', label: 'Valoración' },
  { id: 'salud',      label: 'Salud financiera' },
]
const TAB_IDS = TABS.map(t => t.id)

// ── main component ─────────────────────────────────────────────────────────

export default function CompanyDetailPage(props) {
  const {
    ticker, name, country, currency, sector, subsector, type, classification, profile, rdIntensity, isBank, bankMetrics, isInsurer, insurerMetrics, isReit, reitMetrics, oilBreakeven, crossListings,
    isPremium, hasData, isAuthed, watchEntry,
    price, change, changePct, dailyPrice, avgCost,
    yld, yldNet, destWHT, divRate, low52, high52,
    peTrailing, peForward, evEbitda, eps, payout, mktCap, priceToBook,
    divHistory, cagr, cagr10, streak, updatedAt, dpsPrev, upcomingPayments, nextExDate, nextEarningsDate, originWHT, peHistory, evHistory, evCurrent, valuationMethods,
    paysDividend, noDividendAt,
    healthPanel, moat, dcf, projection, dgiScore, dividendSafety, scoreHistory, insights, roicData, badges, buybacks, ma200,
    revenueHistory, netIncomeHistory, fcfHistory, epsHistory, financials,
    manualImport, finScalars, initialTab,
  } = props

  const router       = useRouter()
  const pathname      = usePathname()
  const searchParams = useSearchParams()

  const urlTab = searchParams.get('tab')
  const [tab, setTab] = useState(TAB_IDS.includes(initialTab) ? initialTab : 'resumen')

  // Sincroniza con la URL (back/forward, enlaces compartidos)
  useEffect(() => {
    if (urlTab && TAB_IDS.includes(urlTab) && urlTab !== tab) setTab(urlTab)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlTab])

  const goTab = (id) => {
    if (id === tab) return
    setTab(id)
    try { router.replace(`${pathname}?tab=${id}`, { scroll: false }) } catch {}
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const isUp       = changePct != null ? changePct >= 0 : null
  const changeCol  = isUp === null ? 'var(--text-muted)' : isUp ? 'var(--positive)' : 'var(--negative)'
  const changeSign = isUp ? '+' : ''
  const flag       = countryFlag(country)
  const sBadge     = streakBadge(streak)
  const valuationMetrics = dgiScore?.categories?.find(c => c.key === 'valuation')?.metrics || []

  // Estado del dividendo para la pestaña Dividendo (banner en vez de historial vacío):
  //   'none' no reparte · 'unknown' sin verificar · 'pending' reparte pero falta el dato · null normal
  // Si hay datos reales de dividendo se muestra el contenido normal aunque
  // pays_dividend aún no esté verificado (null) — solo se recurre al banner
  // cuando de verdad no hay nada que mostrar.
  const hasDivData   = (divRate != null && divRate > 0) || (divHistory?.length > 0)
  const dividendState = paysDividend === false ? 'none'
                      : hasDivData              ? null
                      : paysDividend === true   ? 'pending'
                      : 'unknown'

  return (
    <div style={{ maxWidth: 1000, width: '100%', margin: '0 auto', padding: '16px 5% 64px', boxSizing: 'border-box', overflowX: 'clip' }}>
      <style>{`
        .cdp-2col { display: grid; grid-template-columns: 1fr; gap: 16px; }
        @media (min-width: 860px) { .cdp-2col { grid-template-columns: 1.4fr 1fr; } }
        .cdp-grid4 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        @media (min-width: 720px) { .cdp-grid4 { grid-template-columns: repeat(4,1fr); } }
        .cdp-tabbar::-webkit-scrollbar { height: 0; }
        .cdp-fade { animation: cdpFade 0.25s ease; }
        @keyframes cdpFade { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
      `}</style>

      {/* ── CABECERA FIJA ── */}
      <Card style={{ marginBottom: 0, borderBottomLeftRadius: 0, borderBottomRightRadius: 0, padding: '16px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          {/* Identidad */}
          <div style={{ minWidth: 200, flex: 1, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <CompanyLogo ticker={ticker} name={name} size={46} />
            <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
              <h1 style={{ fontSize: 20, fontWeight: 900, color: 'var(--text-strong)', lineHeight: 1.1 }}>{name}</h1>
              <span style={{ fontSize: 12, color: 'var(--text-faint)', fontWeight: 600 }}>{ticker}</span>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              {flag && <span style={{ fontSize: 16 }}>{flag}</span>}
              {classification ? (
                <>
                  {classification.superLabel && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: classification.superColor, background: `${classification.superColor}1f`, padding: '2px 8px', borderRadius: 5 }}>{classification.superLabel}</span>
                  )}
                  {classification.sectorEs && (
                    <span style={{ fontSize: 11, color: 'var(--accent)', background: 'rgba(99,102,241,0.1)', padding: '2px 8px', borderRadius: 5 }}>{classification.sectorEs}</span>
                  )}
                  {classification.industryEs && (
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', background: 'var(--surface-3)', padding: '2px 8px', borderRadius: 5 }}>{classification.industryEs}</span>
                  )}
                </>
              ) : (
                sector && <span style={{ fontSize: 11, color: 'var(--accent)', background: 'rgba(99,102,241,0.1)', padding: '2px 8px', borderRadius: 5 }}>{sector}</span>
              )}
              {paysDividend !== false && sBadge && <span style={{ fontSize: 11, fontWeight: 700, color: sBadge.color, background: `${sBadge.color}18`, padding: '2px 8px', borderRadius: 5 }}>{sBadge.emoji ? sBadge.emoji + ' ' : ''}{sBadge.label}</span>}
              {paysDividend === false && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', background: 'rgba(107,118,147,0.14)', padding: '2px 8px', borderRadius: 5 }}>Sin dividendo</span>}
              {badges?.filter(b => b.id?.startsWith('moat') || b.id === '1010').map(b => (
                <span key={b.id} style={{ fontSize: 11, fontWeight: 700, color: b.color, background: b.bg, padding: '2px 8px', borderRadius: 5 }} title={b.title}>{b.label}</span>
              ))}
            </div>
            {crossListings?.length > 0 && (
              <div style={{ marginTop: 8, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: 10.5, color: 'var(--text-faint)' }}>También cotiza en:</span>
                {crossListings.map(l => (
                  <span key={l.ticker} title={`${l.ticker} · ${l.country || ''}`} style={{ fontSize: 11, color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    {countryFlag(l.country) && <span style={{ fontSize: 13 }}>{countryFlag(l.country)}</span>}
                    {l.price != null && <span style={{ fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{l.price.toLocaleString('es-ES', { maximumFractionDigits: 2 })} {l.currency}</span>}
                    <span style={{ fontSize: 9.5, color: 'var(--text-faintest)' }}>{l.ticker}</span>
                  </span>
                ))}
              </div>
            )}
            {nextEarningsDate && (
              <div style={{ marginTop: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', background: 'var(--surface-3)', padding: '3px 9px', borderRadius: 5, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  📅 Próximos resultados: <strong style={{ color: 'var(--text)' }}>{fmtDateEs(nextEarningsDate)}</strong>
                </span>
              </div>
            )}
            </div>
          </div>

          {/* Precio */}
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: 30, fontWeight: 900, color: 'var(--text-strong)', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
              {price != null ? price.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
              <span style={{ fontSize: 13, color: 'var(--text-faint)', fontWeight: 400, marginLeft: 5 }}>{currency}</span>
            </p>
            <LocalPrice price={price} currency={currency} />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', alignItems: 'center', marginTop: 4, flexWrap: 'wrap' }}>
              {changePct != null && (
                <span style={{ fontSize: 13, fontWeight: 700, color: changeCol, fontVariantNumeric: 'tabular-nums' }}>
                  {changeSign}{changePct.toFixed(2)}%
                  {change != null && <span style={{ fontSize: 11, marginLeft: 5, opacity: 0.75 }}>({changeSign}{Math.abs(change).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currency})</span>}
                </span>
              )}
              {paysDividend !== false && yld != null && <span style={{ fontSize: 13, color: 'var(--positive)', fontWeight: 700 }}>Yield {fmtPct(yld)}</span>}
            </div>
          </div>
        </div>

        {/* Perfil de negocio — a qué se dedica la empresa */}
        {profile && (
          <p style={{ marginTop: 12, fontSize: 12.5, lineHeight: 1.55, color: '#9aa6be', maxWidth: 780 }}>{profile}</p>
        )}

        {/* 52 semanas compacto */}
        <div style={{ marginTop: 12 }}>
          <Week52Bar price={price} low52={low52} high52={high52} currency={currency} compact />
        </div>

        {/* Acciones */}
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <Link href={`/cartera/nueva-posicion?ticker=${encodeURIComponent(ticker)}`} style={{ fontSize: 12, fontWeight: 700, color: 'var(--positive)', background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.25)', padding: '6px 12px', borderRadius: 8, textDecoration: 'none', whiteSpace: 'nowrap' }}>+ Cartera</Link>
          <FollowButton ticker={ticker} name={name} currency={currency} isAuthed={isAuthed} isPremium={isPremium} entry={watchEntry} />
          <Link href={`/comparador?tickers=${encodeURIComponent(ticker)}`} style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)', padding: '6px 12px', borderRadius: 8, textDecoration: 'none', whiteSpace: 'nowrap' }}>Comparar →</Link>
          {dailyPrice && (
            <span style={{ fontSize: 10, color: 'var(--text-faint)', marginLeft: 'auto' }}>
              {dailyPrice.isToday
                ? `Actualizado hoy ${new Date(dailyPrice.updatedAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`
                : `Cierre del ${new Date(dailyPrice.date + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}`}
            </span>
          )}
        </div>
      </Card>

      {/* ── BARRA DE PESTAÑAS ── */}
      <div className="cdp-tabbar" style={{
        display: 'flex', gap: 4, overflowX: 'auto', borderBottom: '1px solid var(--border)',
        background: 'var(--surface)', borderLeft: '1px solid var(--border)', borderRight: '1px solid var(--border)',
        borderBottomLeftRadius: 0, padding: '0 8px', position: 'sticky', top: 0, zIndex: 5,
      }}>
        {TABS.map(t => {
          const active = t.id === tab
          return (
            <button key={t.id} onClick={() => goTab(t.id)} style={{
              flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer',
              padding: '13px 14px', fontSize: 13, fontWeight: 700,
              color: active ? 'var(--text-strong)' : 'var(--text-faint)',
              borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
              whiteSpace: 'nowrap', transition: 'color 0.15s',
            }}>{t.label}</button>
          )
        })}
      </div>

      {!hasData && (
        <Card style={{ marginTop: 16, textAlign: 'center' }}>
          <p style={{ fontSize: 13, color: 'var(--text-faint)' }}>Esta empresa aún no tiene datos fundamentales. Se actualizan semanalmente.</p>
        </Card>
      )}

      {/* ── CONTENIDO DE LA PESTAÑA ── */}
      <div key={tab} className="cdp-fade" style={{ marginTop: 16 }}>

        {/* ═══ RESUMEN ═══ */}
        {tab === 'resumen' && (
          <>
          <div className="cdp-2col">
            <div style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
              <Card><PriceChart ticker={ticker} currency={currency} avgCost={avgCost} divHistory={divHistory} /></Card>
              {divHistory?.length > 0 && <DividendHistorySection divHistory={divHistory} streak={streak} cagr={cagr} currency={currency} />}
              <DGIScoreCard dgiScore={dgiScore} isPremium={isPremium} compact />
              <Card>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <SectionTitle>Salud financiera</SectionTitle>
                  <button onClick={() => goTab('salud')} style={{ fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}>Ver detalle →</button>
                </div>
                <Semaforo rows={healthPanel?.semaforo} />
              </Card>
            </div>

            <div style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
              {paysDividend !== false && <NextDividendCard nextExDate={nextExDate} payments={upcomingPayments} currency={currency} onSeeAll={() => goTab('dividendo')} />}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <MiniMetric label="Yield" value={yld != null ? fmtPct(yld) : '—'} sub={yldNet != null ? `Neto ~${yldNet.toFixed(2)}%` : null} color="var(--positive)" />
                <MiniMetric label="CAGR div. 5a" value={cagr != null ? (cagr * 100).toFixed(1) + '%' : '—'} />
                <MiniMetric label="Margen seg." value={dcf?.mos != null ? (dcf.mos > 0 ? '+' : '') + (dcf.mos * 100).toFixed(0) + '%' : '—'} color={dcf?.mos != null ? (dcf.mos > 0.1 ? 'var(--positive)' : dcf.mos > -0.1 ? 'var(--warning)' : 'var(--negative)') : null} />
              </div>

              {moat && (
                <Card>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <SectionTitle>Foso económico</SectionTitle>
                    <span style={{ fontSize: 12, fontWeight: 700, color: { wide: 'var(--positive)', narrow: 'var(--warning)', none: 'var(--text-faint)' }[moat.width] || 'var(--text-faint)' }}>{moat.label}</span>
                  </div>
                  {moat.signals?.slice(0, 3).map((s, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, fontSize: 12, color: 'var(--text-muted)', marginBottom: 5 }}><span style={{ color: 'var(--positive)' }}>+</span>{s}</div>
                  ))}
                  {!moat.signals?.length && <p style={{ fontSize: 12, color: 'var(--text-faint)' }}>Datos insuficientes para detectar foso.</p>}
                  <button onClick={() => goTab('salud')} style={{ fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', marginTop: 6, padding: 0 }}>Ver análisis completo →</button>
                </Card>
              )}

              <ResumenProjection yld={yld} cagr={cagr} country={country} currency={currency} destWHT={destWHT} />

              <StrengthsRisks insights={insights} onSeeAll={() => goTab('salud')} />
            </div>
          </div>
          </>
        )}

        {/* ═══ DIVIDENDO ═══ */}
        {tab === 'dividendo' && (
          <div style={{ display: 'grid', gap: 16 }}>
            {dividendState ? (
              <>
                <DividendBanner state={dividendState} date={noDividendAt} />
                <BuybackSection buybacks={buybacks} />
              </>
            ) : (
              <>
                <div className="cdp-grid4">
                  <MiniMetric label="Yield" value={yld != null ? fmtPct(yld) : '—'} sub={yldNet != null ? `Neto ~${yldNet.toFixed(2)}%` : null} color="var(--positive)" />
                  <MiniMetric label="DPS año anterior" value={dpsPrev != null ? `${fmt(dpsPrev, 3)} ${currency}` : '—'} />
                  <MiniMetric label="CAGR div." value={cagr != null ? (cagr * 100).toFixed(1) + '%' : '—'} sub={cagr10 != null ? `10a ~${(cagr10 * 100).toFixed(1)}%` : null} />
                  <MiniMetric label="Payout" value={payout != null ? (payout * 100).toFixed(0) + '%' : '—'} sub={props.payoutEps != null ? `EPS ${props.payoutEps.toFixed(0)}%` : 'FCF'} color={payout > 0.8 ? 'var(--negative)' : payout > 0.6 ? 'var(--warning)' : 'var(--positive)'} />
                </div>
                <DividendHistorySection divHistory={divHistory} streak={streak} cagr={cagr} currency={currency} />
                <UpcomingPayments payments={upcomingPayments} currency={currency} nextExDate={nextExDate} originWHT={originWHT} destWHT={destWHT} isDomestic={country === 'ES'} />
                <RentaProjection yld={yld} cagr={cagr} country={country} currency={currency} dpsScenarios={projection} destWHT={destWHT} />
                <BuybackSection buybacks={buybacks} />
              </>
            )}
          </div>
        )}

        {/* ═══ FINANZAS ═══ */}
        {tab === 'finanzas' && (
          <div style={{ display: 'grid', gap: 16 }}>
            <Card>
              <StatementCharts
                income={financials?.income_statement_annual}
                cashflow={financials?.cashflow_annual}
                balance={financials?.balance_sheet_annual}
                type={type}
                bankNpl={isBank ? (bankMetrics?.nplHistory || []) : undefined}
              />
            </Card>
            <IncomeSankey income={financials?.income_statement_annual} incomeQuarterly={financials?.income_statement_quarterly} currency={currency} />
            <AnalystEstimates ticker={ticker} />
            {isBank ? (
              <BankMetricsCard m={bankMetrics} />
            ) : isInsurer ? (
              <InsurerMetricsCard m={insurerMetrics} />
            ) : isReit ? (
              <ReitMetricsCard m={reitMetrics} currency={currency} />
            ) : (
              <Card>
                <SectionTitle>KPIs financieros clave</SectionTitle>
                <FinanzasKpis
                  income={financials?.income_statement_annual}
                  cashflow={financials?.cashflow_annual}
                  balance={financials?.balance_sheet_annual}
                  divHistory={divHistory}
                  scalars={finScalars}
                />
              </Card>
            )}
            <Card>
              <FinancialTables
                isPremium={isPremium}
                income_statement_annual={financials?.income_statement_annual}
                balance_sheet_annual={financials?.balance_sheet_annual}
                cashflow_annual={financials?.cashflow_annual}
                income_statement_quarterly={financials?.income_statement_quarterly}
                balance_sheet_quarterly={financials?.balance_sheet_quarterly}
                cashflow_quarterly={financials?.cashflow_quarterly}
                manualImport={manualImport}
              />
            </Card>
            <Card>
              <FinanzasDeepDive
                income={financials?.income_statement_annual}
                cashflow={financials?.cashflow_annual}
                balance={financials?.balance_sheet_annual}
                divHistory={divHistory}
                currency={currency}
                scalars={finScalars}
                isPremium={isPremium}
                insurer={isInsurer ? insurerMetrics : null}
              />
            </Card>
          </div>
        )}

        {/* ═══ VALORACIÓN ═══ */}
        {tab === 'valoracion' && (
          <div style={{ display: 'grid', gap: 16 }}>
            <DCFSection dcf={dcf} ticker={ticker} isPremium={isPremium} ma200={ma200} />
            <ValuationMethodsPanel vm={valuationMethods} currency={currency} price={price} isPremium={isPremium} />
            <MultiplesGrid valuationMetrics={valuationMetrics} isPremium={isPremium} />
            <Card>
              <SectionTitle>Posición en el rango anual</SectionTitle>
              <Week52Bar price={price} low52={low52} high52={high52} currency={currency} />
              {price != null && high52 != null && high52 > price && (
                <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 10 }}>
                  A <span style={{ color: 'var(--warning)', fontWeight: 700 }}>{(((high52 - price) / high52) * 100).toFixed(1)}%</span> del máximo anual
                  ({fmt(high52 - price)} {currency}).
                </p>
              )}
            </Card>
            <ValuationHistoryChart
              history={(peHistory || []).map(d => ({ year: d.year, val: d.pe }))} current={peTrailing}
              isPremium={isPremium} title="Historial de valoración (PER)" noun="PER"
              note="Calculado con el precio de cierre de cada ejercicio fiscal y el BPA de ese año."
              gateHint="Evolución del PER por ejercicio frente al PER actual y su media histórica." />
            {isPremium && <ValuationHistoryChart
              history={evHistory} current={evCurrent}
              isPremium title="Historial EV/EBITDA" noun="EV/EBITDA" showGate={false}
              note="EV (capitalización + deuda neta) entre EBITDA, con la misma fórmula en todos los años; el punto «Hoy» usa el precio actual sobre el EBITDA del último ejercicio." />}

            {/* Por qué NO mostramos el precio objetivo de los analistas */}
            <Card style={{ background: 'var(--surface-2)' }}>
              <SectionTitle>¿Y el precio objetivo de los analistas?</SectionTitle>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                A propósito no incluimos el «precio objetivo» de consenso de los analistas. Es una cifra a
                <b style={{ color: 'var(--text)' }}> 12 meses</b>, pensada para el corto plazo, que choca con el enfoque de esta
                herramienta: comprar buenos negocios que aumentan su dividendo y mantenerlos durante años.
              </p>
              <ul style={{ margin: '10px 0 0', paddingLeft: 18, display: 'grid', gap: 6 }}>
                {[
                  'Tiende a anclarse al precio actual y a moverse en manada: cuando la acción sube, los objetivos suben detrás (y viceversa).',
                  'Se revisa con frecuencia justo después del movimiento, así que rara vez anticipa nada.',
                  'Mezcla incentivos del lado vendedor (banca de inversión, relaciones comerciales) que no siempre miran por el inversor a largo plazo.',
                ].map((t, i) => (
                  <li key={i} style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.55 }}>{t}</li>
                ))}
              </ul>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, marginTop: 10 }}>
                Preferimos darte las herramientas para juzgar tú mismo: <b style={{ color: 'var(--text)' }}>valor intrínseco</b> con
                su margen de seguridad, múltiplos frente a su propia historia y la calidad y sostenibilidad del dividendo.
              </p>
            </Card>
          </div>
        )}

        {/* ═══ SALUD FINANCIERA ═══ */}
        {tab === 'salud' && (
          <div style={{ display: 'grid', gap: 16 }}>
            <HealthTwoLevel panel={healthPanel} isPremium={isPremium} ticker={ticker} sectorLabel={healthPanel?.sectorLabel} />
            <MoatSection moat={moat} isPremium={isPremium} />
            <InsightsSection insights={insights} isPremium={isPremium} />
            <DGIScoreCard dgiScore={dgiScore} isPremium={isPremium} scoreHistory={scoreHistory} />
            {paysDividend && <SafetyCard safety={dividendSafety} isPremium={isPremium} />}
            {isBank ? <BankMetricsCard m={bankMetrics} /> : isInsurer ? <InsurerMetricsCard m={insurerMetrics} /> : isReit ? <ReitMetricsCard m={reitMetrics} currency={currency} /> : <RoicCard roicData={roicData} isPremium={isPremium} />}
            {rdIntensity && <RDCard rd={rdIntensity} isPremium={isPremium} />}
            {oilBreakeven && <EnergyBreakevenCard be={oilBreakeven} />}
            <InsiderCard ticker={ticker} isPremium={isPremium} />
          </div>
        )}
      </div>
    </div>
  )
}

// ── small inline helpers used above ────────────────────────────────────────

function ResumenProjection({ yld, cagr, country, currency, destWHT = DEFAULT_DEST_WHT }) {
  const yieldPct  = yld != null ? yld * 100 : null
  const growthPct = cagr != null ? cagr * 100 : 0
  const originWHT = getWHT(country)
  const isDomestic = country === 'ES'
  const rows = yieldPct ? project10y(1000, yieldPct, growthPct, originWHT, destWHT, isDomestic) : null
  const payback = yieldPct ? paybackYear(1000, yieldPct, growthPct, originWHT, destWHT, isDomestic) : null
  return (
    <Card>
      <SectionTitle>Proyección rápida · 1.000 {currency}</SectionTitle>
      {rows ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          <MiniMetric label="Renta año 1" value={`${fmt(rows[0].net)} ${currency}`} color="var(--positive)" />
          <MiniMetric label="Total 10 años" value={`${fmt(rows[9].cum)} ${currency}`} color="var(--accent)" />
          <MiniMetric label="Recuperación" value={payback ? `Año ${payback}` : '+10a'} />
        </div>
      ) : (
        <p style={{ fontSize: 12, color: 'var(--text-faint)' }}>Sin dividendo actual.</p>
      )}
    </Card>
  )
}

function InsightsInline({ insights }) {
  const strong = insights.filter(i => ['positive', 'negative', 'green', 'red'].includes(i.type)).slice(0, 3)
  const typeColor = { positive: 'var(--positive)', negative: 'var(--negative)', green: 'var(--positive)', red: 'var(--negative)' }
  const typeIcon  = { positive: '↑', negative: '↓', green: '↑', red: '↓' }
  if (!strong.length) return <p style={{ fontSize: 12, color: 'var(--text-faint)' }}>Sin señales destacadas.</p>
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {strong.map((ins, i) => (
        <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <span style={{ color: typeColor[ins.type], fontSize: 13, flexShrink: 0, marginTop: 1, fontWeight: 700 }}>{typeIcon[ins.type]}</span>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>{ins.text}</p>
        </div>
      ))}
    </div>
  )
}
