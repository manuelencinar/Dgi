// Hitos / logros de la cartera para motivar al usuario (gamificación de la home).
// Lógica pura, sin React. Cada grupo tiene escalones; al superarlos se "desbloquea"
// la insignia. Se celebra el más alto recién alcanzado (el que controla el cliente
// comparando con lo ya visto, guardado en localStorage).

export const MILESTONE_GROUPS = [
  { key: 'value',     title: 'Patrimonio',          icon: '💼', type: 'eur',   tiers: [1000, 5000, 10000, 25000, 50000, 100000, 250000, 500000, 1000000] },
  { key: 'income',    title: 'Renta anual neta',    icon: '💸', type: 'eur',   suffix: '/año', tiers: [100, 250, 500, 1000, 2500, 5000, 10000, 25000] },
  { key: 'freedom',   title: 'Libertad financiera', icon: '🔥', type: 'pct',   tiers: [10, 25, 50, 75, 100] },
  { key: 'companies', title: 'Diversificación',     icon: '🏢', type: 'count', suffix: ' empresas', tiers: [3, 5, 10, 20, 30, 50] },
]

const eur = v => v.toLocaleString('es-ES') + ' €'

export function tierLabel(group, t) {
  if (t == null) return '—'
  if (group.type === 'eur') return eur(t) + (group.suffix || '')
  if (group.type === 'pct') return t + '%'
  if (group.type === 'count') return t + (group.suffix || '')
  return String(t)
}

// Mensaje de enhorabuena para un hito recién alcanzado.
export function congratsFor(group, tier) {
  switch (group.key) {
    case 'value':     return `¡Tu patrimonio ha superado los ${tierLabel(group, tier)}! 🎉`
    case 'income':    return `¡Ya generas ${tierLabel(group, tier)} de renta pasiva neta! 💸`
    case 'freedom':   return tier >= 100 ? '¡Libertad financiera alcanzada! Tus ingresos pasivos cubren tus gastos. 🔥' : `¡Tus ingresos pasivos ya cubren el ${tier}% de tus gastos! 🔥`
    case 'companies': return `¡Ya tienes ${tier} empresas en tu cartera! Diversificación al alza. 🏢`
    default:          return `¡Nuevo hito alcanzado: ${tierLabel(group, tier)}!`
  }
}

// Estado de cada grupo: nivel actual alcanzado, siguiente objetivo y progreso.
export function computeMilestones({ value = 0, income = 0, freedom = null, companies = 0 }) {
  const byKey = { value, income, freedom: freedom ?? 0, companies }
  const reachedIds = []
  const groups = MILESTONE_GROUPS.map(g => {
    const cur = Number(byKey[g.key]) || 0
    const reachedTiers = g.tiers.filter(t => cur >= t)
    const current = reachedTiers.length ? reachedTiers[reachedTiers.length - 1] : null
    const next = g.tiers.find(t => cur < t) ?? null
    reachedTiers.forEach(t => reachedIds.push(`${g.key}:${t}`))
    const prev = current ?? 0
    const progress = next != null ? Math.max(0, Math.min(1, (cur - prev) / (next - prev))) : 1
    const remaining = next != null ? Math.max(0, next - cur) : 0
    return { key: g.key, title: g.title, icon: g.icon, type: g.type, current, next, value: cur, progress, remaining, reachedTiers, reachedCount: reachedTiers.length }
  })
  return { groups, reachedIds }
}

// Dado lo ya visto (array de ids), devuelve el hito recién alcanzado MÁS relevante
// (el de mayor "peso") para celebrarlo, o null si no hay novedad.
const GROUP_WEIGHT = { value: 4, income: 3, freedom: 2, companies: 1 }
export function newlyReached(reachedIds, seenIds) {
  const seen = new Set(seenIds || [])
  const fresh = (reachedIds || []).filter(id => !seen.has(id))
  if (!fresh.length) return null
  // Elige el más relevante: por peso de grupo y por escalón.
  let best = null
  for (const id of fresh) {
    const [key, tierStr] = id.split(':')
    const tier = Number(tierStr)
    const group = MILESTONE_GROUPS.find(g => g.key === key)
    if (!group) continue
    const score = (GROUP_WEIGHT[key] || 0) * 1e12 + tier
    if (!best || score > best.score) best = { id, key, tier, group, score }
  }
  return best ? { id: best.id, group: best.group, tier: best.tier, message: congratsFor(best.group, best.tier) } : null
}
