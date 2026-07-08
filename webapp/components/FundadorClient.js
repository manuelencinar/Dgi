'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

const CARD = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 24 }

const TOKEN = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN
const ENV = process.env.NEXT_PUBLIC_PADDLE_ENV || 'production'
const PRICE = process.env.NEXT_PUBLIC_PADDLE_PRICE_FOUNDER

export default function FundadorClient() {
  const sb = useRef(createClient()).current
  const [user, setUser] = useState(undefined)   // undefined=cargando, null=sin sesión
  const [ready, setReady] = useState(false)
  const [done, setDone] = useState(false)
  const [err, setErr] = useState(null)

  useEffect(() => {
    sb.auth.getUser().then(({ data }) => setUser(data?.user || null)).catch(() => setUser(null))
  }, [sb])

  // Carga Paddle.js (CDN, sin dependencia npm) e inicializa.
  useEffect(() => {
    if (!TOKEN || !PRICE) return
    const init = () => {
      try {
        const P = window.Paddle
        if (!P) return
        if (ENV === 'sandbox') P.Environment.set('sandbox')
        P.Initialize({ token: TOKEN, eventCallback: (e) => { if (e?.name === 'checkout.completed') setDone(true) } })
        setReady(true)
      } catch (e) { setErr('No se pudo iniciar el pago.') }
    }
    if (window.Paddle) { init(); return }
    const id = 'paddle-js'
    if (document.getElementById(id)) { const t = setInterval(() => { if (window.Paddle) { clearInterval(t); init() } }, 200); return () => clearInterval(t) }
    const s = document.createElement('script')
    s.id = id; s.src = 'https://cdn.paddle.com/paddle/v2/paddle.js'; s.async = true
    s.onload = init; s.onerror = () => setErr('No se pudo cargar el pago.')
    document.body.appendChild(s)
  }, [])

  const openCheckout = () => {
    if (!ready || !user) return
    setErr(null)
    try {
      window.Paddle.Checkout.open({
        items: [{ priceId: PRICE, quantity: 1 }],
        customer: { email: user.email },
        customData: { user_id: user.id },
        settings: { displayMode: 'overlay', theme: 'dark', locale: 'es' },
      })
    } catch (e) { setErr(String(e?.message || e)) }
  }

  const perks = ['Acceso completo a todo Premium', 'Precio bloqueado de por vida', 'Solo 100 plazas de fundador', 'IVA incluido · factura automática']

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '40px 20px 70px' }}>
      <div style={{ textAlign: 'center', marginBottom: 26 }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent)', background: 'rgba(99,102,241,0.16)', padding: '5px 14px', borderRadius: 20, letterSpacing: '0.07em' }}>🚀 BETA FUNDADORES · SOLO 100 PLAZAS</span>
        <h1 style={{ fontSize: 34, fontWeight: 900, color: 'var(--text-strong)', margin: '18px 0 8px' }}>20&nbsp;€/año. <span style={{ color: 'var(--accent)' }}>Para siempre.</span></h1>
        <p style={{ fontSize: 15, color: 'var(--text-muted)', lineHeight: 1.6, maxWidth: 520, margin: '0 auto' }}>
          Conviértete en uno de los 100 primeros suscriptores y disfruta de un precio de 20 € al año para siempre, con acceso completo a todo Premium.
        </p>
      </div>

      <div style={CARD}>
        {done ? (
          <div style={{ textAlign: 'center', padding: '14px 0' }}>
            <p style={{ fontSize: 30, marginBottom: 8 }}>🎉</p>
            <p style={{ fontSize: 16, fontWeight: 800, color: 'var(--positive)', marginBottom: 6 }}>¡Bienvenido, fundador!</p>
            <p style={{ fontSize: 13.5, color: 'var(--text-muted)', lineHeight: 1.6, maxWidth: 440, margin: '0 auto' }}>
              Tu suscripción está activa. Tu Premium se activa en unos segundos; si aún no lo ves, recarga la página.
            </p>
            <Link href="/novedades" style={{ display: 'inline-block', marginTop: 18, fontSize: 13.5, fontWeight: 700, color: '#fff', background: 'var(--accent)', borderRadius: 9, padding: '11px 22px', textDecoration: 'none' }}>Ir a la app →</Link>
          </div>
        ) : (
          <>
            <div style={{ display: 'grid', gap: 10, marginBottom: 20 }}>
              {perks.map(p => (
                <div key={p} style={{ display: 'flex', gap: 9, fontSize: 13.5, color: 'var(--text)' }}>
                  <span style={{ color: 'var(--positive)', fontWeight: 800, flexShrink: 0 }}>✓</span>{p}
                </div>
              ))}
            </div>

            {(!TOKEN || !PRICE) ? (
              <p style={{ fontSize: 13, color: 'var(--warning)', textAlign: 'center', padding: '8px 0' }}>El pago estará disponible muy pronto. Vuelve en unos días para reservar tu plaza.</p>
            ) : user === null ? (
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>Inicia sesión o crea tu cuenta para suscribirte (así activamos tu Premium al instante).</p>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                  <Link href="/register?next=/fundador" style={{ fontSize: 14, fontWeight: 800, color: '#fff', background: 'var(--accent)', borderRadius: 9, padding: '11px 22px', textDecoration: 'none' }}>Crear cuenta gratis</Link>
                  <Link href="/login?next=/fundador" style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 9, padding: '11px 20px', textDecoration: 'none' }}>Ya tengo cuenta</Link>
                </div>
              </div>
            ) : (
              <button onClick={openCheckout} disabled={!ready} style={{ width: '100%', padding: '14px 0', background: 'var(--accent)', border: 'none', borderRadius: 10, color: '#fff', fontWeight: 800, fontSize: 15.5, cursor: ready ? 'pointer' : 'default', opacity: ready ? 1 : 0.6, boxShadow: '0 4px 24px rgba(99,102,241,0.4)' }}>
                {ready ? 'Suscribirme por 20 €/año →' : 'Cargando pago…'}
              </button>
            )}
            {err && <p style={{ fontSize: 12, color: 'var(--negative)', marginTop: 10, textAlign: 'center' }}>{err}</p>}
            <p style={{ fontSize: 11, color: 'var(--text-faintest)', textAlign: 'center', marginTop: 14 }}>Pago seguro con tarjeta, PayPal o Apple/Google Pay. Cancela cuando quieras.</p>
          </>
        )}
      </div>
    </div>
  )
}
