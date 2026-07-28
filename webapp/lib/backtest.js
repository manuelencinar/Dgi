// "¿Y si hubieras invertido?" — rentabilidad histórica total (precio + dividendos
// reinvertidos) a partir de la serie de precios (daily_prices) y el histórico de dividendos.
// Misma reconstrucción que el gráfico de la ficha (coherencia). Puro y testeable.

// Reconstruye la serie de total return (dividendos reinvertidos). shares parte de 1.
// Cada dividendo anual se reparte en 4 pagos aproximados y se reinvierte sobre el precio.
export function reconstructTotalReturn(timestamps, closes, divHistory) {
  if (!closes?.length) return null
  const t0 = timestamps[0], tN = timestamps[timestamps.length - 1]
  const pays = []
  for (const h of (divHistory || [])) {
    const dps = Number(h?.dps)
    if (!dps || dps <= 0 || h?.year == null) continue
    for (const month of [2, 5, 8, 11]) {
      const t = Math.floor(Date.UTC(h.year, month, 15) / 1000)
      if (t >= t0 && t <= tN) pays.push({ t, amt: dps / 4 })
    }
  }
  pays.sort((a, b) => a.t - b.t)
  let shares = 1, pi = 0
  const tr = []
  for (let i = 0; i < closes.length; i++) {
    while (pi < pays.length && pays[pi].t <= timestamps[i]) {
      if (closes[i] > 0) shares += shares * pays[pi].amt / closes[i]
      pi++
    }
    tr.push(shares * closes[i])
  }
  return tr
}

// Dividendos en efectivo cobrados en la ventana (sin reinvertir) por cada acción inicial.
function dividendsPerShare(timestamps, divHistory) {
  const t0 = timestamps[0], tN = timestamps[timestamps.length - 1]
  let sum = 0
  for (const h of (divHistory || [])) {
    const dps = Number(h?.dps)
    if (!dps || dps <= 0 || h?.year == null) continue
    const t = Math.floor(Date.UTC(h.year, 6, 1) / 1000)   // mitad de año (aprox.)
    if (t >= t0 && t <= tN) sum += dps
  }
  return sum
}

// Resultado del backtest para una inversión inicial (por defecto 1.000).
export function computeBacktest({ timestamps, closes, divHistory, initial = 1000 }) {
  if (!timestamps?.length || !closes?.length || timestamps.length !== closes.length || closes[0] <= 0) {
    return { available: false }
  }
  const years = (timestamps[timestamps.length - 1] - timestamps[0]) / (365.25 * 86400)
  if (years < 0.5) return { available: false }

  const p0 = closes[0], pN = closes[closes.length - 1]
  const priceReturn = pN / p0 - 1
  const tr = reconstructTotalReturn(timestamps, closes, divHistory)
  const totalReturn = (tr && tr[0] > 0) ? tr[tr.length - 1] / tr[0] - 1 : priceReturn

  const cagr = ret => Math.pow(1 + ret, 1 / years) - 1
  const sharesInit = initial / p0
  const dividendsCollected = sharesInit * dividendsPerShare(timestamps, divHistory)

  return {
    available: true,
    years: Math.round(years * 10) / 10,
    initial,
    endValue: initial * (1 + totalReturn),
    endValuePriceOnly: initial * (1 + priceReturn),
    totalReturn: totalReturn * 100,
    priceReturn: priceReturn * 100,
    totalCagr: cagr(totalReturn) * 100,
    priceCagr: cagr(priceReturn) * 100,
    dividendsCollected,
    startDate: new Date(timestamps[0] * 1000).toISOString().slice(0, 10),
    endDate: new Date(timestamps[timestamps.length - 1] * 1000).toISOString().slice(0, 10),
  }
}
