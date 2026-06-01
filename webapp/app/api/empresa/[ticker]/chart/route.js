import { getCompanyChartData } from '@/lib/company-chart'

export const dynamic = 'force-dynamic'

const VALID_RANGES = new Set(['1M', '3M', '6M', '1A', '3A'])

export async function GET(request, { params }) {
  const { ticker } = await params
  const range = new URL(request.url).searchParams.get('range') || '1A'

  if (!VALID_RANGES.has(range)) {
    return Response.json({ error: 'Rango inválido' }, { status: 400 })
  }

  try {
    const data = await getCompanyChartData(decodeURIComponent(ticker), range)
    return Response.json(data)
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
