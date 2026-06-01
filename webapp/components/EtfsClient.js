'use client'
import { useState, useMemo } from 'react'
import Link from 'next/link'

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

  const terColor = t => t == null ? '#4a5270' : t < 0.20 ? '#34d399' : t <= 0.50 ? '#fbbf24' : '#f87171'

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 16px 64px' }}>
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

      <div style={{ overflowX: 'auto', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }}>
              {['ETF', 'Ticker', 'Divisa', 'Precio', 'TER', 'Yield TTM', ''].map(h => (
                <th key={h} style={{ padding: '10px', textAlign: h === 'ETF' || h === 'Ticker' ? 'left' : 'left', fontSize: 10, fontWeight: 700, color: '#3a4260', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(f => (
              <tr key={f.ticker} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <td style={{ padding: '10px' }}>
                  <Link href={`/fondo/${encodeURIComponent(f.ticker)}`} style={{ color: '#d0d8e8', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>{f.name || f.ticker}</Link>
                  {f.category && <p style={{ fontSize: 10, color: '#2e3a55' }}>{f.category}</p>}
                </td>
                <td style={{ padding: '10px' }}><span style={{ fontSize: 11, fontWeight: 800, color: '#60a5fa', background: 'rgba(96,165,250,0.12)', padding: '2px 7px', borderRadius: 5 }}>{f.ticker}</span></td>
                <td style={{ padding: '10px', fontSize: 12, color: '#4a5270' }}>{f.currency}</td>
                <td style={{ padding: '10px', fontSize: 12, color: '#c8d0e0' }}>{f.current_price != null ? f.current_price : '—'}</td>
                <td style={{ padding: '10px', fontSize: 12, fontWeight: 700, color: terColor(f.ter) }}>{f.ter != null ? f.ter + '%' : '—'}</td>
                <td style={{ padding: '10px', fontSize: 12, fontWeight: 700, color: '#34d399' }}>{f.yield_ttm != null ? f.yield_ttm + '%' : '—'}</td>
                <td style={{ padding: '10px' }}>
                  <Link href={`/cartera/nueva-posicion?ticker=${encodeURIComponent(f.ticker)}&type=etf`} style={{ fontSize: 11, fontWeight: 700, color: '#818cf8', background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 7, padding: '5px 12px', textDecoration: 'none', whiteSpace: 'nowrap' }}>
                    + Cartera
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filtered.length === 0 && !search.trim() && (
        <p style={{ fontSize: 13, color: '#4a5270', textAlign: 'center', padding: '40px 0' }}>No hay ETFs precargados. Ejecuta la migración SQL de funds.</p>
      )}
    </div>
  )
}
