// Lógica (pura) de la página de Novedades: detectar empresas que han presentado
// resultados recientemente (a partir del último trimestre de los estados ya
// guardados) y calcular el cambio interanual (YoY) destacado. El reparto
// EE.UU./país del usuario para el bloque destacado también vive aquí.

const REV_KEYS = ['Total Revenue', 'Ingresos Totales', 'Ingresos', 'Revenue']
const INC_KEYS = ['Net Income', 'Beneficio Neto', 'Net Income Common Stockholders', 'Beneficio neto', 'Beneficio Neto Común']

function row(data, keys) {
  for (const k of keys) if (Array.isArray(data?.[k])) return data[k]
  return null
}
const yoy = arr => (Array.isArray(arr) && arr.length >= 5 && arr[4] != null && arr[0] != null && Number(arr[4]) !== 0)
  ? (Number(arr[0]) - Number(arr[4])) / Math.abs(Number(arr[4])) * 100 : null

export function daysSince(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr)
  return isNaN(d) ? null : Math.floor((Date.now() - d.getTime()) / 86400000)
}

// Parsea el estado trimestral → { latestDate, revYoY, incYoY, revSeries }.
// columns[0] / data[k][0] = trimestre más reciente. YoY compara contra el mismo
// trimestre de hace un año (índice 4).
export function parseQuarterlyNews(q) {
  if (!q?.columns?.length || !q?.data) return null
  const cols = q.columns
  const rev = row(q.data, REV_KEYS)
  const inc = row(q.data, INC_KEYS)
  const revSeries = rev
    ? cols.map((c, i) => ({ date: c, val: rev[i] != null ? Number(rev[i]) : null }))
        .filter(x => x.val != null).slice(0, 6).reverse()
    : []
  return { latestDate: cols[0], revYoY: yoy(rev), incYoY: yoy(inc), revSeries }
}

// Bloque destacado: mitad EE.UU. y mitad del país del usuario (cuando hay muchas).
// `items` debe venir ordenado por capitalización desc; cada uno con { t, cc }.
export function splitFeatured(items, userCC, n = 6) {
  const half = Math.ceil(n / 2)
  const isHome = userCC && userCC !== 'US'
  const picked = []
  const add = x => { if (x && picked.length < n && !picked.some(p => p.t === x.t)) picked.push(x) }
  if (isHome) {
    items.filter(i => i.cc === 'US').slice(0, half).forEach(add)
    items.filter(i => i.cc === userCC).forEach(add)   // llena la otra mitad
  } else {
    items.filter(i => i.cc === 'US').forEach(add)
  }
  items.forEach(add)                                   // rellena el resto por capitalización
  return picked.slice(0, n)
}
