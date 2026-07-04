import Link from 'next/link'
import PublicNav from '@/components/PublicNav'
import { GUIAS } from '@/data/guias'

const BASE = 'https://everdiv.com'

export const metadata = {
  title: 'Guías de inversión en dividendos (DGI) | EverDiv',
  description: 'Aprende Dividend Growth Investing en español: qué es el DGI, cómo tributan los dividendos en España, Reyes y Aristócratas del dividendo y las métricas que importan.',
  alternates: { canonical: `${BASE}/guias` },
}

const CARD = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 22 }

export default function GuiasIndex() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <PublicNav />
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '44px 20px 70px' }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 14 }}>Aprende DGI</p>
          <h1 style={{ fontSize: 'clamp(28px, 5vw, 38px)', fontWeight: 900, color: 'var(--text-strong)', marginBottom: 12, lineHeight: 1.15 }}>Guías de inversión en dividendos</h1>
          <p style={{ fontSize: 15.5, color: 'var(--text-muted)', maxWidth: 560, margin: '0 auto', lineHeight: 1.65 }}>
            Todo lo que necesitas para invertir en dividendos crecientes con criterio, explicado en español y sin humo.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 14 }}>
          <style>{`@media(min-width:680px){.guias-grid{grid-template-columns:1fr 1fr!important}}`}</style>
          <div className="guias-grid" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 14 }}>
            {GUIAS.map(g => (
              <Link key={g.slug} href={`/guias/${g.slug}`} style={{ ...CARD, textDecoration: 'none', display: 'flex', flexDirection: 'column' }}>
                <p style={{ fontSize: 10.5, color: 'var(--accent)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>{g.category} · {g.minutes} min</p>
                <h2 style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-strong)', lineHeight: 1.3, marginBottom: 8 }}>{g.title}</h2>
                <p style={{ fontSize: 13, color: 'var(--text-faint)', lineHeight: 1.6, flex: 1 }}>{g.excerpt}</p>
                <span style={{ fontSize: 12.5, color: 'var(--accent)', fontWeight: 700, marginTop: 12 }}>Leer guía →</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
