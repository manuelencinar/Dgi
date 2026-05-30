import { getChartData } from '@/lib/market-charts'

export const dynamic = 'force-dynamic'

const VALID_RANGES = new Set(['1d', '5d', '1mo', '3mo', '1y', '5y'])

export async function GET(request, { params }) {
  const { symbol } = await params
  const range = new URL(request.url).searchParams.get('range') || '1y'

  if (!VALID_RANGES.has(range)) {
    return Response.json({ error: 'Rango inválido' }, { status: 400 })
  }

  try {
    const data = await getChartData(decodeURIComponent(symbol), range)
    return Response.json(data)
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
