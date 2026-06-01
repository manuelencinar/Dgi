'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { computeNextDate, FREQ_OPTS } from '@/lib/recurring'

const INPUT = { width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '9px 12px', color: '#c8d0e0', fontSize: 13, outline: 'none', boxSizing: 'border-box' }
const LABEL = { fontSize: 11, color: '#4a5270', marginBottom: 5, display: 'block' }

export function RecurringModal({ ticker, assetType = 'fund', currency = 'EUR', fundName, existing, onClose, onSaved }) {
  const [amount, setAmount]       = useState(existing ? String(existing.amount_eur) : '')
  const [frequency, setFrequency] = useState(existing?.frequency || 'monthly')
  const [startDate, setStartDate] = useState(existing?.start_date || new Date().toISOString().slice(0, 10))
  const [endDate, setEndDate]     = useState(existing?.end_date || '')
  const [notes, setNotes]         = useState(existing?.notes || '')
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    const amt = parseFloat(amount)
    if (!amt || amt <= 0) { setError('Importe inválido'); return }
    setSaving(true); setError(null)

    const sb = createClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) { setError('Sesión expirada'); setSaving(false); return }

    const next = computeNextDate(startDate, frequency)
    const payload = {
      user_id: user.id, ticker, asset_type: assetType, amount_eur: amt,
      frequency, start_date: startDate, end_date: endDate || null, next_date: next,
      notes: notes || null, active: true,
    }

    let err
    if (existing) ({ error: err } = await sb.from('recurring_contributions').update(payload).eq('id', existing.id))
    else ({ error: err } = await sb.from('recurring_contributions').insert(payload))
    if (err) { setError('Error: ' + err.message); setSaving(false); return }

    // Asegurar que existe la posición (0 participaciones)
    const { data: pos } = await sb.from('positions').select('id').eq('user_id', user.id).eq('ticker', ticker).maybeSingle()
    if (!pos) {
      await sb.from('positions').insert({ user_id: user.id, ticker, shares: 0, avg_cost: 0, currency, asset_type: assetType })
    }

    setSaving(false)
    onSaved?.()
    onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#0d1424', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, padding: 22, width: '100%', maxWidth: 440 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <p style={{ fontSize: 15, fontWeight: 800, color: '#c8d0e0' }}>⚡ Aportación periódica</p>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#4a5270', fontSize: 20, cursor: 'pointer' }}>×</button>
        </div>
        {fundName && <p style={{ fontSize: 12, color: '#818cf8', marginBottom: 14 }}>{fundName}</p>}

        <form onSubmit={submit} style={{ display: 'grid', gap: 14 }}>
          <div>
            <label style={LABEL}>Importe por aportación (€)</label>
            <input style={INPUT} type="number" step="any" min="0" placeholder="200" value={amount} onChange={e => setAmount(e.target.value)} required />
          </div>
          <div>
            <label style={LABEL}>Frecuencia</label>
            <select style={INPUT} value={frequency} onChange={e => setFrequency(e.target.value)}>
              {FREQ_OPTS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={LABEL}>Fecha de inicio</label>
              <input style={INPUT} type="date" value={startDate} onChange={e => setStartDate(e.target.value)} required />
            </div>
            <div>
              <label style={LABEL}>Fecha de fin (opcional)</label>
              <input style={INPUT} type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
            </div>
          </div>
          <div>
            <label style={LABEL}>Notas (opcional)</label>
            <input style={INPUT} placeholder="Plan de ahorro jubilación" value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
          {error && <p style={{ fontSize: 12, color: '#f87171' }}>{error}</p>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={{ padding: '9px 16px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#4a5270', cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
            <button type="submit" disabled={saving} style={{ padding: '9px 18px', background: 'rgba(99,102,241,0.85)', border: 'none', borderRadius: 8, color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function RecurringButton({ ticker, assetType = 'fund', currency = 'EUR', fundName }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)} style={{
        padding: '10px 18px', background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.35)',
        borderRadius: 9, color: '#818cf8', fontSize: 13, fontWeight: 700, cursor: 'pointer',
      }}>
        ⚡ Configurar aportación periódica
      </button>
      {open && <RecurringModal ticker={ticker} assetType={assetType} currency={currency} fundName={fundName} onClose={() => setOpen(false)} onSaved={() => location.reload()} />}
    </>
  )
}
