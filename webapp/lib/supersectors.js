// Taxonomía de Morningstar: 11 sectores agrupados en 3 grandes SUPERSECTORES.
// company_fundamentals.sector viene de Yahoo con estos mismos 11 nombres (inglés).

export const SUPERSECTORS = {
  ciclico:   { label: 'Cíclico',   color: '#fb923c', desc: 'Sensibles al ciclo económico' },
  sensible:  { label: 'Sensible',  color: '#60a5fa', desc: 'Siguen la economía con cierto retardo' },
  defensivo: { label: 'Defensivo', color: '#34d399', desc: 'Demanda estable en cualquier ciclo' },
  otros:     { label: 'Otros',     color: '#8090a8', desc: 'ETFs, fondos y sin clasificar' },
}

// Orden de presentación de los supersectores.
export const SUPERSECTOR_ORDER = ['ciclico', 'sensible', 'defensivo', 'otros']

// Sector (en inglés, tal como lo da Yahoo) → supersector + etiqueta en español.
const SECTOR_MAP = {
  'Basic Materials':        { sup: 'ciclico',   es: 'Materiales básicos' },
  'Consumer Cyclical':      { sup: 'ciclico',   es: 'Consumo cíclico' },
  'Financial Services':     { sup: 'ciclico',   es: 'Servicios financieros' },
  'Real Estate':            { sup: 'ciclico',   es: 'Inmobiliario' },
  'Communication Services': { sup: 'sensible',  es: 'Comunicación' },
  'Energy':                 { sup: 'sensible',  es: 'Energía' },
  'Industrials':            { sup: 'sensible',  es: 'Industria' },
  'Technology':             { sup: 'sensible',  es: 'Tecnología' },
  'Consumer Defensive':     { sup: 'defensivo', es: 'Consumo defensivo' },
  'Healthcare':             { sup: 'defensivo', es: 'Salud' },
  'Utilities':              { sup: 'defensivo', es: 'Servicios públicos' },
}

// Devuelve { sup, es } para cualquier sector (incl. ETFs/fondos y sin dato → 'otros').
export function sectorInfo(sector) {
  if (sector && SECTOR_MAP[sector]) return SECTOR_MAP[sector]
  return { sup: 'otros', es: sector && sector !== '—' ? sector : 'Sin clasificar' }
}

export function superSectorOf(sector) { return sectorInfo(sector).sup }
export function sectorLabelEs(sector) { return sectorInfo(sector).es }

// ── Perfiles de inversor ────────────────────────────────────────────────────
// El usuario elige el tipo de inversión; cada perfil define el peso OBJETIVO de
// cada supersector. No todos los supersectores tienen el mismo peso admisible.
export const INVESTOR_PROFILES = {
  defensivo:   { label: 'Defensivo',   desc: 'Prioriza estabilidad y renta',          targets: { defensivo: 60, sensible: 20, ciclico: 20 } },
  equilibrado: { label: 'Equilibrado', desc: 'Reparto equitativo entre supersectores', targets: { defensivo: 34, sensible: 33, ciclico: 33 } },
  crecimiento: { label: 'Crecimiento', desc: 'Más peso a tecnología e industria',      targets: { defensivo: 20, sensible: 50, ciclico: 30 } },
}
export const PROFILE_ORDER = ['defensivo', 'equilibrado', 'crecimiento']
export const DEFAULT_PROFILE = 'equilibrado'
