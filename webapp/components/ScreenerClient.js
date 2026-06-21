'use client'
import { useState, useMemo, useCallback, useEffect } from 'react'
import Link from 'next/link'
import { getCountry, streakBadge, dividendTierInfo, debtEbitdaIsArtifact } from '@/lib/helpers'
import { project10y, paybackYear, getWHT, rentaScore, netYieldOf, buyZoneReason } from '@/lib/screener'
import WatchlistEyeButton from '@/components/watchlist/WatchlistEyeButton'
import PriceAlertButton from '@/components/watchlist/PriceAlertButton'

// ── Opciones de filtros ────────────────────────────────────────────────────
const SCORE_OPTS  = [{ v: 0, l: 'Todas' }, { v: 5, l: '≥5' }, { v: 6, l: '≥6' }, { v: 7, l: '≥7' }, { v: 8, l: '≥8' }]
const ZONA_OPTS   = [{ v: 'all', l: 'Todas' }, { v: 'América', l: 'América' }, { v: 'Europa', l: 'Europa' }, { v: 'Asia', l: 'Asia' }, { v: 'Oceanía', l: 'Oceanía' }, { v: 'África', l: 'África' }]
const YIELD_OPTS  = [{ v: 0, l: 'Todas' }, { v: 1, l: '>1%' }, { v: 2, l: '>2%' }, { v: 3, l: '>3%' }, { v: 4, l: '>4%' }, { v: 5, l: '>5%' }]
const STREAK_OPTS = [{ v: 0, l: 'Todas' }, { v: 5, l: '>5a' }, { v: 10, l: '>10a' }, { v: 25, l: '>25a' }, { v: 35, l: '>35a' }]
const CAGR_OPTS   = [{ v: 0, l: 'Todas' }, { v: 3, l: '>3%' }, { v: 5, l: '>5%' }, { v: 7, l: '>7%' }, { v: 10, l: '>10%' }, { v: 12, l: '>12%' }]
const PAYOUT_OPTS = [{ v: 999, l: 'Todas' }, { v: 50, l: '<50%' }, { v: 70, l: '<70%' }, { v: 90, l: '<90%' }]
const ROIC_OPTS   = [{ v: 0, l: 'Todas' }, { v: 10, l: '>10%' }, { v: 15, l: '>15%' }, { v: 20, l: '>20%' }]
const OPM_OPTS    = [{ v: 0, l: 'Todas' }, { v: 10, l: '>10%' }, { v: 20, l: '>20%' }, { v: 30, l: '>30%' }]
const REV_OPTS    = [{ v: 'all', l: 'Todas' }, { v: 'pos', l: 'Positivo' }, { v: '5', l: '>5%' }, { v: '10', l: '>10%' }]
const MOAT_OPTS   = [{ v: 'all', l: 'Todas' }, { v: 'wide', l: 'Ancho' }, { v: 'narrow', l: 'Estrecho' }, { v: 'none', l: 'Sin foso' }]
const DEBT_OPTS   = [{ v: 99, l: 'Todas' }, { v: 1, l: '<1x' }, { v: 2, l: '<2x' }, { v: 3, l: '<3x' }]
const ICOV_OPTS   = [{ v: 0, l: 'Todas' }, { v: 3, l: '>3x' }, { v: 5, l: '>5x' }, { v: 8, l: '>8x' }]
const MOS_OPTS    = [{ v: -999, l: 'Todas' }, { v: 0, l: 'Positivo' }, { v: 10, l: '>10%' }, { v: 20, l: '>20%' }]
const PE_OPTS     = [{ v: 999, l: 'Todas' }, { v: 15, l: '<15x' }, { v: 20, l: '<20x' }, { v: 25, l: '<25x' }]
const EV_OPTS     = [{ v: 999, l: 'Todas' }, { v: 8, l: '<8x' }, { v: 12, l: '<12x' }, { v: 15, l: '<15x' }]
const CAP_OPTS    = [{ v: 'all', l: 'Todas' }, { v: 'small', l: 'Small <2B' }, { v: 'mid', l: 'Mid 2-10B' }, { v: 'large', l: 'Large 10-100B' }, { v: 'blue', l: 'Blue >100B' }]
const IMPROVING_OPTS = [{ v: 'any', l: 'Cualquier mejora' }, { v: 'roic', l: 'ROIC' }, { v: 'margin', l: 'Márgenes' }, { v: 'debt', l: 'Deuda' }, { v: 'fcf', l: 'FCF' }]

const INIT = {
  score: 0, zona: 'all', sector: 'all',
  yield: 0, streak: 0, cagr: 0, rule1010: false, payout: 999,
  roic: 0, opm: 0, rev: 'all', moat: 'all',
  debt: 99, icov: 0,
  mos: -999, pe: 999, ev: 999, cap: 'all',
  improving: false, improvingType: 'any',
}

const PAGE = 50

function scoreColor(s) { if (s == null) return '#3a4260'; if (s >= 8) return '#34d399'; if (s >= 6.5) return '#86efac'; if (s >= 5) return '#fbbf24'; if (s >= 3) return '#f97316'; return '#f87171' }

// Dos modos de ranking: "Calidad DGI" (Score) y "Renta DGI" (yield + recuperación).
const SORTS_CALIDAD = [
  { k: 'score',    l: '⭐ Nota' },
  { k: 'profit',   l: '💰 Rentables' },
  { k: 'cheap',    l: '🎯 Baratas' },
  { k: 'dividend', l: '💎 Dividendo' },
]
const SORTS_RENTA = [
  { k: 'renta',    l: '🏦 Renta' },
  { k: 'netyield', l: '📈 Yield neto' },
  { k: 'payback',  l: '⏱ Recuperación' },
]
const MODE_DEFAULT = { calidad: 'score', renta: 'renta' }
const MODES = [
  { m: 'calidad', l: '⭐ Calidad DGI', d: 'Ordena por la calidad del negocio y del dividendo (Score DGI): para construir una cartera de empresas excelentes.' },
  { m: 'renta',   l: '🏦 Renta DGI',   d: 'Prioriza el yield neto (tras retenciones) y la rapidez de recuperación: para maximizar la renta que cobras.' },
]

// Tarjeta del screener responsive: en móvil colapsa a una sola línea (nombre +
// badge de nivel + yield + nota); en escritorio (≥760px) también UNA línea pero
// densa (mismo tamaño de bloque que aristócratas, con muchas más columnas).
const SCR_CARD_CSS = `
.scr-card{padding:5px 11px;margin-bottom:4px}
.scr-mobile{display:flex;align-items:center;gap:8px}
.scr-desktop{display:none}
.scr-m-name{flex:1 1 auto;min-width:0;font-size:13px;font-weight:700;color:#d0d8e8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.scr-m-tier{flex-shrink:0;font-size:14px}
.scr-m-yield{flex-shrink:0;font-size:12px;font-weight:700;color:#8090a8;font-variant-numeric:tabular-nums}
.scr-m-score{flex-shrink:0;font-size:16px;font-weight:900;min-width:28px;text-align:right;font-variant-numeric:tabular-nums}
.scr-buyline{margin-top:6px;font-size:11px;line-height:1.4}
@media(min-width:760px){
  .scr-card{padding:8px 12px;margin-bottom:5px}
  .scr-mobile{display:none}
  .scr-desktop{display:flex;align-items:center;gap:9px}
  .scr-buyline{display:none}
  .scr-d-rank{width:34px;flex-shrink:0;font-size:11px;font-weight:800;color:#3a4260;text-align:right;font-variant-numeric:tabular-nums}
  .scr-d-namewrap{flex:1 1 0;min-width:60px;display:flex;align-items:center;gap:6px;overflow:hidden}
  .scr-d-name{font-size:13px;font-weight:700;color:#d0d8e8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .scr-d-m{display:flex;flex-direction:column;text-align:right;min-width:44px;flex-shrink:0;line-height:1.2}
  .scr-d-mlabel{font-size:8.5px;color:#3a4260;font-weight:400}
  .scr-d-mval{font-size:12px;font-weight:700;color:#8090a8;font-variant-numeric:tabular-nums}
  .scr-d-score{font-size:18px;font-weight:900;min-width:30px;text-align:right;flex-shrink:0;font-variant-numeric:tabular-nums}
}`
function fmtEUR0(v) { return v == null ? '—' : v.toLocaleString('es-ES', { maximumFractionDigits: 0 }) + ' €' }
function moatBadge(m) { return m === 'wide' ? '🏰' : m === 'narrow' ? '🧱' : null }

// Proyección €1k para una empresa (idéntica al HTML original).
function projectCompany(co, destWHT, overrides = null) {
  if (co.y == null || co.y <= 0) return null
  const o = getWHT(co.c, overrides)
  const rows = project10y(1000, co.y, co.cagr || 0, o, destWHT, co.c === 'ES')
  if (!rows) return null
  return { y1: rows[0].net, cum10: rows[9].cum, payback: paybackYear(1000, co.y, co.cagr || 0, o, destWHT, co.c === 'ES') }
}

// ── Chips ────────────────────────────────────────────────────────────────────
function Chips({ label, opts, value, onChange, locked }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 5 }}>
        <p style={{ fontSize: 10, fontWeight: 700, color: locked ? '#2e3a55' : '#4a5270', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>{label}</p>
        {locked && <span style={{ fontSize: 8, fontWeight: 700, color: '#6366f1', background: 'rgba(99,102,241,0.12)', padding: '1px 5px', borderRadius: 4 }}>🔒</span>}
      </div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', filter: locked ? 'opacity(0.5)' : 'none' }}>
        {opts.map(o => {
          const active = value === o.v
          return (
            <button key={String(o.v)} onClick={() => !locked && onChange(o.v)} disabled={locked} style={{
              fontSize: 11, padding: '4px 9px', borderRadius: 6, border: '1px solid',
              borderColor: active && !locked ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.07)',
              background: active && !locked ? 'rgba(99,102,241,0.2)' : 'transparent',
              color: locked ? '#2a3045' : (active ? '#818cf8' : '#4a5270'),
              cursor: locked ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontWeight: active ? 700 : 400,
            }}>{o.l}</button>
          )
        })}
      </div>
    </div>
  )
}

function Toggle({ label, value, onChange, locked }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 5 }}>
        <p style={{ fontSize: 10, fontWeight: 700, color: locked ? '#2e3a55' : '#4a5270', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</p>
        {locked && <span style={{ fontSize: 8, fontWeight: 700, color: '#6366f1', background: 'rgba(99,102,241,0.12)', padding: '1px 5px', borderRadius: 4 }}>🔒</span>}
      </div>
      <button onClick={() => !locked && onChange(!value)} disabled={locked} style={{
        fontSize: 11, padding: '4px 12px', borderRadius: 6, border: '1px solid',
        borderColor: value && !locked ? 'rgba(251,191,36,0.5)' : 'rgba(255,255,255,0.07)',
        background: value && !locked ? 'rgba(251,191,36,0.15)' : 'transparent',
        color: locked ? '#2a3045' : (value ? '#fbbf24' : '#4a5270'), cursor: locked ? 'not-allowed' : 'pointer',
        fontFamily: 'inherit', fontWeight: value ? 700 : 400,
      }}>⚡ {value ? 'Activado' : 'Solo 10/10'}</button>
    </div>
  )
}

// ── Tarjeta de empresa ───────────────────────────────────────────────────────
function CompanyCard({ co, rank, destWHT, whtOverrides, sortKey, selected, onSelect, canSelect, following, isAuthed, isPremium }) {
  const ct = getCountry(co.c)
  const proj = projectCompany(co, destWHT, whtOverrides)
  const ny = netYieldOf(co, destWHT, whtOverrides)
  const sb = streakBadge(co.streak)
  const tierName = dividendTierInfo(co.streak)?.name
  const mb = moatBadge(co.moat)
  const buyReason = buyZoneReason(co)

  return (
    <div className="scr-card" style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${selected ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.06)'}`, borderRadius: 12 }}>
      {/* Móvil: una sola línea */}
      <div className="scr-mobile">
        <input type="checkbox" checked={selected} disabled={!selected && !canSelect} onChange={() => onSelect(co.t)} style={{ accentColor: '#818cf8', cursor: 'pointer', flexShrink: 0 }} />
        <span style={{ fontSize: 14, flexShrink: 0 }}>{ct?.flag || '🌐'}</span>
        <Link href={`/empresa/${encodeURIComponent(co.t)}`} className="scr-m-name" style={{ textDecoration: 'none' }}>
          {co.n} <span style={{ fontSize: 10, color: '#2e3a55', fontWeight: 600 }}>{co.t}</span>
        </Link>
        {sb && <span className="scr-m-tier" title={tierName ? `${tierName} · ${co.streak} años subiendo el dividendo` : undefined}>{sb}</span>}
        {co.r1010 && <span title="Regla 10/10: yield + CAGR ≥ 10%" style={{ fontSize: 12, flexShrink: 0 }}>⚡</span>}
        {co.y != null && <span className="scr-m-yield" title="Yield bruto">{co.y.toFixed(1)}%</span>}
        <span className="scr-m-score" style={{ color: scoreColor(co.sc) }}>{co.sc != null ? co.sc.toFixed(1) : '—'}</span>
      </div>

      {/* Escritorio: UNA línea densa (tamaño de bloque como aristócratas) */}
      <div className="scr-desktop">
        <input type="checkbox" checked={selected} disabled={!selected && !canSelect} onChange={() => onSelect(co.t)} style={{ accentColor: '#818cf8', cursor: 'pointer', flexShrink: 0 }} />
        <span className="scr-d-rank">
          {sortKey === 'profit' && proj ? <span style={{ color: '#34d399' }}>{fmtEUR0(proj.cum10)}</span>
            : sortKey === 'cheap' && co.mos != null && !co.mosUnreliable ? <span style={{ color: co.mos >= 0 ? '#34d399' : '#f87171' }}>{co.mos.toFixed(0)}%</span>
            : (sortKey === 'renta' || sortKey === 'netyield') && ny != null ? <span style={{ color: '#34d399' }}>{ny.toFixed(1)}%</span>
            : sortKey === 'payback' && proj?.payback ? <span style={{ color: '#818cf8' }}>r{proj.payback}</span>
            : `#${rank}`}
        </span>
        <span style={{ fontSize: 15, flexShrink: 0 }}>{ct?.flag || '🌐'}</span>
        <div className="scr-d-namewrap">
          <Link href={`/empresa/${encodeURIComponent(co.t)}`} className="scr-d-name" style={{ textDecoration: 'none' }}>
            {co.n} <span style={{ fontSize: 10, color: '#2e3a55', fontWeight: 600 }}>{co.t}</span>
          </Link>
          {sb && <span title={tierName ? `${tierName} · ${co.streak} años subiendo el dividendo` : 'Racha de dividendos'} style={{ fontSize: 12, flexShrink: 0 }}>{sb}</span>}
          {mb && <span title={co.moat === 'wide' ? 'Foso ancho' : 'Foso estrecho'} style={{ fontSize: 11, flexShrink: 0 }}>{mb}</span>}
          {co.r1010 && <span title="Regla 10/10: yield + CAGR ≥ 10%" style={{ fontSize: 11, flexShrink: 0 }}>⚡</span>}
          {co.ero && <span title="Señales de erosión del foso" style={{ fontSize: 11, flexShrink: 0 }}>📉</span>}
          {buyReason && <span title={`Zona de compra: ${buyReason}`} style={{ fontSize: 9, fontWeight: 700, color: '#34d399', background: 'rgba(52,211,153,0.14)', padding: '1px 5px', borderRadius: 4, flexShrink: 0, whiteSpace: 'nowrap', cursor: 'help' }}>● zona</span>}
        </div>

        {co.y != null && <DM label="Yield" val={co.y.toFixed(1) + '%'} />}
        <DM label="CAGR" val={co.cagr == null ? '—' : co.cagrWarn ? 'atíp.' : co.cagr.toFixed(0) + '%'} color={co.cagrWarn ? '#fb923c' : undefined} title={co.cagrWarn ? 'CAGR no fiable (>50%) — neutralizado en el Score' : undefined} />
        <DM label="ROIC" val={co.roicNA ? 'N/A' : co.roic == null ? '—' : (co.roicWarn ? '⚠' : '') + co.roic.toFixed(0) + '%'} color={co.roicWarn ? '#fb923c' : undefined} title={co.roicNA ? 'No aplica en banca/seguros/REITs — se usa ROE' : co.roicWarn ? 'ROIC muy elevado — comparar con peers' : undefined} />
        <DM label="Payout" val={co.payout == null ? '—' : co.payout.toFixed(0) + '%'} />
        <DM label="Deuda" val={co.debt == null ? '—' : debtEbitdaIsArtifact(co.debt) ? 'EBITDA≈0' : co.debt.toFixed(1) + 'x'} title={debtEbitdaIsArtifact(co.debt) ? 'EBITDA cercano a cero — el ratio deuda/EBITDA no es representativo' : 'Deuda neta / EBITDA'} />
        <DM label="MoS" val={co.mosUnreliable ? 'n/f' : co.mos == null ? '—' : (co.mos >= 0 ? '+' : '') + co.mos.toFixed(0) + '%'} color={!co.mosUnreliable && co.mos != null ? (co.mos >= 0 ? '#34d399' : '#f87171') : undefined} title={co.mosUnreliable ? 'Valor intrínseco no fiable para este tipo de activo' : 'Margen de seguridad sobre el valor intrínseco'} />

        <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
          <WatchlistEyeButton ticker={co.t} isAuthed={isAuthed} initialFollowing={following} size={13} />
          <PriceAlertButton ticker={co.t} name={co.n} currency={co.cur} price={co.px} isAuthed={isAuthed} isPremium={isPremium} size={12} />
        </div>
        <span className="scr-d-score" title={co.ero ? 'Incluye −1,0 por señales de erosión del foso 📉' : undefined} style={{ color: scoreColor(co.sc), cursor: co.ero ? 'help' : 'default' }}>{co.sc != null ? co.sc.toFixed(1) : '—'}</span>
      </div>

      {/* Por qué está en zona de compra — línea aparte solo en móvil */}
      {buyReason && (
        <div className="scr-buyline" style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
          <span style={{ color: '#34d399', flexShrink: 0 }}>●</span>
          <span style={{ color: '#86efac' }}><span style={{ fontWeight: 700, color: '#34d399' }}>Zona de compra:</span> {buyReason}</span>
        </div>
      )}
    </div>
  )
}

// Columna compacta (etiqueta arriba / valor abajo) para la fila densa de escritorio.
function DM({ label, val, color, title }) {
  return (
    <div className="scr-d-m" title={title} style={{ cursor: title ? 'help' : 'default' }}>
      <span className="scr-d-mlabel">{label}</span>
      <span className="scr-d-mval" style={color ? { color } : undefined}>{val}</span>
    </div>
  )
}

// ── Comparador ───────────────────────────────────────────────────────────────
function Comparator({ companies, destWHT, onClose }) {
  const rows = [
    ['Score DGI', co => co.sc != null ? co.sc.toFixed(1) : '—'],
    ['Calidad div 💎', co => co.dq != null ? co.dq.toFixed(1) : '—'],
    ['Yield', co => co.y != null ? co.y.toFixed(2) + '%' : '—'],
    ['CAGR div 5a', co => co.cagr != null ? co.cagr.toFixed(1) + '%' : '—'],
    ['Racha', co => co.streak != null ? co.streak + 'a' : '—'],
    ['ROIC', co => co.roic != null ? co.roic.toFixed(1) + '%' : '—'],
    ['Margen op.', co => co.opm != null ? co.opm.toFixed(1) + '%' : '—'],
    ['Payout', co => co.payout != null ? co.payout.toFixed(0) + '%' : '—'],
    ['Deuda/EBITDA', co => co.debt == null ? '—' : debtEbitdaIsArtifact(co.debt) ? 'EBITDA≈0' : co.debt.toFixed(1) + 'x'],
    ['PER', co => co.pe != null ? co.pe.toFixed(1) + 'x' : '—'],
    ['EV/EBITDA', co => co.ev != null ? co.ev.toFixed(1) + 'x' : '—'],
    ['Margen seguridad', co => co.mosUnreliable ? 'no fiable' : co.mos != null ? (co.mos >= 0 ? '+' : '') + co.mos.toFixed(0) + '%' : '—'],
    ['€1k total 10a', co => { const p = projectCompany(co, destWHT); return p ? fmtEUR0(p.cum10) : '—' }],
  ]
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div style={{ background: '#0d1424', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, padding: 20, maxWidth: 900, width: '100%', maxHeight: '90vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <p style={{ fontSize: 16, fontWeight: 800, color: '#e0e8f0' }}>Comparar {companies.length} empresas</p>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#4a5270', fontSize: 22, cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '8px', color: '#4a5270', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>Métrica</th>
                {companies.map(co => (
                  <th key={co.t} style={{ textAlign: 'right', padding: '8px', color: '#c8d0e0', borderBottom: '1px solid rgba(255,255,255,0.1)', whiteSpace: 'nowrap' }}>
                    {getCountry(co.c)?.flag} {co.t}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(([label, fn]) => (
                <tr key={label} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '7px 8px', color: '#4a5270' }}>{label}</td>
                  {companies.map(co => <td key={co.t} style={{ padding: '7px 8px', textAlign: 'right', color: '#c8d0e0', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{fn(co)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── Componente principal ───────────────────────────────────────────────────
export default function ScreenerClient({ companies = [], isPremium = false, sectors = [], destWHT = 19, whtOverrides = null, followed = [], isAuthed = false, initial = null, hueco = null, totalCompanies = 0 }) {
  const followedSet = useMemo(() => new Set(followed), [followed])
  const [filters, setFilters] = useState(initial ? { ...INIT, ...initial } : INIT)
  const [showHueco, setShowHueco] = useState(!!hueco)
  const [search, setSearch]   = useState('')
  const [sortKey, setSortKey] = useState('score')
  const [mode, setMode] = useState('calidad')
  const [visible, setVisible] = useState(PAGE)
  const [panelOpen, setPanelOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [selected, setSelected] = useState([])
  const [showComp, setShowComp] = useState(false)

  useEffect(() => { setVisible(PAGE) }, [filters, search, sortKey])

  const set = useCallback((key, val) => setFilters(f => ({ ...f, [key]: val })), [])
  // Nuevo modelo freemium: TODOS los filtros están disponibles para todos. El
  // límite del plan gratuito es el nº de empresas (50), no los filtros.
  const lock = false

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return companies.filter(co => {
      if (q && !co.n.toLowerCase().includes(q) && !co.t.toLowerCase().includes(q)) return false
      if (filters.score > 0 && (co.sc == null || co.sc < filters.score)) return false
      if (filters.zona !== 'all' && co.cont !== filters.zona) return false
      if (filters.sector !== 'all' && co.s !== filters.sector) return false
      // Si hay cualquier filtro de dividendo activo, excluir las empresas que no
      // reparten dividendo (aparecen en el screener, pero no en búsquedas por dividendo).
      const divFilterActive = filters.yield > 0 || filters.streak > 0 || filters.cagr > 0 || filters.rule1010 || filters.payout < 999
      if (divFilterActive && co.pays === false) return false
      if (filters.yield > 0 && (co.y == null || co.y < filters.yield)) return false
      if (filters.streak > 0 && (co.streak == null || co.streak < filters.streak)) return false
      if (filters.cagr > 0 && (co.cagr == null || co.cagr < filters.cagr)) return false
      if (filters.rule1010 && !co.r1010) return false
      if (filters.payout < 999 && (co.payout == null || co.payout >= filters.payout)) return false
      if (filters.roic > 0 && (co.roic == null || co.roic < filters.roic)) return false
      if (filters.opm > 0 && (co.opm == null || co.opm < filters.opm)) return false
      if (filters.rev === 'pos' && (co.rev == null || co.rev <= 0)) return false
      if (filters.rev === '5' && (co.rev == null || co.rev < 5)) return false
      if (filters.rev === '10' && (co.rev == null || co.rev < 10)) return false
      if (filters.moat !== 'all' && co.moat !== filters.moat) return false
      if (filters.debt < 99 && (co.debt == null || co.debt >= filters.debt)) return false
      if (filters.icov > 0 && (co.icov == null || co.icov < filters.icov)) return false
      if (filters.mos > -999 && (co.mos == null || co.mos < filters.mos)) return false
      if (filters.pe < 999 && (co.pe == null || co.pe <= 0 || co.pe >= filters.pe)) return false
      if (filters.ev < 999 && (co.ev == null || co.ev >= filters.ev)) return false
      if (filters.cap !== 'all') {
        const m = co.mcap
        if (m == null) return false
        if (filters.cap === 'small' && !(m < 2000)) return false
        if (filters.cap === 'mid'   && !(m >= 2000 && m < 10000)) return false
        if (filters.cap === 'large' && !(m >= 10000 && m < 100000)) return false
        if (filters.cap === 'blue'  && !(m >= 100000)) return false
      }
      // Empresas mejorando (bonificaciones por tendencia positiva)
      if (filters.improving) {
        const sel = filters.improvingType
        if (sel === 'roic')   { if (!(co.bRoic > 0)) return false }
        else if (sel === 'margin') { if (!(co.bMargin > 0)) return false }
        else if (sel === 'debt')   { if (!(co.bDebt > 0)) return false }
        else if (sel === 'fcf')    { if (!(co.bFcf > 0)) return false }
        else { if (!(co.bonus > 0)) return false }
      }
      return true
    })
  }, [companies, filters, search, isPremium])

  const sorted = useMemo(() => {
    const arr = [...filtered]
    if (sortKey === 'profit') {
      const val = co => { const p = projectCompany(co, destWHT, whtOverrides); return p ? p.cum10 : -Infinity }
      arr.sort((a, b) => val(b) - val(a))
    } else if (sortKey === 'cheap') {
      // Las valoraciones no fiables (cap de cordura, MoS>80%) se hunden al fondo.
      const val = co => co.mosUnreliable ? -Infinity : (co.mos ?? -Infinity)
      arr.sort((a, b) => val(b) - val(a))
    } else if (sortKey === 'dividend') {
      arr.sort((a, b) => (b.dq ?? -Infinity) - (a.dq ?? -Infinity))
    } else if (sortKey === 'renta') {
      const val = co => rentaScore(co, destWHT, whtOverrides) ?? -Infinity
      arr.sort((a, b) => val(b) - val(a))
    } else if (sortKey === 'netyield') {
      const val = co => netYieldOf(co, destWHT, whtOverrides) ?? -Infinity
      arr.sort((a, b) => val(b) - val(a))
    } else if (sortKey === 'payback') {
      const val = co => { const p = projectCompany(co, destWHT, whtOverrides); return p && p.payback ? p.payback : Infinity }
      arr.sort((a, b) => val(a) - val(b))   // menos años de recuperación primero
    } else {
      arr.sort((a, b) => (b.sc ?? -Infinity) - (a.sc ?? -Infinity))
    }
    return arr
  }, [filtered, sortKey, destWHT])

  const pageRows = sorted.slice(0, visible)

  // Cuántos de los resultados actuales están en zona de compra (para el aviso free).
  const buyZoneCount = useMemo(() => filtered.reduce((n, co) => n + (buyZoneReason(co) ? 1 : 0), 0), [filtered])

  // Chips activos
  const activeChips = useMemo(() => {
    const chips = []
    const add = (k, label) => chips.push({ k, label })
    if (filters.score > 0) add('score', `Score ≥${filters.score}`)
    if (filters.zona !== 'all') add('zona', filters.zona)
    if (filters.sector !== 'all') add('sector', filters.sector)
    if (filters.yield > 0) add('yield', `Yield >${filters.yield}%`)
    if (filters.streak > 0) add('streak', `Racha >${filters.streak}a`)
    if (filters.cagr > 0) add('cagr', `CAGR >${filters.cagr}%`)
    if (filters.rule1010) add('rule1010', '⚡ 10/10')
    if (filters.payout < 999) add('payout', `Payout <${filters.payout}%`)
    if (filters.roic > 0) add('roic', `ROIC >${filters.roic}%`)
    if (filters.opm > 0) add('opm', `Margen op >${filters.opm}%`)
    if (filters.rev !== 'all') add('rev', `Ingresos ${filters.rev === 'pos' ? '+' : '>' + filters.rev + '%'}`)
    if (filters.moat !== 'all') add('moat', `Foso ${filters.moat}`)
    if (filters.debt < 99) add('debt', `Deuda <${filters.debt}x`)
    if (filters.icov > 0) add('icov', `Cobertura >${filters.icov}x`)
    if (filters.mos > -999) add('mos', filters.mos === 0 ? 'MoS positivo' : `MoS >${filters.mos}%`)
    if (filters.pe < 999) add('pe', `PER <${filters.pe}x`)
    if (filters.ev < 999) add('ev', `EV/EBITDA <${filters.ev}x`)
    if (filters.cap !== 'all') add('cap', CAP_OPTS.find(o => o.v === filters.cap)?.l)
    return chips
  }, [filters])

  const resetKey = (k) => set(k, INIT[k])
  const clearAll = () => { setFilters(INIT); setSearch('') }
  const hasFilters = activeChips.length > 0 || search

  const toggleSelect = (t) => setSelected(s => s.includes(t) ? s.filter(x => x !== t) : (s.length < 4 ? [...s, t] : s))
  const selectedCompanies = companies.filter(c => selected.includes(c.t))

  const SORTS = mode === 'renta' ? SORTS_RENTA : SORTS_CALIDAD
  const switchMode = (m) => { setMode(m); setSortKey(MODE_DEFAULT[m]) }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px 100px' }}>
      <style>{SCR_CARD_CSS}</style>
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, color: '#e0e8f0', marginBottom: 4 }}>Screener DGI</h1>
        <p style={{ fontSize: 12, color: '#3a4260' }}>
          {isPremium
            ? `${companies.length.toLocaleString('es-ES')} empresas de 43 mercados`
            : `Muestra gratuita de ${companies.length} empresas · ${(totalCompanies || companies.length).toLocaleString('es-ES')} con Premium`}
        </p>
        <Link href="/construir-cartera" style={{ display: 'inline-block', marginTop: 10, fontSize: 12.5, fontWeight: 700, color: '#a5b4fc', textDecoration: 'none', padding: '8px 14px', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 9 }}>
          🧭 ¿No sabes por dónde empezar? Construye tu cartera desde cero →
        </Link>
      </div>

      {/* Banner: viene del detector de huecos de la cartera */}
      {showHueco && hueco && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 10, padding: '10px 14px', marginBottom: 14 }}>
          <span style={{ fontSize: 16, flexShrink: 0 }}>🧩</span>
          <p style={{ flex: 1, fontSize: 12.5, color: '#c8d0e0', lineHeight: 1.5 }}>
            Para complementar tu cartera: <span style={{ fontWeight: 700, color: '#a5b4fc' }}>{hueco}</span>.
            <Link href="/cartera" style={{ color: '#818cf8', textDecoration: 'none', marginLeft: 6 }}>← Volver a la cartera</Link>
          </p>
          <button onClick={() => { setShowHueco(false); clearAll() }} title="Quitar filtros" style={{ background: 'none', border: 'none', color: '#4a5270', cursor: 'pointer', fontSize: 18, lineHeight: 1, flexShrink: 0 }}>×</button>
        </div>
      )}

      {/* Modo de ranking: Calidad DGI ↔ Renta DGI */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {MODES.map(o => (
            <button key={o.m} onClick={() => switchMode(o.m)} title={o.d} style={{
              fontSize: 13, padding: '9px 16px', borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit',
              border: '1px solid ' + (mode === o.m ? 'rgba(52,211,153,0.5)' : 'rgba(255,255,255,0.08)'),
              background: mode === o.m ? 'rgba(52,211,153,0.14)' : 'transparent',
              color: mode === o.m ? '#34d399' : '#4a5270', fontWeight: mode === o.m ? 800 : 500,
            }}>{o.l}</button>
          ))}
        </div>
        <p style={{ fontSize: 11.5, color: '#4a5270', marginTop: 7, lineHeight: 1.5 }}>
          {MODES.find(o => o.m === mode)?.d}
        </p>
      </div>

      {/* Buscador + ordenación */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nombre o ticker…"
          style={{ flex: 1, minWidth: 200, padding: '10px 14px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 9, color: '#e0e8f0', fontSize: 13, outline: 'none', fontFamily: 'inherit' }} />
        <div style={{ display: 'flex', gap: 4 }}>
          {SORTS.map(s => (
            <button key={s.k} onClick={() => setSortKey(s.k)} style={{
              fontSize: 12, padding: '8px 12px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit',
              border: '1px solid ' + (sortKey === s.k ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.08)'),
              background: sortKey === s.k ? 'rgba(99,102,241,0.2)' : 'transparent',
              color: sortKey === s.k ? '#818cf8' : '#4a5270', fontWeight: sortKey === s.k ? 700 : 400,
            }}>{s.l}</button>
          ))}
        </div>
      </div>

      {/* Toggle panel + chips activos */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <button onClick={() => setPanelOpen(o => !o)} style={{ fontSize: 12, fontWeight: 700, padding: '7px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)', color: '#8090a8', cursor: 'pointer', fontFamily: 'inherit' }}>
          {panelOpen ? '▲ Ocultar filtros' : '▼ Filtros'}{activeChips.length > 0 ? ` (${activeChips.length})` : ''}
        </button>
        <button onClick={() => setHelpOpen(o => !o)} style={{ fontSize: 12, fontWeight: 700, padding: '7px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: helpOpen ? 'rgba(99,102,241,0.12)' : 'rgba(255,255,255,0.03)', color: helpOpen ? '#818cf8' : '#8090a8', cursor: 'pointer', fontFamily: 'inherit' }}>
          {helpOpen ? '▲ Ocultar guía' : 'ℹ️ Guía de métricas'}
        </button>
        {activeChips.map(c => (
          <button key={c.k} onClick={() => resetKey(c.k)} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 14, border: '1px solid rgba(99,102,241,0.3)', background: 'rgba(99,102,241,0.12)', color: '#818cf8', cursor: 'pointer', fontFamily: 'inherit' }}>
            {c.label} ✕
          </button>
        ))}
        {hasFilters && <button onClick={clearAll} style={{ fontSize: 11, color: '#4a5270', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', fontFamily: 'inherit' }}>Limpiar filtros</button>}
      </div>

      {/* Panel de filtros */}
      {panelOpen && (
        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '16px 18px', marginBottom: 16 }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: '#4a5270', letterSpacing: '0.1em', marginBottom: 12 }}>BÁSICOS</p>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 16 }}>
            <Chips label="Score DGI" opts={SCORE_OPTS} value={filters.score} onChange={v => set('score', v)} />
            <Chips label="Zona" opts={ZONA_OPTS} value={filters.zona} onChange={v => set('zona', v)} />
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: '#4a5270', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>Sector</p>
              <select value={filters.sector} onChange={e => set('sector', e.target.value)} style={{ fontSize: 11, padding: '5px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', background: '#0d1424', color: '#6a7090', fontFamily: 'inherit', cursor: 'pointer', outline: 'none' }}>
                <option value="all">Todos los sectores</option>
                {sectors.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <Divider label="DIVIDENDO · PREMIUM" />
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 16 }}>
            <Chips label="Yield" opts={YIELD_OPTS} value={filters.yield} onChange={v => set('yield', v)} locked={lock} />
            <Chips label="Racha" opts={STREAK_OPTS} value={filters.streak} onChange={v => set('streak', v)} locked={lock} />
            <Chips label="CAGR div" opts={CAGR_OPTS} value={filters.cagr} onChange={v => set('cagr', v)} locked={lock} />
            <Chips label="Payout FCF" opts={PAYOUT_OPTS} value={filters.payout} onChange={v => set('payout', v)} locked={lock} />
            <Toggle label="Regla 10/10" value={filters.rule1010} onChange={v => set('rule1010', v)} locked={lock} />
          </div>

          <Divider label="CALIDAD · PREMIUM" />
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 16 }}>
            <Chips label="ROIC" opts={ROIC_OPTS} value={filters.roic} onChange={v => set('roic', v)} locked={lock} />
            <Chips label="Margen op." opts={OPM_OPTS} value={filters.opm} onChange={v => set('opm', v)} locked={lock} />
            <Chips label="Ingresos" opts={REV_OPTS} value={filters.rev} onChange={v => set('rev', v)} locked={lock} />
            <Chips label="Foso" opts={MOAT_OPTS} value={filters.moat} onChange={v => set('moat', v)} locked={lock} />
          </div>

          <Divider label="SOLIDEZ · PREMIUM" />
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 16 }}>
            <Chips label="Deuda/EBITDA" opts={DEBT_OPTS} value={filters.debt} onChange={v => set('debt', v)} locked={lock} />
            <Chips label="Cobertura int." opts={ICOV_OPTS} value={filters.icov} onChange={v => set('icov', v)} locked={lock} />
          </div>

          <Divider label="TENDENCIA · PREMIUM" />
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 16, alignItems: 'flex-start' }}>
            <Toggle label="Empresas mejorando" value={filters.improving} onChange={v => set('improving', v)} locked={lock} />
            {filters.improving && <Chips label="Tipo de mejora" opts={IMPROVING_OPTS} value={filters.improvingType} onChange={v => set('improvingType', v)} locked={lock} />}
          </div>

          <Divider label="VALORACIÓN Y TAMAÑO · PREMIUM" />
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            <Chips label="Margen seguridad" opts={MOS_OPTS} value={filters.mos} onChange={v => set('mos', v)} locked={lock} />
            <Chips label="PER" opts={PE_OPTS} value={filters.pe} onChange={v => set('pe', v)} locked={lock} />
            <Chips label="EV/EBITDA" opts={EV_OPTS} value={filters.ev} onChange={v => set('ev', v)} locked={lock} />
            <Chips label="Capitalización" opts={CAP_OPTS} value={filters.cap} onChange={v => set('cap', v)} locked={lock} />
          </div>

        </div>
      )}

      {/* Guía de métricas */}
      {helpOpen && <HelpGuide />}

      {/* Aviso freemium: muestra de 50 empresas vs. universo completo */}
      {!isPremium && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.18)', borderRadius: 10, padding: '10px 14px', marginBottom: 12 }}>
          <p style={{ fontSize: 12.5, color: '#8090a8', lineHeight: 1.55, flex: 1, minWidth: 220 }}>
            Plan gratuito: estás viendo una <span style={{ color: '#c8d0e0', fontWeight: 700 }}>muestra de {companies.length} empresas</span> de todo el mundo, con <span style={{ color: '#c8d0e0', fontWeight: 700 }}>todos los datos y filtros</span>.
            {totalCompanies > companies.length && <> Premium desbloquea las <span style={{ color: '#34d399', fontWeight: 800 }}>{totalCompanies.toLocaleString('es-ES')}</span> empresas de 43 mercados.</>}
          </p>
          <Link href="/pricing" style={{ fontSize: 12, fontWeight: 700, color: '#fff', background: '#6366f1', padding: '8px 14px', borderRadius: 8, textDecoration: 'none', flexShrink: 0 }}>Ver Premium →</Link>
        </div>
      )}

      {/* Contador */}
      <p style={{ fontSize: 12, color: filtered.length > 0 ? '#4a5270' : '#f87171', marginBottom: 12 }}>
        <span style={{ fontWeight: 700, color: filtered.length > 0 ? '#c8d0e0' : '#f87171', fontSize: 14 }}>{filtered.length.toLocaleString('es-ES')}</span>
        {hasFilters ? ` de ${companies.length.toLocaleString('es-ES')} con los filtros activos` : ` empresa${filtered.length !== 1 ? 's' : ''} encontrada${filtered.length !== 1 ? 's' : ''}`}
      </p>

      {/* Resultados */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <p style={{ fontSize: 14, color: '#8090a8', marginBottom: 16 }}>Ninguna empresa cumple todos los filtros activos</p>
          <button onClick={clearAll} style={{ fontSize: 13, fontWeight: 700, color: '#fff', background: '#6366f1', padding: '9px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Limpiar filtros</button>
        </div>
      ) : (
        <>
          {pageRows.map((co, i) => (
            <CompanyCard key={`${co.t}-${i}`} co={co} rank={i + 1} destWHT={destWHT} whtOverrides={whtOverrides} sortKey={sortKey}
              selected={selected.includes(co.t)} onSelect={toggleSelect} canSelect={selected.length < 4}
              following={followedSet.has(co.t)} isAuthed={isAuthed} isPremium={isPremium} />
          ))}
          {visible < sorted.length && (
            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <button onClick={() => setVisible(v => v + PAGE)} style={{ fontSize: 13, fontWeight: 700, color: '#818cf8', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)', padding: '10px 24px', borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit' }}>
                Cargar más ({sorted.length - visible} restantes)
              </button>
            </div>
          )}
        </>
      )}

      {/* Barra flotante comparador → navega a /comparador */}
      {selected.length >= 2 && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 50, display: 'flex', alignItems: 'center', gap: 12, background: '#10172a', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 30, padding: '8px 8px 8px 18px', boxShadow: '0 4px 20px rgba(0,0,0,0.5)' }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {selectedCompanies.map((co, i) => (
              <span key={co.t} title={co.n} style={{ width: 20, height: 20, borderRadius: '50%', background: ['#34d399', '#60a5fa', '#f59e0b', '#a78bfa', '#f472b6'][i], color: '#08111a', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span>
            ))}
          </div>
          <span style={{ fontSize: 13, color: '#c8d0e0' }}>{selected.length} seleccionadas</span>
          <Link href={`/comparador?tickers=${encodeURIComponent(selected.join(','))}`} style={{ fontSize: 13, fontWeight: 700, color: '#fff', background: '#6366f1', padding: '9px 18px', borderRadius: 22, textDecoration: 'none' }}>
            Comparar →
          </Link>
        </div>
      )}
    </div>
  )
}

function Divider({ label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
      <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.05)' }} />
      <span style={{ fontSize: 10, fontWeight: 700, color: '#6366f1', letterSpacing: '0.1em' }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.05)' }} />
    </div>
  )
}

// ── Guía de métricas ─────────────────────────────────────────────────────────
const GUIDE = [
  { group: 'Puntuaciones', items: [
    ['Score DGI', 'Nota global de 0 a 10 de la empresa como inversión en dividendos crecientes. Combina, ponderadas por sector, las métricas clave: yield, racha y crecimiento del dividendo, payout, deuda, rentabilidad y valoración. Verde ≥6,5 · amarillo 5–6,5 · rojo <5.'],
    ['💎 Calidad del dividendo', 'Mide la solidez y sostenibilidad del dividendo (0–10): payout, deuda/EBITDA, CAGR del dividendo, racha de años subiéndolo y yield neto tras retenciones. Un número alto = dividendo fiable y con margen para seguir creciendo.'],
  ]},
  { group: 'Valoración', items: [
    ['● Zona de compra', 'Línea verde bajo la tarjeta que explica por qué la empresa cotiza atractiva: yield por encima de su media histórica (calculada con el dividendo y el precio de los últimos años), descuento sobre el valor intrínseco, cercanía a su mínimo de 52 semanas, mejora de beneficios esperada (PER previsto por debajo del actual) o regla 10/10. Solo aparece cuando hay señal real de infravaloración.'],
    ['Margen de seguridad (MoS)', 'Diferencia entre el valor intrínseco estimado (DCF sector-aware) y el precio actual. Positivo (verde) = cotiza por debajo de su valor → potencialmente barata. Negativo (rojo) = cotiza por encima → cara.'],
    ['PER', 'Precio / Beneficio por acción. Cuántos años de beneficio actual cuesta la empresa. Más bajo suele ser más barato.'],
    ['EV/EBITDA', 'Valor de empresa (incluida la deuda) sobre el beneficio operativo bruto. Útil para comparar empresas con distinto nivel de deuda.'],
  ]},
  { group: 'Dividendo', items: [
    ['Yield', 'Rentabilidad por dividendo actual: dividendo anual / precio. El óptimo DGI suele estar entre 2% y 6%; muy por encima puede señalar riesgo de recorte.'],
    ['CAGR dividendo', 'Crecimiento anual compuesto del dividendo en los últimos 5 años. Mide la velocidad a la que sube la renta.'],
    ['Racha', 'Años consecutivos subiendo el dividendo. Niveles: ⭐ Aspirante (10+) · 🏆 Aristócrata (25+) · 👑 Rey (50+).'],
    ['Payout', 'Porcentaje del flujo de caja libre (o beneficio) que se reparte como dividendo. Más bajo = más margen y seguridad.'],
    ['⚡ Regla 10/10', 'La empresa cumple que yield + CAGR del dividendo ≥ 10%. Equilibrio entre renta inmediata y crecimiento futuro.'],
  ]},
  { group: 'Calidad del negocio', items: [
    ['ROIC', 'Retorno sobre el capital invertido: cuánto beneficio genera por cada euro invertido en el negocio. Por encima del 15% indica una empresa de alta calidad. (En bancos/aseguradoras se usa el ROE.)'],
    ['Margen operativo', 'Beneficio operativo / ingresos. Mide la eficiencia y el poder de fijación de precios.'],
    ['🏰 / 🧱 Foso económico', 'Ventaja competitiva duradera, estimada por ROIC y márgenes. 🏰 foso ancho (ventaja fuerte) · 🧱 foso estrecho (ventaja moderada).'],
    ['📉 Erosión del foso', 'Señales de que la ventaja competitiva se debilita: ingresos en declive o rentabilidad y márgenes bajos.'],
  ]},
  { group: 'Solidez financiera', items: [
    ['Deuda/EBITDA', 'Veces que la deuda neta supera al beneficio operativo bruto anual. Más bajo = balance más sólido (los REITs toleran cifras más altas).'],
    ['Cobertura de intereses', 'Veces que el beneficio operativo cubre los gastos financieros. Más alto = más holgura para pagar la deuda.'],
  ]},
  { group: 'Proyección sobre €1.000', items: [
    ['Renta año 1', 'Dividendo neto (tras retenciones) que generarían 1.000 € invertidos hoy en el primer año.'],
    ['Total dividendos 10a', 'Suma de todos los dividendos netos cobrados en 10 años sobre esos 1.000 €. El crecimiento del dividendo parte capado al 12% y decae gradualmente hasta el 3% (más realista que un crecimiento constante).'],
    ['Recuperación (rX)', 'Año en el que la suma de dividendos cobrados iguala la inversión inicial. Cuanto antes, mejor.'],
  ]},
  { group: 'Ordenación', items: [
    ['⭐ Calidad DGI', 'Modo que ordena por calidad: ⭐ Nota (Score DGI), 💰 Rentables (total de dividendos a 10 años), 🎯 Baratas (margen de seguridad) y 💎 Dividendo (calidad del dividendo).'],
    ['🏦 Renta DGI', 'Modo enfocado en renta: 🏦 Renta (yield neto + recuperación), 📈 Yield neto (tras retenciones) y ⏱ Recuperación (años hasta recuperar la inversión vía dividendos).'],
    ['📉 Erosión', 'Las empresas con señales de erosión del foso pierden 1,0 punto en la nota. Las valoraciones no fiables (MoS extremo) se excluyen del orden 🎯 Baratas.'],
  ]},
]

function HelpGuide() {
  return (
    <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 12, padding: '18px 20px', marginBottom: 16 }}>
      <p style={{ fontSize: 14, fontWeight: 800, color: '#e0e8f0', marginBottom: 4 }}>Guía de métricas</p>
      <p style={{ fontSize: 12, color: '#4a5270', marginBottom: 18 }}>Qué significa cada dato y badge que ves en las tarjetas.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
        {GUIDE.map(sec => (
          <div key={sec.group}>
            <p style={{ fontSize: 10, fontWeight: 700, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>{sec.group}</p>
            <div style={{ display: 'grid', gap: 12 }}>
              {sec.items.map(([term, desc]) => (
                <div key={term}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: '#c8d0e0', marginBottom: 2 }}>{term}</p>
                  <p style={{ fontSize: 11.5, color: '#8090a8', lineHeight: 1.5 }}>{desc}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
