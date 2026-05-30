'use client'
import { useState, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { getCountry } from '@/lib/helpers'

// ── Opciones de filtros ────────────────────────────────────────────────────

const YIELD_OPTS  = [{ v: 0, l: 'Todos' }, { v: 0.02, l: '>2%' }, { v: 0.03, l: '>3%' }, { v: 0.04, l: '>4%' }, { v: 0.05, l: '>5%' }]
const ZONA_OPTS   = [{ v: 'all', l: 'Todas' }, { v: 'América', l: 'América' }, { v: 'Europa', l: 'Europa' }, { v: 'Asia', l: 'Asia' }, { v: 'Oceanía', l: 'Oceanía' }]
const SCORE_OPTS  = [{ v: 0, l: 'Todos' }, { v: 5, l: '>5' }, { v: 6, l: '>6' }, { v: 7, l: '>7' }, { v: 8, l: '>8' }]
const STREAK_OPTS = [{ v: 0, l: 'Todos' }, { v: 5, l: '>5a' }, { v: 10, l: '>10a' }, { v: 25, l: '>25a' }, { v: 35, l: '>35a' }]
const CAGR_OPTS   = [{ v: 0, l: 'Todos' }, { v: 5, l: '>5%' }, { v: 7, l: '>7%' }, { v: 10, l: '>10%' }, { v: 12, l: '>12%' }]
const DEBT_OPTS   = [{ v: 99, l: 'Todos' }, { v: 1, l: '<1x' }, { v: 2, l: '<2x' }, { v: 3, l: '<3x' }]
const ROIC_OPTS   = [{ v: 0, l: 'Todos' }, { v: 10, l: '>10%' }, { v: 15, l: '>15%' }, { v: 20, l: '>20%' }]
const MOAT_OPTS   = [{ v: 'all', l: 'Todos' }, { v: 'wide', l: 'Ancho' }, { v: 'narrow', l: 'Estrecho' }]

const PAGE_SIZE = 50

function scoreColor(s) {
  if (s == null) return '#2e3a55'
  if (s >= 7) return '#34d399'
  if (s >= 4) return '#fbbf24'
  return '#f87171'
}

// ── Chip group ─────────────────────────────────────────────────────────────

function Chips({ label, opts, value, onChange, locked, soon }) {
  const [tip, setTip] = useState(false)

  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 5 }}>
        <p style={{ fontSize: 10, fontWeight: 700, color: locked ? '#2e3a55' : '#4a5270', textTransform: 'uppercase', letterSpacing: '0.1em', whiteSpace: 'nowrap' }}>
          {label}
        </p>
        {locked && !soon && (
          <span style={{ fontSize: 9, fontWeight: 700, color: '#6366f1', background: 'rgba(99,102,241,0.12)', padding: '1px 6px', borderRadius: 4, letterSpacing: '0.08em' }}>
            PREMIUM
          </span>
        )}
        {soon && (
          <span style={{ fontSize: 9, color: '#2e3a55', padding: '1px 5px', background: 'rgba(255,255,255,0.04)', borderRadius: 4 }}>
            próximamente
          </span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', position: 'relative' }}>
        {opts.map(o => {
          const active = value === o.v
          const disabled = locked || soon
          return (
            <button
              key={o.v}
              onClick={() => {
                if (soon) return
                if (locked) { setTip(true); setTimeout(() => setTip(false), 2200); return }
                onChange(o.v)
              }}
              style={{
                fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1px solid',
                borderColor: active && !disabled ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.07)',
                background:  active && !disabled ? 'rgba(99,102,241,0.2)' : 'transparent',
                color: disabled ? '#2a3045' : (active ? '#818cf8' : '#4a5270'),
                cursor: disabled ? (soon ? 'default' : 'not-allowed') : 'pointer',
                fontFamily: 'inherit', fontWeight: active ? 700 : 400,
                opacity: soon ? 0.35 : 1,
              }}
            >
              {o.l}
            </button>
          )
        })}
        {tip && (
          <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 6, zIndex: 10, background: '#1a2035', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 8, padding: '8px 12px', whiteSpace: 'nowrap' }}>
            <p style={{ fontSize: 12, color: '#c8d0e0', marginBottom: 4 }}>Función exclusiva para Premium</p>
            <Link href="/pricing" style={{ fontSize: 11, color: '#818cf8', textDecoration: 'none', fontWeight: 700 }}>Ver planes →</Link>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Sector select ──────────────────────────────────────────────────────────

function SectorSelect({ sectors, value, onChange }) {
  return (
    <div style={{ minWidth: 0 }}>
      <p style={{ fontSize: 10, fontWeight: 700, color: '#4a5270', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 5 }}>
        Sector
      </p>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          fontSize: 11, padding: '4px 10px', borderRadius: 6,
          border: '1px solid rgba(255,255,255,0.1)',
          background: '#0d1424', color: '#6a7090',
          fontFamily: 'inherit', cursor: 'pointer', outline: 'none',
        }}
      >
        <option value="all">Todos los sectores</option>
        {sectors.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
    </div>
  )
}

// ── Columna ordenable ──────────────────────────────────────────────────────

function SortTh({ col, label, sort, onSort, align = 'right', style = {} }) {
  const active = sort.col === col
  return (
    <th
      onClick={() => onSort(col)}
      style={{
        textAlign: align, padding: '9px 10px', fontSize: 10, fontWeight: 700,
        color: active ? '#818cf8' : '#3a4260',
        textTransform: 'uppercase', letterSpacing: '0.08em',
        cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', ...style,
      }}
    >
      {label} {active ? (sort.dir === 'desc' ? '↓' : '↑') : ''}
    </th>
  )
}

// ── Fila de resultado ──────────────────────────────────────────────────────

function Row({ co }) {
  const ct = getCountry(co.c)
  return (
    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.025)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      <td style={{ padding: '10px 10px', maxWidth: 200 }}>
        <Link href={`/empresa/${encodeURIComponent(co.t)}`} style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
          <span style={{ fontSize: 14, flexShrink: 0 }}>{ct?.flag || '🌐'}</span>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#d0d8e8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {co.n}
            </p>
            <p style={{ fontSize: 10, color: '#2e3a55', whiteSpace: 'nowrap' }}>{ct?.name || co.c}</p>
          </div>
        </Link>
      </td>
      <td style={{ padding: '10px 10px', textAlign: 'left' }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: '#818cf8', background: 'rgba(99,102,241,0.12)', padding: '2px 7px', borderRadius: 5 }}>
          {co.t}
        </span>
      </td>
      <td style={{ padding: '10px 10px', textAlign: 'left' }}>
        <span style={{ fontSize: 11, color: '#4a5270' }}>{co.s}</span>
      </td>
      <td style={{ padding: '10px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
        {co.y != null
          ? <span style={{ fontSize: 12, fontWeight: 700, color: co.y >= 0.04 ? '#34d399' : co.y >= 0.02 ? '#86efac' : '#8090a8' }}>
              {(co.y * 100).toFixed(2)}%
            </span>
          : <span style={{ fontSize: 11, color: '#2e3a55' }}>—</span>
        }
      </td>
      <td style={{ padding: '10px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
        {co.sc != null
          ? <span style={{ fontSize: 13, fontWeight: 900, color: scoreColor(co.sc) }}>{co.sc.toFixed(1)}</span>
          : <span style={{ fontSize: 11, color: '#2e3a55' }}>—</span>
        }
      </td>
      <td style={{ padding: '10px 10px', textAlign: 'right' }}>
        <span style={{ fontSize: 11, color: '#2e3a55' }}>—</span>
      </td>
      <td style={{ padding: '10px 10px', textAlign: 'right' }}>
        <span style={{ fontSize: 11, color: '#2e3a55' }}>—</span>
      </td>
    </tr>
  )
}

// ── Componente principal ───────────────────────────────────────────────────

const INIT_FILTERS = {
  yield: 0, zona: 'all', sector: 'all',
  score: 0, streak: 0, cagr: 0, debt: 99, roic: 0, moat: 'all',
}

export default function ScreenerClient({ companies = [], isPremium = false, sectors = [] }) {
  const [filters, setFilters] = useState(INIT_FILTERS)
  const [sort,    setSort]    = useState({ col: 'sc', dir: 'desc' })
  const [page,    setPage]    = useState(1)
  const [search,  setSearch]  = useState('')

  const set = useCallback((key, val) => {
    setFilters(f => ({ ...f, [key]: val }))
    setPage(1)
  }, [])

  const onSort = useCallback((col) => {
    setSort(s => s.col === col ? { col, dir: s.dir === 'desc' ? 'asc' : 'desc' } : { col, dir: 'desc' })
    setPage(1)
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return companies.filter(co => {
      if (q && !co.n.toLowerCase().includes(q) && !co.t.toLowerCase().includes(q)) return false
      if (filters.yield  > 0          && (co.y  == null || co.y  <  filters.yield))  return false
      if (filters.zona  !== 'all'     && co.r !== filters.zona)                       return false
      if (filters.sector !== 'all'    && co.s !== filters.sector)                     return false
      if (isPremium && filters.score  > 0 && (co.sc == null || co.sc < filters.score)) return false
      // streak, cagr, debt, roic, moat: no data yet → always pass
      return true
    })
  }, [companies, filters, isPremium, search])

  const sorted = useMemo(() => {
    const arr = [...filtered]
    const { col, dir } = sort
    arr.sort((a, b) => {
      const va = a[col] ?? (dir === 'desc' ? -Infinity : Infinity)
      const vb = b[col] ?? (dir === 'desc' ? -Infinity : Infinity)
      if (typeof va === 'string') return dir === 'desc' ? vb.localeCompare(va) : va.localeCompare(vb)
      return dir === 'desc' ? vb - va : va - vb
    })
    return arr
  }, [filtered, sort])

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE)
  const pageRows   = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const withData   = companies.filter(c => c.y != null).length

  const activeCount = Object.entries(filters).filter(([k, v]) =>
    (k === 'yield'  && v > 0) || (k === 'zona'   && v !== 'all') ||
    (k === 'sector' && v !== 'all') || (k === 'score' && v > 0 && isPremium)
  ).length

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px 80px' }}>

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, color: '#e0e8f0', marginBottom: 4 }}>Screener DGI</h1>
        <p style={{ fontSize: 12, color: '#3a4260' }}>
          {companies.length.toLocaleString('es-ES')} empresas de {43} mercados
          {withData > 0 && <> · <span style={{ color: '#4a5270' }}>{withData.toLocaleString('es-ES')} con datos fundamentales</span></>}
        </p>
      </div>

      {/* Buscador */}
      <div style={{ position: 'relative', marginBottom: 16 }}>
        <span style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: '#3a4260', pointerEvents: 'none' }}>⌕</span>
        <input
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
          placeholder="Buscar por nombre o ticker…"
          style={{
            width: '100%', paddingLeft: 36, paddingRight: 16, paddingTop: 10, paddingBottom: 10,
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 9, color: '#e0e8f0', fontSize: 13, outline: 'none',
            fontFamily: 'inherit', boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Panel de filtros */}
      <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '16px 18px', marginBottom: 16 }}>

        {/* Filtros gratuitos */}
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 14 }}>
          <Chips label="Yield" opts={YIELD_OPTS}  value={filters.yield}  onChange={v => set('yield', v)} />
          <Chips label="Zona"  opts={ZONA_OPTS}   value={filters.zona}   onChange={v => set('zona',  v)} />
          <SectorSelect sectors={sectors} value={filters.sector} onChange={v => set('sector', v)} />
        </div>

        {/* Divisor premium */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.05)' }} />
          <span style={{ fontSize: 10, fontWeight: 700, color: '#6366f1', letterSpacing: '0.1em' }}>PREMIUM</span>
          <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.05)' }} />
        </div>

        {/* Filtros premium */}
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          <Chips label="Score DGI"    opts={SCORE_OPTS}  value={filters.score}  onChange={v => set('score', v)}  locked={!isPremium} />
          <Chips label="Racha"        opts={STREAK_OPTS} value={filters.streak} onChange={v => set('streak', v)} locked={!isPremium} soon={true} />
          <Chips label="CAGR Div 5A"  opts={CAGR_OPTS}   value={filters.cagr}   onChange={v => set('cagr', v)}   locked={!isPremium} soon={true} />
          <Chips label="Deuda/EBITDA" opts={DEBT_OPTS}   value={filters.debt}   onChange={v => set('debt', v)}   locked={!isPremium} soon={true} />
          <Chips label="ROIC"         opts={ROIC_OPTS}   value={filters.roic}   onChange={v => set('roic', v)}   locked={!isPremium} soon={true} />
          <Chips label="Foso"         opts={MOAT_OPTS}   value={filters.moat}   onChange={v => set('moat', v)}   locked={!isPremium} soon={true} />
        </div>
      </div>

      {/* Contador + limpiar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <p style={{ fontSize: 12, color: filtered.length > 0 ? '#4a5270' : '#f87171' }}>
          <span style={{ fontWeight: 700, color: filtered.length > 0 ? '#c8d0e0' : '#f87171', fontSize: 14 }}>
            {filtered.length.toLocaleString('es-ES')}
          </span>
          {' '}empresa{filtered.length !== 1 ? 's' : ''} encontrada{filtered.length !== 1 ? 's' : ''}
          {totalPages > 1 && <span style={{ color: '#2e3a55' }}> · pág. {page}/{totalPages}</span>}
        </p>
        {(activeCount > 0 || search) && (
          <button
            onClick={() => { setFilters(INIT_FILTERS); setSearch(''); setPage(1) }}
            style={{ fontSize: 11, color: '#4a5270', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline' }}
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {/* Tabla */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#3a4260', fontSize: 14 }}>
          Sin resultados con los filtros actuales.
        </div>
      ) : (
        <div style={{ overflowX: 'auto', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 680 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }}>
                <SortTh col="n"  label="Empresa"       sort={sort} onSort={onSort} align="left"  style={{ paddingLeft: 14 }} />
                <SortTh col="t"  label="Ticker"        sort={sort} onSort={onSort} align="left" />
                <SortTh col="s"  label="Sector"        sort={sort} onSort={onSort} align="left" />
                <SortTh col="y"  label="Yield"         sort={sort} onSort={onSort} />
                <SortTh col="sc" label="Score DGI"     sort={sort} onSort={onSort} />
                <th style={{ textAlign: 'right', padding: '9px 10px', fontSize: 10, color: '#2a3045', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>
                  Racha 🔒
                </th>
                <th style={{ textAlign: 'right', padding: '9px 10px', fontSize: 10, color: '#2a3045', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>
                  CAGR 5A 🔒
                </th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((co, i) => <Row key={`${co.t}-${i}`} co={co} />)}
            </tbody>
          </table>
        </div>
      )}

      {/* Paginación */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 20 }}>
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', background: 'transparent', color: page === 1 ? '#2a3045' : '#6a7090', cursor: page === 1 ? 'default' : 'pointer', fontFamily: 'inherit', fontSize: 12 }}>
            ← Anterior
          </button>
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            const n = Math.max(1, Math.min(page - 2, totalPages - 4)) + i
            return (
              <button key={n} onClick={() => setPage(n)} style={{
                width: 34, height: 34, borderRadius: 8, fontFamily: 'inherit',
                border: '1px solid ' + (page === n ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.07)'),
                background: page === n ? 'rgba(99,102,241,0.2)' : 'transparent',
                color: page === n ? '#818cf8' : '#4a5270', cursor: 'pointer',
                fontSize: 12, fontWeight: page === n ? 700 : 400,
              }}>{n}</button>
            )
          })}
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', background: 'transparent', color: page === totalPages ? '#2a3045' : '#6a7090', cursor: page === totalPages ? 'default' : 'pointer', fontFamily: 'inherit', fontSize: 12 }}>
            Siguiente →
          </button>
        </div>
      )}

      {/* CTA upgrade */}
      {!isPremium && (
        <div style={{ marginTop: 32, padding: '16px 20px', background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#c8d0e0', marginBottom: 3 }}>
              Desbloquea Score DGI, racha, CAGR y más filtros
            </p>
            <p style={{ fontSize: 12, color: '#4a5270' }}>
              Filtra por calidad DGI real con datos fundamentales de los 43 mercados.
            </p>
          </div>
          <Link href="/pricing" style={{
            fontSize: 13, fontWeight: 700, color: '#fff', textDecoration: 'none',
            background: '#6366f1', padding: '9px 20px', borderRadius: 8, flexShrink: 0,
          }}>
            Ver Premium →
          </Link>
        </div>
      )}
    </div>
  )
}
