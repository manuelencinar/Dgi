'use client'
import { useState } from 'react'
import Link from 'next/link'

const CARD = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 24 }
const INPUT = { background: 'var(--bg-elev)', border: '1px solid var(--border-strong)', borderRadius: 8, padding: '11px 13px', color: 'var(--text)', fontSize: 14, outline: 'none', width: '100%', boxSizing: 'border-box', fontFamily: 'inherit' }

export default function FundadorClient({ bizumPhone }) {
  const [form, setForm] = useState({ email: '', name: '', bizum_ref: '' })
  const [state, setState] = useState('idle')   // idle | sending | ok | error
  const [msg, setMsg] = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    setState('sending'); setMsg(null)
    try {
      const res = await fetch('/api/beta/solicitar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      const j = await res.json()
      if (!res.ok) { setState('error'); setMsg(j.error || 'No se pudo enviar'); return }
      setState('ok')
    } catch (e) { setState('error'); setMsg(String(e.message || e)) }
  }

  const steps = [
    ['1', 'Regístrate gratis', <>Crea tu cuenta en <Link href="/register" style={{ color: 'var(--accent)', fontWeight: 700 }}>everdiv.com/register</Link> (si aún no la tienes). Usa el mismo email que pondrás abajo.</>],
    ['2', `Haz un Bizum de 20 €`, <>Envía <b style={{ color: 'var(--text-strong)' }}>20 €</b> por Bizum al número <b style={{ color: 'var(--accent)' }}>{bizumPhone}</b> poniendo tu <b style={{ color: 'var(--text-strong)' }}>email</b> como concepto.</>],
    ['3', 'Avísanos aquí', 'Rellena el formulario con tu email y activamos tu Premium de fundador (1 año) en menos de 24 h. El precio de 20 €/año queda bloqueado para ti para siempre.'],
  ]

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '40px 20px 70px' }}>
      <div style={{ textAlign: 'center', marginBottom: 30 }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent)', background: 'rgba(99,102,241,0.16)', padding: '5px 14px', borderRadius: 20, letterSpacing: '0.07em' }}>🚀 BETA FUNDADORES · SOLO 100 PLAZAS</span>
        <h1 style={{ fontSize: 34, fontWeight: 900, color: 'var(--text-strong)', margin: '18px 0 8px' }}>20&nbsp;€/año. <span style={{ color: 'var(--accent)' }}>Para siempre.</span></h1>
        <p style={{ fontSize: 15, color: 'var(--text-muted)', lineHeight: 1.6, maxWidth: 520, margin: '0 auto' }}>
          Conviértete en uno de los 100 primeros suscriptores y disfruta de un precio de 20 € al año para siempre, con acceso completo a todo Premium.
        </p>
      </div>

      <div style={{ ...CARD, marginBottom: 18 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 16 }}>Cómo unirte (pago por Bizum)</p>
        <div style={{ display: 'grid', gap: 16 }}>
          {steps.map(([n, t, d]) => (
            <div key={n} style={{ display: 'flex', gap: 14 }}>
              <div style={{ flexShrink: 0, width: 28, height: 28, borderRadius: '50%', background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', color: 'var(--accent)', fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{n}</div>
              <div>
                <h3 style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--text-strong)', marginBottom: 3 }}>{t}</h3>
                <p style={{ fontSize: 13, color: 'var(--text-faint)', lineHeight: 1.6 }}>{d}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={CARD}>
        {state === 'ok' ? (
          <div style={{ textAlign: 'center', padding: '14px 0' }}>
            <p style={{ fontSize: 30, marginBottom: 8 }}>🎉</p>
            <p style={{ fontSize: 16, fontWeight: 800, color: 'var(--positive)', marginBottom: 6 }}>¡Solicitud recibida!</p>
            <p style={{ fontSize: 13.5, color: 'var(--text-muted)', lineHeight: 1.6, maxWidth: 440, margin: '0 auto' }}>
              En cuanto confirmemos tu Bizum activaremos tu Premium de fundador (menos de 24 h). Te avisaremos por email. ¡Gracias por ser de los primeros!
            </p>
            <Link href="/novedades" style={{ display: 'inline-block', marginTop: 18, fontSize: 13.5, fontWeight: 700, color: '#fff', background: 'var(--accent)', borderRadius: 9, padding: '11px 22px', textDecoration: 'none' }}>Ir a la app →</Link>
          </div>
        ) : (
          <form onSubmit={submit} style={{ display: 'grid', gap: 13 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Ya he hecho el Bizum</p>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 5, display: 'block' }}>Tu email (el mismo de tu cuenta) *</label>
              <input style={INPUT} type="email" required placeholder="tucorreo@email.com" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 13 }}>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 5, display: 'block' }}>Nombre (opcional)</label>
                <input style={INPUT} type="text" placeholder="Tu nombre" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 5, display: 'block' }}>Referencia Bizum (opcional)</label>
                <input style={INPUT} type="text" placeholder="Concepto / referencia" value={form.bizum_ref} onChange={e => setForm(f => ({ ...f, bizum_ref: e.target.value }))} />
              </div>
            </div>
            {msg && <p style={{ fontSize: 12.5, color: 'var(--negative)' }}>{msg}</p>}
            <button type="submit" disabled={state === 'sending'} style={{ padding: '12px 0', background: 'var(--accent)', border: 'none', borderRadius: 9, color: '#fff', fontWeight: 800, fontSize: 14.5, cursor: 'pointer', boxShadow: '0 4px 20px rgba(99,102,241,0.35)' }}>
              {state === 'sending' ? 'Enviando…' : 'Reservar mi plaza de fundador'}
            </button>
            <p style={{ fontSize: 11, color: 'var(--text-faintest)', textAlign: 'center' }}>Activación manual en menos de 24 h. Plazas limitadas a 100.</p>
          </form>
        )}
      </div>
    </div>
  )
}
