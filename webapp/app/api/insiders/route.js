import { NextResponse } from 'next/server'
import { createClient as authClient } from '@/lib/supabase/server'
import { getInsiders } from '@/lib/insiders'

export const dynamic = 'force-dynamic'

const ADMIN_EMAIL = 'vayaebookk@gmail.com'

// Caché en memoria por ticker (TTL 6h) para no golpear Yahoo en cada visita.
const cache = new Map()
const TTL = 6 * 60 * 60 * 1000

async function isPremiumUser() {
  try {
    const sb = await authClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return false
    if (user.email === ADMIN_EMAIL) return true
    const { data } = await sb.from('user_settings').select('plan, premium_until').eq('user_id', user.id).maybeSingle()
    let plan = data?.plan || 'free'
    if (plan === 'premium' && data?.premium_until && new Date(data.premium_until) < new Date()) plan = 'free'
    return plan === 'premium'
  } catch { return false }
}

export async function GET(request) {
  const ticker = (new URL(request.url).searchParams.get('ticker') || '').trim().toUpperCase()
  if (!ticker) return NextResponse.json({ data: null })

  // Datos de directivos = contenido premium: no se sirven a usuarios free.
  if (!(await isPremiumUser())) return NextResponse.json({ data: null, locked: true })

  const hit = cache.get(ticker)
  if (hit && Date.now() - hit.t < TTL) return NextResponse.json({ data: hit.d })

  const data = await getInsiders(ticker)
  cache.set(ticker, { t: Date.now(), d: data })
  return NextResponse.json({ data })
}
