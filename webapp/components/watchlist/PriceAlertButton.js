'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

// Alerta de precio rápida desde la tarjeta del screener — sin salir de la página.
// Bajo el capó crea/actualiza una entrada de watchlist con target_price +
// alert_price_active. El cron check-watchlist-alerts genera la notificación
// in-app (y email si es Premium). Para free cuenta contra el límite de 10.
const CUR_SYM = { EUR: '€', USD: '$', GBP: '£', GBp: 'p', JPY: '¥', CHF: 'Fr', CAD: 'C$', AUD: 'A$', SEK: 'kr', DKK: 'kr', NOK: 'kr', HKD: 'HK$', SGD: 'S$' }
function fmt(v, cur) {
  if (v == null || isNaN(v)) return '—'
  const s = CUR_SYM[cur] || (cur ? cur + ' ' : '')
  const n = Number(v).toLocaleString('es-ES', { maximumFractionDigits: 2 })
  return cur === 'EUR' ? `${n} ${s}` : `${s}${n}`
}

export default function PriceAlertButton({ ticker, name, currency = 'EUR', price = null, isAuthed = false, isPremium = false, size = 13 }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(false)        // alerta puesta en esta sesión
  const [target, setTarget] = useState(price != null ? String(price) : '')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)

  const openModal = (e) => {
    e.preventDefault(); e.stopPropagation()
    if (!isAuthed) {
      router.push(`/login?next=${encodeURIComponent('/screener')}&msg=watchlist`)
      return
    }
    setErr(null)
    setTarget(t => t || (price != null ? String(price) : ''))
    setOpen(true)
  }

  const applyDrop = (pct) => {
    if (price == null) return
    setTarget((price * (1 - pct / 100)).toFixed(2))
  }

  const save = async (e) => {
    e.preventDefault(); e.stopPropagation()
    const tp = Number(target)
    if (!(tp > 0)) { setErr('Introduce un precio válido'); return }
    setSaving(true); setErr(null)
    const payload = { ticker, target_price: tp, alert_price_active: true }
    try {
      // POST crea la fila (si no existe). Si ya existía, devuelve already → PUT.
      let res = await fetch('/api/watchlist', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      if (res.status === 403) { setSaving(false); setErr('Límite del plan gratuito (10 empresas). Hazte Premium para más alertas.'); return }
      let data = await res.json().catch(() => ({}))
      if (res.ok && data.already) {
        res = await fetch('/api/watchlist', {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        })
      }
      setSaving(false)
      if (!res.ok) { setErr('No se pudo guardar'); return }
      setActive(true)
      setOpen(false)
    } catch { setSaving(false); setErr('No se pudo guardar') }
  }

  return (
    <>
      <button onClick={openModal} title={active ? 'Alerta de precio activa' : 'Avisarme cuando baje a un precio'}
        style={{
          background: active ? 'rgba(251,191,36,0.16)' : 'transparent',
          border: '1px solid ' + (active ? 'rgba(251,191,36,0.45)' : 'rgba(255,255,255,0.12)'),
          borderRadius: 6, cursor: 'pointer', padding: '2px 6px', lineHeight: 1,
          fontSize: size, opacity: active ? 1 : 0.5, flexShrink: 0,
        }}>
        🔔
      </button>

      {open && (
        <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'rgba(13,20,36,1)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: 20, width: '100%', maxWidth: 380 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <p style={{ fontWeight: 700, color: '#c8d0e0', fontSize: 14 }}>🔔 Avisarme cuando baje</p>
              <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#4a5270', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
            </div>
            <p style={{ fontSize: 12, color: '#8090a8', marginBottom: 4 }}>{name} <span style={{ color: '#3a4260' }}>{ticker}</span></p>
            {price != null && <p style={{ fontSize: 11, color: '#4a5270', marginBottom: 12 }}>Precio actual: <span style={{ color: '#c8d0e0', fontWeight: 600 }}>{fmt(price, currency)}</span></p>}
            <form onSubmit={save} style={{ display: 'grid', gap: 12 }}>
              <div>
                <label style={{ fontSize: 11, color: '#4a5270', marginBottom: 4, display: 'block' }}>Precio objetivo ({currency})</label>
                <input autoFocus type="number" step="any" value={target} onChange={e => setTarget(e.target.value)} placeholder="—"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '9px 12px', color: '#c8d0e0', fontSize: 14, outline: 'none', width: '100%', boxSizing: 'border-box' }} />
              </div>
              {price != null && (
                <div style={{ display: 'flex', gap: 6 }}>
                  {[5, 10, 15].map(p => (
                    <button key={p} type="button" onClick={() => applyDrop(p)} style={{ flex: 1, fontSize: 11, padding: '6px 0', borderRadius: 7, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#8090a8', cursor: 'pointer', fontFamily: 'inherit' }}>−{p}%</button>
                  ))}
                </div>
              )}
              {!isPremium && <p style={{ fontSize: 10, color: '#fbbf24' }}>El aviso por email es Premium. Lo verás igualmente en la campana de notificaciones.</p>}
              {err && <p style={{ fontSize: 11, color: '#f87171' }}>{err}</p>}
              <button type="submit" disabled={saving} style={{ padding: '9px 16px', background: 'rgba(251,191,36,0.9)', border: 'none', borderRadius: 8, color: '#0d1424', fontWeight: 800, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>
                {saving ? 'Guardando…' : 'Activar aviso'}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
