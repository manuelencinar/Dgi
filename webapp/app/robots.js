// Permite indexar las páginas públicas (landing, mercados, screener, fichas,
// rankings) y bloquea las privadas/de app y las APIs.
const BASE = 'https://invest-dgi.vercel.app'

export default function robots() {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/api/', '/dashboard', '/cartera', '/ajustes', '/onboarding',
        '/cancelar', '/watchlist', '/notificaciones', '/login', '/register', '/app',
      ],
    },
    sitemap: `${BASE}/sitemap.xml`,
  }
}
