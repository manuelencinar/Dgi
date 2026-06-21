import { NextResponse } from 'next/server'
import { createClient as authClient } from '@/lib/supabase/server'
import { getEffectiveDict } from '@/lib/dict'
import { buildScreenerCompanies } from '@/lib/screener-companies'
import { buildPortfolioPlan } from '@/lib/build-plan'
import { resolveDestWHT } from '@/lib/fiscal-es'

export const dynamic = 'force-dynamic'

const ADMIN_EMAIL = 'vayaebookk@gmail.com'
const FREE_VISIBLE = 5   // el plan free solo revela 5 empresas; el resto requiere Premium

async function getUserContext() {
  try {
    const supabase = await authClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { isPremium: false, destWHT: 19 }
    const { data } = await supabase.from('user_settings').select('*').eq('user_id', user.id).maybeSingle()
    const destWHT = resolveDestWHT(data)
    if (user.email === ADMIN_EMAIL) return { isPremium: true, destWHT }
    let plan = data?.plan || 'free'
    if (plan === 'premium' && data?.premium_until && new Date(data.premium_until) < new Date()) plan = 'free'
    return { isPremium: plan === 'premium', destWHT }
  } catch { return { isPremium: false, destWHT: 19 } }
}

export async function POST(req) {
  try {
    const { isPremium, destWHT } = await getUserContext()
    const body = await req.json().catch(() => ({}))

    // Saneo de las respuestas del wizard (no fiarse del cliente).
    const monthly = Math.max(0, Math.min(Number(body.monthly) || 0, 1_000_000))
    const targetYield = Math.max(0, Math.min(Number(body.targetYield) || 3, 15))
    const horizon = ['corto', 'medio', 'largo'].includes(body.horizon) ? body.horizon : 'medio'
    const excludeSectors = Array.isArray(body.exclude) ? body.exclude.filter(s => typeof s === 'string').slice(0, 40) : []

    // El universo completo SOLO vive en el server; al cliente solo le llega el plan.
    const dict = await getEffectiveDict()
    const companies = await buildScreenerCompanies(destWHT, dict)
    const { plan, meta } = buildPortfolioPlan(companies, { monthly, targetYield, horizon, excludeSectors, destWHT, size: 12 })

    // Free: solo se devuelven las 5 primeras empresas del plan (el resto no se
    // envía, solo el conteo). Premium: plan completo.
    const visiblePlan = isPremium ? plan : plan.slice(0, FREE_VISIBLE)
    const hidden = isPremium ? 0 : Math.max(0, plan.length - visiblePlan.length)

    return NextResponse.json({ plan: visiblePlan, meta, hidden, isPremium })
  } catch {
    return NextResponse.json({ error: 'No se pudo generar el plan' }, { status: 500 })
  }
}
