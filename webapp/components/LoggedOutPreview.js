import Link from 'next/link'

// Preview mockeada para usuarios sin sesión en Watchlist / Cartera: en vez de
// mandar directo al login, se enseña el valor con datos de ejemplo difuminados
// y un CTA para registrarse.
const VARIANTS = {
  watchlist: {
    icon: '👁',
    title: 'Tu Watchlist DGI',
    subtitle: 'Sigue empresas y recibe un aviso cuando lleguen a tu precio o yield objetivo. Sin perderte ninguna oportunidad de compra.',
    cols: ['Empresa', 'Precio', 'Objetivo', 'Distancia', 'Yield'],
    rows: [
      ['🇺🇸 Johnson & Johnson', '152,30 $', '145,00 $', '+5,0%', '3,1%'],
      ['🇪🇸 Inditex', '46,80 €', '42,00 €', '+11,4%', '3,4%'],
      ['🇩🇪 Allianz', '312,40 €', '300,00 €', '+4,1%', '4,6%'],
      ['🇺🇸 PepsiCo', '142,10 $', '135,00 $', '+5,3%', '3,4%'],
      ['🇬🇧 Diageo', '2.410 p', '2.200 p', '+9,5%', '3,9%'],
    ],
  },
  cartera: {
    icon: '💼',
    title: 'Tu cartera DGI',
    subtitle: 'Controla tus posiciones, dividendos cobrados, diversificación, coste fiscal y proyección de renta a 10 años con CAGR real.',
    cols: ['Empresa', 'Valor', 'Peso', 'Yield', 'Renta/año'],
    rows: [
      ['🇺🇸 Coca-Cola', '4.200 €', '18%', '3,0%', '126 €'],
      ['🇺🇸 Microsoft', '3.800 €', '16%', '0,8%', '30 €'],
      ['🇫🇷 LVMH', '3.100 €', '13%', '2,1%', '65 €'],
      ['🇪🇸 Iberdrola', '2.700 €', '12%', '4,8%', '130 €'],
      ['🇺🇸 Realty Income', '2.300 €', '10%', '5,6%', '129 €'],
    ],
  },
}

export default function LoggedOutPreview({ variant = 'cartera' }) {
  const v = VARIANTS[variant] || VARIANTS.cartera
  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 16px 80px' }}>
      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <div style={{ fontSize: 40, marginBottom: 10 }}>{v.icon}</div>
        <h1 style={{ fontSize: 26, fontWeight: 900, color: 'var(--text-strong)', marginBottom: 10 }}>{v.title}</h1>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.6, maxWidth: 560, margin: '0 auto' }}>{v.subtitle}</p>
      </div>

      {/* Mock difuminado + CTA superpuesto */}
      <div style={{ position: 'relative', borderRadius: 14, overflow: 'hidden', border: '1px solid var(--border)' }}>
        <div style={{ filter: 'blur(2px)', opacity: 0.55, pointerEvents: 'none', userSelect: 'none', padding: '12px 14px', background: 'var(--surface)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', gap: 8, padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>
            {v.cols.map((c, i) => <span key={i} style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-faint)', textAlign: i === 0 ? 'left' : 'right', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{c}</span>)}
          </div>
          {v.rows.map((r, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', gap: 8, padding: '10px 8px', borderBottom: '1px solid var(--surface-2)' }}>
              {r.map((cell, j) => <span key={j} style={{ fontSize: 12.5, fontWeight: j === 0 ? 700 : 600, color: j === 0 ? 'var(--text)' : 'var(--text-muted)', textAlign: j === 0 ? 'left' : 'right', fontVariantNumeric: 'tabular-nums' }}>{cell}</span>)}
            </div>
          ))}
        </div>
        {/* Degradado + CTA */}
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(to bottom, rgba(8,11,20,0.45), rgba(8,11,20,0.85))' }}>
          <div style={{ textAlign: 'center', padding: 20 }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 4 }}>Datos de ejemplo</p>
            <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 18 }}>Regístrate gratis para crear {variant === 'watchlist' ? 'tu watchlist' : 'tu cartera'} real.</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Link href={`/register?next=/${variant}`} style={{ fontSize: 14, fontWeight: 800, color: '#fff', textDecoration: 'none', padding: '12px 24px', background: 'var(--accent)', borderRadius: 10, boxShadow: '0 4px 20px rgba(99,102,241,0.4)' }}>
                Empezar gratis →
              </Link>
              <Link href={`/login?next=/${variant}`} style={{ fontSize: 14, fontWeight: 600, color: 'var(--accent)', textDecoration: 'none', padding: '12px 20px', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 10, background: 'rgba(99,102,241,0.08)' }}>
                Acceder
              </Link>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-faintest)', marginTop: 14 }}>Sin tarjeta · Plan gratuito permanente</p>
          </div>
        </div>
      </div>
    </div>
  )
}
