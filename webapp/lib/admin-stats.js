import { DICT } from '@/data/dict'
import { MARKETS } from '@/lib/markets'
import { getIndexConstituents } from '@/lib/index-constituents'

const DAY = 24 * 3600 * 1000

// Campos críticos (proxies escalares de revenue/fcf/net income/total debt)
const CRITICAL = [
  { key: 'current_price',  label: 'Precio' },
  { key: 'dps',            label: 'DPS' },
  { key: 'revenue_cagr5',  label: 'Ingresos' },
  { key: 'fcf_per_share',  label: 'FCF' },
  { key: 'eps_trailing',   label: 'Bº neto' },
  { key: 'net_debt',       label: 'Deuda' },
]

// ── Auth users (service role) ──────────────────────────────────────────────

export async function listAllAuthUsers(sc) {
  const all = []
  try {
    for (let page = 1; page <= 10; page++) {
      const { data, error } = await sc.auth.admin.listUsers({ page, perPage: 1000 })
      if (error || !data?.users?.length) break
      all.push(...data.users)
      if (data.users.length < 1000) break
    }
  } catch {}
  return all
}

// ── Fundamentals coverage ──────────────────────────────────────────────────

export async function getFundamentalsLite(sc) {
  // PostgREST limita a 1000 filas por petición → paginar con .range()
  const all = []
  const PAGE = 1000
  try {
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await sc
        .from('company_fundamentals')
        .select('ticker, current_price, dps, revenue_cagr5, fcf_per_share, eps_trailing, net_debt, updated_at')
        .range(from, from + PAGE - 1)
      if (error || !data?.length) break
      all.push(...data)
      if (data.length < PAGE) break
    }
  } catch {}
  return all
}

export function computeDataStats(fundamentals) {
  const fundByTicker = Object.fromEntries(fundamentals.map(f => [f.ticker, f]))
  const dictTickers  = DICT.map(d => d[1])

  const missing = dictTickers.filter(t => !fundByTicker[t])
  const now = Date.now()

  const outdated = fundamentals.filter(f => f.updated_at && (now - new Date(f.updated_at).getTime()) > 30 * DAY)
  const incomplete = fundamentals.filter(f =>
    CRITICAL.some(c => f[c.key] == null))

  return {
    totalFundamentals: fundamentals.length,
    missingCount:      missing.length,
    outdatedCount:     outdated.length,
    incompleteCount:   incomplete.length,
  }
}

export function getMissingCompanies(fundamentals) {
  const have = new Set(fundamentals.map(f => f.ticker))
  return DICT
    .filter(d => !have.has(d[1]))
    .map(d => ({ ticker: d[1], name: d[0], country: d[2], sector: d[4] }))
    .sort((a, b) => (a.sector || '').localeCompare(b.sector || ''))
}

export function getIncompleteCompanies(fundamentals) {
  const dictByTicker = Object.fromEntries(DICT.map(d => [d[1], d]))
  return fundamentals
    .map(f => {
      const missingFields = CRITICAL.filter(c => f[c.key] == null).map(c => c.label)
      if (!missingFields.length) return null
      const d = dictByTicker[f.ticker]
      return { ticker: f.ticker, name: d?.[0] ?? f.ticker, missingFields, updated_at: f.updated_at }
    })
    .filter(Boolean)
}

export function getOutdatedCompanies(fundamentals) {
  const dictByTicker = Object.fromEntries(DICT.map(d => [d[1], d]))
  const now = Date.now()
  return fundamentals
    .filter(f => f.updated_at && (now - new Date(f.updated_at).getTime()) > 30 * DAY)
    .map(f => ({ ticker: f.ticker, name: dictByTicker[f.ticker]?.[0] ?? f.ticker, updated_at: f.updated_at }))
    .sort((a, b) => new Date(a.updated_at) - new Date(b.updated_at))
}

// ── User metrics ───────────────────────────────────────────────────────────

export async function getUserMetrics(sc) {
  const users = await listAllAuthUsers(sc)
  const now = Date.now()

  let premiumMonthly = 0, premiumAnnual = 0, premiumTotal = 0
  try {
    const { data: settings } = await sc.from('user_settings').select('user_id, plan, premium_until')
    const active = (settings || []).filter(s => {
      if (s.plan !== 'premium') return false
      if (s.premium_until && new Date(s.premium_until) < new Date()) return false
      return true
    })
    premiumTotal = active.length
    // Sin distinción fiable mensual/anual → estimar todo mensual salvo marca
    premiumMonthly = active.length
  } catch {}

  const total      = users.length
  const new7d      = users.filter(u => u.created_at && (now - new Date(u.created_at).getTime()) <= 7 * DAY).length
  const new30d     = users.filter(u => u.created_at && (now - new Date(u.created_at).getTime()) <= 30 * DAY).length
  const active30d  = users.filter(u => u.last_sign_in_at && (now - new Date(u.last_sign_in_at).getTime()) <= 30 * DAY).length
  const conversion = total > 0 ? premiumTotal / total * 100 : 0
  const mrr        = premiumMonthly * 9.99 + (premiumAnnual * 59.90 / 12)

  // Registros por semana, últimos 3 meses
  const weeks = {}
  users.forEach(u => {
    if (!u.created_at) return
    const d = new Date(u.created_at)
    if (now - d.getTime() > 92 * DAY) return
    const monday = new Date(d); monday.setDate(d.getDate() - ((d.getDay() + 6) % 7))
    const key = monday.toISOString().slice(0, 10)
    weeks[key] = (weeks[key] || 0) + 1
  })
  const weekly = Object.entries(weeks).sort().map(([week, count]) => ({ week: week.slice(5), count }))

  return { total, new7d, new30d, active30d, premiumTotal, conversion, mrr, weekly, users }
}

// ── Index coverage ─────────────────────────────────────────────────────────

export function getIndexCoverage(fundamentals) {
  const fundData = Object.fromEntries(fundamentals.map(f => [f.ticker, f]))
  const isComplete = f => f && CRITICAL.every(c => f[c.key] != null)

  return MARKETS.map(m => {
    const companies = getIndexConstituents(m.symbol)
    const total = companies.length
    let complete = 0, missing = 0
    const missingList = []
    let latest = null
    companies.forEach(c => {
      const f = fundData[c.ticker]
      if (!f) { missing++; missingList.push(c); return }
      if (isComplete(f)) complete++
      if (f.updated_at && (!latest || new Date(f.updated_at) > new Date(latest))) latest = f.updated_at
    })
    const coverage = total > 0 ? complete / total * 100 : 0
    return {
      symbol: m.symbol, name: m.name, country: m.country, flag: m.flag, region: m.region,
      total, complete, missing, coverage, latest, missingList,
    }
  })
}
