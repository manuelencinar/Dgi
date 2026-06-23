'use client'
import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { enrichPositions } from '@/lib/portfolio'
import { getLatestExchangeRate } from '@/lib/currency'
import { buildDividendCalendar, MONTHS_ES } from '@/lib/dividend-calendar'

const CARD = { background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 'var(--cdp-pad, 20px)', marginBottom: 16 }
const fmtEUR = v => v == null ? '—' : (Math.abs(v) >= 1000 ? v.toLocaleString('es-ES', { maximumFractionDigits: 0 }) : v.toLocaleString('es-ES', { maximumFractionDigits: 2 })) + ' €'

// Widget compacto: los próximos cobros de dividendo de la cartera (reutiliza
// buildDividendCalendar, que ya combina fechas ex/pago confirmadas y estimadas).
export default function UpcomingDividends() {
  const [data, setData] = useState(null)
  const sb = createClient()

  useEffect(() => {
    let cancel = false
    ;(async () => {
      const { data: { user } } = await sb.auth.getUser()
      if (!user) return
      const { data: positions } = await sb.from('positions').select('*').eq('user_id', user.id)
      if (!positions?.length) { if (!cancel) setData({ upcoming: [] }); return }

      const stockTickers = [...new Set(positions.filter(p => (p.asset_type || 'stock') === 'stock').map(p => p.ticker))]
      const fundTickers = [...new Set(positions.filter(p => (p.asset_type || 'stock') !== 'stock').map(p => p.ticker))]
      const [{ data: funds }, { data: fundsData }, { data: settings }] = await Promise.all([
        stockTickers.length ? sb.from('company_fundamentals').select('ticker,current_price,dps,div_cagr5,sector,industry,country,div_history,dividend_events,next_ex_date,next_pay_date').in('ticker', stockTickers) : Promise.resolve({ data: [] }),
        fundTickers.length ? sb.from('funds').select('*').in('ticker', fundTickers) : Promise.resolve({ data: [] }),
        sb.from('user_settings').select('dest_wht,wht_overrides').eq('user_id', user.id).maybeSingle(),
      ])
      const fMap = Object.fromEntries((funds || []).map(f => [f.ticker, f]))
      const fundsMap = Object.fromEntries((fundsData || []).map(f => [f.ticker, f]))
      const enr = enrichPositions(positions, fMap, fundsMap)

      const currencies = [...new Set(enr.map(p => p.currency || 'EUR'))].filter(c => c && c !== 'EUR')
      const fxEntries = await Promise.all(currencies.map(async c => {
        try { const r = await getLatestExchangeRate(c, 'EUR'); return [c, r?.rate ?? null] } catch { return [c, null] }
      }))
      const fx = Object.fromEntries(fxEntries.filter(([, r]) => r != null))
      const destWHT = settings?.dest_wht != null ? Number(settings.dest_wht) : 19
      const whtOverrides = settings?.wht_overrides && typeof settings.wht_overrides === 'object' ? settings.wht_overrides : null

      const cal = buildDividendCalendar(enr, fMap, fx, destWHT, { whtOverrides })
      if (!cancel) setData({ upcoming: (cal.upcoming || []).slice(0, 5) })
    })().catch(() => { if (!cancel) setData({ upcoming: [] }) })
    return () => { cancel = true }
  }, [])

  const items = data?.upcoming || []
  if (!data || items.length === 0) return null

  return (
    <div style={CARD}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: '#4a5270', textTransform: 'uppercase', letterSpacing: '0.1em' }}>📅 Próximos cobros</p>
        <Link href="/cartera/calendario" style={{ fontSize: 11.5, color: '#818cf8', textDecoration: 'none' }}>Ver calendario →</Link>
      </div>
      <div style={{ display: 'grid', gap: 8 }}>
        {items.map((e, i) => {
          const d = e.date instanceof Date ? e.date : new Date(e.date)
          return (
            <Link key={i} href={`/empresa/${encodeURIComponent(e.ticker)}`} style={{ textDecoration: 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5 }}>
                <span style={{ width: 52, flexShrink: 0, color: '#8090a8', fontWeight: 700 }}>{d.getDate()} {MONTHS_ES[d.getMonth()]}</span>
                <span style={{ flex: 1, color: '#c8d0e0', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name}</span>
                <span style={{ fontSize: 9, fontWeight: 700, color: e.confirmed ? '#34d399' : '#4a5270', background: e.confirmed ? 'rgba(52,211,153,0.12)' : 'rgba(255,255,255,0.04)', padding: '1px 6px', borderRadius: 4, flexShrink: 0 }}>{e.confirmed ? 'confirmado' : 'estimado'}</span>
                <span style={{ color: '#34d399', fontWeight: 700, flexShrink: 0, minWidth: 60, textAlign: 'right' }}>+{fmtEUR(e.netEUR)}</span>
              </div>
            </Link>
          )
        })}
      </div>
      <p style={{ fontSize: 10, color: '#3a4260', marginTop: 10 }}>Importe neto estimado tras retención. Las fechas estimadas se basan en el patrón histórico de pagos.</p>
    </div>
  )
}
