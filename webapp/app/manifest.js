// Manifest PWA → la app se puede instalar ("añadir a pantalla de inicio") con
// icono y arranque propios. Next 16 lo sirve en /manifest.webmanifest y añade el
// <link rel="manifest"> automáticamente.
export default function manifest() {
  return {
    name: 'EverDiv',
    short_name: 'EverDiv',
    description: 'Análisis de dividendos crecientes (DGI): screener, valoración, cartera, rankings y alertas.',
    start_url: '/',
    display: 'standalone',
    background_color: '#080b14',
    theme_color: '#080b14',
    lang: 'es',
    categories: ['finance', 'productivity'],
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icon-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
    ],
  }
}
