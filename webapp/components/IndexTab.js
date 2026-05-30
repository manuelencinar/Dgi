'use client'
import { useState, useMemo } from 'react'
import { DICT } from '@/data/dict'
import { SECTORS } from '@/lib/sectors'
import { getCountry, sC, gM, is1010, streakBadge, detectMoat, calcDivQuality } from '@/lib/helpers'
import UpgradeModal from './UpgradeModal'

const PAGE_SIZE = 50

const SECTOR_COLORS = {
  'Technology':             '#818cf8',
  'Healthcare':             '#34d399',
  'Financial Services':     '#a78bfa',
  'Industrials':            '#fb923c',
  'Consumer Defensive':     '#2dd4bf',
  'Consumer Cyclical':      '#fbbf24',
  'Utilities':              '#67e8f9',
  'Energy':                 '#f59e0b',
  'Real Estate':            '#f472b6',
  'Basic Materials':        '#a3e635',
  'Communication Services': '#c084fc',
}

// ~5% de tickers son gratuitos, siempre los mismos (hash determinista)
function isFreeCompany(ticker) {
  const hash = [...(ticker||'')].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 0)
  return (hash % 20) === 0
}

function Stat({ label, value }) {
  return (
    <div>
      <p style={{ fontSize: 10, color: '#3a4260', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 3 }}>{label}</p>
      <div style={{ fontSize: 13, color: '#c8d0e0' }}>{value}</div>
    </div>
  )
}

function CompanyDetail({ co }) {
  const sc = SECTORS[co.sector] || SECTORS.general
  const ct = getCountry(co.country)
  const col = SECTOR_COLORS[co.superSector] || sc.color
  const metrics = gM(co.sector)

  return (
    <div style={{
      padding: '16px 18px', background: 'rgba(99,102,241,0.05)',
      border: '1px solid rgba(99,102,241,0.15)', borderTop: 'none',
      borderRadius: '0 0 10px 10px',
    }}>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 14 }}>
        <Stat label="País" value={<span>{ct?.flag} {ct?.name || co.country}</span>}/>
        <Stat label="Sector" value={<span style={{ color: col }}>{co.superSector}</span>}/>
        <Stat label="Industria" value={<span style={{ color: '#8090a8' }}>{co.sectorName}</span>}/>
        <Stat label="Divisa" value={<span style={{ color: '#8090a8' }}>{co.currency}</span>}/>
        {co.values?.yield_pct != null && <Stat label="Yield" value={<span style={{ color: '#34d399' }}>{co.values.yield_pct}%</span>}/>}
        {co.values?.div_years != null && <Stat label="Años dividendo" value={co.values.div_years}/>}
        {co.values?.div_cagr5 != null && <Stat label="CAGR div. 5A" value={co.values.div_cagr5 + '%'}/>}
      </div>

      {co.scores && Object.keys(co.scores).length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 4 }}>
          {metrics.map(m => {
            const s = co.scores[m.id]
            if(s == null) return null
            return (
              <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#4a5270', padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <span>{m.label}</span>
                <span style={{ color: sC(s), fontWeight: 700 }}>{s}/10</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function CompanyRow({ co, rank, isPremium, onUpgrade }) {
  const [open, setOpen] = useState(false)
  const showFull = isPremium || isFreeCompany(co.ticker)
  const sc  = SECTORS[co.sector] || SECTORS.general
  const ct  = getCountry(co.country)
  const col = SECTOR_COLORS[co.superSector] || sc.color

  const moat   = detectMoat(co)
  const the1010 = is1010(co)
  const streak = streakBadge(co.values?.div_years)
  const dq     = calcDivQuality(co)

  function handleClick() {
    if(showFull) setOpen(o => !o)
    else onUpgrade()
  }

  return (
    <div>
      <div
        onClick={handleClick}
        style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
          background: open ? 'rgba(99,102,241,0.08)' : 'rgba(255,255,255,0.025)',
          borderRadius: open ? '10px 10px 0 0' : 10,
          borderTop:    '1px solid ' + (open ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.05)'),
          borderRight:  '1px solid ' + (open ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.05)'),
          borderBottom: open ? 'none' : '1px solid rgba(255,255,255,0.05)',
          borderLeft:   `3px solid ${col}`,
          cursor: 'pointer',
        }}
        onMouseEnter={e => { if(!open) e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
        onMouseLeave={e => { if(!open) e.currentTarget.style.background = 'rgba(255,255,255,0.025)' }}
      >
        {/* Rank */}
        <span style={{ fontSize: 11, color: '#3a4260', width: 24, textAlign: 'right', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
          {co.score != null ? rank : '—'}
        </span>

        {/* Flag */}
        <span style={{ fontSize: 15, flexShrink: 0 }}>{ct?.flag || '🌐'}</span>

        {/* Nombre + badges + sector */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
            <span style={{
              fontSize: 13, fontWeight: 700, color: '#d0d8e8',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              maxWidth: 160,
              filter: showFull ? 'none' : 'blur(6px)',
              userSelect: showFull ? 'auto' : 'none',
            }}>
              {co.name}
            </span>
            {streak && (
              <span style={{ fontSize: 11, lineHeight: 1 }} title={`${co.values?.div_years} años de dividendo creciente`}>
                {streak}
              </span>
            )}
            {moat && (
              <span style={{ fontSize: 11, lineHeight: 1 }} title={moat.width === 'wide' ? 'Foso ancho' : 'Foso estrecho'}>
                {moat.width === 'wide' ? '🏰' : '🧱'}
              </span>
            )}
            {the1010 && (
              <span style={{ fontSize: 9, color: '#fbbf24', background: 'rgba(251,191,36,0.12)', padding: '1px 4px', borderRadius: 3, lineHeight: 1.4 }} title="Regla 10/10: yield+CAGR≥10%">
                ⚡
              </span>
            )}
          </div>
          <p style={{ fontSize: 11, color: '#3a4260', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>
            {co.sectorName}
          </p>
        </div>

        {/* Ticker */}
        <span style={{ fontSize: 11, fontWeight: 800, color: '#818cf8', background: 'rgba(99,102,241,0.12)', padding: '3px 7px', borderRadius: 5, flexShrink: 0 }}>
          {co.ticker}
        </span>

        {/* Score + Div quality */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0, minWidth: 36 }}>
          <span style={{ fontSize: 17, fontWeight: 900, color: co.score != null ? sC(co.score) : '#2a3045', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
            {co.score != null ? co.score.toFixed(1) : '—'}
          </span>
          {dq != null && (
            <span style={{ fontSize: 9, fontWeight: 700, color: '#a78bfa', lineHeight: 1.4 }}>💎{dq}</span>
          )}
        </div>

        {/* Lock / chevron */}
        <span style={{ fontSize: showFull ? 11 : 13, color: '#3a4260', flexShrink: 0, width: 14, textAlign: 'center' }}>
          {showFull ? (open ? '▲' : '▼') : '🔒'}
        </span>
      </div>

      {open && showFull && <CompanyDetail co={co}/>}
    </div>
  )
}

export default function IndexTab({ scoresMap, plan }) {
  const [search, setSearch]       = useState('')
  const [page, setPage]           = useState(1)
  const [showUpgrade, setShowUpgrade] = useState(false)
  const isPremium = plan === 'premium'

  const companies = useMemo(() => {
    const seen = new Set()
    return DICT
      .filter(d => { if (seen.has(d[1])) return false; seen.add(d[1]); return true })
      .map(d => ({
        name: d[0], ticker: d[1], country: d[2], currency: d[3],
        superSector: d[4], sectorName: d[5], sector: d[6],
        score:  scoresMap[d[1]]?.score  ?? null,
        scores: scoresMap[d[1]]?.scores ?? {},
        values: scoresMap[d[1]]?.values ?? {},
      })).sort((a, b) => {
      if(a.score === null && b.score === null) return 0
      if(a.score === null) return 1
      if(b.score === null) return -1
      return b.score - a.score
    })
  }, [scoresMap])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if(!q) return companies
    return companies.filter(c =>
      c.name.toLowerCase().includes(q) || c.ticker.toLowerCase().includes(q)
    )
  }, [companies, search])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const pageItems  = filtered.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE)
  const offset     = (page-1)*PAGE_SIZE
  const scoredCount = Object.values(scoresMap).filter(v => v.score != null).length

  return (
    <div>
      {showUpgrade && <UpgradeModal onClose={() => setShowUpgrade(false)}/>}

      {/* Stats */}
      <div style={{ display: 'flex', gap: 24, marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <p style={{ fontSize: 22, fontWeight: 900, color: '#e0e8f0', lineHeight: 1 }}>{companies.length.toLocaleString('es-ES')}</p>
          <p style={{ fontSize: 10, color: '#3a4260', marginTop: 3 }}>empresas en el índice</p>
        </div>
        {scoredCount > 0 && (
          <div>
            <p style={{ fontSize: 22, fontWeight: 900, color: '#818cf8', lineHeight: 1 }}>{scoredCount.toLocaleString('es-ES')}</p>
            <p style={{ fontSize: 10, color: '#3a4260', marginTop: 3 }}>con puntuación DGI</p>
          </div>
        )}
        {!isPremium && (
          <div style={{ marginLeft: 'auto', alignSelf: 'center' }}>
            <button onClick={() => setShowUpgrade(true)} style={{
              fontSize: 11, fontWeight: 700, color: '#818cf8',
              background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)',
              borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontFamily: 'inherit',
            }}>
              ⚡ Ver Premium
            </button>
          </div>
        )}
      </div>

      {/* Buscador */}
      <div style={{ position: 'relative', marginBottom: 14 }}>
        <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 14, pointerEvents: 'none' }}>🔍</span>
        <input
          value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
          placeholder="Buscar empresa o ticker…"
          style={{ width: '100%', paddingLeft: 36, paddingRight: 14, paddingTop: 10, paddingBottom: 10, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#fff', fontSize: 13, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
        />
      </div>

      {/* Cabecera */}
      <div style={{ display: 'flex', gap: 10, padding: '4px 14px', marginBottom: 4, fontSize: 10, color: '#2a3045', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        <span style={{ width: 24, textAlign: 'right' }}>#</span>
        <span style={{ width: 22 }}/>
        <span style={{ flex: 1 }}>Empresa</span>
        <span>Ticker</span>
        <span style={{ minWidth: 36, textAlign: 'right' }}>Score</span>
        <span style={{ width: 14 }}/>
      </div>

      {/* Lista */}
      <div style={{ display: 'grid', gap: 4 }}>
        {pageItems.map((co, i) => (
          <CompanyRow
            key={co.ticker}
            co={co}
            rank={offset + i + 1}
            isPremium={isPremium}
            onUpgrade={() => setShowUpgrade(true)}
          />
        ))}
      </div>

      {/* Paginación */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 24 }}>
          <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page===1}
            style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: page===1?'#2a3045':'#6a7090', cursor: page===1?'default':'pointer', fontFamily: 'inherit', fontSize: 12 }}>
            ← Anterior
          </button>
          {Array.from({length: Math.min(5, totalPages)}, (_, i) => {
            const n = Math.max(1, Math.min(page-2, totalPages-4)) + i
            return (
              <button key={n} onClick={() => setPage(n)} style={{ width: 36, height: 36, borderRadius: 8, border: '1px solid '+(page===n?'rgba(99,102,241,0.5)':'rgba(255,255,255,0.08)'), background: page===n?'rgba(99,102,241,0.25)':'rgba(255,255,255,0.03)', color: page===n?'#818cf8':'#4a5270', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: page===n?700:400 }}>
                {n}
              </button>
            )
          })}
          <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page===totalPages}
            style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: page===totalPages?'#2a3045':'#6a7090', cursor: page===totalPages?'default':'pointer', fontFamily: 'inherit', fontSize: 12 }}>
            Siguiente →
          </button>
        </div>
      )}
    </div>
  )
}
