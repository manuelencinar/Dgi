'use client'
import Link from 'next/link'
import PriceChart from '@/components/empresa/PriceChart'
import HealthGauge from '@/components/empresa/HealthGauge'
import DividendBars from '@/components/empresa/DividendBars'
import FinancialTables from '@/components/empresa/FinancialTables'

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
  if (v >= 1e12) return (v / 1e12).toFixed(2) + ' B'
  if (v >= 1e9)  return (v / 1e9).toFixed(1)  + ' MM'
  if (v >= 1e6)  return (v / 1e6).toFixed(0)  + ' M'
  return String(v)
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
  const barCol  = pct == null ? '#4a5270' : pct < 30 ? '#f87171' : pct > 70 ? '#34d399' : '#fbbf24'

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
        <div style={{ display: 'grid', gap: 6, marginBottom: moat.negative?.length ? 12 : 0 }}>
          {moat.signals.map((s, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, fontSize: 13, color: '#8090a8', alignItems: 'flex-start' }}>
              <span style={{ color: '#34d399', flexShrink: 0, marginTop: 1 }}>+</span>{s}
            </div>
          ))}
        </div>
      )}
      {moat.negative?.length > 0 && (
        <div style={{ display: 'grid', gap: 6 }}>
          {moat.negative.map((s, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, fontSize: 13, color: '#8090a8', alignItems: 'flex-start' }}>
              <span style={{ color: '#f87171', flexShrink: 0, marginTop: 1 }}>−</span>{s}
            </div>
          ))}
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

// ── dcf + valuation section ───────────────────────────────────────────────

function DCFSection({ dcf, peTrailing, peForward, evEbitda, isPremium }) {
  const content = (
    <Card>
      <SectionTitle>DCF y valoración</SectionTitle>
      {dcf ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '12px' }}>
              <p style={{ fontSize: 10, color: '#4a5270', marginBottom: 4 }}>Valor intrínseco</p>
              <p style={{ fontSize: 22, fontWeight: 800, color: '#c8d0e0' }}>{fmt(dcf.intrinsicValue)}</p>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '12px' }}>
              <p style={{ fontSize: 10, color: '#4a5270', marginBottom: 4 }}>Precio actual</p>
              <p style={{ fontSize: 22, fontWeight: 800, color: '#c8d0e0' }}>{fmt(dcf.price)}</p>
            </div>
          </div>
          {dcf.mos != null && (() => {
            const mosCol  = dcf.mos > 0.1 ? '#34d399' : dcf.mos > -0.1 ? '#fbbf24' : '#f87171'
            const mosLbl  = dcf.mos > 0.25 ? 'Zona de compra' : dcf.mos > 0.05 ? 'Ligero descuento' : dcf.mos > -0.1 ? 'Precio justo' : 'Sobrecomprado'
            return (
              <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div>
                  <p style={{ fontSize: 10, color: '#4a5270', marginBottom: 2 }}>Margen de seguridad</p>
                  <p style={{ fontSize: 22, fontWeight: 800, color: mosCol }}>
                    {dcf.mos > 0 ? '+' : ''}{(dcf.mos * 100).toFixed(1)}%
                  </p>
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: mosCol, background: `${mosCol}18`, padding: '4px 10px', borderRadius: 6 }}>{mosLbl}</span>
              </div>
            )
          })()}
          <p style={{ fontSize: 10, color: '#2e3a55', marginBottom: 12 }}>
            Descuento: {(dcf.discount * 100).toFixed(0)}% · Crecimiento: {(dcf.growth * 100).toFixed(1)}%
          </p>
        </>
      ) : (
        <p style={{ fontSize: 13, color: '#4a5270', marginBottom: 14 }}>DCF no disponible (requiere EPS positivo)</p>
      )}

      {/* Ratios */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
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
    <PremiumGate label="Valoración DCF (Premium)" hint="Valor intrínseco, margen de seguridad y múltiplos de valoración.">
      {content}
    </PremiumGate>
  )
}

// ── insights section ──────────────────────────────────────────────────────

function InsightsSection({ insights, isPremium }) {
  if (!insights?.length) return null
  const typeIcon  = { positive: '↑', neutral: '·', negative: '↓' }
  const typeColor = { positive: '#34d399', neutral: '#fbbf24', negative: '#f87171' }
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

// ── dgi score sidebar card ────────────────────────────────────────────────

function DGIScoreCard({ dgiScore, isPremium }) {
  if (!dgiScore) return null

  const content = (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <SectionTitle>Score DGI</SectionTitle>
        <span style={{ fontSize: 32, fontWeight: 900, color: scoreColor(dgiScore.total), lineHeight: 1 }}>
          {dgiScore.total}
        </span>
      </div>
      <div style={{ display: 'grid', gap: 10 }}>
        {dgiScore.breakdown.map(b => (
          <div key={b.key}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 12, color: '#4a5270' }}>{b.label}</span>
              <span style={{ fontSize: 12, color: '#c8d0e0', fontWeight: 600 }}>
                {b.score.toFixed(1)}<span style={{ color: '#2e3a55' }}>/{b.max} ({b.weight})</span>
              </span>
            </div>
            <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${(b.score / b.max) * 100}%`, background: scoreColor(b.score), borderRadius: 2 }} />
            </div>
          </div>
        ))}
      </div>
    </Card>
  )

  return isPremium ? content : (
    <PremiumGate label="Score DGI (Premium)" hint="Nota 0–10 con desglose por dividendo, calidad, valoración y momentum.">
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

// ── main component ────────────────────────────────────────────────────────

export default function CompanyDetailPage({
  ticker, name, country, currency, sector, subsector, type,
  isPremium, hasData,
  price, change, changePct,
  yld, divRate, low52, high52,
  peTrailing, peForward, evEbitda, eps, payout, mktCap,
  divHistory, cagr, streak, updatedAt,
  health, moat, dcf, projection, dgiScore, insights,
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

      {/* Breadcrumb */}
      <p style={{ fontSize: 12, color: '#4a5270', marginBottom: 16 }}>
        <Link href="/mercados" style={{ color: '#4a5270', textDecoration: 'none' }}>Mercados</Link>
        {' / '}
        <span style={{ color: '#8090a8' }}>{name}</span>
      </p>

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
        <PriceChart ticker={ticker} currency={currency} />
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

          {/* ── 6. DCF Y VALORACIÓN ── */}
          <DCFSection dcf={dcf} peTrailing={peTrailing} peForward={peForward} evEbitda={evEbitda} isPremium={isPremium} />

          {/* ── 7. PROYECCIÓN 10 AÑOS ── */}
          <ProjectionSection projection={projection} cagr={cagr} isPremium={isPremium} />

          {/* ── 8. INSIGHTS ── */}
          <InsightsSection insights={insights} isPremium={isPremium} />

          {/* ── 9. ESTADOS FINANCIEROS ── */}
          <Card>
            <SectionTitle>Estados financieros</SectionTitle>
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
          <KeyRatiosCard eps={eps} payout={payout} mktCap={mktCap} updatedAt={updatedAt} />
        </div>
      </div>
    </div>
  )
}
