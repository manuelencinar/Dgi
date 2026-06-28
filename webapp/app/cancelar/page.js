import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createClient as serviceClient } from '@supabase/supabase-js'
import PublicNav from '@/components/PublicNav'
import CancelarClient from '@/components/CancelarClient'
import { enrichPositions, calcSummary, FX } from '@/lib/portfolio'
import { getStripe } from '@/lib/stripe'

export const metadata = { title: 'Cancelar suscripción — EverDiv' }
export const dynamic  = 'force-dynamic'

const ADMIN_EMAIL  = 'vayaebookk@gmail.com'
const MONTHLY_PRICE = 9.99

function sb() {
  return serviceClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
}

export default async function CancelarPage() {
  const auth = await createClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) redirect('/login')

  const admin = sb()
  const { data: settings } = await admin
    .from('user_settings')
    .select('plan, premium_until, access_until, stripe_subscription_id, retention_discount_used, subscription_paused')
    .eq('user_id', user.id)
    .maybeSingle()

  const isAdmin   = user.email === ADMIN_EMAIL
  const isPremium = isAdmin || (settings?.plan === 'premium' && (!settings.premium_until || new Date(settings.premium_until) >= new Date()))

  // Solo accesible para premium — si no, a ajustes
  if (!isPremium) redirect('/ajustes')

  // ── Resumen de uso ────────────────────────────────────────────────────────
  const { data: positions } = await admin.from('positions').select('*').eq('user_id', user.id)

  let companies = 0, markets = 0, totalValue = null, annualIncome = null, yieldOnCost = null
  if (positions?.length) {
    const stockTickers = [...new Set(positions.filter(p => (p.asset_type || 'stock') === 'stock').map(p => p.ticker))]
    const allTickers   = [...new Set(positions.map(p => p.ticker))]

    const [{ data: funds }, { data: fundsData }] = await Promise.all([
      stockTickers.length ? admin.from('company_fundamentals').select('ticker, current_price, dps, sector, country').in('ticker', stockTickers) : Promise.resolve({ data: [] }),
      admin.from('funds').select('ticker, current_price, currency, country').in('ticker', allTickers),
    ])
    const fundMap  = Object.fromEntries((funds || []).map(f => [f.ticker, f]))
    const fundsMap = Object.fromEntries((fundsData || []).map(f => [f.ticker, f]))

    const enriched = enrichPositions(positions, fundMap, fundsMap)
    const summary  = calcSummary(enriched)

    companies   = stockTickers.length
    totalValue  = summary.totalValueEUR
    annualIncome = summary.totalIncomeEUR
    yieldOnCost = summary.yieldOnCost
    markets = new Set((positions).map(p => fundMap[p.ticker]?.country || fundsMap[p.ticker]?.country).filter(Boolean)).size
  }

  // Aportaciones periódicas ejecutadas (total en EUR aproximado)
  let recurringTotal = 0
  try {
    const { data: recurTx } = await admin.from('transactions').select('ticker, shares, price').eq('user_id', user.id).eq('type', 'buy_recurring')
    if (recurTx?.length) {
      const rt = [...new Set(recurTx.map(t => t.ticker))]
      const { data: fr } = await admin.from('funds').select('ticker, currency').in('ticker', rt)
      const curMap = Object.fromEntries((fr || []).map(f => [f.ticker, f.currency]))
      recurringTotal = recurTx.reduce((s, t) => s + Number(t.shares) * Number(t.price) * (FX[curMap[t.ticker]] || 1), 0)
    }
  } catch {}

  // Meses como premium — desde Stripe si es posible, si no desde el registro
  let monthsAsPremium = 0
  try {
    if (settings?.stripe_subscription_id) {
      const sub = await getStripe().subscriptions.retrieve(settings.stripe_subscription_id)
      const startEpoch = sub.start_date || sub.created
      if (startEpoch) monthsAsPremium = Math.max(1, Math.round((Date.now() / 1000 - startEpoch) / (30 * 86400)))
    }
  } catch {}
  if (!monthsAsPremium && user.created_at) {
    monthsAsPremium = Math.max(1, Math.round((Date.now() - new Date(user.created_at).getTime()) / (30 * 86400000)))
  }

  const accessUntil = settings?.access_until || settings?.premium_until || null

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <PublicNav />
      <CancelarClient
        summary={{ companies, markets, totalValue, annualIncome, yieldOnCost, recurringTotal, monthsAsPremium }}
        accessUntil={accessUntil}
        discountUsed={!!settings?.retention_discount_used}
        monthlyPrice={MONTHLY_PRICE}
      />
    </div>
  )
}
