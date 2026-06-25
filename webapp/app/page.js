import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'
import { MARKETS } from '@/lib/markets'
import { getEffectiveMarkets } from '@/lib/markets-overrides'
import LandingFaq from '@/components/LandingFaq'
import PublicNav from '@/components/PublicNav'

export const metadata = {
  title: 'Mi Índice DGI — Invierte en dividendos con criterio',
  description: 'El único screener que analiza 43 mercados globales con metodología DGI real. Score de calidad, radar de oportunidades y salud financiera actualizada. Empieza gratis.',
}

// Cachear la landing y revalidar el contador 1 vez al día (no penaliza cada visita)
export const revalidate = 86400

const FALLBACK_COUNT = 1588

async function getCompanyCount() {
  try {
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    const { count } = await sb.from('company_fundamentals').select('ticker', { count: 'exact', head: true })
    return count && count > 0 ? count : FALLBACK_COUNT
  } catch {
    return FALLBACK_COUNT
  }
}

// Datos reales de ADP para el mockup de la ficha (que no contradiga la ficha real).
async function getShowcase() {
  const fb = { streak: 42, price: 305.40, yld: 2.1, score: 8.7 }
  try {
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    const [{ data: f }, { data: sh }] = await Promise.all([
      sb.from('company_fundamentals').select('current_price, dps, div_streak').eq('ticker', 'ADP').maybeSingle(),
      sb.from('score_history').select('score').eq('ticker', 'ADP').order('date', { ascending: false }).limit(1).maybeSingle(),
    ])
    const price = f?.current_price != null ? Number(f.current_price) : fb.price
    const dps = f?.dps != null ? Number(f.dps) : null
    return {
      streak: f?.div_streak ?? fb.streak,
      price,
      yld: (price > 0 && dps != null) ? dps / price * 100 : fb.yld,
      score: sh?.score != null ? Number(sh.score) : fb.score,
    }
  } catch { return fb }
}

// ── Datos para el mockup del hero ─────────────────────────────────────────
const MOCKUP_MARKETS = [
  { flag: '🇺🇸', name: 'S&P 500',   score: 8.2, yield: 2.1, opps: 12, col: 'var(--positive)' },
  { flag: '🇬🇧', name: 'FTSE 100',  score: 7.8, yield: 3.8, opps:  9, col: 'var(--positive)' },
  { flag: '🇦🇺', name: 'ASX 200',   score: 7.1, yield: 4.2, opps:  6, col: 'var(--positive)' },
  { flag: '🇪🇸', name: 'IBEX 35',   score: 6.5, yield: 3.2, opps:  4, col: 'var(--warning)' },
  { flag: '🇩🇪', name: 'DAX',       score: 5.4, yield: 2.8, opps:  2, col: 'var(--warning)' },
  { flag: '🇫🇷', name: 'CAC 40',    score: 6.1, yield: 3.1, opps:  3, col: 'var(--warning)' },
]

function Flag({ emoji }) {
  return <span style={{ fontSize: 16, lineHeight: 1, flexShrink: 0 }}>{emoji || '🌐'}</span>
}


function Hero() {
  return (
    <section style={{
      padding: '80px 24px 90px',
      background: 'radial-gradient(ellipse 70% 50% at 50% -10%, rgba(99,102,241,0.18) 0%, transparent 70%)',
      borderBottom: '1px solid var(--surface-3)',
    }}>
      <style>{`
        .hero-grid { display: grid; grid-template-columns: 1fr; gap: 48px; align-items: center; max-width: 1060px; margin: 0 auto; }
        @media (min-width: 900px) { .hero-grid { grid-template-columns: 1fr 1fr; } }
        .hero-title { font-size: 38px; }
        @media (min-width: 640px) { .hero-title { font-size: 50px; } }
      `}</style>
      <div className="hero-grid">

        {/* Copy */}
        <div>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 16 }}>
            Dividend Growth Investing
          </p>
          <h1 className="hero-title" style={{ fontWeight: 900, color: 'var(--text-strong)', lineHeight: 1.1, marginBottom: 18 }}>
            Invierte en dividendos<br/>
            <span style={{ color: 'var(--accent)' }}>con criterio real.</span>
          </h1>
          <p style={{ fontSize: 16, color: 'var(--text-faint)', lineHeight: 1.7, marginBottom: 32, maxWidth: 480 }}>
            El único screener que analiza 43 mercados globales con metodología DGI —
            score de calidad, radar de oportunidades y salud financiera actualizada.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Link href="/register" style={{
              fontSize: 15, fontWeight: 800, color: '#fff', textDecoration: 'none',
              padding: '13px 28px', background: 'var(--accent)', borderRadius: 10,
              boxShadow: '0 4px 24px rgba(99,102,241,0.4)',
            }}>
              Empezar gratis →
            </Link>
            <a href="#precios" style={{
              fontSize: 14, fontWeight: 600, color: 'var(--accent)', textDecoration: 'none',
              padding: '13px 22px', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 10,
              background: 'rgba(99,102,241,0.08)',
            }}>
              Ver planes
            </a>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-faintest)', marginTop: 14 }}>
            Sin tarjeta de crédito · Plan gratuito permanente
          </p>
        </div>

        {/* Mockup */}
        <div style={{ perspective: 800 }}>
          <div style={{
            background: 'rgba(13,18,32,0.95)', border: '1px solid var(--border-strong)',
            borderRadius: 14, overflow: 'hidden',
            boxShadow: '0 32px 64px rgba(0,0,0,0.6), 0 0 0 1px var(--border)',
            transform: 'rotateY(-4deg) rotateX(2deg)',
          }}>
            {/* Browser chrome */}
            <div style={{ background: 'var(--surface-2)', padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ display: 'flex', gap: 5 }}>
                {['var(--negative)','var(--warning)','var(--positive)'].map((c, i) => (
                  <div key={i} style={{ width: 10, height: 10, borderRadius: '50%', background: c, opacity: 0.6 }} />
                ))}
              </div>
              <div style={{ flex: 1, background: 'var(--border)', borderRadius: 5, padding: '3px 10px', fontSize: 10, color: 'var(--text-faintest)' }}>
                miindicedgi.com/mercados
              </div>
            </div>
            {/* Header */}
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--surface-3)' }}>
              <p style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-strong)' }}>Mercados Globales</p>
              <p style={{ fontSize: 9, color: 'var(--text-faintest)' }}>43 índices · ordenados por Score DGI</p>
            </div>
            {/* Market rows */}
            {MOCKUP_MARKETS.map((m, i) => (
              <div key={i} style={{ padding: '10px 14px', borderBottom: '1px solid var(--surface-2)', display: 'flex', alignItems: 'center', gap: 10 }}>
                <Flag emoji={m.flag} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)' }}>{m.name}</p>
                  <p style={{ fontSize: 9, color: 'var(--text-faintest)' }}>
                    Yield {m.yield.toFixed(1)}% ·
                    <span style={{ color: '#fb923c' }}> {m.opps} oportunidades</span>
                  </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontSize: 18, fontWeight: 900, color: m.col, lineHeight: 1 }}>{m.score}</p>
                  <p style={{ fontSize: 8, color: 'var(--text-faintest)' }}>DGI</p>
                </div>
              </div>
            ))}
            <div style={{ padding: '8px 14px', textAlign: 'center' }}>
              <p style={{ fontSize: 9, color: 'var(--text-faintest)' }}>+ 37 mercados más</p>
            </div>
          </div>
        </div>

      </div>
    </section>
  )
}

function Benefits() {
  const items = [
    {
      icon: '🌍',
      title: '43 mercados con criterios DGI',
      text: 'Desde el S&P 500 hasta el IBEX 35, el Nikkei o el ASX. Cada mercado analizado con el mismo rigor: yield, payout, sostenibilidad y score de calidad.',
    },
    {
      icon: '🎯',
      title: 'Radar de oportunidades de compra',
      text: 'Detecta automáticamente las empresas de cada mercado que están en zona de compra según criterios DGI. Sin hacer nada, sabes dónde mirar.',
    },
    {
      icon: '💚',
      title: 'Salud financiera real del dividendo',
      text: 'No te fíes solo del yield. Analizamos payout ratio, EPS, sostenibilidad del dividendo y solidez financiera para que sepas si ese dividendo durará.',
    },
  ]
  return (
    <section style={{ padding: '80px 24px', borderBottom: '1px solid var(--surface-3)' }}>
      <style>{`
        .benefits-grid { display: grid; grid-template-columns: 1fr; gap: 24px; max-width: 960px; margin: 0 auto; }
        @media (min-width: 700px) { .benefits-grid { grid-template-columns: repeat(3, 1fr); } }
      `}</style>
      <div style={{ textAlign: 'center', marginBottom: 52 }}>
        <h2 style={{ fontSize: 28, fontWeight: 900, color: 'var(--text-strong)', marginBottom: 10 }}>
          Todo lo que necesitas. Nada que sobre.
        </h2>
        <p style={{ fontSize: 14, color: 'var(--text-faint)', maxWidth: 420, margin: '0 auto' }}>
          Diseñado para inversores que analizan con criterio, no para traders.
        </p>
      </div>
      <div className="benefits-grid">
        {items.map((item, i) => (
          <div key={i} style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 14, padding: '28px 24px',
          }}>
            <div style={{ fontSize: 32, marginBottom: 16 }}>{item.icon}</div>
            <h3 style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-strong)', marginBottom: 10, lineHeight: 1.35 }}>
              {item.title}
            </h3>
            <p style={{ fontSize: 13, color: 'var(--text-faint)', lineHeight: 1.7 }}>{item.text}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function ForWhom() {
  const yes = [
    'Construyes una cartera de dividendos crecientes a largo plazo, no buscas pelotazos.',
    'Aportas cada mes y quieres decidir con criterio qué empresa añadir y a qué precio.',
    'Quieres analizar la calidad real (foso, payout, deuda, ROIC), no solo mirar el yield.',
  ]
  return (
    <section style={{ padding: '80px 24px', borderBottom: '1px solid var(--surface-3)' }}>
      <div style={{ maxWidth: 820, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 14 }}>
            ¿Es para ti?
          </p>
          <h2 style={{ fontSize: 28, fontWeight: 900, color: 'var(--text-strong)', marginBottom: 14 }}>
            Hecha para el inversor en dividendos
          </h2>
          <p style={{ fontSize: 16, color: 'var(--text-muted)', maxWidth: 600, margin: '0 auto', lineHeight: 1.7 }}>
            Si inviertes <span style={{ color: 'var(--text-strong)', fontWeight: 700 }}>entre 300€ y 2.000€ al mes</span> en
            empresas sólidas con dividendo creciente y quieres saber <span style={{ color: 'var(--text-strong)', fontWeight: 700 }}>cuáles
            y cuándo comprar</span>, esta herramienta es para ti.
          </p>
        </div>
        <div style={{ display: 'grid', gap: 12, maxWidth: 640, margin: '0 auto' }}>
          {yes.map((t, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', background: 'rgba(52,211,153,0.05)', border: '1px solid rgba(52,211,153,0.15)', borderRadius: 10, padding: '14px 16px' }}>
              <span style={{ color: 'var(--positive)', fontWeight: 700, fontSize: 15, flexShrink: 0 }}>✓</span>
              <span style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.5 }}>{t}</span>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '10px 16px' }}>
            <span style={{ color: 'var(--negative)', fontWeight: 700, fontSize: 15, flexShrink: 0 }}>✕</span>
            <span style={{ fontSize: 13, color: 'var(--text-faint)', lineHeight: 1.5 }}>No es para trading, análisis técnico ni para buscar la próxima acción de moda.</span>
          </div>
        </div>
      </div>
    </section>
  )
}

// Mockup de tarjetas del screener filtrado para el bloque "Así se usa".
const MOCKUP_SCREENER = [
  { flag: '🇺🇸', name: 'Johnson & Johnson', t: 'JNJ',  score: 8.4, yield: 3.1, reason: 'yield +26% sobre su media de 5 años' },
  { flag: '🇬🇧', name: 'British American Tobacco', t: 'BATS', score: 7.3, yield: 7.8, reason: 'yield +31% sobre su media de 5 años' },
  { flag: '🇩🇪', name: 'Münchener Rück', t: 'MUV2', score: 7.9, yield: 3.7, reason: 'a 4% de su mínimo anual' },
  { flag: '🇪🇸', name: 'Inditex',          t: 'ITX',  score: 7.6, yield: 3.4, reason: '27% de margen de seguridad' },
  { flag: '🇺🇸', name: 'PepsiCo',          t: 'PEP',  score: 8.1, yield: 3.4, reason: '36% por debajo de su valor intrínseco' },
]

function scColor(s) { return s >= 8 ? 'var(--positive)' : s >= 6.5 ? '#86efac' : 'var(--warning)' }

function UseCase() {
  return (
    <section style={{ padding: '80px 24px', borderBottom: '1px solid var(--surface-3)', background: 'rgba(99,102,241,0.02)' }}>
      <style>{`
        .use-grid { display: grid; grid-template-columns: 1fr; gap: 40px; align-items: center; max-width: 1000px; margin: 0 auto; }
        @media (min-width: 860px) { .use-grid { grid-template-columns: 0.85fr 1fr; } }
      `}</style>
      <div style={{ textAlign: 'center', marginBottom: 48 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 14 }}>
          Así se usa cada mes
        </p>
        <h2 style={{ fontSize: 28, fontWeight: 900, color: 'var(--text-strong)', marginBottom: 10 }}>
          Cada aportación, una decisión con criterio
        </h2>
        <p style={{ fontSize: 14, color: 'var(--text-faint)', maxWidth: 480, margin: '0 auto' }}>
          El flujo real: del dinero del mes a la empresa que de verdad encaja.
        </p>
      </div>
      <div className="use-grid">
        {/* Narrativa */}
        <div style={{ display: 'grid', gap: 20 }}>
          {[
            ['1', 'Filtras por calidad', 'Yield mínimo, racha de dividendo, deuda contenida y margen de seguridad. De casi 2.000 empresas a una lista corta.'],
            ['2', 'Miras quién está barato', 'La etiqueta verde "zona de compra" te dice por qué: yield por encima de su media, descuento sobre su valor o cerca de mínimos.'],
            ['3', 'Eliges y registras la compra', 'Comparas las finalistas, decides cuál añadir este mes y la anotas en tu cartera. El mes que viene, repites.'],
          ].map(([n, t, d]) => (
            <div key={n} style={{ display: 'flex', gap: 14 }}>
              <div style={{ flexShrink: 0, width: 30, height: 30, borderRadius: '50%', background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', color: 'var(--accent)', fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{n}</div>
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-strong)', marginBottom: 4 }}>{t}</h3>
                <p style={{ fontSize: 13, color: 'var(--text-faint)', lineHeight: 1.65 }}>{d}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Mockup del screener filtrado */}
        <div style={{ background: 'rgba(13,18,32,0.95)', border: '1px solid var(--border-strong)', borderRadius: 14, overflow: 'hidden', boxShadow: '0 24px 48px rgba(0,0,0,0.5)' }}>
          <div style={{ padding: '11px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-strong)' }}>Screener DGI</span>
            <span style={{ fontSize: 9, color: 'var(--positive)', background: 'rgba(52,211,153,0.12)', padding: '2px 7px', borderRadius: 5 }}>Yield &gt;3%</span>
            <span style={{ fontSize: 9, color: 'var(--positive)', background: 'rgba(52,211,153,0.12)', padding: '2px 7px', borderRadius: 5 }}>Racha &gt;10a</span>
            <span style={{ fontSize: 9, color: 'var(--positive)', background: 'rgba(52,211,153,0.12)', padding: '2px 7px', borderRadius: 5 }}>Deuda &lt;3x</span>
          </div>
          {MOCKUP_SCREENER.map((c, i) => (
            <div key={i} style={{ padding: '10px 14px', borderBottom: '1px solid var(--surface-2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <span style={{ fontSize: 14 }}>{c.flag}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name} <span style={{ fontSize: 9, color: 'var(--text-faintest)' }}>{c.t}</span></p>
                </div>
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)' }}>{c.yield.toFixed(1)}%</span>
                <span style={{ fontSize: 15, fontWeight: 900, color: scColor(c.score), minWidth: 26, textAlign: 'right' }}>{c.score.toFixed(1)}</span>
              </div>
              <p style={{ fontSize: 9.5, color: 'var(--positive)', marginTop: 3, display: 'flex', gap: 5 }}>
                <span>●</span><span style={{ color: '#86efac' }}>Zona de compra: {c.reason}</span>
              </p>
            </div>
          ))}
          <div style={{ padding: '9px 14px', textAlign: 'center' }}>
            <span style={{ fontSize: 9, color: 'var(--text-faintest)' }}>5 finalistas de 1.900+ analizadas</span>
          </div>
        </div>
      </div>
      <div style={{ textAlign: 'center', marginTop: 44 }}>
        <Link href="/screener" style={{ fontSize: 14, fontWeight: 700, color: '#fff', textDecoration: 'none', padding: '12px 26px', background: 'var(--accent)', borderRadius: 10, boxShadow: '0 4px 20px rgba(99,102,241,0.35)' }}>
          Ver el screener real →
        </Link>
      </div>
    </section>
  )
}

function DualRanking() {
  const modes = [
    {
      icon: '⭐', tag: 'Calidad DGI', color: 'var(--positive)',
      title: 'Para construir una cartera de empresas excelentes',
      text: 'Ordena por la calidad del negocio y del dividendo con el Score DGI: rentabilidad sobre el capital, foso, payout sostenible, deuda y crecimiento. Encuentra los mejores compounders, no solo los que más reparten.',
      bullets: ['⭐ Nota (Score DGI)', '💰 Rentables (renta a 10 años)', '🎯 Baratas (margen de seguridad)', '💎 Calidad del dividendo'],
    },
    {
      icon: '🏦', tag: 'Renta DGI', color: 'var(--warning)',
      title: 'Para maximizar la renta que cobras',
      text: 'Cambia el chip y reordena las mismas empresas por el yield neto tras retenciones y la rapidez con la que recuperas la inversión vía dividendos. Pensado para quien busca renta hoy, no solo crecimiento futuro.',
      bullets: ['🏦 Renta (yield neto + recuperación)', '📈 Yield neto tras retenciones', '⏱ Años hasta recuperar la inversión'],
    },
  ]
  return (
    <section style={{ padding: '80px 24px', borderBottom: '1px solid var(--surface-3)', background: 'rgba(99,102,241,0.03)' }}>
      <style>{`
        .dual-grid { display: grid; grid-template-columns: 1fr; gap: 20px; max-width: 920px; margin: 0 auto; }
        @media (min-width: 760px) { .dual-grid { grid-template-columns: 1fr 1fr; } }
      `}</style>
      <div style={{ textAlign: 'center', marginBottom: 14 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 14 }}>
          Único en el screener
        </p>
        <h2 style={{ fontSize: 28, fontWeight: 900, color: 'var(--text-strong)', marginBottom: 10 }}>
          Dos formas de buscar. Una sola herramienta.
        </h2>
        <p style={{ fontSize: 14, color: 'var(--text-faint)', maxWidth: 520, margin: '0 auto 40px' }}>
          Calidad y renta no son lo mismo. Con un clic reordenas casi 2.000 empresas según lo que de verdad buscas.
        </p>
      </div>
      <div className="dual-grid">
        {modes.map((m, i) => (
          <div key={i} style={{
            background: 'var(--surface)', border: `1px solid ${m.color}33`,
            borderRadius: 16, padding: '28px 24px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <span style={{ fontSize: 26 }}>{m.icon}</span>
              <span style={{ fontSize: 12, fontWeight: 800, color: m.color, background: `${m.color}1a`, padding: '4px 12px', borderRadius: 20 }}>{m.tag}</span>
            </div>
            <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-strong)', marginBottom: 10, lineHeight: 1.35 }}>{m.title}</h3>
            <p style={{ fontSize: 13, color: 'var(--text-faint)', lineHeight: 1.7, marginBottom: 18 }}>{m.text}</p>
            <div style={{ display: 'grid', gap: 8 }}>
              {m.bullets.map((b, j) => (
                <div key={j} style={{ fontSize: 12.5, color: 'var(--text-muted)', display: 'flex', gap: 8 }}>
                  <span style={{ color: m.color, flexShrink: 0 }}>›</span>{b}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div style={{ textAlign: 'center', marginTop: 36 }}>
        <Link href="/screener" style={{
          fontSize: 14, fontWeight: 700, color: '#fff', textDecoration: 'none',
          padding: '12px 26px', background: 'var(--accent)', borderRadius: 10,
          boxShadow: '0 4px 20px rgba(99,102,241,0.35)',
        }}>
          Probar el screener gratis →
        </Link>
      </div>
    </section>
  )
}

function HowItWorks() {
  const steps = [
    { n: '01', title: 'Elige un mercado', text: 'Accede a cualquiera de los 43 índices disponibles. Desde los grandes americanos hasta mercados europeos, asiáticos y emergentes.' },
    { n: '02', title: 'Analiza con criterios DGI', text: 'Ve el Score de calidad del índice, el termómetro de empresas con dividendo sostenible, el yield real y el mapa de salud financiera.' },
    { n: '03', title: 'Detecta y actúa', text: 'El radar de oportunidades te señala las empresas que cumplen todos los criterios DGI y están en zona de compra. Toma mejores decisiones con más información.' },
  ]
  return (
    <section style={{ padding: '80px 24px', borderBottom: '1px solid var(--surface-3)', background: 'rgba(99,102,241,0.03)' }}>
      <style>{`
        .steps-grid { display: grid; grid-template-columns: 1fr; gap: 32px; max-width: 820px; margin: 0 auto; position: relative; }
        @media (min-width: 700px) { .steps-grid { grid-template-columns: repeat(3, 1fr); } }
      `}</style>
      <div style={{ textAlign: 'center', marginBottom: 52 }}>
        <h2 style={{ fontSize: 28, fontWeight: 900, color: 'var(--text-strong)', marginBottom: 10 }}>
          Cómo funciona
        </h2>
        <p style={{ fontSize: 14, color: 'var(--text-faint)' }}>Tres pasos. Sin curva de aprendizaje.</p>
      </div>
      <div className="steps-grid">
        {steps.map((s, i) => (
          <div key={i} style={{ position: 'relative' }}>
            <div style={{ fontSize: 40, fontWeight: 900, color: 'rgba(99,102,241,0.18)', lineHeight: 1, marginBottom: 14 }}>{s.n}</div>
            <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-strong)', marginBottom: 10 }}>{s.title}</h3>
            <p style={{ fontSize: 13, color: 'var(--text-faint)', lineHeight: 1.7 }}>{s.text}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function MarketsSection({ markets = MARKETS }) {
  return (
    <section style={{ padding: '80px 24px', borderBottom: '1px solid var(--surface-3)' }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 44 }}>
          <h2 style={{ fontSize: 28, fontWeight: 900, color: 'var(--text-strong)', marginBottom: 10 }}>
            {markets.length} mercados globales
          </h2>
          <p style={{ fontSize: 14, color: 'var(--text-faint)' }}>
            América · Europa · Asia-Pacífico · ETFs globales
          </p>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
          {markets.map(m => (
            <div key={m.symbol} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'var(--surface-2)', border: '1px solid var(--border)',
              borderRadius: 8, padding: '8px 12px',
            }}>
              <Flag emoji={m.flag} />
              <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{m.name}</span>
            </div>
          ))}
        </div>
        <div style={{ textAlign: 'center', marginTop: 32 }}>
          <Link href="/register" style={{
            fontSize: 13, fontWeight: 700, color: 'var(--accent)', textDecoration: 'none',
            padding: '10px 24px', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 9,
            background: 'rgba(99,102,241,0.08)',
          }}>
            Explorar todos los mercados →
          </Link>
        </div>
      </div>
    </section>
  )
}

function PlatformMetrics({ companyCount }) {
  const cards = [
    { big: companyCount.toLocaleString('es-ES'), sub: 'empresas analizadas',           detail: 'de 43 mercados globales' },
    { big: '2×',                                  sub: 'actualización diaria de precios', detail: 'cierre Europa y cierre EEUU' },
    { big: '10 años',                             sub: 'de proyección de dividendos',     detail: 'por empresa, con 3 escenarios' },
    { big: '0€',                                  sub: 'para empezar',                    detail: 'sin tarjeta de crédito' },
  ]
  return (
    <section style={{ padding: '80px 24px', borderBottom: '1px solid var(--surface-3)', background: 'rgba(99,102,241,0.02)' }}>
      <style>{`
        .metrics-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; max-width: 960px; margin: 0 auto; }
        @media (min-width: 760px) { .metrics-grid { grid-template-columns: repeat(4, 1fr); } }
        .metric-card { background: var(--surface-2); border: 1px solid var(--border); border-radius: 14px; padding: 28px 20px; text-align: center; transition: border-color 0.2s; }
        .metric-card:hover { border-color: rgba(129,140,248,0.4); }
      `}</style>
      <div style={{ textAlign: 'center', marginBottom: 48 }}>
        <h2 style={{ fontSize: 28, fontWeight: 900, color: 'var(--text-strong)' }}>
          Números reales. Sin artificios.
        </h2>
      </div>
      <div className="metrics-grid">
        {cards.map((c, i) => (
          <div key={i} className="metric-card">
            <p style={{ fontSize: 'clamp(32px, 5vw, 48px)', fontWeight: 700, color: 'var(--accent)', lineHeight: 1.1, marginBottom: 8 }}>
              {c.big}
            </p>
            <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-strong)', marginBottom: 4 }}>{c.sub}</p>
            <p style={{ fontSize: 12, color: 'var(--text-faint)' }}>{c.detail}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function Pricing() {
  const freeFeatures = [
    '43 mercados con Score DGI',
    'Termómetro DGI y yield del índice',
    'Ranking comparativo de mercados',
    'Screener con filtros básicos (yield, zona, sector)',
    'Hasta 10 empresas en tu cartera personal',
  ]
  const premiumFeatures = [
    'Todo lo del plan gratuito',
    'Radar de oportunidades de compra',
    'Mapa de salud financiera del índice',
    'Desglose completo del Score DGI',
    'Evolución histórica del índice',
    'Filtros premium en el screener (score, racha, CAGR…)',
    'Empresas ilimitadas en cartera',
    'Exportar / importar datos',
  ]
  return (
    <section id="precios" style={{ padding: '80px 24px', borderBottom: '1px solid var(--surface-3)' }}>
      <style>{`
        .pricing-grid { display: grid; grid-template-columns: 1fr; gap: 16px; max-width: 820px; margin: 0 auto; }
        @media (min-width: 700px) { .pricing-grid { grid-template-columns: 1fr 1fr 1fr; } }
      `}</style>
      <div style={{ textAlign: 'center', marginBottom: 52 }}>
        <h2 style={{ fontSize: 28, fontWeight: 900, color: 'var(--text-strong)', marginBottom: 10 }}>
          Planes simples y transparentes
        </h2>
        <p style={{ fontSize: 14, color: 'var(--text-faint)' }}>
          Empieza gratis. Sin tarjeta. Actualiza cuando quieras.
        </p>
      </div>
      <div className="pricing-grid">

        {/* Gratuito */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--surface-3)', borderRadius: 16, padding: '28px 22px' }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-faint)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10 }}>Gratuito</p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 6 }}>
            <span style={{ fontSize: 36, fontWeight: 900, color: 'var(--text-strong)' }}>0€</span>
            <span style={{ fontSize: 13, color: 'var(--text-faint)' }}>/mes</span>
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-faintest)', marginBottom: 22 }}>Para siempre. Sin tarjeta.</p>
          <div style={{ display: 'grid', gap: 9, marginBottom: 28 }}>
            {freeFeatures.map((f, i) => (
              <div key={i} style={{ display: 'flex', gap: 9, fontSize: 13 }}>
                <span style={{ color: 'var(--positive)', fontWeight: 700, flexShrink: 0 }}>✓</span>
                <span style={{ color: 'var(--text-muted)', lineHeight: 1.4 }}>{f}</span>
              </div>
            ))}
          </div>
          <Link href="/register" style={{
            display: 'block', textAlign: 'center', padding: '11px 0',
            background: 'var(--surface-3)', border: '1px solid var(--border-strong)',
            color: 'var(--text-muted)', borderRadius: 9, fontSize: 14, fontWeight: 700, textDecoration: 'none',
          }}>
            Registrarse gratis
          </Link>
        </div>

        {/* Premium mensual */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 16, padding: '28px 22px' }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10 }}>Premium mensual</p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 6 }}>
            <span style={{ fontSize: 36, fontWeight: 900, color: 'var(--text-strong)' }}>9,99€</span>
            <span style={{ fontSize: 13, color: 'var(--text-faint)' }}>/mes</span>
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-faintest)', marginBottom: 22 }}>Cancela cuando quieras.</p>
          <div style={{ display: 'grid', gap: 9, marginBottom: 28 }}>
            {premiumFeatures.map((f, i) => (
              <div key={i} style={{ display: 'flex', gap: 9, fontSize: 13 }}>
                <span style={{ color: 'var(--accent)', fontWeight: 700, flexShrink: 0 }}>✓</span>
                <span style={{ color: 'var(--text-muted)', lineHeight: 1.4 }}>{f}</span>
              </div>
            ))}
          </div>
          <Link href="/pricing" style={{
            display: 'block', textAlign: 'center', padding: '11px 0',
            background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.35)',
            color: 'var(--accent)', borderRadius: 9, fontSize: 14, fontWeight: 700, textDecoration: 'none',
          }}>
            Empezar mensual
          </Link>
        </div>

        {/* Premium anual — protagonista */}
        <div style={{ background: 'rgba(99,102,241,0.07)', border: '2px solid rgba(99,102,241,0.45)', borderRadius: 16, padding: '28px 22px', position: 'relative' }}>
          <div style={{
            position: 'absolute', top: -13, left: '50%', transform: 'translateX(-50%)',
            background: 'var(--accent)', color: '#fff', fontSize: 10, fontWeight: 800,
            padding: '4px 16px', borderRadius: 10, letterSpacing: '0.08em', whiteSpace: 'nowrap',
          }}>
            MEJOR VALOR · −50%
          </div>
          <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10 }}>Premium anual</p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 4 }}>
            <span style={{ fontSize: 36, fontWeight: 900, color: 'var(--text-strong)' }}>59,90€</span>
            <span style={{ fontSize: 13, color: 'var(--text-faint)' }}>/año</span>
          </div>
          <p style={{ fontSize: 12, color: 'var(--positive)', fontWeight: 600, marginBottom: 2 }}>Equivale a 4,99€/mes</p>
          <p style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 22 }}>Ahorras 60€ al año.</p>
          <div style={{ display: 'grid', gap: 9, marginBottom: 28 }}>
            {premiumFeatures.map((f, i) => (
              <div key={i} style={{ display: 'flex', gap: 9, fontSize: 13 }}>
                <span style={{ color: 'var(--accent)', fontWeight: 700, flexShrink: 0 }}>✓</span>
                <span style={{ color: 'var(--text-muted)', lineHeight: 1.4 }}>{f}</span>
              </div>
            ))}
          </div>
          <Link href="/pricing" style={{
            display: 'block', textAlign: 'center', padding: '13px 0',
            background: 'var(--accent)', color: '#fff', borderRadius: 9,
            fontSize: 15, fontWeight: 800, textDecoration: 'none',
            boxShadow: '0 4px 20px rgba(99,102,241,0.4)',
          }}>
            Empezar anual →
          </Link>
        </div>

      </div>
    </section>
  )
}

function CompanyShowcase({ data = {} }) {
  const streak = data.streak ?? 42
  const tier = streak >= 50 ? '👑 Rey' : streak >= 25 ? '🏆 Aristócrata' : streak >= 10 ? '⭐ Aspirante' : 'Dividendo'
  const price = (data.price ?? 305.40).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const yld = (data.yld ?? 2.1).toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  const score = (data.score ?? 8.7).toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  const cats = [
    { l: 'Calidad del negocio', v: 9.1, w: 35 },
    { l: 'Dividendo', v: 8.6, w: 30 },
    { l: 'Solidez financiera', v: 8.9, w: 20 },
    { l: 'Valoración', v: 7.4, w: 15 },
  ]
  const health = [
    { l: 'Rentabilidad', c: 'var(--positive)' }, { l: 'Deuda', c: 'var(--positive)' },
    { l: 'Dividendo', c: 'var(--positive)' }, { l: 'Márgenes', c: 'var(--positive)' }, { l: 'Crecimiento', c: 'var(--warning)' },
  ]
  return (
    <section style={{ padding: '80px 24px', borderBottom: '1px solid var(--surface-3)', background: 'rgba(99,102,241,0.02)' }}>
      <style>{`
        .cs-grid { display: grid; grid-template-columns: 1fr; gap: 40px; align-items: center; max-width: 1000px; margin: 0 auto; }
        @media (min-width: 860px) { .cs-grid { grid-template-columns: 1fr 1fr; } }
      `}</style>
      <div style={{ textAlign: 'center', marginBottom: 48 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 14 }}>La ficha de cada empresa</p>
        <h2 style={{ fontSize: 28, fontWeight: 900, color: 'var(--text-strong)', marginBottom: 10 }}>Todo el análisis DGI, empresa por empresa</h2>
        <p style={{ fontSize: 14, color: 'var(--text-faint)', maxWidth: 520, margin: '0 auto' }}>Score DGI con desglose, mapa de salud financiera, valor intrínseco, proyección de renta e insights — de casi 2.000 empresas.</p>
      </div>
      <div className="cs-grid">
        {/* Mockup de la ficha */}
        <div style={{ background: 'rgba(13,18,32,0.95)', border: '1px solid var(--border-strong)', borderRadius: 14, overflow: 'hidden', boxShadow: '0 24px 48px rgba(0,0,0,0.5)' }}>
          <div style={{ padding: '13px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div>
              <p style={{ fontSize: 14, fontWeight: 900, color: 'var(--text-strong)' }}>🇺🇸 Automatic Data Processing <span style={{ fontSize: 10, color: 'var(--text-faintest)' }}>ADP</span></p>
              <p style={{ fontSize: 10, color: 'var(--positive)', marginTop: 2 }}>{tier} · {streak} años subiendo el dividendo</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: 18, fontWeight: 900, color: 'var(--text-strong)', lineHeight: 1 }}>{price} <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>$</span></p>
              <p style={{ fontSize: 10, color: 'var(--positive)' }}>Yield {yld}%</p>
            </div>
          </div>
          <div style={{ padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Score DGI</span>
              <span style={{ fontSize: 30, fontWeight: 900, color: 'var(--positive)', lineHeight: 1 }}>{score}</span>
            </div>
            {cats.map(c => (
              <div key={c.l} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{c.l} <span style={{ color: 'var(--text-faintest)' }}>{c.w}%</span></span>
                  <span style={{ fontSize: 11, fontWeight: 800, color: c.v >= 8 ? 'var(--positive)' : 'var(--warning)' }}>{c.v.toFixed(1)}</span>
                </div>
                <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${c.v * 10}%`, background: c.v >= 8 ? 'var(--positive)' : 'var(--warning)', borderRadius: 2 }} />
                </div>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--surface-3)' }}>
              {health.map(h => (
                <span key={h.l} style={{ fontSize: 9, color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: h.c }} />{h.l}
                </span>
              ))}
            </div>
          </div>
        </div>
        {/* Lista de lo que incluye */}
        <div style={{ display: 'grid', gap: 14 }}>
          {[
            ['📊', 'Score DGI con desglose', 'Nota 0–10 ponderada por sector, con las cuatro dimensiones y el detalle métrica a métrica.'],
            ['💚', 'Mapa de salud financiera', 'Semáforo de rentabilidad, deuda, dividendo, márgenes y crecimiento — adaptado al sector.'],
            ['🎯', 'Valor intrínseco y zona de compra', 'DCF sector-aware con margen de seguridad, MM200 e insights de por qué (in)fravalorada.'],
            ['💰', 'Proyección de renta a 10 años', 'Cuánto cobrarás en dividendos con tu aportación, en tres escenarios y con CAGR real.'],
          ].map(([icon, t, d]) => (
            <div key={t} style={{ display: 'flex', gap: 14 }}>
              <span style={{ fontSize: 22, flexShrink: 0 }}>{icon}</span>
              <div>
                <h3 style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--text-strong)', marginBottom: 3 }}>{t}</h3>
                <p style={{ fontSize: 12.5, color: 'var(--text-faint)', lineHeight: 1.6 }}>{d}</p>
              </div>
            </div>
          ))}
          <Link href="/empresa/ADP" style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)', textDecoration: 'none', marginTop: 4 }}>Ver una ficha real (ADP) →</Link>
        </div>
      </div>
    </section>
  )
}

function FaqSection() {
  return (
    <section style={{ padding: '80px 24px', borderBottom: '1px solid var(--surface-3)' }}>
      <div style={{ textAlign: 'center', marginBottom: 44 }}>
        <h2 style={{ fontSize: 28, fontWeight: 900, color: 'var(--text-strong)', marginBottom: 10 }}>
          Preguntas frecuentes
        </h2>
        <p style={{ fontSize: 14, color: 'var(--text-faint)' }}>Todo lo que necesitas saber antes de empezar.</p>
      </div>
      <LandingFaq />
    </section>
  )
}

function Footer() {
  return (
    <footer style={{ padding: '44px 24px 32px', borderTop: '1px solid var(--surface-3)' }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start', gap: 24, marginBottom: 32 }}>
          <div>
            <p style={{ fontSize: 16, fontWeight: 900, color: 'var(--text-strong)', marginBottom: 6 }}>Mi Índice DGI</p>
            <p style={{ fontSize: 12, color: 'var(--text-faintest)', maxWidth: 280, lineHeight: 1.65 }}>
              Herramienta de análisis para inversores de dividendos crecientes. 43 mercados globales. Datos fundamentales reales.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Link href="/mercados" style={{ fontSize: 13, color: 'var(--text-faintest)', textDecoration: 'none' }}>Mercados</Link>
              <Link href="/screener" style={{ fontSize: 13, color: 'var(--text-faintest)', textDecoration: 'none' }}>Screener</Link>
              <Link href="/pricing" style={{ fontSize: 13, color: 'var(--text-faintest)', textDecoration: 'none' }}>Precios</Link>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Link href="/register" style={{ fontSize: 13, color: 'var(--text-faintest)', textDecoration: 'none' }}>Registro</Link>
              <Link href="/login" style={{ fontSize: 13, color: 'var(--text-faintest)', textDecoration: 'none' }}>Acceder</Link>
              <a href="mailto:hola@miindicedgi.com" style={{ fontSize: 13, color: 'var(--text-faintest)', textDecoration: 'none' }}>Contacto</a>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Link href="/privacidad" style={{ fontSize: 13, color: 'var(--text-faintest)', textDecoration: 'none' }}>Política de privacidad</Link>
              <Link href="/terminos" style={{ fontSize: 13, color: 'var(--text-faintest)', textDecoration: 'none' }}>Términos de uso</Link>
            </div>
          </div>
        </div>
        <div style={{ borderTop: '1px solid var(--surface-3)', paddingTop: 20, display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={{ fontSize: 11, color: 'var(--bg-elev)' }}>© 2025 Mi Índice DGI</p>
          <p style={{ fontSize: 11, color: 'var(--bg-elev)', maxWidth: 500, textAlign: 'right' }}>
            La información proporcionada no constituye asesoramiento financiero. Invertir implica riesgos. Consulta a un asesor antes de tomar decisiones de inversión.
          </p>
        </div>
      </div>
    </footer>
  )
}

export default async function LandingPage() {
  const companyCount = await getCompanyCount()
  const showcase = await getShowcase()
  // Mercados ACTIVOS (mismos que /mercados) — evita mostrar en la landing índices
  // desactivados (p.ej. Dow Jones Global Titans) y descuadrar el recuento.
  let markets
  try { markets = await getEffectiveMarkets() } catch {}
  if (!markets?.length) markets = MARKETS
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <PublicNav />
      <Hero />
      <ForWhom />
      <CompanyShowcase data={showcase} />
      <Benefits />
      <DualRanking />
      <UseCase />
      <HowItWorks />
      <MarketsSection markets={markets} />
      <PlatformMetrics companyCount={companyCount} />
      <Pricing />
      <FaqSection />
      <Footer />
    </div>
  )
}
