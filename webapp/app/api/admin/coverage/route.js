import { NextResponse } from 'next/server'
import { requireAdmin, serviceClient } from '@/lib/admin'
import { getCoverageByCompany, getUncoveredCompanies } from '@/lib/financial-history-stats'
import { getEffectiveDict } from '@/lib/dict'

export const dynamic = 'force-dynamic'

export async function GET() {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const sc = serviceClient()
  const [coverage, uncovered, eff] = await Promise.all([
    getCoverageByCompany(sc),
    getUncoveredCompanies(sc),
    getEffectiveDict().catch(() => []),
  ])
  const nameByTicker = Object.fromEntries((eff || []).map(d => [d[1], d[0]]))

  return NextResponse.json({
    coverage: coverage.map(c => ({ ...c, name: nameByTicker[c.ticker] || c.ticker })),
    uncovered: uncovered.map(t => ({ ticker: t, name: nameByTicker[t] || t })),
    total: (eff || []).length,
  })
}
