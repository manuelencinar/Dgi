// Unificación de cotizaciones múltiples (misma empresa en varios mercados).
// La página de una cotización secundaria redirige a la MATRIZ (mercado de
// origen) y la matriz muestra las demás cotizaciones (mercado, precio y ticker).
//
// Mapa CURADO a mano (no heurístico): agrupar por nombre da falsos positivos
// peligrosos — p.ej. Domino's Pizza Inc (DPZ, EEUU), Domino's Australia (DMP.AX)
// y Domino's UK (DOM.L) son TRES empresas distintas. Aquí solo van pares
// verificados, con el origen correcto (a veces EEUU: ResMed, Amcor, Smurfit
// WestRock, CCEP; a veces extranjero: ASML, AstraZeneca; espejos OTC suizos).

// secundario → matriz (mercado de origen). Ambos deben existir en el DICT.
export const PRIMARY = {
  // ADRs / cotización extranjera → mercado de origen
  'ASML': 'ASML.AS',          // ASML Holding (NL)
  'AZN': 'AZN.L',             // AstraZeneca (UK)
  'NGG': 'NG.L',              // National Grid (UK)
  'HDB': 'HDFCBANK.NS',       // HDFC Bank (India)
  'UNA.AS': 'ULVR.L',         // Unilever → cotización principal en Londres
  'TUI.L': 'TUI1.DE',         // TUI → salió de Londres, principal en Fráncfort

  // Espejos OTC en EEUU (.SS, USD) de valores suizos → SIX (.SW, CHF)
  'ABBN.SS': 'ABBN.SW', 'ALC.SS': 'ALC.SW', 'GIVN.SS': 'GIVN.SW',
  'HOLN.SS': 'HOLN.SW', 'KNIN.SS': 'KNIN.SW', 'LONN.SS': 'LONN.SW',
  'NOVN.SS': 'NOVN.SW', 'PGHN.SS': 'PGHN.SW', 'SDZ.SS': 'SDZ.SW',
  'SIKA.SS': 'SIKA.SW', 'SOON.SS': 'SOON.SW', 'SLHN.SS': 'SLHN.SW',
  'SRENH.SS': 'SREN.SW', 'SCMN.SS': 'SCMN.SW', 'UBSG.SS': 'UBSG.SW',

  // Empresas de origen EEUU con CDI/cotización secundaria extranjera → EEUU
  'RMD.AX': 'RMD',            // ResMed (US)
  'AMCR.AX': 'AMCR', 'AMC.AX': 'AMCR',   // Amcor (US, NYSE)
  'SW.IR': 'SW', 'SWR.L': 'SW',          // Smurfit WestRock (US, NYSE)
  'CCEP.MC': 'CCEP', 'CCEP.L': 'CCEP',   // Coca-Cola Europacific Partners (US, Nasdaq)
}

// matriz → [todas las cotizaciones del grupo, matriz incluida]
const GROUP = (() => {
  const g = {}
  for (const [sec, prim] of Object.entries(PRIMARY)) {
    (g[prim] = g[prim] || [prim]).push(sec)
  }
  return g
})()

// Ticker matriz de una cotización (o el mismo si no está unificada).
export function primaryOf(ticker) {
  return PRIMARY[ticker] || ticker
}

// ¿Es esta cotización una secundaria (debe redirigir)?
export function isSecondary(ticker) {
  return PRIMARY[ticker] != null
}

// Otras cotizaciones de la misma empresa (excluyendo la matriz). [] si no hay.
export function otherListings(primaryTicker) {
  return (GROUP[primaryTicker] || []).filter(t => t !== primaryTicker)
}
