import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

const LINKS = [
  { href: '/mercados', label: 'Mercados' },
  { href: '/screener', label: 'Screener' },
  { href: '/etfs',     label: 'ETFs' },
  { href: '/cartera',  label: 'Cartera' },
]

const ADMIN_EMAIL = 'vayaebookk@gmail.com'

async function getSessionUser() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    let isPremium = user.email === ADMIN_EMAIL
    if (!isPremium) {
      const { data } = await supabase
        .from('user_settings')
        .select('plan, premium_until')
        .eq('user_id', user.id)
        .single()
      if (data?.plan === 'premium') {
        isPremium = !data.premium_until || new Date(data.premium_until) >= new Date()
      }
    }

    return { email: user.email, isPremium }
  } catch {
    return null
  }
}

export default async function PublicNav({ active }) {
  const sessionUser = await getSessionUser()

  return (
    <nav style={{
      position: 'sticky', top: 0, zIndex: 50,
      background: 'rgba(8,11,20,0.92)', backdropFilter: 'blur(12px)',
      borderBottom: '1px solid rgba(255,255,255,0.06)',
      padding: '0 16px',
    }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'center', height: 52, gap: 0 }}>
        <Link href="/" style={{ fontSize: 14, fontWeight: 900, color: '#e0e8f0', textDecoration: 'none', marginRight: 28, flexShrink: 0 }}>
          Mi Índice DGI
        </Link>

        <div style={{ display: 'flex', gap: 2, flex: 1 }}>
          {LINKS.map(l => (
            <Link key={l.href} href={l.href} style={{
              fontSize: 13, fontWeight: 500, padding: '6px 12px', borderRadius: 7, textDecoration: 'none',
              color: active === l.href ? '#818cf8' : '#4a5270',
              background: active === l.href ? 'rgba(99,102,241,0.12)' : 'transparent',
            }}>
              {l.label}
            </Link>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {sessionUser ? (
            <>
              {sessionUser.isPremium && (
                <span style={{
                  fontSize: 10, fontWeight: 700, color: '#fbbf24',
                  background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.25)',
                  borderRadius: 6, padding: '2px 8px', letterSpacing: '0.06em',
                }}>
                  PREMIUM
                </span>
              )}
              <Link href="/mercados" style={{
                fontSize: 12, fontWeight: 700, color: '#818cf8',
                background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)',
                borderRadius: 8, padding: '5px 13px', textDecoration: 'none',
              }}>
                Mi Índice →
              </Link>
            </>
          ) : (
            <>
              <Link href="/login" style={{ fontSize: 12, color: '#4a5270', textDecoration: 'none', padding: '6px 12px' }}>
                Acceder
              </Link>
              <Link href="/register" style={{
                fontSize: 12, fontWeight: 700, color: '#fff', textDecoration: 'none',
                padding: '6px 14px', background: 'rgba(99,102,241,0.8)', borderRadius: 8,
              }}>
                Registro gratis
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  )
}
