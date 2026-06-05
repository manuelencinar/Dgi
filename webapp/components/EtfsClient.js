'use client'
import { useState, useMemo } from 'react'
import Link from 'next/link'

// TER almacenado como decimal (0.0006 = 0.06%). Se muestra siempre como %.
function terPct(t) { return t == null ? null : t * 100 }
function terColor(t) { const p = terPct(t); return p == null ? '#4a5270' : p < 0.20 ? '#34d399' : p <= 0.50 ? '#fbbf24' : '#f87171' }

function Skeleton({ w = 42 }) {
  return <span style={{ display: 'inline-block', width: w, height: 12, borderRadius: 4, verticalAlign: 'middle', background: 'rgba(255,255,255,0.06)', backgroundImage: 'linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.12) 50%, rgba(255,255,255,0.04) 75%)', backgroundSize: '200% 100%', animation: 'etf-shimmer 1.4s ease-in-out infinite' }} />
}

// Celda de rentabilidad con comparativa inline vs benchmark
function ReturnCell({ etf, bench, benchName }) {
  if (etf == null) return <span style={{ fontSize: 12, color: '#4a5270' }}>Sin datos</span>
  const beats = bench != null && etf >= bench
  const etfColor = bench == null ? '#c8d0e0' : beats ? '#34d399' : '#fb923c'
  return (
    <div>
      <p style={{ fontSize: 12, fontWeight: 700, color: etfColor }}>{(etf >= 0 ? '+' : '') + etf.toFixed(1) + '%'}</p>
      {bench != null && (
        <p style={{ fontSize: 10, color: '#4a5270' }}>{(bench >= 0 ? '+' : '') + bench.toFixed(1) + '%'} {benchName || ''}</p>
      )}
    </div>
  )
}

export default function EtfsClient({ initialFunds }) {
  const [funds, setFunds] = useState(initialFunds)
  const [search, setSearch] = useState('')
  const [lookupState, setLookupState] = useState('idle')
  const [lookupMsg, setLookupMsg] = useState('')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return funds
    return funds.filter(f => (f.name || '').toLowerCase().includes(q) || f.ticker.toLowerCase().includes(q))
  }, [funds, search])

  const etfs  = filtered.filter(f => (f.asset_type || 'etf') !== 'fund')
  const onlyFunds = filtered.filter(f => f.asset_type === 'fund')

  const searchYahoo = async () => {
    const tk = search.trim().toUpperCase()
    if (!tk) return
    setLookupState('loading'); setLookupMsg('')
    try {
      const res = await fetch('/api/fund/lookup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticker: tk, assetType: 'etf' }) })
      const data = await res.json()
      if (!res.ok) { setLookupState('idle'); setLookupMsg('No encontrado en Yahoo Finance.'); return }
      const f = data.fund
      setFunds(prev => prev.some(x => x.ticker === f.ticker) ? prev.map(x => x.ticker === f.ticker ? f : x) : [...prev, f])
      setLookupState('idle'); setLookupMsg(`✓ ${f.name} añadido a la lista`)
    } catch { setLookupState('idle'); setLookupMsg('Error en la búsqueda.') }
  }

  return (
    <div style={{ maxWidth: 1040, margin: '0 auto', padding: '24px 16px 64px' }}>
      <style>{`@keyframes etf-shimmer { 0% { background-position: 200% 0 } 100% { background-position: -200% 0 } }`}</style>

      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, color: '#e0e8f0', marginBottom: 4 }}>ETFs DGI</h1>
        <p style={{ fontSize: 13, color: '#4a5270' }}>ETFs de dividendos de referencia. Añade cualquiera a tu cartera o busca otros por ticker.</p>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <input value={search} onChange={e => { setSearch(e.target.value); setLookupMsg('') }} placeholder="Buscar por nombre o ticker (ej: SCHD)…"
          style={{ flex: 1, minWidth: 220, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 9, padding: '10px 14px', color: '#e0e8f0', fontSize: 13, outline: 'none' }} />
        {filtered.length === 0 && search.trim() && (
          <button onClick={searchYahoo} disabled={lookupState === 'loading'} style={{ padding: '10px 18px', background: 'rgba(99,102,241,0.85)', border: 'none', borderRadius: 9, color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
            {lookupState === 'loading' ? 'Buscando…' : 'Buscar en Yahoo'}
          </button>
        )}
      </div>
      {lookupMsg && <p style={{ fontSize: 12, color: lookupMsg.startsWith('✓') ? '#34d399' : '#fbbf24', marginBottom: 12 }}>{lookupMsg}</p>}

      <Section title="ETFs" rows={etfs} kind="etf" accent="#60a5fa"
        empty="No hay ETFs precargados. Ejecuta la migración SQL de funds." />
      {etfs.length > 0 && (
        <p style={{ fontSize: 11, color: '#3a4260', marginTop: -16, marginBottom: 28 }}>
          Los precios se actualizan diariamente. Si un ETF muestra datos pendientes es porque se añadió recientemente.
        </p>
      )}

      <Section title="Fondos de inversión añadidos por usuarios" rows={onlyFunds} kind="fund" accent="#a78bfa"
        empty="Aún no hay fondos añadidos por usuarios." />
      <p style={{ fontSize: 12, color: '#4a5270', marginTop: -16 }}>
        ¿Tienes un fondo en cartera? Añádelo desde tu cartera y quedará disponible para todos los usuarios.
      </p>
    </div>
  )
}

function Section({ title, rows, kind, accent, empty }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <p style={{ fontSize: 13, fontWeight: 800, color: '#c8d0e0', marginBottom: 10 }}>
        {title} <span style={{ fontSize: 11, color: '#4a5270', fontWeight: 400 }}>({rows.length})</span>
      </p>
      {rows.length === 0 ? (
        <p style={{ fontSize: 13, color: '#4a5270', padding: '20px 0' }}>{empty}</p>
      ) : (
        <div style={{ overflowX: 'auto', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }}>
                {[kind === 'fund' ? 'Fondo' : 'ETF', 'Precio', 'TER', 'Yield TTM', 'Rentab. 1A', 'Rentab. 3A', 'Benchmark', ''].map(h => (
                  <th key={h} style={{ padding: '10px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#3a4260', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(f => (
                <tr key={f.ticker} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '10px' }}>
                    <Link href={`/fondo/${encodeURIComponent(f.ticker)}`} style={{ color: '#d0d8e8', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>{f.name || f.ticker}</Link>
                    <p style={{ fontSize: 10, color: '#2e3a55' }}><span style={{ color: accent, fontWeight: 700 }}>{f.ticker}</span>{f.category ? ' · ' + f.category : ''}</p>
                  </td>
                  <td style={{ padding: '10px', fontSize: 12, color: '#c8d0e0' }}>{f.current_price != null ? f.current_price + ' ' + (f.currency || '') : <Skeleton w={48} />}</td>
                  <td style={{ padding: '10px', fontSize: 12, fontWeight: 700, color: terColor(f.ter) }}>{f.ter != null ? terPct(f.ter).toFixed(2) + '%' : <Skeleton w={36} />}</td>
                  <td style={{ padding: '10px', fontSize: 12, fontWeight: 700, color: '#34d399' }}>{f.yield_ttm != null ? f.yield_ttm + '%' : <Skeleton w={40} />}</td>
                  <td style={{ padding: '10px' }}><ReturnCell etf={f.return_1y} bench={f.benchmark_return_1y} benchName={f.benchmark_name} /></td>
                  <td style={{ padding: '10px' }}><ReturnCell etf={f.return_3y} bench={f.benchmark_return_3y} benchName={f.benchmark_name} /></td>
                  <td style={{ padding: '10px', fontSize: 11, color: '#8090a8' }}>{f.benchmark_name || '—'}</td>
                  <td style={{ padding: '10px' }}>
                    <Link href={`/cartera/nueva-posicion?ticker=${encodeURIComponent(f.ticker)}&type=${kind}`} style={{ fontSize: 11, fontWeight: 700, color: '#818cf8', background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 7, padding: '5px 12px', textDecoration: 'none', whiteSpace: 'nowrap' }}>
                      + Cartera
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
