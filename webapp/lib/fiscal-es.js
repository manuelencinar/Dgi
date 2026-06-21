// Fiscalidad del IRPF español sobre dividendos (renta del ahorro).
// Dos modos de tributación del usuario (user_settings.tax_mode):
//   · 'fixed'  → tipo plano configurado a mano (dest_wht). También para no residentes.
//   · 'income' → se calcula a partir de los ingresos anuales y los hijos:
//        - si los ingresos ≤ umbral de exención → 0% (la retención se devuelve en la renta)
//        - si no → escala progresiva del ahorro sobre la renta del ahorro (= dividendos)
//
// Fuente única: lo usan el screener, rankings, comparador, construir-cartera,
// la ficha y el coste fiscal de la cartera, vía resolveDestWHT().

// Mínimo personal por debajo del cual no se tributa en IRPF (rendimientos del trabajo).
export const PERSONAL_EXEMPTION = 17094

// Incremento del umbral por descendiente (declaración conjunta): 1º, 2º, 3º y 4º+.
const CHILD_MIN = [2400, 2700, 4000]
const CHILD_MIN_REST = 4500
// Incremento adicional por cada descendiente menor de 3 años.
const CHILD_UNDER3_BONUS = 2800

// Suma del mínimo por descendientes para `n` hijos (<25 años o con discapacidad).
export function childMinimum(children = 0) {
  let sum = 0
  for (let i = 0; i < Math.max(0, children); i++) sum += i < CHILD_MIN.length ? CHILD_MIN[i] : CHILD_MIN_REST
  return sum
}

// Umbral total de exención: mínimo personal + descendientes + menores de 3 años.
export function exemptionThreshold({ children = 0, childrenUnder3 = 0 } = {}) {
  const u3 = Math.min(Math.max(0, childrenUnder3), Math.max(0, children))
  return PERSONAL_EXEMPTION + childMinimum(children) + CHILD_UNDER3_BONUS * u3
}

// Escala del ahorro (IRPF, base del ahorro), tramos marginales.
export const SAVINGS_BRACKETS = [
  { upTo: 6000,    rate: 19 },
  { upTo: 50000,   rate: 21 },
  { upTo: 200000,  rate: 23 },
  { upTo: 300000,  rate: 27 },
  { upTo: Infinity, rate: 30 },
]

// Cuota total (en €) que corresponde a una base del ahorro aplicando la escala progresiva.
export function spanishSavingsTaxDue(base = 0) {
  let due = 0, prev = 0
  for (const { upTo, rate } of SAVINGS_BRACKETS) {
    if (base <= prev) break
    const slice = Math.min(base, upTo) - prev
    due += slice * rate / 100
    prev = upTo
  }
  return due
}

// Tipo marginal (%) que aplica al siguiente euro de renta del ahorro.
export function spanishMarginalRate(base = 0) {
  for (const { upTo, rate } of SAVINGS_BRACKETS) if (base <= upTo) return rate
  return 30
}

// Tipo medio efectivo (%) sobre la base del ahorro (cuota/base). Base 0 → primer tramo.
export function spanishAvgRate(base = 0) {
  return base > 0 ? spanishSavingsTaxDue(base) / base * 100 : SAVINGS_BRACKETS[0].rate
}

// Tipo efectivo del impuesto de destino (España) para el usuario, según su modo.
//   settings    → fila de user_settings (tax_mode, annual_income, children, children_under3, dest_wht)
//   savingsBase → renta del ahorro estimada (= dividendos anuales, en la divisa base). 0 si se desconoce.
// Devuelve el % a usar como destWHT en effectiveDivTax y el resto del pipeline.
export function resolveDestWHT(settings, savingsBase = 0) {
  if (!settings) return 19
  if (settings.tax_mode === 'income') {
    const income = settings.annual_income != null && settings.annual_income !== '' ? Number(settings.annual_income) : null
    const thr = exemptionThreshold({ children: Number(settings.children) || 0, childrenUnder3: Number(settings.children_under3) || 0 })
    if (income != null && !isNaN(income) && income <= thr) return 0
    return spanishAvgRate(Math.max(0, Number(savingsBase) || 0))
  }
  const n = Number(settings.dest_wht)
  return (!isNaN(n) && n >= 0 && n <= 60) ? n : 19
}

// ¿Está el usuario exento (ingresos por debajo del umbral)? Para mostrarlo en la UI.
export function isExemptUser(settings) {
  if (!settings || settings.tax_mode !== 'income') return false
  const income = settings.annual_income != null && settings.annual_income !== '' ? Number(settings.annual_income) : null
  if (income == null || isNaN(income)) return false
  return income <= exemptionThreshold({ children: Number(settings.children) || 0, childrenUnder3: Number(settings.children_under3) || 0 })
}
