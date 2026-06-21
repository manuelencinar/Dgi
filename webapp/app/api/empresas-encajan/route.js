import { NextResponse } from 'next/server'
import { createClient as authClient } from '@/lib/supabase/server'
import { getEffectiveDict } from '@/lib/dict'
import { buildScreenerCompanies } from '@/lib/screener-companies'
import { recommendFitCompanies, currentWeekSeed, nextUpdateDate } from '@/lib/fit-recommendations'

export const dynamic = 'force-dynamic'

const ADMIN_EMAIL = 'vayaebookk@gmail.com'

async function getUserContext() {
  try {
    const supabase = await authClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { isPremium: false, destWHT: 19 }
    const { data } = await supabase.from('user_settings').select('plan, premium_until, dest_wht').eq('user_id', user.id).maybeSingle()
    const destWHT = data?.dest_wht != null ? Number(data.dest_wht) : 19
    if (user.email === ADMIN_EMAIL) return { isPremium: true, destWHT }
    let plan = data?.plan || 'free'
    if (plan === 'premium' && data?.premium_until && new Date(data.premium_until) < new Date()) plan = 'free'
    return { isPremium: plan === 'premium', destWHT }
  } catch { return { isPremium: false, destWHT: 19 } }
}

// Saneo de un mapa de pesos {clave: %} recibido del cliente (su propia cartera).
function sanitizeWeights(raw) {
  const clean = (m) => {
    if (!m || typeof m !== 'object') return {}
    const out = {}
    for (const [k, v] of Object.entries(m)) {
      if (typeof k !== 'string' || k.length > 24) continue
      const n = Number(v)
      if (Number.isFinite(n) && n >= 0) out[k] = Math.min(n, 100)
    }
    return out
  }
  return {
    sectorW:  clean(raw?.sectorW),
    supW:     clean(raw?.supW),
    currW:    clean(raw?.currW),
    countryW: clean(raw?.countryW),
  }
}

export async function POST(req) {
  try {
    const { isPremium, destWHT } = await getUserContext()
    // Función premium: el server no calcula recomendaciones para usuarios free.
    if (!isPremium) return NextResponse.json({ recommendations: [], isPremium: false })

    const body = await req.json().catch(() => ({}))
    const weights = sanitizeWeights(body.weights)

    // El universo completo SOLO vive en el server; al cliente solo le llegan las 5.
    const dict = await getEffectiveDict()
    const companies = await buildScreenerCompanies(destWHT, dict)
    const recommendations = recommendFitCompanies(companies, weights, currentWeekSeed(), 5)

    return NextResponse.json({ recommendations, isPremium: true, nextUpdate: nextUpdateDate() })
  } catch {
    return NextResponse.json({ error: 'No se pudieron generar recomendaciones' }, { status: 500 })
  }
}
