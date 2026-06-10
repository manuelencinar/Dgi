import { redirect } from 'next/navigation'

// El calendario vive ahora dentro de la sección Dividendos.
export const dynamic = 'force-dynamic'
export default function CalendarioRedirect() {
  redirect('/cartera/dividendos')
}
