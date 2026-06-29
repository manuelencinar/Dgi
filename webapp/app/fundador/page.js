import PublicNav from '@/components/PublicNav'
import FundadorClient from '@/components/FundadorClient'

export const metadata = {
  title: 'Hazte fundador — EverDiv',
  description: 'Conviértete en uno de los 100 primeros suscriptores y disfruta de un precio de 20 € al año para siempre.',
}
export const dynamic = 'force-dynamic'

export default function FundadorPage() {
  const bizumPhone = process.env.NEXT_PUBLIC_BIZUM_PHONE || '—'
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <PublicNav />
      <FundadorClient bizumPhone={bizumPhone} />
    </div>
  )
}
