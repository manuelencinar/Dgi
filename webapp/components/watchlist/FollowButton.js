'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

const CARD = { background: 'var(--bg-elev)', border: '1px solid var(--border-strong)', borderRadius: 12, padding: 20 }
const INPUT = { background: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: 8, padding: '9px 12px', color: 'var(--text)', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' }

function Toggle({ label, value, onChange }) {
  return (
    <button type="button" onClick={() => onChange(!value)} style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, width: '100%',
      padding: '8px 12px', borderRadius: 8, border: '1px solid ' + (value ? 'rgba(251,191,36,0.4)' : 'var(--border-strong)'),
      background: value ? 'rgba(251,191,36,0.1)' : 'transparent', cursor: 'pointer', fontFamily: 'inherit',
    }}>
      <span style={{ fontSize: 12, color: value ? 'var(--warning)' : 'var(--text-muted)' }}>🔔 {label}</span>
      <span style={{ width: 34, height: 18, borderRadius: 10, background: value ? 'var(--warning)' : 'var(--border-strong)', position: 'relative', flexShrink: 0 }}>
        <span style={{ position: 'absolute', top: 2, left: value ? 18 : 2, width: 14, height: 14, borderRadius: '50%', background: 'var(--bg-elev)' }} />
      </span>
    </button>
  )
}

export default function FollowButton({ ticker, name, currency = 'EUR', isAuthed = false, isPremium = false, entry = null }) {
  const router = useRouter()
  const [following, setFollowing] = useState(!!entry)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)

  const [targetPrice, setTargetPrice] = useState(entry?.target_price ?? '')
  const [targetYield, setTargetYield] = useState(entry?.target_yield ?? '')
  const [notes, setNotes] = useState(entry?.notes ?? '')
  const [alertPrice, setAlertPrice] = useState(!!entry?.alert_price_active)
  const [alertYield, setAlertYield] = useState(!!entry?.alert_yield_active)
  const [alertBuyzone, setAlertBuyzone] = useState(!!entry?.alert_buyzone_active)

  const handleClick = () => {
    if (!isAuthed) {
      router.push(`/login?next=${encodeURIComponent(`/empresa/${ticker}`)}&msg=watchlist`)
      return
    }
    setErr(null)
    setOpen(true)
  }

  const save = async (e) => {
    e.preventDefault()
    setSaving(true); setErr(null)
    const payload = {
      ticker, target_price: targetPrice, target_yield: targetYield, notes,
      alert_price_active: alertPrice, alert_yield_active: alertYield,
      alert_buyzone_active: alertBuyzone,
    }
    const res = await fetch('/api/watchlist', {
      method: following ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    setSaving(false)
    if (res.status === 403) { setErr(`Límite del plan gratuito (10 empresas). Hazte Premium para seguir más.`); return }
    if (!res.ok) { setErr('No se pudo guardar'); return }
    setFollowing(true)
    setOpen(false)
  }

  const remove = async () => {
    setSaving(true)
    await fetch(`/api/watchlist?ticker=${encodeURIComponent(ticker)}`, { method: 'DELETE' })
    setSaving(false)
    setFollowing(false)
    setOpen(false)
  }

  const btnStyle = {
    fontSize: 12, fontWeight: 700, padding: '6px 14px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit',
    color: following ? 'var(--warning)' : 'var(--accent)',
    background: following ? 'rgba(251,191,36,0.12)' : 'rgba(99,102,241,0.1)',
    border: '1px solid ' + (following ? 'rgba(251,191,36,0.3)' : 'rgba(99,102,241,0.25)'),
  }

  return (
    <>
      <button onClick={handleClick} style={btnStyle} title={following ? 'En tu watchlist' : 'Añadir a tu watchlist con precio/yield objetivo y alertas'}>
        {following ? '👁 En watchlist' : '👁 Seguir'}
      </button>

      {open && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', padding: 16 }} onClick={() => setOpen(false)}>
          <div style={{ ...CARD, minWidth: 300, maxWidth: 420, width: '100%' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
              <p style={{ fontWeight: 700, color: 'var(--text)', fontSize: 15 }}>{following ? 'Editar en watchlist' : 'Añadir a watchlist'} · {name}</p>
              <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
            </div>
            <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: -6, marginBottom: 12 }}>Seguir una empresa = añadirla a tu watchlist. Define precio o yield objetivo y te avisamos cuando los alcance.</p>
            <form onSubmit={save} style={{ display: 'grid', gap: 14 }}>
              <div>
                <label style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 4, display: 'block' }}>Precio objetivo ({currency})</label>
                <input style={INPUT} type="number" step="any" value={targetPrice} onChange={e => setTargetPrice(e.target.value)} placeholder="—" />
                <p style={{ fontSize: 10, color: 'var(--text-faintest)', marginTop: 4 }}>Te avisamos cuando el precio baje hasta aquí</p>
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 4, display: 'block' }}>Yield objetivo (%)</label>
                <input style={INPUT} type="number" step="any" value={targetYield} onChange={e => setTargetYield(e.target.value)} placeholder="—" />
                <p style={{ fontSize: 10, color: 'var(--text-faintest)', marginTop: 4 }}>Te avisamos cuando el yield suba hasta aquí</p>
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 4, display: 'block' }}>Notas</label>
                <textarea style={{ ...INPUT, resize: 'vertical', minHeight: 56 }} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Esperar a que baje del PER 20x" />
              </div>
              <Toggle label="Activar alerta de precio" value={alertPrice} onChange={setAlertPrice} />
              <Toggle label="Activar alerta de yield" value={alertYield} onChange={setAlertYield} />
              <div>
                <Toggle label="Avísame cuando sea COMPRA" value={alertBuyzone} onChange={setAlertBuyzone} />
                <p style={{ fontSize: 10, color: 'var(--text-faintest)', marginTop: 4 }}>Sin fijar precio: te avisamos cuando entre en zona de compra por su Score DGI y margen de seguridad</p>
              </div>
              {!isPremium && (alertPrice || alertYield || alertBuyzone) && (
                <p style={{ fontSize: 10, color: 'var(--warning)' }}>Las alertas por email son Premium. Verás el aviso en la campana de notificaciones igualmente.</p>
              )}
              {err && <p style={{ fontSize: 11, color: 'var(--negative)' }}>{err}</p>}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center' }}>
                {following ? (
                  <button type="button" onClick={remove} disabled={saving} style={{ padding: '8px 14px', background: 'transparent', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 7, color: 'var(--negative)', cursor: 'pointer', fontSize: 12 }}>Dejar de seguir</button>
                ) : <span />}
                <button type="submit" disabled={saving} style={{ padding: '8px 16px', background: 'var(--accent)', border: 'none', borderRadius: 7, color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 12 }}>{saving ? 'Guardando…' : 'Guardar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
