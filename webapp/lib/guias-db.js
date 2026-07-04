// Lectura de guías desde Supabase (server-only, service client). Si la tabla aún
// no existe o está vacía, cae a las guías estáticas de data/guias.js (así el blog
// funciona incluso antes de ejecutar guias.sql / sembrar).
import { createClient } from '@supabase/supabase-js'
import { GUIAS as STATIC } from '@/data/guias'
import { blocksToMd } from '@/lib/markdown-blocks'

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
}

const staticList = () => STATIC.map(g => ({
  slug: g.slug, title: g.title, description: g.description, category: g.category,
  excerpt: g.excerpt, minutes: g.minutes, updated_at: g.updated,
}))
const staticOne = slug => {
  const g = STATIC.find(x => x.slug === slug)
  if (!g) return null
  return { slug: g.slug, title: g.title, description: g.description, category: g.category, excerpt: g.excerpt, minutes: g.minutes, related: g.related || [], content: blocksToMd(g.content), updated_at: g.updated }
}

export async function listPublishedGuias() {
  try {
    const { data } = await sb().from('guias').select('slug, title, description, category, excerpt, minutes, updated_at')
      .eq('published', true).order('updated_at', { ascending: false })
    if (data && data.length) return data
  } catch {}
  return staticList()
}

export async function getPublishedGuia(slug) {
  try {
    const { data } = await sb().from('guias').select('*').eq('slug', slug).eq('published', true).maybeSingle()
    if (data) return data
  } catch {}
  return staticOne(slug)
}
