import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { FX } from '@/lib/portfolio'
import { weightedAvgCost } from '@/lib/portfolio'
import { addMonths, FREQ_MONTHS } from '@/lib/recurring'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
}

async function sendAportacionEmail(to, data) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { skipped: true }
  const from = process.env.RESEND_FROM || 'EverDiv <noreply@everdiv.com>'
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0"><div style="font-family:Arial,sans-serif;background:#080b14;padding:24px;color:#c8d0e0">
    <h2 style="color:#818cf8">Aportación periódica ejecutada</h2>
    <p><strong>${data.name}</strong></p>
    <p>Fecha: ${data.date}<br>Importe: ${data.amount} €<br>Precio del día: ${data.price} ${data.currency}<br>
    Participaciones compradas: ${data.shares}<br>Total acumulado en este fondo: ${data.totalShares} participaciones</p>
    <a href="https://www.everdiv.com/cartera" style="color:#818cf8">Ver mi cartera</a></div></body></html>`
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, subject: `Aportación periódica ejecutada — ${data.name}`, html }),
    })
    return { sent: true }
  } catch { return { error: true } }
}

export async function GET(request) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const client = sb()
  const today = new Date().toISOString().slice(0, 10)

  const { data: due } = await client
    .from('recurring_contributions')
    .select('*')
    .eq('active', true)
    .lte('next_date', today)
  if (!due?.length) return NextResponse.json({ processed: 0, message: 'Sin aportaciones pendientes' })

  // Precios de los fondos implicados
  const tickers = [...new Set(due.map(c => c.ticker))]
  const { data: funds } = await client.from('funds').select('ticker, name, currency, current_price, updated_at').in('ticker', tickers)
  const fundMap = Object.fromEntries((funds || []).map(f => [f.ticker, f]))

  let processed = 0, skipped = 0, errors = 0
  const details = []

  for (const c of due) {
    const f = fundMap[c.ticker]
    if (!f || f.current_price == null) {
      skipped++; details.push({ ticker: c.ticker, status: 'sin_precio' })
      continue // no avanzar next_date → reintenta mañana
    }

    try {
      const currency = f.currency || 'EUR'
      const fx = FX[currency] || 1
      const priceDate = f.updated_at ? f.updated_at.slice(0, 10) : c.next_date
      const moneyInCcy = c.amount_eur / fx           // EUR → divisa del fondo
      const shares = moneyInCcy / f.current_price
      const exactDay = priceDate === c.next_date

      const noteParts = ['Aportación periódica automática']
      if (c.notes) noteParts.push(c.notes)
      if (!exactDay) noteParts.push(`Precio del ${priceDate} usado — valor liquidativo del día exacto no disponible`)

      await client.from('transactions').insert({
        user_id: c.user_id, ticker: c.ticker, type: 'buy_recurring',
        shares, price: f.current_price, date: c.next_date, price_date: priceDate,
        notes: noteParts.join(' — '),
      })

      // Posición — recalcular precio medio ponderado
      const { data: pos } = await client.from('positions').select('*').eq('user_id', c.user_id).eq('ticker', c.ticker).maybeSingle()
      let totalShares = shares
      if (pos) {
        const newShares = Number(pos.shares) + shares
        const newAvg = weightedAvgCost(Number(pos.shares), Number(pos.avg_cost), shares, f.current_price)
        totalShares = newShares
        await client.from('positions').update({ shares: newShares, avg_cost: newAvg, updated_at: new Date().toISOString() }).eq('id', pos.id)
      } else {
        await client.from('positions').insert({ user_id: c.user_id, ticker: c.ticker, shares, avg_cost: f.current_price, currency, asset_type: c.asset_type })
      }

      // Nueva next_date
      const nextDate = addMonths(c.next_date, FREQ_MONTHS[c.frequency] || 1)
      const stillActive = !(c.end_date && nextDate > c.end_date)
      await client.from('recurring_contributions').update({ next_date: nextDate, active: stillActive }).eq('id', c.id)

      // Email opcional (si Resend configurado y el usuario tiene alertas email)
      try {
        const { data: settings } = await client.from('user_settings').select('alert_config').eq('user_id', c.user_id).maybeSingle()
        if (settings?.alert_config?.emailAlerts) {
          const { data: u } = await client.auth.admin.getUserById(c.user_id)
          if (u?.user?.email) await sendAportacionEmail(u.user.email, {
            name: f.name || c.ticker, date: c.next_date, amount: c.amount_eur,
            price: f.current_price, currency, shares: shares.toFixed(4), totalShares: totalShares.toFixed(4),
          })
        }
      } catch {}

      // Notificación in-app (best-effort)
      try {
        await client.from('notifications').insert({
          user_id: c.user_id, type: 'recurring', ticker: c.ticker,
          message: `Aportación periódica ejecutada en ${f.name || c.ticker}: ${c.amount_eur} € (${shares.toFixed(4)} part.)`,
        })
      } catch {}

      processed++; details.push({ ticker: c.ticker, status: 'ok', shares: +shares.toFixed(4) })
    } catch (e) {
      errors++; details.push({ ticker: c.ticker, status: 'error', error: String(e.message || e) })
    }
  }

  try {
    await client.from('admin_logs').insert({
      event_type: 'recurring_contributions',
      description: `Aportaciones: ${processed} ejecutadas · ${skipped} sin precio · ${errors} errores`,
      details: { processed, skipped, errors, items: details.slice(0, 50) },
      status: errors > 0 ? 'error' : 'ok',
    })
  } catch {}

  return NextResponse.json({ processed, skipped, errors, details })
}
