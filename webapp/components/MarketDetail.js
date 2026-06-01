'use client'
import { useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import PricesFreshnessIndicator from '@/components/PricesFreshnessIndicator'

const RANGES = [
  { id: '1mo', label: '1M' },
  { id: '3mo', label: '3M' },
  { id: '1y',  label: '1A' },
  { id: '5y',  label: '5A' },
]

// ── Helpers ────────────────────────────────────────────────────────────────

function flagCode(emoji) {
  const cps = [...(emoji || '')].map(c => c.codePointAt(0))
  if (cps.length !== 2 || cps[0] < 0x1F1E6 || cps[0] > 0x1F1FF) return null
  return cps.map(cp => String.fromCharCode(cp - 0x1F1E6 + 65)).join('').toLowerCase()
}

function Flag({ emoji, size = 28 }) {
  const code = flagCode(emoji)
  if (!code) return <span style={{ fontSize: size * 0.65 }}>🌐</span>
  return <img src={`https://flagcdn.com/${size}x${Math.round(size * 0.75)}/${code}.png`} width={size} height={Math.round(size * 0.75)} alt={code} style={{ display: 'block', borderRadius: 2 }} />
}

function fmtPrice(v) {
  if (v == null) return '—'
  if (Math.abs(v) >= 10000) return v.toLocaleString('es-ES', { maximumFractionDigits: 0 })
  if (Math.abs(v) >= 1000)  return v.toLocaleString('es-ES', { maximumFractionDigits: 1 })
  return v.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtPct(v, alwaysSign = true) {
  if (v == null) return 'N/D'
  const sign = alwaysSign && v >= 0 ? '+' : ''
  return sign + v.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%'
}

function fmtDate(ts, range) {
  const d = new Date(ts * 1000)
  if (range === '5y') return d.toLocaleDateString('es-ES', { month: 'short', year: '2-digit' })
  if (range === '1y') return d.toLocaleDateString('es-ES', { month: 'short', year: '2-digit' })
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
}

function pctColor(v) {
  if (v == null) return '#4a5270'
  return v >= 0 ? '#34d399' : '#f87171'
}

// ── SVG Chart ──────────────────────────────────────────────────────────────

const W = 800, H = 200
const PAD = { top: 16, right: 12, bottom: 32, left: 58 }
const IW = W - PAD.left - PAD.right
const IH = H - PAD.top  - PAD.bottom

function Chart({ data, range }) {
  const [hover, setHover] = useState(null)
  const svgRef = useRef(null)

  const { timestamps: ts, closes } = data || {}
  if (!closes?.length) return (
    <div style={{ height: H, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: '#3a4260', fontSize: 12 }}>Sin datos</p>
    </div>
  )

  const min    = Math.min(...closes)
  const max    = Math.max(...closes)
  const span   = max - min || 1

  const xOf = i => PAD.left + (i / (closes.length - 1)) * IW
  const yOf = v => PAD.top  + IH - ((v - min) / span)   * IH

  const linePath = closes.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xOf(i).toFixed(1)} ${yOf(v).toFixed(1)}`).join(' ')
  const areaPath = `${linePath} L ${xOf(closes.length - 1).toFixed(1)} ${(PAD.top + IH).toFixed(1)} L ${PAD.left.toFixed(1)} ${(PAD.top + IH).toFixed(1)} Z`

  const netUp = closes[closes.length - 1] >= closes[0]
  const lineColor = netUp ? '#34d399' : '#f87171'

  const labelCount = 5
  const xLabels = Array.from({ length: labelCount }, (_, i) => {
    const idx = Math.round(i / (labelCount - 1) * (ts.length - 1))
    return { x: xOf(idx), label: fmtDate(ts[idx], range) }
  })

  const yLabels = [0, 0.33, 0.67, 1].map(t => ({
    y: yOf(min + t * span),
    label: fmtPrice(min + t * span),
  }))

  function handleMouseMove(e) {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return
    const relX = ((e.clientX - rect.left) / rect.width) * W - PAD.left
    if (relX < 0 || relX > IW) { setHover(null); return }
    const idx = Math.min(closes.length - 1, Math.max(0, Math.round(relX / IW * (closes.length - 1))))
    setHover({ idx, x: xOf(idx), y: yOf(closes[idx]), price: closes[idx], ts: ts[idx] })
  }

  return (
    <div style={{ position: 'relative' }}>
      {hover && (
        <div style={{
          position: 'absolute', top: 4,
          left: hover.x / W * 100 + '%',
          transform: hover.idx > closes.length * 0.65 ? 'translateX(-110%)' : 'translateX(8px)',
          background: '#0f1221', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 8, padding: '6px 10px', pointerEvents: 'none', zIndex: 10, whiteSpace: 'nowrap',
        }}>
          <p style={{ fontSize: 10, color: '#4a5270', marginBottom: 2 }}>{fmtDate(hover.ts, range)}</p>
          <p style={{ fontSize: 14, fontWeight: 800, color: '#e0e8f0', fontVariantNumeric: 'tabular-nums' }}>{fmtPrice(hover.price)}</p>
        </div>
      )}
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block', cursor: 'crosshair' }}
        onMouseMove={handleMouseMove} onMouseLeave={() => setHover(null)}>
        <defs>
          <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={lineColor} stopOpacity="0.22" />
            <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
          </linearGradient>
        </defs>
        {yLabels.map((l, i) => (
          <g key={i}>
            <line x1={PAD.left} x2={W - PAD.right} y1={l.y} y2={l.y} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
            <text x={PAD.left - 6} y={l.y + 4} textAnchor="end" fontSize="9" fill="#2a3045" fontFamily="inherit">{l.label}</text>
          </g>
        ))}
        <path d={areaPath} fill="url(#g)" />
        <path d={linePath} stroke={lineColor} strokeWidth="1.5" fill="none" strokeLinejoin="round" />
        {hover && (
          <>
            <line x1={hover.x} x2={hover.x} y1={PAD.top} y2={PAD.top + IH} stroke="rgba(255,255,255,0.18)" strokeWidth="1" strokeDasharray="4 3" />
            <circle cx={hover.x} cy={hover.y} r="4" fill={lineColor} stroke="#080b14" strokeWidth="2" />
          </>
        )}
        {xLabels.map((l, i) => (
          <text key={i} x={l.x} y={H - 6} textAnchor="middle" fontSize="9" fill="#2a3045" fontFamily="inherit">{l.label}</text>
        ))}
      </svg>
    </div>
  )
}

// ── Constituents list ──────────────────────────────────────────────────────

const SECTOR_LABELS = {
  'Technology':             'Tecnología',
  'Healthcare':             'Salud',
  'Financial Services':     'Financiero',
  'Industrials':            'Industrial',
  'Consumer Defensive':     'Consumo básico',
  'Consumer Cyclical':      'Consumo cíclico',
  'Utilities':              'Utilities',
  'Energy':                 'Energía',
  'Real Estate':            'Inmobiliario',
  'Basic Materials':        'Materiales',
  'Communication Services': 'Comunicación',
}

function fmtCompanyPrice(v, cur) {
  if (v == null) return '—'
  // GBp is pence – show without conversion, user knows it's pence
  const abs = Math.abs(v)
  if (abs >= 100000) return v.toLocaleString('es-ES', { maximumFractionDigits: 0 })
  if (abs >= 10000)  return v.toLocaleString('es-ES', { maximumFractionDigits: 0 })
  if (abs >= 1000)   return v.toLocaleString('es-ES', { maximumFractionDigits: 1 })
  return v.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function ConstituentRow({ company, quote }) {
  const up     = quote?.pct != null ? quote.pct >= 0 : null
  const col    = up === null ? '#4a5270' : up ? '#34d399' : '#f87171'
  const sign   = quote?.pct != null && quote.pct >= 0 ? '+' : ''
  const pctStr = quote?.pct != null
    ? sign + quote.pct.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%'
    : '—'
  const cur = quote?.cur || company.cur

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
      gap: 8,
    }}>
      <p style={{
        fontSize: 12, fontWeight: 600, color: '#c8d4e4',
        flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>
        {company.name}
      </p>
      <p style={{ fontSize: 10, color: '#2e3a55', flexShrink: 0, width: 70, textAlign: 'right' }}>
        {company.ticker}
      </p>
      <p style={{
        fontSize: 12, fontWeight: 700, color: '#dde6f4',
        fontVariantNumeric: 'tabular-nums', flexShrink: 0, width: 80, textAlign: 'right',
      }}>
        {fmtCompanyPrice(quote?.price, cur)}
        {quote?.price != null && cur && (
          <span style={{ fontSize: 9, color: '#2e3a55', marginLeft: 2 }}>{cur}</span>
        )}
      </p>
      <p style={{
        fontSize: 11, fontWeight: 600, color: col,
        fontVariantNumeric: 'tabular-nums', flexShrink: 0, width: 62, textAlign: 'right',
      }}>
        {pctStr}
      </p>
    </div>
  )
}

function ConstituentsList({ constituents, quotes }) {
  const [expanded, setExpanded] = useState(false)

  if (!constituents.length) return null

  const sorted  = [...constituents].sort((a, b) => a.name.localeCompare(b.name))
  const PREVIEW = 15
  const visible = expanded ? sorted : sorted.slice(0, PREVIEW)

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <p style={{
          fontSize: 10, fontWeight: 700, color: '#4a5270',
          letterSpacing: '0.08em', textTransform: 'uppercase',
        }}>
          Empresas del índice
        </p>
        <p style={{ fontSize: 10, color: '#2a3248' }}>
          {constituents.length} empresas · precios locales · act. diaria
        </p>
      </div>

      {/* Column headers */}
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        padding: '3px 0 5px', borderBottom: '1px solid rgba(255,255,255,0.08)',
        gap: 8,
      }}>
        <p style={{ fontSize: 9, color: '#2e3a55', flex: 1 }}>Nombre</p>
        <p style={{ fontSize: 9, color: '#2e3a55', width: 70, textAlign: 'right' }}>Ticker</p>
        <p style={{ fontSize: 9, color: '#2e3a55', width: 80, textAlign: 'right' }}>Precio</p>
        <p style={{ fontSize: 9, color: '#2e3a55', width: 62, textAlign: 'right' }}>Var. día</p>
      </div>

      <div>
        {visible.map(c => (
          <ConstituentRow key={c.ticker} company={c} quote={quotes[c.ticker]} />
        ))}
      </div>

      {sorted.length > PREVIEW && (
        <button
          onClick={() => setExpanded(e => !e)}
          style={{
            marginTop: 8, fontSize: 11, fontWeight: 600,
            color: '#818cf8', background: 'transparent', border: 'none',
            cursor: 'pointer', padding: 0, fontFamily: 'inherit',
          }}
        >
          {expanded
            ? '↑ Mostrar menos'
            : `↓ Ver las ${sorted.length - PREVIEW} restantes`}
        </button>
      )}
    </div>
  )
}

// ── Stat card ──────────────────────────────────────────────────────────────

function Stat({ label, value, color, sub }) {
  return (
    <div style={{ padding: '12px 14px', background: 'rgba(255,255,255,0.025)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)' }}>
      <p style={{ fontSize: 10, color: '#3a4260', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>{label}</p>
      <p style={{ fontSize: 18, fontWeight: 800, color: color || '#e0e8f0', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{value}</p>
      {sub && <p style={{ fontSize: 10, color: '#3a4260', marginTop: 4 }}>{sub}</p>}
    </div>
  )
}

// ── DGI Analytics (free) ──────────────────────────────────────────────────

function SectionTitle({ children }) {
  return (
    <p style={{
      fontSize: 10, fontWeight: 700, color: '#4a5270',
      letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10,
    }}>
      {children}
    </p>
  )
}

function scoreColor(s) {
  return s >= 7 ? '#34d399' : s >= 4 ? '#fbbf24' : '#f87171'
}

function DGIScoreAndRanking({ score, ranking, currentSymbol }) {
  const [expanded, setExpanded] = useState(false)
  if (score == null) return null

  const color   = scoreColor(score)
  const rank    = ranking.findIndex(r => r.symbol === currentSymbol) + 1
  const PREVIEW = 10
  const visible = expanded ? ranking : ranking.slice(0, PREVIEW)

  return (
    <div style={{
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 12, overflow: 'hidden', marginBottom: 12,
    }}>
      {/* Score header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 20,
        padding: '16px 20px', flexWrap: 'wrap',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div style={{ textAlign: 'center', minWidth: 64 }}>
          <p style={{ fontSize: 44, fontWeight: 900, color, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
            {score.toFixed(1)}
          </p>
          <p style={{ fontSize: 10, color: '#3a4260', marginTop: 2 }}>de 10</p>
        </div>
        <div style={{ flex: 1, minWidth: 160 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#c8d4e4', marginBottom: 6 }}>Score DGI del índice</p>
          <div style={{ height: 8, background: 'rgba(255,255,255,0.07)', borderRadius: 4, overflow: 'hidden', marginBottom: 6 }}>
            <div style={{ width: (score / 10 * 100) + '%', height: '100%', background: color, borderRadius: 4 }} />
          </div>
          <p style={{ fontSize: 10, color: '#3a4260' }}>
            {rank > 0 && `Posición #${rank} de ${ranking.length} mercados · `}
            {score >= 7 ? 'Sólidas características DGI' : score >= 4 ? 'Potencial DGI moderado' : 'Escasas características DGI'}
          </p>
        </div>
      </div>

      {/* Ranking table */}
      <div style={{ padding: '10px 0' }}>
        <p style={{ fontSize: 9, fontWeight: 700, color: '#2e3a55', letterSpacing: '0.08em', textTransform: 'uppercase', padding: '0 16px 6px' }}>
          Ranking DGI — {ranking.length} mercados analizados
        </p>
        {visible.map((m, i) => {
          const isCurrent = m.symbol === currentSymbol
          const c = scoreColor(m.score)
          return (
            <div key={m.symbol} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '5px 16px',
              background: isCurrent ? 'rgba(99,102,241,0.08)' : 'transparent',
              borderLeft: isCurrent ? '2px solid rgba(99,102,241,0.5)' : '2px solid transparent',
            }}>
              <p style={{ fontSize: 10, color: '#2e3a55', width: 20, textAlign: 'right', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                {i + 1}
              </p>
              <span style={{ fontSize: 13 }}>{m.flag}</span>
              <p style={{ flex: 1, fontSize: 11, fontWeight: isCurrent ? 700 : 400, color: isCurrent ? '#c8d4e4' : '#8090a8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {m.name}
              </p>
              <div style={{ width: 60, height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden', flexShrink: 0 }}>
                <div style={{ width: (m.score / 10 * 100) + '%', height: '100%', background: c, borderRadius: 2 }} />
              </div>
              <p style={{ fontSize: 11, fontWeight: 700, color: c, fontVariantNumeric: 'tabular-nums', width: 28, textAlign: 'right', flexShrink: 0 }}>
                {m.score.toFixed(1)}
              </p>
            </div>
          )
        })}
        {ranking.length > PREVIEW && (
          <button onClick={() => setExpanded(e => !e)} style={{
            margin: '6px 16px 4px', fontSize: 11, fontWeight: 600,
            color: '#818cf8', background: 'transparent', border: 'none',
            cursor: 'pointer', padding: 0, fontFamily: 'inherit', display: 'block',
          }}>
            {expanded ? '↑ Mostrar menos' : `↓ Ver los ${ranking.length - PREVIEW} restantes`}
          </button>
        )}
      </div>
    </div>
  )
}

function ThermometerSimple({ thermometer }) {
  if (!thermometer) return null
  const { dgiInvestable, total } = thermometer
  const pct   = total > 0 ? Math.round(dgiInvestable / total * 100) : 0
  const color  = pct >= 30 ? '#34d399' : pct >= 15 ? '#fbbf24' : '#f87171'
  return (
    <div style={{
      padding: '12px 16px', borderRadius: 10,
      background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)',
    }}>
      <p style={{ fontSize: 10, color: '#3a4260', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5 }}>
        Termómetro DGI
      </p>
      <p style={{ fontSize: 22, fontWeight: 900, color, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
        {pct}%
      </p>
      <p style={{ fontSize: 10, color: '#3a4260', marginTop: 4 }}>
        {dgiInvestable} de {total} empresas son aptas para DGI
      </p>
    </div>
  )
}

function YieldSimple({ avgYield, bondRate }) {
  if (avgYield == null || bondRate == null) return null
  const yPct  = (avgYield * 100).toFixed(2)
  const bPct  = (bondRate * 100).toFixed(2)
  const spread = avgYield - bondRate
  const pos   = spread >= 0
  const col   = pos ? '#34d399' : '#f87171'
  return (
    <div style={{
      padding: '12px 16px', borderRadius: 10,
      background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)',
    }}>
      <p style={{ fontSize: 10, color: '#3a4260', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
        Yield real del índice
      </p>
      <div style={{ display: 'flex', gap: 16, marginBottom: 8 }}>
        <div>
          <p style={{ fontSize: 18, fontWeight: 900, color: '#34d399', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{yPct}%</p>
          <p style={{ fontSize: 9, color: '#3a4260', marginTop: 2 }}>Yield índice</p>
        </div>
        <div style={{ width: 1, background: 'rgba(255,255,255,0.07)' }} />
        <div>
          <p style={{ fontSize: 18, fontWeight: 900, color: '#fbbf24', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{bPct}%</p>
          <p style={{ fontSize: 9, color: '#3a4260', marginTop: 2 }}>Bono 10A</p>
        </div>
      </div>
      <p style={{ fontSize: 10, color: col }}>
        {pos
          ? `Prima de ${(spread * 100).toFixed(2)}pp sobre el bono`
          : `${Math.abs(spread * 100).toFixed(2)}pp por debajo del bono`}
      </p>
    </div>
  )
}

// ── Premium gate ───────────────────────────────────────────────────────────

function PremiumGate({ isPremium, children }) {
  if (isPremium) return children
  return (
    <div style={{ position: 'relative', marginBottom: 12 }}>
      {/* Content visible but faded at the bottom */}
      <div style={{ maxHeight: 140, overflow: 'hidden', position: 'relative', pointerEvents: 'none', userSelect: 'none' }}>
        {children}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: 80,
          background: 'linear-gradient(to bottom, transparent, #080b14)',
        }} />
      </div>
      {/* Discrete upgrade prompt */}
      <div style={{ paddingTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
        <Link href="/pricing" style={{
          fontSize: 11, color: '#4a5270', textDecoration: 'none',
          borderBottom: '1px solid rgba(74,82,112,0.4)', paddingBottom: 1,
          transition: 'color 0.15s',
        }}
          onMouseEnter={e => e.currentTarget.style.color = '#818cf8'}
          onMouseLeave={e => e.currentTarget.style.color = '#4a5270'}
        >
          Ver información completa — desde 4,99€/mes →
        </Link>
      </div>
    </div>
  )
}

// ── Premium analytics components ───────────────────────────────────────────

const HEALTH_COLORS = {
  green:  { bg: 'rgba(52,211,153,0.15)',  border: 'rgba(52,211,153,0.3)',  text: '#34d399', dot: '#34d399'  },
  yellow: { bg: 'rgba(251,191,36,0.12)',  border: 'rgba(251,191,36,0.25)', text: '#fbbf24', dot: '#fbbf24'  },
  red:    { bg: 'rgba(248,113,113,0.12)', border: 'rgba(248,113,113,0.25)',text: '#f87171', dot: '#f87171'  },
  gray:   { bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.08)',text: '#4a5270', dot: '#2e3a55'  },
}

function HealthMapGrid({ healthMap }) {
  const [expanded, setExpanded] = useState(false)
  if (!healthMap?.companies?.length) return null

  const PREVIEW = 20
  const visible = expanded ? healthMap.companies : healthMap.companies.slice(0, PREVIEW)

  const counts = [
    { key: 'green',  label: 'Sólida',  count: healthMap.green  },
    { key: 'yellow', label: 'Neutral', count: healthMap.yellow },
    { key: 'red',    label: 'Débil',   count: healthMap.red    },
    { key: 'gray',   label: 'S/D',     count: healthMap.gray   },
  ]

  return (
    <div style={{ padding: '14px 16px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12 }}>
      <p style={{ fontSize: 12, fontWeight: 700, color: '#c8d4e4', marginBottom: 4 }}>Mapa de salud financiera</p>
      <p style={{ fontSize: 10, color: '#3a4260', marginBottom: 12 }}>Clasificación DGI de cada empresa del índice</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {counts.map(c => {
          const s = HEALTH_COLORS[c.key]
          return (
            <div key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 6, background: s.bg, border: '1px solid ' + s.border }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: s.dot }} />
              <span style={{ fontSize: 10, color: s.text }}>{c.label}</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: s.text }}>{c.count}</span>
            </div>
          )
        })}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: 4 }}>
        {visible.map(c => {
          const s = HEALTH_COLORS[c.health] || HEALTH_COLORS.gray
          return (
            <div key={c.ticker} style={{ padding: '5px 7px', borderRadius: 6, background: s.bg, border: '1px solid ' + s.border }}
              title={`${c.name}\nYield: ${c.yield != null ? (c.yield * 100).toFixed(2) + '%' : 'N/D'}\nPayout: ${c.payout != null ? (c.payout * 100).toFixed(0) + '%' : 'N/D'}`}>
              <p style={{ fontSize: 10, fontWeight: 700, color: s.text, lineHeight: 1.2 }}>{c.ticker}</p>
            </div>
          )
        })}
      </div>
      {healthMap.companies.length > PREVIEW && (
        <button onClick={() => setExpanded(e => !e)} style={{ marginTop: 10, fontSize: 11, fontWeight: 600, color: '#818cf8', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
          {expanded ? '↑ Mostrar menos' : `↓ Ver las ${healthMap.companies.length - PREVIEW} restantes`}
        </button>
      )}
    </div>
  )
}

function OpportunityRadar({ opportunities }) {
  if (!opportunities?.length) return null
  return (
    <div style={{ padding: '14px 16px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12 }}>
      <p style={{ fontSize: 12, fontWeight: 700, color: '#c8d4e4', marginBottom: 4 }}>Radar de oportunidades</p>
      <p style={{ fontSize: 10, color: '#3a4260', marginBottom: 12 }}>Las mejores candidatas DGI del índice según yield, payout y valoración</p>
      {opportunities.map((c, i) => (
        <div key={c.ticker} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: i < opportunities.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
          <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: '#818cf8' }}>{i + 1}</span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: '#c8d4e4', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</p>
            <p style={{ fontSize: 10, color: '#3a4260', marginTop: 1 }}>{c.ticker}</p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
            {c.yield != null && <div style={{ textAlign: 'right' }}><p style={{ fontSize: 9, color: '#3a4260' }}>Yield</p><p style={{ fontSize: 12, fontWeight: 700, color: '#34d399', fontVariantNumeric: 'tabular-nums' }}>{(c.yield * 100).toFixed(2)}%</p></div>}
            {c.payout != null && <div style={{ textAlign: 'right' }}><p style={{ fontSize: 9, color: '#3a4260' }}>Payout</p><p style={{ fontSize: 12, fontWeight: 700, color: '#fbbf24', fontVariantNumeric: 'tabular-nums' }}>{(c.payout * 100).toFixed(0)}%</p></div>}
            {c.pe != null && <div style={{ textAlign: 'right' }}><p style={{ fontSize: 9, color: '#3a4260' }}>PER</p><p style={{ fontSize: 12, fontWeight: 700, color: '#8090a8', fontVariantNumeric: 'tabular-nums' }}>{c.pe.toFixed(1)}x</p></div>}
          </div>
        </div>
      ))}
    </div>
  )
}

function ScoreBreakdown({ breakdown }) {
  if (!breakdown?.length) return null
  const total = breakdown.reduce((s, b) => s + b.max, 0)
  return (
    <div style={{ padding: '14px 16px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12 }}>
      <p style={{ fontSize: 12, fontWeight: 700, color: '#c8d4e4', marginBottom: 4 }}>Desglose del Score DGI</p>
      <p style={{ fontSize: 10, color: '#3a4260', marginBottom: 14 }}>Qué está impulsando o penalizando la nota del índice</p>
      {breakdown.map(b => {
        const col = b.pts === 0 ? '#f87171' : b.pts >= b.max * 0.67 ? '#34d399' : '#fbbf24'
        return (
          <div key={b.key} style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: '#8090a8' }}>{b.label}</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontSize: 10, color: '#3a4260' }}>{b.detail}</span>
                <span style={{ fontSize: 12, fontWeight: 800, color: col, fontVariantNumeric: 'tabular-nums' }}>
                  {b.pts}/{b.max} pts
                </span>
              </div>
            </div>
            <div style={{ height: 5, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ width: (b.pts / b.max * 100) + '%', height: '100%', background: col, borderRadius: 3 }} />
            </div>
          </div>
        )
      })}
      <p style={{ fontSize: 10, color: '#2e3a55', marginTop: 4, textAlign: 'right' }}>
        Total: {breakdown.reduce((s, b) => s + b.pts, 0)}/{total} puntos
      </p>
    </div>
  )
}

function PremiumPlaceholder({ title, description }) {
  return (
    <div style={{ padding: '16px', background: 'rgba(255,255,255,0.015)', border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 14 }}>
      <p style={{ fontSize: 20 }}>🔒</p>
      <div>
        <p style={{ fontSize: 12, fontWeight: 600, color: '#4a5270' }}>{title}</p>
        <p style={{ fontSize: 10, color: '#2e3a55', marginTop: 2 }}>{description}</p>
      </div>
      <Link href="/pricing" style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, color: '#818cf8', textDecoration: 'none', flexShrink: 0 }}>Premium →</Link>
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────

export default function MarketDetail({ market, quote, initialChartData, stats, returns, constituents = [], constituentQuotes = {}, dgiMetrics = null, ranking = [], isPremium = false }) {
  const [range,     setRange]     = useState('1y')
  const [chartData, setChartData] = useState(initialChartData)
  const [loading,   setLoading]   = useState(false)

  const loadChart = useCallback(async (r) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/markets/${encodeURIComponent(market.symbol)}/chart?range=${r}`, { cache: 'no-store' })
      if (res.ok) setChartData(await res.json())
    } catch {}
    setLoading(false)
  }, [market.symbol])

  function handleRange(r) {
    setRange(r)
    loadChart(r)
  }

  const up   = quote?.pct != null ? quote.pct >= 0 : null
  const col  = up === null ? '#8090a8' : up ? '#34d399' : '#f87171'
  const sign = quote?.pct != null && quote.pct >= 0 ? '+' : ''

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '20px 16px 60px' }}>

      {/* Back */}
      <Link href="/" style={{ fontSize: 12, color: '#4a5270', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 20 }}>
        ← Mercados
      </Link>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Flag emoji={market.flag} size={36} />
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 900, color: '#e0e8f0', lineHeight: 1.1 }}>{market.name}</h1>
            <p style={{ fontSize: 12, color: '#3a4260', marginTop: 3 }}>{market.country} · {market.symbol}</p>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ fontSize: 30, fontWeight: 900, color: '#e0e8f0', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
            {fmtPrice(quote?.price)}
          </p>
          <p style={{ fontSize: 15, fontWeight: 700, color: col, fontVariantNumeric: 'tabular-nums', marginTop: 5 }}>
            {quote?.pct != null ? `${sign}${fmtPct(quote.pct, false)}` : '—'}
            {quote?.change != null && (
              <span style={{ fontSize: 11, marginLeft: 6, opacity: 0.65 }}>
                ({sign}{fmtPrice(quote.change)})
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Chart */}
      <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '14px 16px 8px', marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
          {RANGES.map(r => {
            const active = r.id === range
            return (
              <button key={r.id} onClick={() => handleRange(r.id)} style={{
                fontSize: 11, fontWeight: active ? 700 : 400, padding: '4px 12px', borderRadius: 6,
                border: '1px solid ' + (active ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.08)'),
                background: active ? 'rgba(99,102,241,0.2)' : 'transparent',
                color: active ? '#818cf8' : '#4a5270', cursor: 'pointer', fontFamily: 'inherit',
              }}>{r.label}</button>
            )
          })}
          {loading && <span style={{ fontSize: 11, color: '#3a4260', alignSelf: 'center', marginLeft: 4 }}>cargando…</span>}
        </div>
        {chartData
          ? <Chart data={chartData} range={range} />
          : <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <p style={{ color: '#3a4260', fontSize: 12 }}>{loading ? 'Cargando…' : 'Sin datos de gráfico'}</p>
            </div>
        }
      </div>

      {/* ── FREE: Score DGI + Ranking ── */}
      {dgiMetrics && (
        <>
          <SectionTitle>Análisis DGI del índice</SectionTitle>
          <DGIScoreAndRanking score={dgiMetrics.dgiScore} ranking={ranking} currentSymbol={market.symbol} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10, marginBottom: 20 }}>
            <ThermometerSimple thermometer={dgiMetrics.thermometer} />
            <YieldSimple avgYield={dgiMetrics.avgYield} bondRate={dgiMetrics.bondRate} />
          </div>
        </>
      )}

      {/* ── FREE: Empresas del índice ── */}
      {constituents.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
          <PricesFreshnessIndicator />
        </div>
        <ConstituentsList constituents={constituents} quotes={constituentQuotes} />
      )}

      {/* ── PREMIUM: Analytics avanzados ── */}
      {dgiMetrics && (
        <div style={{ marginBottom: 24 }}>
          <SectionTitle>Analytics premium</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

            <PremiumGate isPremium={isPremium}>
              <OpportunityRadar opportunities={dgiMetrics.opportunities} />
            </PremiumGate>

            <PremiumGate isPremium={isPremium}>
              <HealthMapGrid healthMap={dgiMetrics.healthMap} />
            </PremiumGate>

            <PremiumGate isPremium={isPremium}>
              <ScoreBreakdown breakdown={dgiMetrics.breakdown} />
            </PremiumGate>

            {!isPremium && (
              <>
                <PremiumPlaceholder title="Evolución histórica del dividendo" description="Crecimiento agregado del dividendo del índice en los últimos 5 años" />
                <PremiumPlaceholder title="Alertas de oportunidad" description="Notificación cuando una empresa del índice entra en zona de compra DGI" />
              </>
            )}
          </div>
        </div>
      )}

      {/* ── FREE: Rentabilidades ── */}
      <div style={{ marginBottom: 20 }}>
        <p style={{ fontSize: 10, fontWeight: 700, color: '#4a5270', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>Rentabilidad del índice</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8 }}>
          <Stat label="YTD"    value={fmtPct(returns.ytd)} color={pctColor(returns.ytd)} />
          <Stat label="1 Año"  value={fmtPct(returns.y1)}  color={pctColor(returns.y1)}  />
          <Stat label="3 Años" value={fmtPct(returns.y3)}  color={pctColor(returns.y3)}  />
          <Stat label="5 Años" value={fmtPct(returns.y5)}  color={pctColor(returns.y5)}  />
        </div>
      </div>

      {/* ── FREE: Valoración ── */}
      <div style={{ marginBottom: 24 }}>
        <p style={{ fontSize: 10, fontWeight: 700, color: '#4a5270', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>Valoración y dividendo</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8 }}>
          <Stat label="PER"        value={stats?.pe       != null ? stats.pe.toFixed(1) + 'x'  : 'N/D'} sub="precio / beneficio" />
          <Stat label="PER Forward" value={stats?.forwardPe != null ? stats.forwardPe.toFixed(1) + 'x' : 'N/D'} sub="estimación próximo año" />
          <Stat label="Yield medio" value={stats?.dividendYield != null ? stats.dividendYield.toFixed(2) + '%' : 'N/D'} color={stats?.dividendYield ? '#34d399' : undefined} sub="dividendo / precio" />
          {stats?.week52Low  != null && <Stat label="Mín. 52 sem." value={fmtPrice(stats.week52Low)}  />}
          {stats?.week52High != null && <Stat label="Máx. 52 sem." value={fmtPrice(stats.week52High)} />}
          {stats?.beta       != null && <Stat label="Beta" value={stats.beta.toFixed(2)} sub="vs mercado global" />}
        </div>
        {(!stats || Object.values(stats).every(v => v == null)) && (
          <p style={{ fontSize: 11, color: '#2a3045', marginTop: 8 }}>
            Yahoo Finance no expone estadísticas para este índice concreto.
          </p>
        )}
      </div>

      {/* ── Comparativa cartera ── */}
      <div style={{ padding: '18px 20px', background: 'rgba(99,102,241,0.04)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#818cf8', marginBottom: 6 }}>
              📊 Comparativa: tu cartera vs {market.name}
            </p>
            <p style={{ fontSize: 12, color: '#3a4260', maxWidth: 440, lineHeight: 1.6 }}>
              Registra tu cartera DGI para ver tu yield, CAGR de dividendo y rentabilidad total
              frente a este índice — el análisis que realmente te dice si estás batiendo al mercado.
            </p>
          </div>
          <Link href="/app" style={{
            fontSize: 11, fontWeight: 700, color: '#818cf8',
            background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)',
            borderRadius: 8, padding: '7px 14px', textDecoration: 'none', flexShrink: 0,
            alignSelf: 'center',
          }}>
            Ir a mi índice →
          </Link>
        </div>
      </div>

    </div>
  )
}
