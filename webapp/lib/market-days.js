// Días de mercado: qué cierre debería existir ya en daily_prices.
//
// El cron de precios corre a las 17:00 UTC (tras el cierre europeo, 17:30
// CET/CEST = 16:30/15:30 UTC) y a las 22:00 UTC (tras el cierre americano,
// 16:00 ET = 21:00/20:00 UTC). Hasta las 22:00 UTC el último cierre completo
// disponible es el del día hábil anterior.
//
// No contempla festivos: en un festivo se considerará "pendiente" un cierre que
// no existe y se reintentará. Es el lado seguro (reintentar de más, nunca servir
// un precio viejo dándolo por bueno).

export function expectedCloseDate(now = new Date()) {
  const d = new Date(now)
  if (d.getUTCHours() < 22) d.setUTCDate(d.getUTCDate() - 1)
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

// ¿El precio guardado (fecha YYYY-MM-DD) está al día?
export function isPriceFresh(storedDate, now = new Date()) {
  if (!storedDate) return false
  return storedDate >= expectedCloseDate(now)
}

// ¿Debe el precio de daily_prices sustituir al `current_price` que ya trae la
// fila de company_fundamentals/funds? Solo si es igual de reciente o más: si el
// refresco falló, un cierre viejo NO debe pisar el precio del scrape semanal
// (era el motivo de que la cartera mostrase precios de hace días mientras la
// ficha, que cotiza en vivo, iba al día).
export function shouldReplacePrice(dp, rowUpdatedAt) {
  if (dp?.price == null) return false
  if (dp.fresh) return true
  if (!rowUpdatedAt) return true
  return dp.date >= String(rowUpdatedAt).slice(0, 10)
}
