import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'

export async function proxy(request) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl
  const isAuthPage = pathname.startsWith('/login') || pathname.startsWith('/register')
  const isAppPage = pathname.startsWith('/app')
  const isDashboard = pathname.startsWith('/dashboard')

  // Panel de administración — solo admin, redirección silenciosa
  if (isDashboard) {
    if (!user) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      return NextResponse.redirect(url)
    }
    let isAdmin = user.email === 'vayaebookk@gmail.com'
    if (!isAdmin) {
      const { data } = await supabase
        .from('user_settings')
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle()
      isAdmin = data?.role === 'admin'
    }
    if (!isAdmin) {
      const url = request.nextUrl.clone()
      url.pathname = '/'
      return NextResponse.redirect(url)
    }
  }

  if (!user && isAppPage) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (user && isAuthPage) {
    const url = request.nextUrl.clone()
    url.pathname = '/app'
    return NextResponse.redirect(url)
  }

  // Onboarding: si el usuario autenticado entra a una ruta de app y aún no lo
  // ha completado, redirigir a /onboarding (nunca bloquea: hay botón saltar).
  const ONBOARD_ROUTES = ['/app', '/cartera', '/mercados', '/screener', '/comparador', '/etfs', '/empresa', '/fondo', '/watchlist']
  if (user && ONBOARD_ROUTES.some(r => pathname.startsWith(r)) && pathname !== '/onboarding') {
    try {
      const { data } = await supabase.from('user_settings').select('onboarding_completed').eq('user_id', user.id).maybeSingle()
      if (data && data.onboarding_completed === false) {
        const url = request.nextUrl.clone()
        url.pathname = '/onboarding'
        return NextResponse.redirect(url)
      }
    } catch {}
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
