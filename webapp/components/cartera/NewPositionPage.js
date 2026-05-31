'use client'
import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { DICT } from '@/data/dict'
import { weightedAvgCost } from '@/lib/portfolio'

const BG = '#080b14'
const CARD = { background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 20 }
const INPUT = {
  width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 8, padding: '10px 12px', color: '#c8d0e0', fontSize: 14, outline: 'none', boxSizing: 'border-box',
}
const LABEL = { fontSize: 12, color: '#4a5270', marginBottom: 6, display: 'block' }
const BTN_PRIMARY = {
  padding: '11px 24px', background: 'rgba(99,102,241,0.85)', border: 'none', borderRadius: 8,
  color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
}
const BTN_GHOST = {
  padding: '11px 24px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 8, color: '#4a5270', fontSize: 14, cursor: 'pointer',
}

export default function NewPositionPage() {
  const router  = useRouter()
  const [query, setQuery]       = useState('')
  const [results, setResults]   = useState([])
  const [selected, setSelected] = useState(null)  // {ticker, name, currency}
  const [form, setForm]         = useState({ shares: '', price: '', date: new Date().toISOString().slice(0,10), type: 'buy', notes: '' })
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState(null)

  const search = useCallback((q) => {
    setQuery(q)
    if (q.length < 1) { setResults([]); return }
    const lower = q.toLowerCase()
    setResults(
      DICT.filter(d => d[0].toLowerCase().includes(lower) || d[1].toLowerCase().includes(lower))
        .slice(0, 8)
        .map(d => ({ ticker: d[1], name: d[0], currency: d[3] }))
    )
  }, [])

  const select = (item) => {
    setSelected(item)
    setQuery(item.name)
    setResults([])
  }

  const field = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!selected) { setError('Selecciona una empresa'); return }
    const shares = parseFloat(form.shares)
    const price  = parseFloat(form.price)
    if (!shares || shares <= 0) { setError('Número de acciones inválido'); return }
    if (!price  || price  <= 0) { setError('Precio inválido'); return }
    if (!form.date) { setError('Fecha requerida'); return }

    setSaving(true); setError(null)
    const sb = createClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) { setError('Sesión expirada'); setSaving(false); return }

    // Insert transaction
    await sb.from('transactions').insert({
      user_id: user.id, ticker: selected.ticker,
      type: form.type, shares, price, date: form.date, notes: form.notes || null,
    })

    // Update or insert position
    const { data: existing } = await sb
      .from('positions').select('*').eq('user_id', user.id).eq('ticker', selected.ticker).maybeSingle()

    if (form.type === 'buy') {
      if (existing) {
        const newShares  = existing.shares + shares
        const newAvgCost = weightedAvgCost(existing.shares, existing.avg_cost, shares, price)
        await sb.from('positions').update({ shares: newShares, avg_cost: newAvgCost, updated_at: new Date().toISOString() }).eq('id', existing.id)
      } else {
        await sb.from('positions').insert({
          user_id: user.id, ticker: selected.ticker,
          shares, avg_cost: price, currency: selected.currency,
        })
      }
    } else {
      // sell
      if (existing) {
        const remaining = existing.shares - shares
        if (remaining <= 0) {
          await sb.from('positions').delete().eq('id', existing.id)
        } else {
          await sb.from('positions').update({ shares: remaining, updated_at: new Date().toISOString() }).eq('id', existing.id)
        }
      }
    }

    router.push('/cartera')
  }

  return (
    <div style={{ maxWidth: 540, margin: '0 auto', padding: '24px 16px 64px' }}>
      <div style={{ marginBottom: 20 }}>
        <Link href="/cartera" style={{ fontSize: 12, color: '#4a5270', textDecoration: 'none' }}>← Volver a cartera</Link>
      </div>
      <h1 style={{ fontSize: 22, fontWeight: 900, color: '#e0e8f0', marginBottom: 24 }}>Añadir operación</h1>

      <form onSubmit={handleSubmit}>
        <div style={{ ...CARD, display: 'grid', gap: 18 }}>

          {/* Buscador */}
          <div style={{ position: 'relative' }}>
            <label style={LABEL}>Empresa</label>
            <input
              style={INPUT} placeholder="Busca por nombre o ticker..." autoComplete="off"
              value={query} onChange={e => search(e.target.value)}
            />
            {results.length > 0 && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20,
                background: '#10172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8,
                overflow: 'hidden', marginTop: 4, maxHeight: 280, overflowY: 'auto',
              }}>
                {results.map(r => (
                  <button key={r.ticker} type="button" onClick={() => select(r)} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    width: '100%', padding: '10px 14px', background: 'none', border: 'none',
                    cursor: 'pointer', textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.04)',
                  }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'none'}
                  >
                    <span style={{ fontSize: 13, color: '#c8d0e0' }}>{r.name}</span>
                    <span style={{ fontSize: 11, color: '#4a5270', marginLeft: 8, flexShrink: 0 }}>{r.ticker} · {r.currency}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Tipo */}
          <div>
            <label style={LABEL}>Tipo de operación</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {['buy', 'sell'].map(t => (
                <button key={t} type="button" onClick={() => field('type', t)} style={{
                  flex: 1, padding: '8px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700,
                  border: form.type === t ? 'none' : '1px solid rgba(255,255,255,0.1)',
                  background: form.type === t ? (t === 'buy' ? 'rgba(52,211,153,0.2)' : 'rgba(248,113,113,0.2)') : 'rgba(255,255,255,0.03)',
                  color: form.type === t ? (t === 'buy' ? '#34d399' : '#f87171') : '#4a5270',
                }}>
                  {t === 'buy' ? 'Compra' : 'Venta'}
                </button>
              ))}
            </div>
          </div>

          {/* Shares + Price */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={LABEL}>Nº de acciones</label>
              <input style={INPUT} type="number" step="any" min="0" placeholder="100" value={form.shares} onChange={e => field('shares', e.target.value)} required />
            </div>
            <div>
              <label style={LABEL}>Precio por acción {selected ? `(${selected.currency})` : ''}</label>
              <input style={INPUT} type="number" step="any" min="0" placeholder="45.50" value={form.price} onChange={e => field('price', e.target.value)} required />
            </div>
          </div>

          {/* Date */}
          <div>
            <label style={LABEL}>Fecha de la operación</label>
            <input style={INPUT} type="date" value={form.date} onChange={e => field('date', e.target.value)} required />
          </div>

          {/* Notes */}
          <div>
            <label style={LABEL}>Notas (opcional)</label>
            <textarea style={{ ...INPUT, minHeight: 72, resize: 'vertical' }} placeholder="Primera compra, objetivo largo plazo..." value={form.notes} onChange={e => field('notes', e.target.value)} />
          </div>

          {/* Preview */}
          {selected && form.shares && form.price && (
            <div style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 8, padding: '10px 14px' }}>
              <p style={{ fontSize: 11, color: '#818cf8', fontWeight: 700, marginBottom: 4 }}>Resumen</p>
              <p style={{ fontSize: 13, color: '#c8d0e0' }}>
                {form.type === 'buy' ? 'Compra' : 'Venta'} de{' '}
                <strong>{form.shares}</strong> acciones de <strong>{selected.name}</strong> a{' '}
                <strong>{form.price} {selected.currency}</strong>
              </p>
              <p style={{ fontSize: 12, color: '#8090a8', marginTop: 2 }}>
                Total: {(parseFloat(form.shares || 0) * parseFloat(form.price || 0)).toLocaleString('es-ES', { maximumFractionDigits: 2 })} {selected.currency}
              </p>
            </div>
          )}

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
