// Helpers de la Watchlist — lógica pura reutilizable en cliente y servidor.

export const FREE_WATCHLIST_LIMIT = 10

// Proximidad del precio actual al precio objetivo.
//  inZone : precio actual <= objetivo (en zona de compra)
//  near   : dentro del 5% por encima del objetivo (cerca)
//  pct    : distancia relativa (negativo = por debajo del objetivo)
//  abs    : distancia absoluta en la divisa
export function priceProximity(current, target) {
  if (current == null || target == null || target <= 0) return null
  const abs = current - target
  const pct = (abs / target) * 100
  return {
    abs,
    pct,
    inZone: current <= target,
    near: !(current <= target) && pct <= 5,
  }
}

// Precio al que haría falta cotizar para alcanzar el yield objetivo.
//   yield = dps / precio  →  precio = dps / (yield/100)
export function priceForYield(dps, targetYield) {
  if (dps == null || targetYield == null || targetYield <= 0) return null
  return dps / (targetYield / 100)
}

// ¿Hay alguna alerta configurada en esta entrada?
export function hasAlert(row) {
  return !!(row?.alert_price_active || row?.alert_yield_active)
}
