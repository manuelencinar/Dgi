'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const CARD   = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }
const BTN_GREEN = { padding: '12px 24px', background: 'rgba(52,211,153,0.9)', border: 'none', borderRadius: 8, color: '#062b1f', fontSize: 14, fontWeight: 800, cursor: 'pointer' }
const BTN_INDIGO = { padding: '12px 24px', background: 'rgba(99,102,241,0.9)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }
const LINK_SMALL = { fontSize: 12, color: 'var(--text-faint)', textDecoration: 'underline', cursor: 'pointer', background: 'none', border: 'none', padding: 0 }
const TEXTAREA = { width: '100%', minHeight: 80, background: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: 8, padding: '10px 12px', color: 'var(--text)', fontSize: 14, outline: 'none', boxSizing: 'border-box', resize: 'vertical' }

const REASONS = [
  { id: 'precio',           emoji: '💰', label: 'El precio es demasiado alto' },
  { id: 'no_uso',           emoji: '😴', label: 'No lo uso suficiente' },
  { id: 'faltan_funciones', emoji: '🔧', label: 'Le faltan funciones que necesito' },
  { id: 'otra_herramienta', emoji: '🔄', label: 'Voy a usar otra herramienta' },
  { id: 'gasto_temporal',   emoji: '⏸', label: 'Es un gasto temporal que quiero reducir' },
  { id: 'ya_conseguido',    emoji: '🎯', label: 'Ya conseguí lo que necesitaba' },
  { id: 'otro',             emoji: '💬', label: 'Otro motivo' },
]

function fmtEUR(v) {
  if (v == null || isNaN(v)) return '—'
  return v.toLocaleString('es-ES', { maximumFractionDigits: 0 }) + ' €'
}
function fmtFecha(d) {
  if (!d) return 'el final de tu período actual'
  return new Date(d + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
}

export default function CancelarClient({ summary, accessUntil, discountUsed, monthlyPrice }) {
  const router = useRouter()
  const [reason, setReason]       = useState(null)
  const [feedbackText, setFeedback] = useState('')
  const [pauseMonths, setPauseMonths] = useState(1)
  const [view, setView]           = useState('main')   // main | confirm | done
  const [doneMsg, setDoneMsg]     = useState('')
  const [busy, setBusy]           = useState(false)
  const [error, setError]         = useState(null)

  const halfPrice = (monthlyPrice / 2).toFixed(2).replace('.', ',')

  // Qué oferta se mostró (para analytics al cancelar)
  const offerForReason = { precio: 'descuento', no_uso: 'pausa', faltan_funciones: 'sugerencia', gasto_temporal: 'pausa' }
  const offerShown = reason ? (offerForReason[reason] || 'ninguna') : null

  // ── Acciones ────────────────────────────────────────────────────────────────
  const call = async (url, body) => {
    setBusy(true); setError(null)
    try {
      const res  = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Algo ha fallado'); setBusy(false); return null }
      setBusy(false)
      return data
    } catch (e) { setError(String(e)); setBusy(false); return null }
  }

  const acceptDiscount = async () => {
    const r = await call('/api/cancelar/descuento')
    if (r) { setDoneMsg(`Descuento aplicado. Pagarás un 50% menos durante los próximos 3 meses. ¡Gracias por seguir con nosotros!`); setView('done') }
  }

  const pause = async (months) => {
    const r = await call('/api/cancelar/pausa', { months })
    if (r) { setDoneMsg(`Tu suscripción está pausada hasta el ${fmtFecha(r.pauseEndDate)}. No se realizará ningún cobro. Puedes reactivarla antes cuando quieras desde Ajustes.`); setView('done') }
  }

  const sendSuggestion = async () => {
    if (feedbackText.trim()) await call('/api/cancelar/feedback', { content: feedbackText, type: 'feature_request' })
    setDoneMsg('¡Gracias por tu sugerencia! La hemos recibido y sigues como Premium. Muchas mejoras vienen de usuarios como tú.')
    setView('done')
  }

  const confirmCancel = async () => {
    const r = await call('/api/cancelar/confirmar', {
      reason, feedback: feedbackText || null,
      monthsAsPremium: summary.monthsAsPremium,
      offerShown, offerAccepted: false,
    })
    if (r) { setDoneMsg(`Cancelación confirmada. Sigues con acceso Premium hasta el ${fmtFecha(r.accessUntil)}. Esperamos verte pronto.`); setView('done') }
  }

  // ── Vista final ──────────────────────────────────────────────────────────────
  if (view === 'done') {
    return (
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '48px 16px 64px', textAlign: 'center' }}>
        <div style={{ ...CARD, padding: 32 }}>
          <p style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-strong)', marginBottom: 12 }}>Listo</p>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 24 }}>{doneMsg}</p>
          <Link href="/cartera" style={{ ...BTN_INDIGO, textDecoration: 'none', display: 'inline-block' }}>Ir a mi cartera</Link>
        </div>
      </div>
    )
  }

  // ── Vista de confirmación (paso 5) ──────────────────────────────────────────
  if (view === 'confirm') {
    return (
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '32px 16px 64px' }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, color: 'var(--text-strong)', marginBottom: 20 }}>Confirmar cancelación</h1>
        <div style={{ ...CARD, marginBottom: 20 }}>
          <div style={{ display: 'grid', gap: 14 }}>
            <Dato k="Acceso premium hasta" v={fmtFecha(accessUntil)} />
            <Dato k="Tus datos se conservan" v="Sí, durante 12 meses" />
            <Dato k="Puedes volver cuando quieras" v="Sí, con todos tus datos" />
          </div>
        </div>

        <label style={{ fontSize: 12, color: 'var(--text-faint)', display: 'block', marginBottom: 6 }}>¿Algo más que quieras decirnos? (opcional)</label>
        <textarea style={TEXTAREA} value={feedbackText} onChange={e => setFeedback(e.target.value)} placeholder="Tu opinión nos ayuda a mejorar" />

        {error && <p style={{ fontSize: 12, color: 'var(--negative)', marginTop: 12 }}>{error}</p>}

        {/* Botón de mantener más visible; cancelar menos prominente — diseño honesto */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center', marginTop: 24 }}>
          <button onClick={() => router.push('/cartera')} style={{ ...BTN_INDIGO, width: '100%', maxWidth: 320 }}>
            Mantener mi suscripción
          </button>
          <button onClick={confirmCancel} disabled={busy} style={{ ...LINK_SMALL, color: 'var(--negative)', fontSize: 13, padding: '6px 0' }}>
            {busy ? 'Procesando…' : 'Cancelar suscripción'}
          </button>
        </div>
      </div>
    )
  }

  // ── Vista principal (pasos 1 + 2) ───────────────────────────────────────────
  const cards = [
    summary.companies > 0 && { label: 'Empresas en tu índice DGI', value: summary.companies },
    summary.markets   > 0 && { label: 'Mercados que sigues', value: summary.markets },
    summary.annualIncome != null && summary.annualIncome > 0 && { label: 'Renta anual proyectada', value: fmtEUR(summary.annualIncome), color: 'var(--positive)' },
    { label: 'Tiempo como Premium', value: `${summary.monthsAsPremium} ${summary.monthsAsPremium === 1 ? 'mes' : 'meses'}`, color: 'var(--warning)' },
    summary.totalValue != null && summary.totalValue > 0 && { label: 'Valor de tu cartera', value: fmtEUR(summary.totalValue) },
    summary.yieldOnCost != null && { label: 'Yield on cost medio', value: summary.yieldOnCost.toFixed(2) + '%', color: 'var(--accent)' },
    summary.recurringTotal > 0 && { label: 'Aportado automáticamente', value: fmtEUR(summary.recurringTotal), color: '#a78bfa' },
  ].filter(Boolean)

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '32px 16px 64px' }}>
      {/* PASO 1 — Resumen de uso */}
      <h1 style={{ fontSize: 24, fontWeight: 900, color: 'var(--text-strong)', marginBottom: 6 }}>Antes de irte, mira lo que has construido</h1>
      <p style={{ fontSize: 13, color: 'var(--text-faint)', marginBottom: 24 }}>Tu actividad como miembro Premium de Mi Índice DGI.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 16 }}>
        {cards.map(c => (
          <div key={c.label} style={{ ...CARD, padding: '16px 18px' }}>
            <p style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 6 }}>{c.label}</p>
            <p style={{ fontSize: 24, fontWeight: 900, color: c.color || 'var(--text)', lineHeight: 1 }}>{c.value}</p>
          </div>
        ))}
      </div>

      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 36 }}>
        Si cancelas perderás acceso a estos datos y análisis el <strong style={{ color: 'var(--text)' }}>{fmtFecha(accessUntil)}</strong>.
      </p>

      {/* PASO 2 — Pregunta de motivo */}
      <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-strong)', marginBottom: 16 }}>¿Por qué quieres cancelar?</h2>

      <div style={{ display: 'grid', gap: 8, marginBottom: 20 }}>
        {REASONS.map(r => (
          <button key={r.id} onClick={() => { setReason(r.id); setError(null); setFeedback('') }} style={{
            display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', width: '100%',
            padding: '12px 16px', borderRadius: 10, cursor: 'pointer', fontSize: 14,
            border: reason === r.id ? '1px solid rgba(99,102,241,0.6)' : '1px solid var(--surface-3)',
            background: reason === r.id ? 'rgba(99,102,241,0.12)' : 'var(--surface)',
            color: reason === r.id ? 'var(--text)' : 'var(--text-muted)', fontWeight: reason === r.id ? 700 : 500,
          }}>
            <span style={{ fontSize: 18 }}>{r.emoji}</span> {r.label}
          </button>
        ))}
      </div>

      {/* Respuesta personalizada según motivo */}
      {reason && (
        <div style={{ ...CARD, padding: 22 }}>
          {error && <p style={{ fontSize: 12, color: 'var(--negative)', marginBottom: 12 }}>{error}</p>}

          {/* Precio → descuento (solo si no lo usó antes) */}
          {reason === 'precio' && (
            discountUsed ? (
              <Retention
                text="Ya disfrutaste antes de un descuento de retención. Si el precio sigue siendo un problema, lo entendemos."
                onCancel={() => setView('confirm')}
              />
            ) : (
              <Retention
                text={`Entendemos que el precio importa. Te ofrecemos continuar con un 50% de descuento durante los próximos 3 meses — pagarías solo ${halfPrice}€/mes.`}
                btnLabel="Aceptar descuento y continuar"
                onAccept={acceptDiscount}
                onCancel={() => setView('confirm')}
                busy={busy}
              />
            )
          )}

          {/* No lo uso → pausa 30 días */}
          {reason === 'no_uso' && (
            <Retention
              text="Puedes pausar tu suscripción 30 días gratis — cuando vuelvas todo estará exactamente como lo dejaste."
              btnLabel="Pausar 30 días gratis"
              onAccept={() => pause(1)}
              onCancel={() => setView('confirm')}
              busy={busy}
            />
          )}

          {/* Faltan funciones → campo texto + enviar sugerencia */}
          {reason === 'faltan_funciones' && (
            <div>
              <p style={{ fontSize: 14, color: 'var(--text)', marginBottom: 12, lineHeight: 1.5 }}>
                Cuéntanos qué funciones necesitas — muchas de las mejoras actuales vienen de sugerencias de usuarios como tú.
              </p>
              <textarea style={TEXTAREA} value={feedbackText} onChange={e => setFeedback(e.target.value)} placeholder="Las funciones que echas en falta…" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-start', marginTop: 14 }}>
                <button onClick={sendSuggestion} disabled={busy} style={BTN_GREEN}>Enviar sugerencia y continuar como Premium</button>
                <button onClick={() => setView('confirm')} style={LINK_SMALL}>Cancelar de todas formas</button>
              </div>
            </div>
          )}

          {/* Gasto temporal → pausa 1 o 2 meses */}
          {reason === 'gasto_temporal' && (
            <div>
              <p style={{ fontSize: 14, color: 'var(--text)', marginBottom: 14, lineHeight: 1.5 }}>
                Puedes pausar hasta 2 meses — sin coste, sin perder tus datos.
              </p>
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                {[1, 2].map(m => (
                  <button key={m} onClick={() => setPauseMonths(m)} style={{
                    flex: 1, padding: '10px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700,
                    border: pauseMonths === m ? '1px solid rgba(52,211,153,0.6)' : '1px solid var(--border-strong)',
                    background: pauseMonths === m ? 'rgba(52,211,153,0.12)' : 'var(--surface-2)',
                    color: pauseMonths === m ? 'var(--positive)' : 'var(--text-muted)',
                  }}>Pausar {m} {m === 1 ? 'mes' : 'meses'}</button>
                ))}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-start' }}>
                <button onClick={() => pause(pauseMonths)} disabled={busy} style={BTN_GREEN}>Pausar suscripción</button>
                <button onClick={() => setView('confirm')} style={LINK_SMALL}>Cancelar definitivamente</button>
              </div>
            </div>
          )}

          {/* Otra herramienta / ya conseguido → texto opcional + confirmar */}
          {(reason === 'otra_herramienta' || reason === 'ya_conseguido') && (
            <div>
              <p style={{ fontSize: 14, color: 'var(--text)', marginBottom: 12, lineHeight: 1.5 }}>
                {reason === 'otra_herramienta' ? '¿Qué herramienta usarás? Nos ayuda a mejorar.' : '¿Qué buscabas conseguir? Nos ayuda a entender mejor a nuestros usuarios.'}
              </p>
              <textarea style={TEXTAREA} value={feedbackText} onChange={e => setFeedback(e.target.value)} placeholder="Opcional" />
              <div style={{ marginTop: 14 }}>
                <button onClick={() => setView('confirm')} style={BTN_INDIGO}>Continuar</button>
              </div>
            </div>
          )}

          {/* Otro motivo → directo a confirmar */}
          {reason === 'otro' && (
            <div>
              <p style={{ fontSize: 14, color: 'var(--text)', marginBottom: 12, lineHeight: 1.5 }}>Lamentamos verte partir. Puedes contarnos más en el siguiente paso.</p>
              <button onClick={() => setView('confirm')} style={BTN_INDIGO}>Continuar</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Retention({ text, btnLabel, onAccept, onCancel, busy }) {
  return (
    <div>
      <p style={{ fontSize: 14, color: 'var(--text)', marginBottom: 18, lineHeight: 1.5 }}>{text}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-start' }}>
        {onAccept && btnLabel && (
          <button onClick={onAccept} disabled={busy} style={{ padding: '12px 24px', background: 'rgba(52,211,153,0.9)', border: 'none', borderRadius: 8, color: '#062b1f', fontSize: 14, fontWeight: 800, cursor: 'pointer' }}>
            {busy ? 'Procesando…' : btnLabel}
          </button>
        )}
        <button onClick={onCancel} style={{ fontSize: 12, color: 'var(--text-faint)', textDecoration: 'underline', cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}>
          {onAccept ? 'No, prefiero cancelar de todas formas' : 'Continuar con la cancelación'}
        </button>
      </div>
    </div>
  )
}

function Dato({ k, v }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, paddingBottom: 12, borderBottom: '1px solid var(--surface-3)' }}>
      <span style={{ fontSize: 13, color: 'var(--text-faint)' }}>{k}</span>
      <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600, textAlign: 'right' }}>{v}</span>
    </div>
  )
}
