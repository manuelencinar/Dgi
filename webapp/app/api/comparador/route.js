import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildComparadorCompanies } from '@/lib/comparador'

export const dynamic = 'force-dynamic'

const ADMIN_EMAIL = 'vayaebookk@gmail.com'

export async function GET(request) {
  const url = new URL(request.url)
  const tickers = (url.searchParams.get('tickers') || '').split(',').map(t => t.trim()).filter(Boolean)
  if (!tickers.length) return NextResponse.json({ companies: [] })

  // Retención destino del usuario
  let destWHT = 19
  let isPremium = false
  try {
    const auth = await createClient()
    const { data: { user } } = await auth.auth.getUser()
    if (user) {
      const { data } = await auth.from('user_settings').select('plan, premium_until, dest_wht').eq('user_id', user.id).maybeSingle()
      if (data?.dest_wht != null) destWHT = Number(data.dest_wht)
      isPremium = user.email === ADMIN_EMAIL || (data?.plan === 'premium' && (!data.premium_until || new Date(data.premium_until) >= new Date()))
    }
  } catch {}

  // Free: máximo 2 empresas
  const limited = isPremium ? tickers.slice(0, 5) : tickers.slice(0, 2)
  const companies = await buildComparadorCompanies(limited, destWHT)
  return NextResponse.json({ companies })
}
