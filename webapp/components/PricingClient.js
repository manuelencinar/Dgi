'use client'
import { useState } from 'react'
import Link from 'next/link'

const FREE_FEATURES = [
  'Mercados globales con Score DGI',
  'Termómetro DGI y yield del índice',
  'Ranking de los 42 mercados',
  'Hasta 10 empresas en tu índice',
  'Scoring automático y gráficos',
]

const PREMIUM_FEATURES = [
  'Todo lo del plan gratuito',
  'Radar de oportunidades de compra',
  'Mapa de salud financiera del índice',
  'Desglose completo del Score DGI',
  'Evolución histórica del índice',
  'Alertas de mercado',
  'Empresas ilimitadas en tu índice',
  'Exportar / Importar JSON',
  'Fetch de fundamentales automático',
]

const FAQ = [
  {
    q: '¿Hay periodo de prueba?',
    a: 'El plan gratuito es permanente y no requiere tarjeta. Úsalo el tiempo que necesites. El premium se cobra desde el primer día.',
  },
  {
    q: '¿Puedo cancelar cuando quiera?',
    a: 'Sí, sin permanencia ni penalización. Cancelas desde el portal de cliente y no se renueva el siguiente periodo.',
  },
  {
    q: '¿Qué pasa con mis datos si cancelo?',
    a: 'Tus datos se conservan. Solo se desactivan las funciones premium; sigues en el plan gratuito con acceso completo al tier gratuito.',
  },
  {
    q: '¿Puedo cambiar de mensual a anual?',
    a: 'Sí, desde el portal de cliente puedes cambiar de plan en cualquier momento. El cambio es inmediato y se prorratean los días.',
  },
]

export default function PricingClient({
  isLoggedIn, isPremium, hasCustomerId,
  monthlyPriceId, annualPriceId,
  success, cancel,
}) {
  const [loading, setLoading] = useState(null) // 'monthly' | 'annual' | 'portal'

  async function startCheckout(priceId, key) {
    if (!isLoggedIn) { window.location.href = '/register'; return }
    setLoading(key)
    try {
      const r = await fetch('/api/stripe/checkout', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ priceId }),
      })
      const d = await r.json()
      if (d.url) window.location.href = d.url
      else setLoading(null)
    } catch { setLoading(null) }
  }

  async function openPortal() {
    setLoading('portal')
    try {
      const r = await fetch('/api/stripe/portal', { method: 'POST' })
      const d = await r.json()
      if (d.url) window.location.href = d.url
      else setLoading(null)
    } catch { setLoading(null) }
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '40px 16px 80px' }}>

      {/* Banner éxito/cancelación */}
      {success && (
        <div style={{ marginBottom: 28, padding: '14px 20px', background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.25)', borderRadius: 10, color: '#34d399', fontSize: 14, fontWeight: 600, textAlign: 'center' }}>
          ¡Suscripción activada! Ya tienes acceso completo al plan premium.
        </div>
      )}
      {cancel && (
        <div style={{ marginBottom: 28, padding: '14px 20px', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 10, color: '#f87171', fontSize: 14, textAlign: 'center' }}>
          El pago fue cancelado. Puedes intentarlo de nuevo cuando quieras.
        </div>
      )}

      {/* Cabecera */}
      <div style={{ textAlign: 'center', marginBottom: 48 }}>
        <h1 style={{ fontSize: 30, fontWeight: 900, color: '#e0e8f0', marginBottom: 10 }}>
          Planes simples y transparentes
        </h1>
        <p style={{ fontSize: 14, color: '#4a5270' }}>
          Empieza gratis. Sin tarjeta. Actualiza cuando quieras.
        </p>
      </div>

      {/* Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 14, maxWidth: 860, margin: '0 auto 20px' }}>

        {/* Gratuito */}
        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '28px 24px' }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: '#4a5270', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10 }}>Gratuito</p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 6 }}>
            <span style={{ fontSize: 38, fontWeight: 900, color: '#e0e8f0' }}>0€</span>
            <span style={{ fontSize: 13, color: '#4a5270' }}>/mes</span>
          </div>
          <p style={{ fontSize: 11, color: '#3a4260', marginBottom: 22 }}>Sin tarjeta. Para siempre.</p>
          <div style={{ display: 'grid', gap: 9, marginBottom: 28 }}>
            {FREE_FEATURES.map((f, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, fontSize: 13 }}>
                <span style={{ color: '#34d399', flexShrink: 0, fontWeight: 700, lineHeight: 1.4 }}>✓</span>
                <span style={{ color: '#8090a8', lineHeight: 1.4 }}>{f}</span>
              </div>
            ))}
          </div>
          {isPremium ? (
            <div style={{ textAlign: 'center', padding: '11px 0', color: '#3a4260', fontSize: 13 }}>Plan inferior</div>
          ) : (
            <div style={{ textAlign: 'center', padding: '11px 0', background: 'rgba(255,255,255,0.03)', color: '#4a5270', borderRadius: 9, fontSize: 13, fontWeight: 700 }}>
              Plan actual
            </div>
          )}
        </div>

        {/* Mensual */}
        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: '28px 24px' }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: '#6a7090', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10 }}>Premium mensual</p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 6 }}>
            <span style={{ fontSize: 38, fontWeight: 900, color: '#e0e8f0' }}>9,99€</span>
            <span style={{ fontSize: 13, color: '#4a5270' }}>/mes</span>
          </div>
          <p style={{ fontSize: 11, color: '#3a4260', marginBottom: 22 }}>Cancela en cualquier momento.</p>
          <div style={{ display: 'grid', gap: 9, marginBottom: 28 }}>
            {PREMIUM_FEATURES.map((f, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, fontSize: 13 }}>
                <span style={{ color: '#818cf8', flexShrink: 0, fontWeight: 700, lineHeight: 1.4 }}>✓</span>
                <span style={{ color: '#8090a8', lineHeight: 1.4 }}>{f}</span>
              </div>
            ))}
          </div>
          {isPremium ? (
            <div style={{ textAlign: 'center', padding: '11px 0', color: '#3a4260', fontSize: 13 }}>Incluido en tu plan</div>
          ) : (
            <button
              onClick={() => startCheckout(monthlyPriceId, 'monthly')}
              disabled={loading === 'monthly'}
              style={{ width: '100%', padding: '12px 0', background: 'rgba(99,102,241,0.25)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.35)', borderRadius: 9, fontSize: 14, fontWeight: 700, cursor: loading === 'monthly' ? 'default' : 'pointer', fontFamily: 'inherit', transition: 'opacity .15s' }}>
              {loading === 'monthly' ? 'Redirigiendo…' : (isLoggedIn ? 'Activar mensual' : 'Crear cuenta y activar')}
            </button>
          )}
        </div>

        {/* Anual — protagonista */}
        <div style={{ background: 'rgba(99,102,241,0.06)', border: '2px solid rgba(99,102,241,0.45)', borderRadius: 16, padding: '28px 24px', position: 'relative' }}>
          <div style={{ position: 'absolute', top: -13, left: '50%', transform: 'translateX(-50%)', background: '#6366f1', color: '#fff', fontSize: 10, fontWeight: 800, padding: '4px 16px', borderRadius: 10, letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>
            MEJOR PRECIO · −50%
          </div>
          <p style={{ fontSize: 10, fontWeight: 700, color: '#818cf8', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10 }}>Premium anual</p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 4 }}>
            <span style={{ fontSize: 38, fontWeight: 900, color: '#e0e8f0' }}>59,90€</span>
            <span style={{ fontSize: 13, color: '#4a5270' }}>/año</span>
          </div>
          <p style={{ fontSize: 12, color: '#34d399', fontWeight: 600, marginBottom: 4 }}>
            Equivale a 4,99€/mes
          </p>
          <p style={{ fontSize: 11, color: '#4a5270', marginBottom: 22 }}>
            Ahorras 60€ al año frente al mensual.
          </p>
          <div style={{ display: 'grid', gap: 9, marginBottom: 28 }}>
            {PREMIUM_FEATURES.map((f, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, fontSize: 13 }}>
                <span style={{ color: '#818cf8', flexShrink: 0, fontWeight: 700, lineHeight: 1.4 }}>✓</span>
                <span style={{ color: '#8090a8', lineHeight: 1.4 }}>{f}</span>
              </div>
            ))}
          </div>
          {isPremium ? (
            <div style={{ textAlign: 'center', padding: '11px 0', color: '#34d399', fontSize: 13, fontWeight: 600 }}>✓ Plan activo</div>
          ) : (
            <button
              onClick={() => startCheckout(annualPriceId, 'annual')}
              disabled={loading === 'annual'}
              style={{ width: '100%', padding: '13px 0', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 9, fontSize: 15, fontWeight: 800, cursor: loading === 'annual' ? 'default' : 'pointer', fontFamily: 'inherit', boxShadow: '0 4px 20px rgba(99,102,241,0.35)', transition: 'opacity .15s' }}>
              {loading === 'annual' ? 'Redirigiendo…' : (isLoggedIn ? 'Activar anual →' : 'Crear cuenta y activar →')}
            </button>
          )}
        </div>
      </div>

      {/* Gestionar suscripción */}
      {isPremium && hasCustomerId && (
        <div style={{ textAlign: 'center', marginBottom: 44 }}>
          <button
            onClick={openPortal}
            disabled={loading === 'portal'}
            style={{ fontSize: 12, color: '#4a5270', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', fontFamily: 'inherit' }}>
            {loading === 'portal' ? 'Abriendo portal…' : 'Gestionar suscripción / Cancelar'}
          </button>
        </div>
      )}

      {/* FAQ */}
      <div style={{ maxWidth: 600, margin: '0 auto' }}>
        <h2 style={{ fontSize: 12, fontWeight: 700, color: '#3a4260', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 16, textAlign: 'center' }}>
          Preguntas frecuentes
        </h2>
        <div style={{ display: 'grid', gap: 8 }}>
          {FAQ.map((item, i) => (
            <div key={i} style={{ padding: '14px 18px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 10 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#c8d0e0', marginBottom: 5 }}>{item.q}</p>
              <p style={{ fontSize: 12, color: '#4a5270', lineHeight: 1.65 }}>{item.a}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
