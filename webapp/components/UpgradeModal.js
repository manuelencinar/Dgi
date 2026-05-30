'use client'
import Link from 'next/link'

const PERKS = [
  'Empresas ilimitadas (ahora: 10 máximo)',
  'Exportar e importar tu cartera en JSON',
  'Fetch automático de fundamentales',
  'Backup en GitHub',
]

export default function UpgradeModal({ onClose }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px 12px' }}>
      <div style={{ width: '100%', maxWidth: 400, background: '#0f1221', border: '1px solid rgba(99,102,241,0.35)', borderRadius: 18, padding: '28px 24px' }}>

        <div style={{ textAlign: 'center', marginBottom: 22 }}>
          <p style={{ fontSize: 34, marginBottom: 10 }}>⚡</p>
          <h2 style={{ fontSize: 18, fontWeight: 900, color: '#e0e8f0', marginBottom: 6 }}>Límite del plan gratuito</h2>
          <p style={{ fontSize: 13, color: '#4a5270' }}>Has alcanzado el máximo de 10 empresas.</p>
        </div>

        <div style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 12, padding: '14px 16px', marginBottom: 20 }}>
          <p style={{ fontSize: 10, color: '#818cf8', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>Premium incluye</p>
          <div style={{ display: 'grid', gap: 8 }}>
            {PERKS.map((p, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, color: '#8090a8' }}>
                <span style={{ color: '#818cf8', flexShrink: 0, fontWeight: 700, marginTop: 1 }}>✓</span>
                {p}
              </div>
            ))}
          </div>
        </div>

        <Link href="/pricing" style={{ display: 'block', textAlign: 'center', padding: '12px 0', background: 'rgba(99,102,241,0.8)', color: '#fff', borderRadius: 9, fontSize: 14, fontWeight: 700, textDecoration: 'none', marginBottom: 8 }}>
          Ver planes Premium →
        </Link>
        <button onClick={onClose} style={{ width: '100%', padding: '10px 0', background: 'rgba(255,255,255,0.04)', color: '#4a5270', border: 'none', borderRadius: 9, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
          Continuar gratis
        </button>
      </div>
    </div>
  )
}
