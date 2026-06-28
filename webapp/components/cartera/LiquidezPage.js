'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { CASH_TYPES, estimateMonthInterest, estimateAnnualInterest } from '@/lib/cash-fund'

const CARD = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }
const INPUT = { background: 'var(--bg-elev)', border: '1px solid var(--border-strong)', borderRadius: 7, padding: '8px 10px', color: 'var(--text-strong)', fontSize: 13, outline: 'none', width: '100%', fontFamily: 'inherit', boxSizing: 'border-box' }
const fmtEUR = (v, d = 2) => v == null || isNaN(v) ? '—' : Number(v).toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d }) + ' €'
const fmtDate = d => d ? new Date(String(d).slice(0, 10) + 'T12:00:00').toLocaleDateString('es-ES') : '—'
const todayStr = () => new Date().toISOString().slice(0, 10)

export default function LiquidezPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [movements, setMovements] = useState([])
  const [balance, setBalance] = useState(0)
  const [rate, setRate] = useState(0)
  const [dividendsToCash, setDividendsToCash] = useState(false)
  const [ready, setReady] = useState(true)
  const [rateDraft, setRateDraft] = useState('')
  const [saved, setSaved] = useState(false)
  const [form, setForm] = useState({ type: 'deposit', amount: '', date: todayStr(), note: '' })
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch('/api/cartera/liquidez')
    if (res.status === 401) { router.push('/login'); return }
    const d = await res.json().catch(() => ({}))
    setMovements(d.movements || [])
    setBalance(Number(d.balance) || 0)
    setRate(Number(d.rate) || 0)
    setRateDraft(d.rate ? String(d.rate) : '')
    setDividendsToCash(!!d.dividendsToCash)
    setReady(d.ready !== false)
    setLoading(false)
  }, [router])

  useEffect(() => { load() }, [load])

  const saveSettings = async (patch) => {
    setSaved(false)
    await fetch('/api/ajustes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) }).catch(() => {})
    setSaved(true); setTimeout(() => setSaved(false), 2000)
  }
  const saveRate = () => {
    const n = Number(rateDraft)
    const val = (!isNaN(n) && n >= 0 && n <= 20) ? Math.round(n * 1000) / 1000 : 0
    setRate(val); saveSettings({ cash_interest_rate: val }).then(load)
  }
  const toggleDividends = () => {
    const v = !dividendsToCash
    setDividendsToCash(v); saveSettings({ dividends_to_cash: v })
  }

  const addMovement = async (e) => {
    e.preventDefault()
    const amount = Number(form.amount)
    if (!amount || amount <= 0) return
    setBusy(true)
    await fetch('/api/cartera/liquidez', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: form.type, amount, date: form.date, note: form.note }),
    }).catch(() => {})
    setForm({ type: 'deposit', amount: '', date: todayStr(), note: '' })
    await load()
    setBusy(false)
  }
  const del = async (id) => {
    if (!confirm('¿Eliminar este movimiento?')) return
    await fetch(`/api/cartera/liquidez?id=${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {})
    await load()
  }

  const monthInterest = useMemo(() => estimateMonthInterest(balance, rate), [balance, rate])
  const annualInterest = useMemo(() => estimateAnnualInterest(balance, rate), [balance, rate])
  const ordered = useMemo(() => [...movements].sort((a, b) => (String(a.date) < String(b.date) ? 1 : -1)), [movements])

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-faint)' }}>Cargando fondo de oportunidad…</div>

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 16px 64px' }}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, color: 'var(--text-strong)' }}>Fondo de oportunidad</h1>
        <p style={{ fontSize: 13, color: 'var(--text-faint)', marginTop: 4, maxWidth: 640, lineHeight: 1.5 }}>
          Tu pólvora seca: la liquidez disponible para comprar cuando aparezcan oportunidades. Aquí entran tus aportaciones, opcionalmente tus dividendos, y los intereses que te paga el banco.
        </p>
      </div>

      {!ready && (
        <div style={{ ...CARD, marginBottom: 16, borderColor: 'rgba(251,191,36,0.4)', background: 'rgba(251,191,36,0.06)' }}>
          <p style={{ fontSize: 12.5, color: 'var(--warning)', lineHeight: 1.5 }}>El fondo de oportunidad aún no está activo en la base de datos. Ejecuta <b>webapp/sql/cash_fund.sql</b> en Supabase para empezar a usarlo.</p>
        </div>
      )}

      {/* Saldo + intereses */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 16 }}>
        <div style={{ ...CARD }}>
          <p style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Liquidez disponible</p>
          <p style={{ fontSize: 28, fontWeight: 900, color: 'var(--text-strong)' }}>{fmtEUR(balance, 0)}</p>
          <p style={{ fontSize: 11, color: 'var(--text-faintest)', marginTop: 4 }}>Saldo del fondo de oportunidad</p>
        </div>
        <div style={{ ...CARD }}>
          <p style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Interés este mes</p>
          <p style={{ fontSize: 28, fontWeight: 900, color: 'var(--warning)' }}>{rate > 0 ? fmtEUR(monthInterest) : '—'}</p>
          <p style={{ fontSize: 11, color: 'var(--text-faintest)', marginTop: 4 }}>Estimado sobre el saldo actual</p>
        </div>
        <div style={{ ...CARD }}>
          <p style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Interés anual</p>
          <p style={{ fontSize: 28, fontWeight: 900, color: 'var(--warning)' }}>{rate > 0 ? fmtEUR(annualInterest, 0) : '—'}</p>
          <p style={{ fontSize: 11, color: 'var(--text-faintest)', marginTop: 4 }}>{rate > 0 ? `${rate}% TAE sobre el saldo` : 'Fija un tipo abajo'}</p>
        </div>
      </div>

      {/* Configuración */}
      <div style={{ ...CARD, marginBottom: 16 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14 }}>Configuración</p>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ maxWidth: 200 }}>
            <label style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 4, display: 'block' }}>Tipo de interés del banco (TAE %)</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input style={{ ...INPUT, width: 100 }} type="number" step="0.01" min="0" max="20" placeholder="2.5" value={rateDraft} onChange={e => setRateDraft(e.target.value)} onBlur={saveRate} />
              <button onClick={saveRate} style={{ padding: '8px 14px', background: 'var(--accent)', border: 'none', borderRadius: 7, color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>Guardar</button>
            </div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--text)' }}>
            <input type="checkbox" checked={dividendsToCash} onChange={toggleDividends} />
            Los dividendos en efectivo van al fondo de oportunidad
          </label>
          {saved && <span style={{ color: 'var(--positive)', fontSize: 12, fontWeight: 700 }}>✓ Guardado</span>}
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-faintest)', marginTop: 12, lineHeight: 1.5 }}>
          El interés se calcula cada mes sobre el saldo (parte proporcional de la TAE) y se capitaliza. Al activar el toggle, el neto de cada dividendo que confirmes como cobrado se añade a este fondo.
        </p>
      </div>

      {/* Añadir movimiento */}
      <div style={{ ...CARD, marginBottom: 16 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14 }}>Mover liquidez</p>
        <form onSubmit={addMovement} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 4, display: 'block' }}>Tipo</label>
            <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} style={{ ...INPUT, width: 150 }}>
              <option value="deposit">➕ Aportación</option>
              <option value="withdraw">➖ Retirada</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 4, display: 'block' }}>Importe (€)</label>
            <input style={{ ...INPUT, width: 120 }} type="number" step="any" min="0" placeholder="1000" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} required />
          </div>
          <div>
            <label style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 4, display: 'block' }}>Fecha</label>
            <input style={{ ...INPUT, width: 150 }} type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} required />
          </div>
          <div style={{ flex: 1, minWidth: 140 }}>
            <label style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 4, display: 'block' }}>Nota (opcional)</label>
            <input style={INPUT} type="text" placeholder="Ahorro del mes…" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
          </div>
          <button type="submit" disabled={busy} style={{ padding: '9px 18px', background: 'rgba(52,211,153,0.85)', border: 'none', borderRadius: 8, color: '#06281d', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>
            {busy ? 'Guardando…' : 'Añadir'}
          </button>
        </form>
      </div>

      {/* Movimientos */}
      <div style={{ ...CARD }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14 }}>Movimientos</p>
        {ordered.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text-faint)', padding: '12px 0' }}>Aún no hay movimientos. Añade tu primera aportación arriba.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 520 }}>
              <thead><tr>{['Fecha', 'Tipo', 'Importe', 'Nota', ''].map((h, i) => (
                <th key={i} style={{ padding: '6px 8px', textAlign: i === 2 ? 'right' : 'left', color: 'var(--text-faint)', borderBottom: '1px solid var(--border)', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
              ))}</tr></thead>
              <tbody>
                {ordered.map(m => {
                  const info = CASH_TYPES[m.type] || { label: m.type, color: 'var(--text)' }
                  const amt = Number(m.amount) || 0
                  return (
                    <tr key={m.id} style={{ borderBottom: '1px solid var(--surface-2)' }}>
                      <td style={{ padding: '8px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{fmtDate(m.date)}</td>
                      <td style={{ padding: '8px' }}><span style={{ fontSize: 11, fontWeight: 700, color: info.color }}>{info.label}</span></td>
                      <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700, color: amt >= 0 ? 'var(--positive)' : 'var(--negative)', whiteSpace: 'nowrap' }}>{amt >= 0 ? '+' : '−'}{fmtEUR(Math.abs(amt))}</td>
                      <td style={{ padding: '8px', color: 'var(--text-faint)', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={m.note || ''}>{m.note || '—'}</td>
                      <td style={{ padding: '8px', textAlign: 'right' }}>
                        {m.type !== 'interest' && <button onClick={() => del(m.id)} title="Eliminar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--negative)', fontSize: 13 }}>🗑</button>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
