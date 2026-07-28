// "Precio de compra DGI" para la ficha: el precio al que la empresa entraría en zona de
// compra según nuestros umbrales (margen de seguridad sobre el valor intrínseco + calidad).
// Reutiliza el valor intrínseco ya calculado. No inventa nada: si no hay valoración fiable
// o la calidad es baja, lo indica.
const num = v => (v != null && !isNaN(v)) ? Number(v) : null

export const MOS_TARGET = 0.20      // margen de seguridad objetivo (20%)
export const MIN_QUALITY = 6.5      // Score DGI mínimo para considerarlo "comprable"

// intrinsic: valor intrínseco por acción (mismo del DCF). price: precio actual.
// score: Score DGI total. reliableMos: si la valoración es fiable (no marcada no-disponible).
// yieldAvg / dps: para el objetivo por rentabilidad histórica (precio al que el yield vuelve
// a su media histórica).
export function computeBuyPrice({ intrinsic, price, score, reliableMos = true, yieldAvg = null, dps = null }) {
  const iv = num(intrinsic), p = num(price), sc = num(score)
  const quality = sc != null && sc >= MIN_QUALITY

  // Precio al que el margen de seguridad alcanza el objetivo.
  const buyPrice = (reliableMos && iv != null && iv > 0) ? iv * (1 - MOS_TARGET) : null

  // Precio al que el yield vuelve a su media histórica (señal secundaria).
  const yAvg = num(yieldAvg), d = num(dps)
  const yieldTargetPrice = (yAvg != null && yAvg > 0 && d != null && d > 0) ? d / (yAvg / 100) : null

  const distancePct = (buyPrice != null && p != null && p > 0) ? (p - buyPrice) / p * 100 : null
  const inZone = (buyPrice != null && p != null) ? p <= buyPrice : false
  const currentMos = (iv != null && iv > 0 && p != null && p > 0) ? (iv - p) / iv * 100 : null

  return {
    available: buyPrice != null,
    quality,                 // cumple el umbral de calidad
    buyPrice,                // precio de entrada objetivo (MoS 20%)
    yieldTargetPrice,        // precio al que el yield = su media histórica
    price: p,
    distancePct,             // % que tendría que caer el precio (negativo = ya está por debajo)
    inZone,                  // ya en zona de compra por MoS
    currentMos,              // margen de seguridad al precio actual
    reason: !quality ? 'calidad_baja' : (!buyPrice ? 'sin_valoracion' : null),
  }
}
