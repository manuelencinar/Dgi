'use client'
import { useState } from 'react'
import Link from 'next/link'
import { getCountry } from '@/lib/helpers'
import { priceProximity, priceForYield, FREE_WATCHLIST_LIMIT } from '@/lib/watchlist'

const CUR_SYM = { EUR: '€', USD: '$', GBP: '£', GBp: 'p', JPY: '¥', CHF: 'Fr', CAD: 'C$', AUD: 'A$', SEK: 'kr', DKK: 'kr', NOK: 'kr', HKD: 'HK$', SGD: 'S$' }
function curSym(c) { return CUR_SYM[c] || (c ? c + ' ' : '') }
function fmtPx(v, cur) {
  if (v == null) return '—'
  const s = curSym(cur)
  const n = Number(v).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return cur === 'EUR' ? `${n} ${s}` : `${s}${n}`
}
function scoreColor(s) { if (s == null) return '#3a4260'; if (s >= 8) return '#34d399'; if (s >= 6.5) return '#86efac'; if (s >= 5) return '#fbbf24'; if (s >= 3) return '#f97316'; return '#f87171' }

const CARD = { background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 20 }
const INPUT = { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '9px 12px', color: '#c8d0e0', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' }

// ── Modal de edición ─────────────────────────────────────────────────────────
function EditModal({ item, isPremium, onClose, onSaved }) {
  const [targetPrice, setTargetPrice] = useState(item.targetPrice ?? '')
  const [targetYield, setTargetYield] = useState(item.targetYield ?? '')
  const [notes, setNotes] = useState(item.notes ?? '')
  const [alertPrice, setAlertPrice] = useState(item.alertPrice)
  const [alertYield, setAlertYield] = useState(item.alertYield)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true); setErr(null)
    const res = await fetch('/api/watchlist', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ticker: item.ticker,
        target_price: targetPrice, target_yield: targetYield, notes,
        alert_price_active: alertPrice, alert_yield_active: alertYield,
      }),
    })
    setSaving(false)
    if (!res.ok) { setErr('No se pudo guardar'); return }
    onSaved({
      ...item,
      targetPrice: targetPrice === '' ? null : Number(targetPrice),
      targetYield: targetYield === '' ? null : Number(targetYield),
      notes: notes || null,
      alertPrice, alertYield,
      proximity: priceProximity(item.currentPrice, targetPrice === '' ? null : Number(targetPrice)),
      priceForTargetYield: priceForYield(item.dps, targetYield === '' ? null : Number(targetYield)),
    })
    onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', padding: 16 }} onClick={onClose}>
      <div style={{ ...CARD, minWidth: 300, maxWidth: 420, width: '100%' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
          <p style={{ fontWeight: 700, color: '#c8d0e0', fontSize: 15 }}>{item.name}</p>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#4a5270', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
        </div>
        <form onSubmit={submit} style={{ display: 'grid', gap: 14 }}>
          <div>
            <label style={{ fontSize: 11, color: '#4a5270', marginBottom: 4, display: 'block' }}>Precio objetivo ({item.currency})</label>
            <input style={INPUT} type="number" step="any" value={targetPrice} onChange={e => setTargetPrice(e.target.value)} placeholder="—" />
            <p style={{ fontSize: 10, color: '#2e3a55', marginTop: 4 }}>Te avisamos cuando el precio baje hasta aquí</p>
          </div>
          <div>
            <label style={{ fontSize: 11, color: '#4a5270', marginBottom: 4, display: 'block' }}>Yield objetivo (%)</label>
            <input style={INPUT} type="number" step="any" value={targetYield} onChange={e => setTargetYield(e.target.value)} placeholder="—" />
            <p style={{ fontSize: 10, color: '#2e3a55', marginTop: 4 }}>Te avisamos cuando el yield suba hasta aquí</p>
          </div>
          <div>
            <label style={{ fontSize: 11, color: '#4a5270', marginBottom: 4, display: 'block' }}>Notas</label>
            <textarea style={{ ...INPUT, resize: 'vertical', minHeight: 56 }} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Esperar a que baje del PER 20x" />
          </div>
          <AlertToggle label="Alerta de precio" value={alertPrice} onChange={setAlertPrice} isPremium={isPremium} />
          <AlertToggle label="Alerta de yield" value={alertYield} onChange={setAlertYield} isPremium={isPremium} />
          {!isPremium && (alertPrice || alertYield) && (
            <p style={{ fontSize: 10, color: '#fbbf24' }}>Las alertas por email son Premium. Verás el aviso en la campana de notificaciones igualmente.</p>
          )}
          {err && <p style={{ fontSize: 11, color: '#f87171' }}>{err}</p>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={{ padding: '8px 16px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7, color: '#4a5270', cursor: 'pointer', fontSize: 12 }}>Cancelar</button>
            <button type="submit" disabled={saving} style={{ padding: '8px 16px', background: 'rgba(99,102,241,0.85)', border: 'none', borderRadius: 7, color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 12 }}>{saving ? 'Guardando…' : 'Guardar'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function AlertToggle({ label, value, onChange }) {
  return (
    <button type="button" onClick={() => onChange(!value)} style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
      padding: '8px 12px', borderRadius: 8, border: '1px solid ' + (value ? 'rgba(251,191,36,0.4)' : 'rgba(255,255,255,0.1)'),
      background: value ? 'rgba(251,191,36,0.1)' : 'transparent', cursor: 'pointer', fontFamily: 'inherit',
    }}>
      <span style={{ fontSize: 12, color: value ? '#fbbf24' : '#8090a8' }}>🔔 {label}</span>
      <span style={{ width: 34, height: 18, borderRadius: 10, background: value ? '#fbbf24' : 'rgba(255,255,255,0.1)', position: 'relative', transition: 'background 0.15s', flexShrink: 0 }}>
        <span style={{ position: 'absolute', top: 2, left: value ? 18 : 2, width: 14, height: 14, borderRadius: '50%', background: '#0d1424', transition: 'left 0.15s' }} />
      </span>
    </button>
  )
}

// ── Fila ───────────────────────────────────────────────────────────────────
function Row({ it, onEdit, onDelete }) {
  const ct = getCountry(it.country)
  const prox = it.proximity
  const rowBg = prox?.inZone ? 'rgba(52,211,153,0.10)' : prox?.near ? 'rgba(52,211,153,0.04)' : 'transparent'
  const truncNotes = it.notes && it.notes.length > 40 ? it.notes.slice(0, 40) + '…' : it.notes

  return (
    <tr style={{ background: rowBg }}>
      <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <Link href={`/empresa/${encodeURIComponent(it.ticker)}`} style={{ textDecoration: 'none' }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#c8d0e0', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 14 }}>{ct?.flag || '🌐'}</span>{it.name}
          </p>
          <p style={{ fontSize: 10, color: '#4a5270' }}>{it.ticker}{it.sector ? ` · ${it.sector}` : ''}</p>
        </Link>
        {prox?.inZone && <span style={{ display: 'inline-block', marginTop: 4, fontSize: 10, fontWeight: 700, color: '#34d399', background: 'rgba(52,211,153,0.15)', padding: '2px 7px', borderRadius: 5 }}>🎯 En zona de compra</span>}
        {prox?.near && !prox?.inZone && <span style={{ display: 'inline-block', marginTop: 4, fontSize: 10, fontWeight: 700, color: '#86efac' }}>Cerca del objetivo</span>}
      </td>
      <td style={{ padding: '10px 8px', textAlign: 'right', color: '#c8d0e0', borderBottom: '1px solid rgba(255,255,255,0.04)', fontVariantNumeric: 'tabular-nums' }}>{fmtPx(it.currentPrice, it.currency)}</td>
      <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid rgba(255,255,255,0.04)', fontWeight: 700, color: it.changePct == null ? '#4a5270' : it.changePct >= 0 ? '#34d399' : '#f87171' }}>
        {it.changePct == null ? '—' : `${it.changePct >= 0 ? '+' : ''}${it.changePct.toFixed(2)}%`}
      </td>
      <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <span style={{ fontSize: 15, fontWeight: 900, color: scoreColor(it.score) }}>{it.score != null ? it.score.toFixed(1) : '—'}</span>
      </td>
      <td style={{ padding: '10px 8px', textAlign: 'right', color: '#34d399', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>{it.yld != null ? it.yld.toFixed(2) + '%' : '—'}</td>
      <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        {it.targetPrice != null ? (
          <div>
            <p style={{ color: '#c8d0e0', fontWeight: 600 }}>{fmtPx(it.targetPrice, it.currency)}</p>
            {prox && <p style={{ fontSize: 10, color: prox.inZone ? '#34d399' : '#8090a8' }}>{prox.pct >= 0 ? '+' : ''}{prox.pct.toFixed(1)}% · {prox.abs >= 0 ? '+' : ''}{fmtPx(prox.abs, it.currency)}</p>}
          </div>
        ) : <span style={{ color: '#3a4260' }}>—</span>}
      </td>
      <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        {it.targetYield != null ? (
          <div>
            <p style={{ color: '#c8d0e0', fontWeight: 600 }}>{it.targetYield.toFixed(2)}%</p>
            {it.priceForTargetYield != null && <p style={{ fontSize: 10, color: '#8090a8' }}>a {fmtPx(it.priceForTargetYield, it.currency)}</p>}
          </div>
        ) : <span style={{ color: '#3a4260' }}>—</span>}
      </td>
      <td style={{ padding: '10px 8px', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        {(it.alertPrice || it.alertYield) ? <span title="Alerta activa" style={{ fontSize: 14 }}>🔔</span> : <span style={{ color: '#2e3a55' }}>—</span>}
      </td>
      <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.04)', maxWidth: 160 }}>
        {truncNotes ? <span title={it.notes} style={{ fontSize: 11, color: '#8090a8', cursor: 'help' }}>{truncNotes}</span> : <span style={{ color: '#2e3a55' }}>—</span>}
      </td>
      <td style={{ padding: '10px 8px', textAlign: 'right', color: '#4a5270', fontSize: 10, borderBottom: '1px solid rgba(255,255,255,0.04)', whiteSpace: 'nowrap' }}>
        {it.createdAt ? new Date(it.createdAt).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'}
      </td>
      <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid rgba(255,255,255,0.04)', whiteSpace: 'nowrap' }}>
        <button onClick={() => onEdit(it)} title="Editar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#818cf8', fontSize: 14, padding: '2px 4px' }}>✏</button>
        <Link href={`/cartera/nueva-posicion?ticker=${encodeURIComponent(it.ticker)}`} title="Añadir a cartera" style={{ textDecoration: 'none', color: '#34d399', fontSize: 14, padding: '2px 4px' }}>＋</Link>
        <button onClick={() => onDelete(it)} title="Eliminar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f87171', fontSize: 14, padding: '2px 4px' }}>🗑</button>
      </td>
    </tr>
  )
}

// ── Principal ────────────────────────────────────────────────────────────────
export default function WatchlistClient({ initialItems = [], isPremium = false }) {
  const [items, setItems] = useState(initialItems)
  const [editing, setEditing] = useState(null)

  const onSaved = (updated) => setItems(list => list.map(x => x.id === updated.id ? updated : x))
  const onDelete = async (it) => {
    if (!confirm(`¿Dejar de seguir ${it.name}?`)) return
    setItems(list => list.filter(x => x.id !== it.id))
    await fetch(`/api/watchlist?ticker=${encodeURIComponent(it.ticker)}`, { method: 'DELETE' })
  }

  const HEADS = ['Empresa', 'P. Actual', 'Var.', 'Score', 'Yield', 'P. objetivo', 'Yield objetivo', 'Alerta', 'Notas', 'Añadido', '']

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px 80px' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, color: '#e0e8f0', marginBottom: 4 }}>Tu Watchlist</h1>
        <p style={{ fontSize: 13, color: '#4a5270' }}>Empresas que sigues — te avisamos cuando llegan a tu precio</p>
      </div>

      {!isPremium && items.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14, padding: '10px 14px', background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 10 }}>
          <p style={{ fontSize: 12, color: '#8090a8' }}>{items.length} / {FREE_WATCHLIST_LIMIT} empresas (plan gratuito). Premium: watchlist ilimitada y alertas por email.</p>
          <Link href="/pricing" style={{ fontSize: 12, fontWeight: 700, color: '#fff', background: '#6366f1', padding: '7px 14px', borderRadius: 8, textDecoration: 'none', flexShrink: 0 }}>Ver Premium →</Link>
        </div>
      )}

      {items.length === 0 ? (
        <div style={{ ...CARD, textAlign: 'center', padding: '60px 20px' }}>
          <p style={{ fontSize: 32, marginBottom: 12 }}>👁</p>
          <p style={{ fontSize: 14, color: '#8090a8', marginBottom: 8, maxWidth: 420, marginLeft: 'auto', marginRight: 'auto' }}>Aún no sigues ninguna empresa. Añade empresas desde el screener o desde la ficha de cada empresa.</p>
          <Link href="/screener" style={{ display: 'inline-block', marginTop: 8, fontSize: 13, fontWeight: 700, color: '#fff', background: '#6366f1', padding: '10px 20px', borderRadius: 9, textDecoration: 'none' }}>Explorar screener →</Link>
        </div>
      ) : (
        <div style={{ ...CARD, padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 900 }}>
            <thead>
              <tr>
                {HEADS.map((h, i) => (
                  <th key={i} style={{ padding: '12px 8px', textAlign: i === 0 ? 'left' : i === 7 ? 'center' : 'right', color: '#4a5270', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.08)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map(it => <Row key={it.id} it={it} onEdit={setEditing} onDelete={onDelete} />)}
            </tbody>
          </table>
        </div>
      )}

      {editing && <EditModal item={editing} isPremium={isPremium} onClose={() => setEditing(null)} onSaved={onSaved} />}
    </div>
  )
}
