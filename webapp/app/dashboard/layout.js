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
    <div style={{ minHeight: '100vh', background: '#080b14', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', flex: 1 }}>
        <DashboardSidebar />
        <main style={{ flex: 1, minWidth: 0, padding: '28px 28px 64px' }}>
          {children}
        </main>
      </div>
    </div>
  )
}
