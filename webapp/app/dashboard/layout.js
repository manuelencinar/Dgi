import { redirect } from 'next/navigation'
import { getAdminContext } from '@/lib/admin'
import DashboardSidebar from '@/components/dashboard/DashboardSidebar'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Panel de administración', robots: { index: false, follow: false } }

export default async function DashboardLayout({ children }) {
  // Defensa en profundidad (además del middleware)
  const { isAdmin } = await getAdminContext()
  if (!isAdmin) redirect('/')

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', flex: 1 }}>
        <DashboardSidebar />
        <main style={{ flex: 1, minWidth: 0, padding: '30px 32px 72px' }}>
          <div style={{ maxWidth: 1160, margin: '0 auto' }}>
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
