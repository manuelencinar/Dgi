// La pestaña Historial se eliminó: las operaciones y las comisiones viven ahora
// dentro de /cartera (desplegable "Operaciones"). Redirigimos para no romper enlaces.
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default function Page() {
  redirect('/cartera')
}
