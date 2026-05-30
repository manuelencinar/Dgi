import { getMarketQuotes } from '@/lib/market-quotes'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { quotes, ts, fromCache, stale } = await getMarketQuotes()
    return Response.json({ quotes, ts, fromCache, stale: stale || false })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
