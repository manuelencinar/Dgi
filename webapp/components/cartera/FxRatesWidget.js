'use client'
import { useState, useEffect } from 'react'
import { getExchangeRateChange } from '@/lib/currency'

export default function FxRatesWidget({ currencies }) {
  const [rates, setRates] = useState([])

  useEffect(() => {
    if (!currencies?.length) return
    load()
  }, [currencies?.join(',')])

  const load = async () => {
    const unique = [...new Set(currencies.filter(c => c && c !== 'EUR'))]
    if (!unique.length) return

    const results = await Promise.all(
      unique.map(async currency => {
        const r = await getExchangeRateChange(currency, 'EUR')
        return r ? { currency, rate: r.rate, date: r.rateDate, chg: r.changePct } : null
      })
    )
    setRates(results.filter(Boolean))
  }

  if (!rates.length) return null

  return (
    <div className="cdp-fx" style={{ marginBottom: 16, padding: '9px 12px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12 }}>
      {/* En escritorio ocupa como mucho ~20% del ancho (no una fila entera). */}
      <style>{`@media(min-width:760px){.cdp-fx{max-width:230px}}`}</style>
      <p style={{ fontSize: 9.5, fontWeight: 700, color: '#4a5270', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 7 }}>Tipos de cambio hoy</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {rates.map(r => (
          <div key={r.currency} style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontSize: 11, color: '#4a5270', fontWeight: 600, minWidth: 56 }}>{r.currency}/EUR</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#c8d0e0' }}>{r.rate.toFixed(4)}</span>
            {r.chg != null && (
              <span style={{ fontSize: 10.5, fontWeight: 600, color: r.chg >= 0 ? '#34d399' : '#f87171' }}>
                {r.chg >= 0 ? '▲' : '▼'}{Math.abs(r.chg).toFixed(2)}%
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
