import { createClient as authClient } from '@/lib/supabase/server'
import PublicNav from '@/components/PublicNav'
import ConstruirCarteraClient from '@/components/ConstruirCarteraClient'
import { getEffectiveDict } from '@/lib/dict'
import { resolveDestWHT } from '@/lib/fiscal-es'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Construir cartera desde cero | Mi Índice DGI',
  description: 'Responde 4 preguntas y obtén un plan de 10-15 empresas DGI ordenadas por prioridad de entrada, con asignación mensual sugerida.',
}

const ADMIN_EMAIL = 'vayaebookk@gmail.com'

async function getUserContext() {
  try {
    const supabase = await authClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { plan: 'free', destWHT: 19, isAuthed: false }
    const { data } = await supabase.from('user_settings').select('*').eq('user_id', user.id).maybeSingle()
    const destWHT = resolveDestWHT(data)
    if (user.email === ADMIN_EMAIL) return { plan: 'premium', destWHT, isAuthed: true }
    let plan = data?.plan || 'free'
    if (plan === 'premium' && data?.premium_until && new Date(data.premium_until) < new Date()) plan = 'free'
    return { plan, destWHT, isAuthed: true }
  } catch { return { plan: 'free', destWHT: 19, isAuthed: false } }
}

export default async function ConstruirCarteraPage() {
  const { plan, destWHT, isAuthed } = await getUserContext()
  const dict = await getEffectiveDict()
  // Solo se envían al cliente los NOMBRES de sector (para el paso 4). El plan se
  // calcula en el server (POST /api/construir-cartera): el universo de empresas
  // nunca llega al cliente.
  const sectors = [...new Set(dict.map(d => d[4]))].filter(Boolean).sort()

  return (
    <div style={{ minHeight: '100vh', background: '#080b14' }}>
      <PublicNav active="/construir-cartera" />
      <ConstruirCarteraClient
        sectors={sectors}
        destWHT={destWHT}
        isPremium={plan === 'premium'}
        isAuthed={isAuthed}
      />
    </div>
  )
}
