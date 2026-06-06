import { NextResponse } from 'next/server'
import { createClient as authClient } from '@/lib/supabase/server'
import { createClient as serviceClient } from '@supabase/supabase-js'
import { buildWatchlistRows, sortByProximity } from '@/lib/watchlist-enrich'

export const dynamic = 'force-dynamic'

// GET — watchlist del usuario enriquecida (precio, score, yield, proximidad).
// La usa la mini watchlist de la cartera.
export async function GET() {
  const supabase = await authClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data: rows } = await supabase.from('watchlist').select('*').eq('user_id', user.id)
  if (!rows?.length) return NextResponse.json({ items: [] })

  const sb = serviceClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  const items = sortByProximity(await buildWatchlistRows(sb, rows))
  return NextResponse.json({ items })
}
