import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if(!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('portfolios')
    .select('data')
    .eq('user_id', user.id)
    .single()

  if(error && error.code !== 'PGRST116') return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ companies: data?.data || [] })
}

export async function POST(request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if(!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companies } = await request.json()

  const { error } = await supabase
    .from('portfolios')
    .upsert({ user_id: user.id, data: companies, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })

  if(error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
