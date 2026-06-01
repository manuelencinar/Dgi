import { createClient } from '@supabase/supabase-js'
import { createClient as authClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import PublicNav from '@/components/PublicNav'
import PriceChart from '@/components/empresa/PriceChart'
import DividendBars from '@/components/empresa/DividendBars'
import { fetchAndStoreFund } from '@/lib/fund-fetch'
import RecurringButton from '@/components/cartera/RecurringButton'

export const dynamic = 'force-dynamic'

function sc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
}

function fmt(v, d = 2) {
  if (v == null || isNaN(v)) return '—'
  return v.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d })
}

function distByYear(history) {
  if (!Array.isArray(history)) return []
  const map = {}
  history.forEach(d => { if (d.date) { const y = d.date.slice(0, 4); map[y] = (map[y] || 0) + (d.amount || 0) } })
  return Object.entries(map).map(([year, dps]) => ({ year: +year, dps })).sort((a, b) => a.year - b.year)
}

export async function generateMetadata({ params }) {
  const { ticker } = await params
  const t = decodeURIComponent(ticker)
  return { title: `${t} — ETF / Fondo | Mi Índice DGI` }
}

const Card = ({ children, style }) => (
  <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 20, ...style }}>{children}</div>
)
const SectionTitle = ({ children }) => (
  <p style={{ fontSize: 11, fontWeight: 700, color: '#4a5270', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14 }}>{children}</p>
)

export default async function FondoPage({ params }) {
  const { ticker } = await params
  const t = decodeURIComponent(ticker)

  let { data: fund } = await sc().from('funds').select('*').eq('ticker', t).maybeSingle()

  // Auto-rellenado: si la posición existe pero el fondo no está en la tabla, descargarlo de Yahoo
  if (!fund) {
    const assetType = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(t) ? 'fund' : 'etf'
    const res = await fetchAndStoreFund(t, assetType)
    if (res.fund) {
      const { data } = await sc().from('funds').select('*').eq('ticker', res.fund.ticker).maybeSingle()
      fund = data || res.fund
    }
  }
  if (!fund) notFound()

  // Posición del usuario
  let position = null
  try {
    const supa = await authClient()
    const { data: { user } } = await supa.auth.getUser()
    if (user) {
      const { data } = await supa.from('positions').select('*').eq('user_id', user.id).eq('ticker', t).maybeSingle()
      position = data
    }
  } catch {}

  const terColor = fund.ter == null ? '#4a5270' : fund.ter < 0.20 ? '#34d399' : fund.ter <= 0.50 ? '#fbbf24' : '#f87171'
  const annualDist = (fund.yield_ttm != null && fund.current_price != null) ? fund.yield_ttm / 100 * fund.current_price : null
  const byYear = distByYear(fund.distribution_history)
  const typeLabel = fund.asset_type === 'fund' ? 'Fondo' : 'ETF'
  const typeColor = fund.asset_type === 'fund' ? '#a78bfa' : '#60a5fa'

  return (
    <div style={{ minHeight: '100vh', background: '#080b14' }}>
      <PublicNav />
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 16px 64px' }}>
        <p style={{ fontSize: 12, color: '#4a5270', marginBottom: 16 }}>
          <Link href="/cartera" style={{ color: '#4a5270', textDecoration: 'none' }}>Cartera</Link>{' / '}
          <span style={{ color: '#8090a8' }}>{fund.name || t}</span>
        </p>

        {/* Cabecera */}
        <Card style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <h1 style={{ fontSize: 22, fontWeight: 900, color: '#e0e8f0' }}>{fund.name || t}</h1>
                <span style={{ fontSize: 11, fontWeight: 700, color: typeColor, background: `${typeColor}22`, padding: '2px 8px', borderRadius: 5 }}>{typeLabel}</span>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: '#4a5270' }}>{t}</span>
                <span style={{ fontSize: 11, color: '#4a5270', background: 'rgba(255,255,255,0.04)', padding: '2px 8px', borderRadius: 5 }}>{fund.currency}</span>
                {fund.category && <span style={{ fontSize: 11, color: '#818cf8', background: 'rgba(99,102,241,0.1)', padding: '2px 8px', borderRadius: 5 }}>{fund.category}</span>}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: 36, fontWeight: 900, color: '#e0e8f0', lineHeight: 1 }}>
                {fund.current_price != null ? fmt(fund.current_price) : '—'}
                <span style={{ fontSize: 14, color: '#4a5270', fontWeight: 400, marginLeft: 6 }}>{fund.currency}</span>
              </p>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 8 }}>
                <div><p style={{ fontSize: 10, color: '#4a5270' }}>TER</p><p style={{ fontSize: 14, fontWeight: 700, color: terColor }}>{fund.ter != null ? fund.ter + '%' : '—'}</p></div>
                <div><p style={{ fontSize: 10, color: '#4a5270' }}>Yield TTM</p><p style={{ fontSize: 14, fontWeight: 700, color: '#34d399' }}>{fund.yield_ttm != null ? fund.yield_ttm + '%' : '—'}</p></div>
              </div>
            </div>
          </div>
        </Card>

        {/* Aportación periódica */}
        <div style={{ marginBottom: 16 }}>
          <RecurringButton ticker={fund.ticker} assetType={fund.asset_type} currency={fund.currency} fundName={fund.name} />
        </div>

        {/* Gráfico de precio */}
        <Card style={{ marginBottom: 16 }}>
          <PriceChart ticker={t} currency={fund.currency} />
        </Card>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 16 }}>
          {/* Métricas del producto */}
          <Card>
            <SectionTitle>Métricas del producto</SectionTitle>
            <div style={{ display: 'grid', gap: 9 }}>
              {[
                ['TER (coste anual)', fund.ter != null ? fund.ter + '%' : '—'],
                ['Yield TTM', fund.yield_ttm != null ? fund.yield_ttm + '%' : '—'],
                ['Distribución anual', annualDist != null ? `${fmt(annualDist)} ${fund.currency}` : '—'],
                ['Distribución/año (tu posición)', (position && annualDist != null) ? `${fmt(annualDist * position.shares)} ${fund.currency}` : '—'],
                ['Benchmark', fund.benchmark || '—'],
                ['Categoría', fund.category || '—'],
                ['Gestora / emisor', fund.manager || '—'],
                ['ISIN', fund.isin || '—'],
              ].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, paddingBottom: 7, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <span style={{ color: '#4a5270' }}>{k}</span>
                  <span style={{ color: '#c8d0e0', fontWeight: 600, textAlign: 'right' }}>{v}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* Posición del usuario */}
          {position && (
            <Card>
              <SectionTitle>Tu posición</SectionTitle>
              <div style={{ display: 'grid', gap: 9 }}>
                {(() => {
                  const value = fund.current_price != null ? fund.current_price * position.shares : null
                  const cost = position.avg_cost * position.shares
                  const gain = value != null ? value - cost : null
                  const gainPct = cost > 0 && gain != null ? gain / cost * 100 : null
                  const yoc = position.avg_cost > 0 && annualDist != null ? annualDist / position.avg_cost * 100 : null
                  return [
                    ['Participaciones', fmt(position.shares, 4)],
                    ['Precio medio', `${fmt(position.avg_cost)} ${fund.currency}`],
                    ['Valor actual', value != null ? `${fmt(value)} ${fund.currency}` : '—'],
                    ['Rentabilidad', gainPct != null ? `${gainPct >= 0 ? '+' : ''}${gainPct.toFixed(2)}%` : '—'],
                    ['Distribución anual', annualDist != null ? `${fmt(annualDist * position.shares)} ${fund.currency}` : '—'],
                    ['Yield on cost', yoc != null ? yoc.toFixed(2) + '%' : '—'],
                  ].map(([k, v]) => (
                    <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, paddingBottom: 7, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <span style={{ color: '#4a5270' }}>{k}</span>
                      <span style={{ color: '#c8d0e0', fontWeight: 600 }}>{v}</span>
                    </div>
                  ))
                })()}
              </div>
            </Card>
          )}
        </div>

        {/* Historial de distribuciones */}
        <Card style={{ marginTop: 16 }}>
          <SectionTitle>Historial de distribuciones</SectionTitle>
          {byYear.length > 0 ? <DividendBars history={byYear} /> : <p style={{ fontSize: 13, color: '#4a5270' }}>Sin historial de distribuciones disponible.</p>}
        </Card>

        {/* Nota informativa */}
        <div style={{ marginTop: 16, padding: '12px 16px', background: 'rgba(255,255,255,0.02)', borderRadius: 10 }}>
          <p style={{ fontSize: 11, color: '#4a5270', lineHeight: 1.5 }}>
            Los ETFs y fondos no incluyen análisis de foso económico, salud financiera ni valoración intrínseca. Estos análisis aplican a empresas individuales.
          </p>
        </div>
      </div>
    </div>
  )
}
