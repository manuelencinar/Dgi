import { NextResponse } from 'next/server'
import { requireAdmin, serviceClient } from '@/lib/admin'

export const dynamic = 'force-dynamic'

export async function POST() {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const cutoff = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString()
  const sc = serviceClient()
  try {
    const { error, count } = await sc
      .from('admin_logs')
      .delete({ count: 'exact' })
      .lt('created_at', cutoff)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Misma retención (90 días) para los eventos de actividad. Tolerante a que la tabla
    // aún no exista (no rompe la limpieza de admin_logs).
    let eventsDeleted = 0
    try {
      const { count: ec } = await sc.from('user_events').delete({ count: 'exact' }).lt('created_at', cutoff)
      eventsDeleted = ec ?? 0
    } catch {}

    return NextResponse.json({ ok: true, deleted: count ?? 0, eventsDeleted })
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 500 })
  }
}
