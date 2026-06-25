import { createClient } from '@/lib/supabase/server'
import PublicNav from '@/components/PublicNav'
import ComparadorClient from '@/components/ComparadorClient'
import { getEffectiveDict } from '@/lib/dict'
import { buildComparadorCompanies } from '@/lib/comparador'
import { resolveDestWHT } from '@/lib/fiscal-es'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Comparador de empresas | Mi Índice DGI', description: 'Compara hasta 5 empresas DGI lado a lado: radar multidimensional, métricas, proyección de renta a 10 años y valoración.' }

const ADMIN_EMAIL = 'vayaebookk@gmail.com'

async function getUserContext() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { plan: 'free', destWHT: 19 }
    const { data } = await supabase.from('user_settings').select('*').eq('user_id', user.id).maybeSingle()
    const destWHT = resolveDestWHT(data)
    if (user.email === ADMIN_EMAIL) return { plan: 'premium', destWHT }
    let plan = data?.plan || 'free'
    if (plan === 'premium' && data?.premium_until && new Date(data.premium_until) < new Date()) plan = 'free'
    return { plan, destWHT }
  } catch { return { plan: 'free', destWHT: 19 } }
}

export default async function ComparadorPage({ searchParams }) {
  const sp = await searchParams
  const { plan, destWHT } = await getUserContext()
  const isPremium = plan === 'premium'

  const initialTickers = (sp?.tickers || '').split(',').map(t => t.trim()).filter(Boolean)
  const limited = isPremium ? initialTickers.slice(0, 5) : initialTickers.slice(0, 2)
  const initialCompanies = limited.length ? await buildComparadorCompanies(limited, destWHT) : []

  // Lista ligera para el buscador y el explorador: [name, ticker, sector, type, subsector]
  const options = (await getEffectiveDict()).map(d => [d[0], d[1], d[4], d[6], d[5]])

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <PublicNav active="/comparador" />
      <ComparadorClient
        initialCompanies={initialCompanies}
        options={options}
        isPremium={isPremium}
        destWHT={destWHT}
      />
    </div>
  )
}
