import { NextResponse } from 'next/server'
import { requireAdmin, serviceClient } from '@/lib/admin'

export const dynamic = 'force-dynamic'

// Salud/frescura de las fuentes de datos. Comprueba cada serie POR SEPARADO —
// en especial cada índice benchmark— porque el indicador global de daily_prices
// no detecta una serie congelada (el caso ^GSPC parado 13 meses mientras el resto
// se actualizaba). Pensado para el Dashboard.

const BENCHMARKS = ['^GSPC', '^STOXX', 'URTH', '^NDX', '^FTSE', '^GDAXI', '^N225']

const dayAge = d => d == null ? null : Math.floor((Date.now() - new Date(d + 'T12:00:00').getTime()) / 86400000)
// status según antigüedad y cadencia esperada (diaria o semanal)
function statusFor(age, { warn, stale }) {
  if (age == null) return 'stale'
  if (age >= stale) return 'stale'
  if (age >= warn) return 'warn'
  return 'ok'
}

async function maxDate(client, table, col, filter) {
  let q = client.from(table).select(col).order(col, { ascending: false }).limit(1)
  if (filter) q = filter(q)
  const { data } = await q.maybeSingle()
  return data?.[col] ?? null
}

export async function GET() {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const client = serviceClient()
  const daily = { warn: 4, stale: 9 }       // se espera precio cada día hábil
  const weekly = { warn: 9, stale: 16 }      // fundamentales: run semanal

  const [pricesDate, fxDate, fundDate, ...benchDates] = await Promise.all([
    maxDate(client, 'daily_prices', 'date'),
    maxDate(client, 'exchange_rates', 'date'),
    maxDate(client, 'company_fundamentals', 'updated_at'),
    ...BENCHMARKS.map(t => maxDate(client, 'daily_prices', 'date', q => q.eq('ticker', t))),
  ])

  const sources = [
    { key: 'daily_prices', label: 'Precios diarios', date: pricesDate, age: dayAge(pricesDate), status: statusFor(dayAge(pricesDate), daily) },
    { key: 'exchange_rates', label: 'Tipos de cambio', date: fxDate, age: dayAge(fxDate), status: statusFor(dayAge(fxDate), daily) },
    { key: 'fundamentals', label: 'Fundamentales', date: fundDate ? fundDate.slice(0, 10) : null, age: dayAge(fundDate ? fundDate.slice(0, 10) : null), status: statusFor(dayAge(fundDate ? fundDate.slice(0, 10) : null), weekly) },
  ]
  const benchmarks = BENCHMARKS.map((t, i) => ({
    ticker: t, date: benchDates[i], age: dayAge(benchDates[i]), status: statusFor(dayAge(benchDates[i]), daily),
  }))

  const worst = [...sources, ...benchmarks].some(s => s.status === 'stale') ? 'stale'
    : [...sources, ...benchmarks].some(s => s.status === 'warn') ? 'warn' : 'ok'

  return NextResponse.json({ sources, benchmarks, worst })
}
