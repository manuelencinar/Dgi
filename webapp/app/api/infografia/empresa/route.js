import { createClient } from '@/lib/supabase/server'
import { buildInfographicModels } from '@/lib/infografia-data'
import { renderEmpresaHtml } from '@/lib/infografia-template'
import { htmlToPdf } from '@/lib/pdf'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const ADMIN_EMAIL = 'vayaebookk@gmail.com'

const cache = new Map()
const TTL = 12 * 60 * 60 * 1000

async function isPremiumUser() {
  try {
    const auth = await createClient()
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return false
    if (user.email === ADMIN_EMAIL) return true
    const { data } = await auth.from('user_settings').select('*').eq('user_id', user.id).maybeSingle()
    return data?.plan === 'premium' && (!data.premium_until || new Date(data.premium_until) >= new Date())
  } catch { return false }
}

export async function GET(request) {
  const url = new URL(request.url)
  const ticker = (url.searchParams.get('ticker') || '').trim().toUpperCase()
  if (!ticker) return Response.json({ error: 'Indica un ticker (?ticker=A).' }, { status: 400 })

  if (!(await isPremiumUser())) return Response.json({ error: 'La infografía en PDF es una función Premium.' }, { status: 403 })

  const hit = cache.get(ticker)
  let pdf = hit && Date.now() - hit.at < TTL ? hit.pdf : null

  if (!pdf) {
    const models = await buildInfographicModels([ticker])
    if (!models.length) return Response.json({ error: 'No hay datos para esa empresa.' }, { status: 404 })
    const html = renderEmpresaHtml(models[0])
    pdf = await htmlToPdf(html)
    cache.set(ticker, { at: Date.now(), pdf })
  }

  return new Response(pdf, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="EverDiv-${ticker}.pdf"`,
      'Cache-Control': 'no-store, must-revalidate',
    },
  })
}
