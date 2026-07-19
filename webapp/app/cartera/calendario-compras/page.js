import { createClient } from '@/lib/supabase/server'
import PublicNav from '@/components/PublicNav'
import CarteraNav from '@/components/cartera/CarteraNav'
import CalendarioComprasClient from '@/components/cartera/CalendarioComprasClient'
import LoggedOutPreview from '@/components/LoggedOutPreview'

export const metadata = {
  title: 'Calendario de compras — EverDiv',
  description: 'Planifica tus próximas aportaciones y proyecta cómo quedaría tu cartera si ejecutas el plan.',
}
export const dynamic = 'force-dynamic'

export default async function CalendarioComprasPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
        <PublicNav active="/cartera" />
        <LoggedOutPreview variant="cartera" />
      </div>
    )
  }
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <PublicNav active="/cartera" />
      <CarteraNav />
      <CalendarioComprasClient />
    </div>
  )
}
