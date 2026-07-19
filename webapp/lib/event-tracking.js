// Mapeo ruta → sección para el tracking de actividad (lo consume proxy.js).
// LISTA BLANCA explícita: cualquier ruta no mapeada devuelve null → NO se trackea
// (así se excluyen _next, assets, /api/admin/*, /dashboard, y demás APIs internas).

// Páginas: se trackean como page_view (solo GET). Prefijo → sección.
const PAGE_SECTIONS = [
  { prefix: '/screener',          section: 'screener' },
  { prefix: '/cartera',           section: 'cartera' },
  { prefix: '/watchlist',         section: 'watchlist' },
  { prefix: '/comparador',        section: 'comparador' },
  { prefix: '/aristocratas',      section: 'aristocratas' },
  { prefix: '/canibales',         section: 'aristocratas' },
  { prefix: '/compounders',       section: 'aristocratas' },
  { prefix: '/etfs',              section: 'etfs' },
  { prefix: '/fondo',             section: 'etfs' },
  { prefix: '/empresa',           section: 'ficha_empresa' },
  { prefix: '/mercados',          section: 'mercados' },
  { prefix: '/novedades',         section: 'novedades' },
  { prefix: '/construir-cartera', section: 'construir_cartera' },
  { prefix: '/guias',             section: 'guias' },
]

// Acciones clave por API: event_name específico (distinto de page_view).
const ACTIONS = [
  { path: '/api/comparador',              method: 'POST', section: 'comparador', event_name: 'comparacion_hecha' },
  { path: '/api/watchlist',               method: 'POST', section: 'watchlist',  event_name: 'watchlist_accion' },
  { path: '/api/procesar-aportaciones',   method: null,   section: 'cartera',    event_name: 'aportacion_procesada' },
]

// Devuelve { section, event_name, metadata? } o null si la ruta no se trackea.
export function resolveEvent(pathname, method = 'GET') {
  if (!pathname) return null

  // 1) Acciones clave (APIs whitelisteadas)
  for (const a of ACTIONS) {
    if (pathname === a.path && (!a.method || a.method === method)) {
      return { section: a.section, event_name: a.event_name }
    }
  }

  // 2) Excluir explícitamente lo que no son páginas de app
  if (pathname.startsWith('/api/') || pathname.startsWith('/_next') || pathname.startsWith('/dashboard')) return null

  // 3) Páginas: solo navegaciones GET
  if (method !== 'GET') return null
  for (const p of PAGE_SECTIONS) {
    if (pathname === p.prefix || pathname.startsWith(p.prefix + '/')) {
      // Ficha de empresa: guardamos el ticker visto en metadata (solo lo relevante).
      if (p.section === 'ficha_empresa') {
        const parts = pathname.split('/')
        const ticker = parts[2] ? decodeURIComponent(parts[2]) : null
        return { section: p.section, event_name: 'page_view', metadata: ticker ? { ticker } : null }
      }
      return { section: p.section, event_name: 'page_view' }
    }
  }
  return null
}
