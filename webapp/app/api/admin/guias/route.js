// CRUD de guías (admin). Guarda el contenido en Markdown; las páginas públicas
// leen las publicadas.
import { NextResponse } from 'next/server'
import { requireAdmin, serviceClient } from '@/lib/admin'

export const dynamic = 'force-dynamic'

const slugify = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)

export async function GET() {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  const { data, error } = await serviceClient().from('guias').select('*').order('updated_at', { ascending: false })
  if (error) return NextResponse.json({ guias: [], error: error.message })
  return NextResponse.json({ guias: data || [] })
}

export async function POST(request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  let b
  try { b = await request.json() } catch { return NextResponse.json({ error: 'Body inválido' }, { status: 400 }) }

  const title = String(b?.title || '').trim()
  if (!title) return NextResponse.json({ error: 'El título es obligatorio' }, { status: 400 })
  const slug = slugify(b?.slug || title)
  if (!slug) return NextResponse.json({ error: 'Slug inválido' }, { status: 400 })

  const related = Array.isArray(b?.related) ? b.related
    : (typeof b?.related === 'string' ? b.related.split(',').map(s => s.trim()).filter(Boolean) : [])

  const row = {
    slug, title,
    description: b?.description ? String(b.description).slice(0, 300) : null,
    category: b?.category ? String(b.category).slice(0, 40) : null,
    excerpt: b?.excerpt ? String(b.excerpt).slice(0, 300) : null,
    content: b?.content != null ? String(b.content) : '',
    minutes: Math.max(1, Math.min(60, parseInt(b?.minutes) || 5)),
    related,
    published: !!b?.published,
    updated_at: new Date().toISOString(),
  }

  const sb = serviceClient()
  let res
  if (b?.id) res = await sb.from('guias').update(row).eq('id', b.id).select().maybeSingle()
  else res = await sb.from('guias').insert(row).select().maybeSingle()
  if (res.error) {
    const dup = /duplicate|unique/i.test(res.error.message)
    return NextResponse.json({ error: dup ? 'Ya existe una guía con ese slug' : res.error.message }, { status: 200 })
  }
  return NextResponse.json({ ok: true, guia: res.data })
}

export async function DELETE(request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })
  const { error } = await serviceClient().from('guias').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 200 })
  return NextResponse.json({ ok: true })
}
