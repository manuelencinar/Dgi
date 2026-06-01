'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function FxRatesWidget({ currencies }) {
  const [rates, setRates] = useState([])
  const sb = createClient()

  useEffect(() => {
    if (!currencies?.length) return
    load()
  }, [currencies?.join(',')])

  const load = async () => {
    const unique = [...new Set(currencies.filter(c => c && c !== 'EUR'))]
    if (!unique.length) return

    const today     = new Date()
    const todayStr  = today.toISOString().slice(0, 10)
    const past10    = new Date(today); past10.setDate(past10.getDate() - 10)
    const pastStr   = past10.toISOString().slice(0, 10)

    const { data } = await sb
      .from('exchange_rates')
      .select('base_currency, rate, date')
      .in('base_currency', unique)
      .eq('quote_currency', 'EUR')
      .gte('date', pastStr)
      .lte('date', todayStr)
      .order('date', { ascending: false })

    if (!data?.length) return

    // Para cada divisa: último dato y penúltimo (para calcular variación diaria)
    const byPair = {}
    data.forEach(r => {
      if (!byPair[r.base_currency]) byPair[r.base_currency] = []
      byPair[r.base_currency].push(r)
    })

    const result = unique.map(currency => {
      const rows = byPair[currency] || []
      if (!rows.length) return null
      const latest = rows[0]
      const prev   = rows[1] || null
      const chg    = prev ? (latest.rate - prev.rate) / prev.rate * 100 : null
      return { currency, rate: Number(latest.rate), date: latest.date, chg }
    }).filter(Boolean)

    setRates(result)
  }

  if (!rates.length) return null

  return (
    <div style={{ marginBottom: 16, padding: '12px 16px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12 }}>
      <p style={{ fontSize: 10, fontWeight: 700, color: '#4a5270', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Tipos de cambio hoy</p>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {rates.map(r => (
          <div key={r.currency} style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontSize: 11, color: '#4a5270', fontWeight: 600 }}>{r.currency}/EUR</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#c8d0e0' }}>{r.rate.toFixed(4)}</span>
            {r.chg != null && (
              <span style={{ fontSize: 11, fontWeight: 600, color: r.chg >= 0 ? '#34d399' : '#f87171' }}>
                {r.chg >= 0 ? '▲' : '▼'}{Math.abs(r.chg).toFixed(2)}%
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
