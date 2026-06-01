'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { DICT } from '@/data/dict'
import { weightedAvgCost } from '@/lib/portfolio'

const CARD = { background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 20 }
const INPUT = { width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '10px 12px', color: '#c8d0e0', fontSize: 14, outline: 'none', boxSizing: 'border-box' }
const LABEL = { fontSize: 12, color: '#4a5270', marginBottom: 6, display: 'block' }
const BTN_PRIMARY = { padding: '11px 24px', background: 'rgba(99,102,241,0.85)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }
const BTN_GHOST = { padding: '11px 24px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#4a5270', fontSize: 14, cursor: 'pointer' }

const ASSET_TYPES = [
  { v: 'stock', l: 'Acción' },
  { v: 'etf',   l: 'ETF' },
  { v: 'fund',  l: 'Fondo de inversión' },
]

export default function NewPositionPage() {
  const router = useRouter()
  const [assetType, setAssetType] = useState('stock')

  // Acción (búsqueda DICT)
  const [query, setQuery]       = useState('')
  const [results, setResults]   = useState([])
  const [selected, setSelected] = useState(null)  // {ticker, name, currency, assetType}

  // ETF/Fondo (lookup)
  const [lookupTicker, setLookupTicker] = useState('')
  const [lookupState, setLookupState]   = useState('idle') // idle|loading|ok|notfound
  const [fundData, setFundData]         = useState(null)
  const [manual, setManual]             = useState({ name: '', currency: 'EUR', current_price: '', annual_distribution: '' })

  const [form, setForm]   = useState({ shares: '', price: '', date: new Date().toISOString().slice(0, 10), type: 'buy', notes: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState(null)

  // Prefill desde query params (?ticker, ?type, ?shares, ?price)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const p = new URLSearchParams(window.location.search)
    const t = p.get('type'); const tk = p.get('ticker')
    if (t && ['stock', 'etf', 'fund'].includes(t)) setAssetType(t)
    if (p.get('shares')) setForm(f => ({ ...f, shares: p.get('shares') }))
    if (p.get('price'))  setForm(f => ({ ...f, price: p.get('price') }))
    if (tk) {
      if (t === 'etf' || t === 'fund') { setLookupTicker(tk) }
      else {
        const d = DICT.find(x => x[1] === tk)
        if (d) setSelected({ ticker: d[1], name: d[0], currency: d[3], assetType: 'stock' })
      }
    }
  }, [])

  const search = useCallback((q) => {
    setQuery(q)
    if (q.length < 1) { setResults([]); return }
    const lower = q.toLowerCase()
    setResults(DICT.filter(d => d[0].toLowerCase().includes(lower) || d[1].toLowerCase().includes(lower))
      .slice(0, 8).map(d => ({ ticker: d[1], name: d[0], currency: d[3] })))
  }, [])

  const selectStock = (item) => { setSelected({ ...item, assetType: 'stock' }); setQuery(item.name); setResults([]) }

  const doLookup = async () => {
    if (!lookupTicker.trim()) return
    setLookupState('loading'); setFundData(null); setSelected(null); setError(null)
    try {
      const res = await fetch('/api/fund/lookup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticker: lookupTicker, assetType }) })
      const data = await res.json()
      if (!res.ok) { setLookupState('notfound'); return }
      const f = data.fund
      setFundData(f)
      setSelected({ ticker: f.ticker, name: f.name, currency: f.currency, assetType })
      setForm(fm => ({ ...fm, price: fm.price || (f.current_price != null ? String(f.current_price) : '') }))
      setLookupState('ok')
    } catch { setLookupState('notfound') }
  }

  const saveManual = async () => {
    if (!manual.name) { setError('Nombre obligatorio'); return }
    setError(null)
    const res = await fetch('/api/fund/lookup', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticker: lookupTicker || manual.name.replace(/\s+/g, '').toUpperCase().slice(0, 12), ...manual }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error || 'Error'); return }
    const f = data.fund
    setFundData(f)
    setSelected({ ticker: f.ticker, name: f.name, currency: f.currency, assetType: 'fund' })
    setForm(fm => ({ ...fm, price: fm.price || (f.current_price != null ? String(f.current_price) : '') }))
    setLookupState('ok')
  }

  const field = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!selected) { setError('Selecciona o busca un activo'); return }
    const shares = parseFloat(form.shares), price = parseFloat(form.price)
    if (!shares || shares <= 0) { setError('Número de participaciones inválido'); return }
    if (!price || price <= 0) { setError('Precio inválido'); return }

    setSaving(true); setError(null)
    const sb = createClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) { setError('Sesión expirada'); setSaving(false); return }

    const { error: txErr } = await sb.from('transactions').insert({
      user_id: user.id, ticker: selected.ticker, type: form.type,
      shares, price, date: form.date, notes: form.notes || null,
    })
    if (txErr) { setError('Error al guardar la transacción: ' + txErr.message); setSaving(false); return }

    const { data: existing } = await sb.from('positions').select('*').eq('user_id', user.id).eq('ticker', selected.ticker).maybeSingle()

    let posErr = null
    if (form.type === 'buy') {
      if (existing) {
        const newShares = existing.shares + shares
        const newAvg = weightedAvgCost(existing.shares, existing.avg_cost, shares, price)
        ;({ error: posErr } = await sb.from('positions').update({ shares: newShares, avg_cost: newAvg, updated_at: new Date().toISOString() }).eq('id', existing.id))
      } else {
        ;({ error: posErr } = await sb.from('positions').insert({
          user_id: user.id, ticker: selected.ticker, shares, avg_cost: price,
          currency: selected.currency, asset_type: selected.assetType,
        }))
      }
    } else if (existing) {
      const remaining = existing.shares - shares
      if (remaining <= 0) ({ error: posErr } = await sb.from('positions').delete().eq('id', existing.id))
      else ({ error: posErr } = await sb.from('positions').update({ shares: remaining, updated_at: new Date().toISOString() }).eq('id', existing.id))
    }
    if (posErr) {
      const hint = /asset_type/.test(posErr.message) ? ' (falta ejecutar el SQL que añade asset_type a positions)' : ''
      setError('Error al guardar la posición: ' + posErr.message + hint); setSaving(false); return
    }

    router.push('/cartera')
  }

  const unit = assetType === 'stock' ? 'acciones' : 'participaciones'

  return (
    <div style={{ maxWidth: 540, margin: '0 auto', padding: '24px 16px 64px' }}>
      <div style={{ marginBottom: 20 }}>
        <Link href="/cartera" style={{ fontSize: 12, color: '#4a5270', textDecoration: 'none' }}>← Volver a cartera</Link>
      </div>
      <h1 style={{ fontSize: 22, fontWeight: 900, color: '#e0e8f0', marginBottom: 24 }}>Añadir operación</h1>

      <form onSubmit={handleSubmit}>
        <div style={{ ...CARD, display: 'grid', gap: 18 }}>

          {/* Selector tipo de activo */}
          <div>
            <label style={LABEL}>Tipo de activo</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {ASSET_TYPES.map(a => (
                <button key={a.v} type="button" onClick={() => { setAssetType(a.v); setSelected(null); setFundData(null); setLookupState('idle') }} style={{
                  flex: 1, padding: '8px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700,
                  border: assetType === a.v ? 'none' : '1px solid rgba(255,255,255,0.1)',
                  background: assetType === a.v ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.03)',
                  color: assetType === a.v ? '#818cf8' : '#4a5270',
                }}>{a.l}</button>
              ))}
            </div>
          </div>

          {/* Búsqueda según tipo */}
          {assetType === 'stock' ? (
            <div style={{ position: 'relative' }}>
              <label style={LABEL}>Empresa</label>
              <input style={INPUT} placeholder="Busca por nombre o ticker..." autoComplete="off" value={query} onChange={e => search(e.target.value)} />
              {results.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, background: '#10172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, overflow: 'hidden', marginTop: 4, maxHeight: 280, overflowY: 'auto' }}>
                  {results.map(r => (
                    <button key={r.ticker} type="button" onClick={() => selectStock(r)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <span style={{ fontSize: 13, color: '#c8d0e0' }}>{r.name}</span>
                      <span style={{ fontSize: 11, color: '#4a5270', marginLeft: 8, flexShrink: 0 }}>{r.ticker} · {r.currency}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div>
              <label style={LABEL}>{assetType === 'etf' ? 'Ticker de Yahoo Finance (ej: SCHD, VHYL.L, TDIV.AS)' : 'ISIN o ticker de Yahoo Finance'}</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input style={INPUT} placeholder={assetType === 'etf' ? 'SCHD' : 'IE00B...'} value={lookupTicker} onChange={e => setLookupTicker(e.target.value)} />
                <button type="button" onClick={doLookup} disabled={lookupState === 'loading'} style={{ ...BTN_PRIMARY, padding: '10px 18px', flexShrink: 0 }}>
                  {lookupState === 'loading' ? '…' : 'Buscar'}
                </button>
              </div>

              {fundData && lookupState === 'ok' && (
                <div style={{ marginTop: 10, padding: '12px', background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.2)', borderRadius: 8 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: '#c8d0e0' }}>{fundData.name}</p>
                  <p style={{ fontSize: 12, color: '#8090a8', marginTop: 4 }}>
                    Precio: {fundData.current_price != null ? `${fundData.current_price} ${fundData.currency}` : '—'}
                    {fundData.ter != null && ` · TER ${fundData.ter}%`}
                    {fundData.yield_ttm != null && ` · Yield TTM ${fundData.yield_ttm}%`}
                  </p>
                </div>
              )}

              {lookupState === 'notfound' && (
                <div style={{ marginTop: 10 }}>
                  <p style={{ fontSize: 12, color: '#fbbf24', marginBottom: assetType === 'fund' ? 10 : 0 }}>
                    No encontrado en Yahoo Finance{assetType === 'fund' ? ' — introduce los datos manualmente:' : '. Verifica el ticker.'}
                  </p>
                  {assetType === 'fund' && (
                    <div style={{ display: 'grid', gap: 8, padding: '12px', background: 'rgba(255,255,255,0.02)', borderRadius: 8 }}>
                      <input style={INPUT} placeholder="Nombre del fondo" value={manual.name} onChange={e => setManual(m => ({ ...m, name: e.target.value }))} />
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <input style={INPUT} placeholder="Divisa (EUR)" value={manual.currency} onChange={e => setManual(m => ({ ...m, currency: e.target.value.toUpperCase() }))} />
                        <input style={INPUT} type="number" step="any" placeholder="Valor liquidativo" value={manual.current_price} onChange={e => setManual(m => ({ ...m, current_price: e.target.value }))} />
                      </div>
                      <input style={INPUT} type="number" step="any" placeholder="Distribución anual (opcional)" value={manual.annual_distribution} onChange={e => setManual(m => ({ ...m, annual_distribution: e.target.value }))} />
                      <button type="button" onClick={saveManual} style={{ ...BTN_PRIMARY, padding: '9px' }}>Guardar fondo manual</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Tipo operación */}
          <div>
            <label style={LABEL}>Tipo de operación</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {['buy', 'sell'].map(t => (
                <button key={t} type="button" onClick={() => field('type', t)} style={{
                  flex: 1, padding: '8px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700,
                  border: form.type === t ? 'none' : '1px solid rgba(255,255,255,0.1)',
                  background: form.type === t ? (t === 'buy' ? 'rgba(52,211,153,0.2)' : 'rgba(248,113,113,0.2)') : 'rgba(255,255,255,0.03)',
                  color: form.type === t ? (t === 'buy' ? '#34d399' : '#f87171') : '#4a5270',
                }}>{t === 'buy' ? 'Compra' : 'Venta'}</button>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={LABEL}>Nº de {unit}</label>
              <input style={INPUT} type="number" step="any" min="0" placeholder="100" value={form.shares} onChange={e => field('shares', e.target.value)} required />
            </div>
            <div>
              <label style={LABEL}>Precio {selected ? `(${selected.currency})` : ''}</label>
              <input style={INPUT} type="number" step="any" min="0" placeholder="45.50" value={form.price} onChange={e => field('price', e.target.value)} required />
            </div>
          </div>

          <div>
            <label style={LABEL}>Fecha de la operación</label>
            <input style={INPUT} type="date" value={form.date} onChange={e => field('date', e.target.value)} required />
          </div>

          <div>
            <label style={LABEL}>Notas (opcional)</label>
            <textarea style={{ ...INPUT, minHeight: 64, resize: 'vertical' }} value={form.notes} onChange={e => field('notes', e.target.value)} />
          </div>

          {error && <p style={{ fontSize: 12, color: '#f87171' }}>{error}</p>}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <Link href="/cartera"><button type="button" style={BTN_GHOST}>Cancelar</button></Link>
            <button type="submit" style={{ ...BTN_PRIMARY, opacity: saving ? 0.6 : 1 }} disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar operación'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
