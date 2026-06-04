import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail, emailShell, emailButton, APP_URL } from '@/lib/email'

export const dynamic     = 'force-dynamic'
export const maxDuration = 60

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
}

export async function GET(request) {
  // Seguridad opcional del cron
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const auth = request.headers.get('authorization')
    if (auth !== `Bearer ${cronSecret}`) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const admin = sb()

  // Cancelaciones de hace exactamente 30 días (ventana de 1 día)
  const from = new Date(); from.setDate(from.getDate() - 30); from.setHours(0, 0, 0, 0)
  const to   = new Date(from); to.setDate(to.getDate() + 1)

  const { data: cancels } = await admin
    .from('cancellations')
    .select('user_id, created_at')
    .gte('created_at', from.toISOString())
    .lt('created_at', to.toISOString())

  if (!cancels?.length) return NextResponse.json({ processed: 0, message: 'Sin cancelaciones hace 30 días' })

  let sent = 0, skipped = 0, errors = 0

  for (const c of cancels) {
    try {
      // Comprobar que no ha reactivado y que acepta emails
      const { data: s } = await admin
        .from('user_settings')
        .select('plan, premium_until, alerts_email_active, monthly_summary_active')
        .eq('user_id', c.user_id)
        .maybeSingle()

      const reactivated = s?.plan === 'premium' && (!s.premium_until || new Date(s.premium_until) >= new Date())
      const acceptsEmail = s?.alerts_email_active || s?.monthly_summary_active
      if (reactivated || !acceptsEmail) { skipped++; continue }

      const { data: userResp } = await admin.auth.admin.getUserById(c.user_id)
      const email = userResp?.user?.email
      if (!email) { skipped++; continue }

      // Recordar lo que tenía en cartera
      let carteraLine = ''
      try {
        const { data: positions } = await admin.from('positions').select('ticker').eq('user_id', c.user_id)
        if (positions?.length) {
          carteraLine = `<p style="color:#c8d0e0;font-size:14px;margin:0 0 8px">Tu cartera con <strong>${positions.length} posiciones</strong> sigue guardada, esperándote tal y como la dejaste.</p>`
        }
      } catch {}

      const html = emailShell('Te echamos de menos', `
        <p style="color:#e0e8f0;font-size:16px;margin:0 0 16px">Ha pasado un mes desde que te fuiste.</p>
        ${carteraLine}
        <p style="color:#c8d0e0;font-size:14px;margin:0 0 8px">Seguimos mejorando Mi Índice DGI con nuevas funciones de análisis DGI, cartera y seguimiento de dividendos.</p>
        <p style="color:#34d399;font-size:15px;font-weight:bold;margin:16px 0 0">Si vuelves esta semana, tu primer mes es al 50%.</p>
        ${emailButton(`${APP_URL}/pricing`, 'Volver a Premium')}
      `)

      const r = await sendEmail(email, 'Te echamos de menos — Mi Índice DGI', html)
      if (r.sent) sent++
      else { skipped++ }
    } catch {
      errors++
    }
  }

  return NextResponse.json({ processed: cancels.length, sent, skipped, errors })
}
