import { NextResponse } from 'next/server'
import { requireAdmin, serviceClient } from '@/lib/admin'

export const dynamic = 'force-dynamic'

const REPO     = 'manuelencinar/Dgi'
const WORKFLOW = 'update_all.yml'

export async function POST() {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const token = process.env.GITHUB_TOKEN
  if (!token) return NextResponse.json({ error: 'GITHUB_TOKEN no configurado en las variables de entorno' }, { status: 500 })

  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref: 'master', inputs: { job: 'prices' } }),
    })

    if (res.status === 204) {
      try {
        await serviceClient().from('admin_logs').insert({
          event_type: 'manual_trigger',
          description: `Actualización de precios disparada manualmente por ${admin.email}`,
          status: 'ok',
        })
      } catch {}
      return NextResponse.json({ ok: true, message: 'Workflow de precios disparado correctamente' })
    }

    const text = await res.text()
    return NextResponse.json({ error: `GitHub devolvió ${res.status}: ${text}` }, { status: 502 })
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 500 })
  }
}
