import { NextResponse } from 'next/server'
import { requireAdmin, serviceClient } from '@/lib/admin'

export const dynamic = 'force-dynamic'

export async function POST() {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const cutoff = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString()
  try {
    const { error, count } = await serviceClient()
      .from('admin_logs')
      .delete({ count: 'exact' })
      .lt('created_at', cutoff)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, deleted: count ?? 0 })
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 500 })
  }
}
