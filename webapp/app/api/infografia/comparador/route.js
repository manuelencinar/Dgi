import { createClient } from '@/lib/supabase/server'
import { buildInfographicModels } from '@/lib/infografia-data'
import { renderComparadorHtml } from '@/lib/infografia-template'
import { htmlToPdf } from '@/lib/pdf'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const ADMIN_EMAIL = 'vayaebookk@gmail.com'

// Caché en memoria del PDF (los datos cambian a lo sumo a diario). Clave = tickers.
const cache = new Map()
const TTL = 12 * 60 * 60 * 1000   // 12h

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
  const tickers = (url.searchParams.get('tickers') || '').split(',').map(t => t.trim().toUpperCase()).filter(Boolean).slice(0, 2)
  if (tickers.length < 2) return Response.json({ error: 'Indica dos tickers (?tickers=A,B).' }, { status: 400 })

  if (!(await isPremiumUser())) return Response.json({ error: 'La infografía en PDF es una función Premium.' }, { status: 403 })

  const key = tickers.join(',')
  const hit = cache.get(key)
  let pdf = hit && Date.now() - hit.at < TTL ? hit.pdf : null

  if (!pdf) {
    const models = await buildInfographicModels(tickers)
    if (models.length < 2) return Response.json({ error: 'No hay datos suficientes para esas empresas.' }, { status: 404 })
    const html = renderComparadorHtml(models)
    pdf = await htmlToPdf(html)
    cache.set(key, { at: Date.now(), pdf })
  }

  const filename = `EverDiv-${tickers.join('-vs-')}.pdf`
  return new Response(pdf, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, max-age=43200',
    },
  })
}
