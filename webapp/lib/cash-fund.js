// Fondo de oportunidad (liquidez) — lógica pura, sin React ni Supabase.
// Los movimientos guardan el importe CON SIGNO (+ entra, − sale); el saldo = suma.

// Tipos de movimiento: signo aplicado al importe que teclea el usuario (positivo)
// y etiqueta/color para la UI.
export const CASH_TYPES = {
  deposit:    { sign: +1, label: 'Aportación',  color: 'var(--positive)' },
  dividend:   { sign: +1, label: 'Dividendo',   color: 'var(--accent)' },
  interest:   { sign: +1, label: 'Interés',     color: 'var(--warning)' },
  withdraw:   { sign: -1, label: 'Retirada',    color: 'var(--negative)' },
  investment: { sign: -1, label: 'Inversión',   color: 'var(--negative)' },
}
export function signOf(type) { return CASH_TYPES[type]?.sign ?? 1 }

const round2 = v => Math.round((Number(v) || 0) * 100) / 100
// TAE → tipo mensual (parte proporcional del anual).
export function monthlyRate(taePct) { return (Number(taePct) || 0) / 100 / 12 }

// Saldo (suma de importes con signo) hasta una fecha ISO incluida (o total).
export function balanceOf(movements, asOfIso = null) {
  return round2((movements || []).reduce((s, m) => {
    if (asOfIso && String(m.date) > asOfIso) return s
    return s + (Number(m.amount) || 0)
  }, 0))
}

function lastDayIso(y, monthIdx) {
  const d = new Date(y, monthIdx + 1, 0)   // día 0 del mes siguiente = último del actual
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Intereses pendientes de devengar: por cada MES COMPLETO (anterior al actual) desde
// el primer movimiento que aún no tenga su apunte de interés, calcula el interés del
// mes = saldo a fin de mes × tipo mensual y lo capitaliza (compuesto). Devuelve la
// lista de movimientos {type:'interest', amount, date, note} a insertar.
export function pendingInterest(movements, taePct, today = new Date()) {
  const rate = monthlyRate(taePct)
  if (rate <= 0 || !movements || !movements.length) return []
  const sorted = [...movements].sort((a, b) => (String(a.date) < String(b.date) ? -1 : 1))
  const first = new Date(String(sorted[0].date).slice(0, 10) + 'T12:00:00')
  const have = new Set(movements.filter(m => m.type === 'interest').map(m => String(m.date).slice(0, 7)))
  const out = []
  let y = first.getFullYear(), mo = first.getMonth()
  const curY = today.getFullYear(), curMo = today.getMonth()
  while (y < curY || (y === curY && mo < curMo)) {   // solo meses ya cerrados
    const ym = `${y}-${String(mo + 1).padStart(2, '0')}`
    if (!have.has(ym)) {
      const endIso = lastDayIso(y, mo)
      // saldo a fin de mes incluyendo los intereses ya generados en meses previos
      const bal = balanceOf([...movements, ...out], endIso)
      const interest = round2(bal * rate)
      if (interest > 0) out.push({ type: 'interest', amount: interest, date: endIso, note: `Interés ${ym} · ${taePct}% TAE` })
    }
    mo++; if (mo > 11) { mo = 0; y++ }
  }
  return out
}

// Estimación del interés del MES en curso sobre el saldo actual (no se persiste).
export function estimateMonthInterest(balance, taePct) { return round2((Number(balance) || 0) * monthlyRate(taePct)) }
// Estimación del interés ANUAL sobre el saldo actual (saldo × TAE).
export function estimateAnnualInterest(balance, taePct) { return round2((Number(balance) || 0) * (Number(taePct) || 0) / 100) }
