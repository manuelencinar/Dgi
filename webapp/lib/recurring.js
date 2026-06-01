// Aportaciones periódicas — helpers puros

export const FREQ_MONTHS = { monthly: 1, quarterly: 3, semiannual: 6, annual: 12 }
export const FREQ_LABEL  = { monthly: 'Mensual', quarterly: 'Trimestral', semiannual: 'Semestral', annual: 'Anual' }
export const FREQ_OPTS   = [
  { v: 'monthly', l: 'Mensual' }, { v: 'quarterly', l: 'Trimestral' },
  { v: 'semiannual', l: 'Semestral' }, { v: 'annual', l: 'Anual' },
]

// Suma meses a una fecha YYYY-MM-DD, clampando el día al último del mes
export function addMonths(dateStr, months) {
  const d = new Date(dateStr + 'T00:00:00')
  const day = d.getDate()
  d.setDate(1)
  d.setMonth(d.getMonth() + months)
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  d.setDate(Math.min(day, lastDay))
  return d.toISOString().slice(0, 10)
}

// next_date: la fecha de inicio si es futura, o la próxima según frecuencia si ya pasó
export function computeNextDate(startDate, frequency) {
  const today = new Date().toISOString().slice(0, 10)
  if (startDate > today) return startDate
  const m = FREQ_MONTHS[frequency] || 1
  let next = startDate
  let guard = 0
  while (next <= today && guard < 600) { next = addMonths(next, m); guard++ }
  return next
}

// Importe normalizado a mensual
export function monthlyEquivalent(amount, frequency) {
  return (Number(amount) || 0) / (FREQ_MONTHS[frequency] || 1)
}
