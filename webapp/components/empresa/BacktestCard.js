'use client'
// "¿Y si hubieras invertido?" — rentabilidad histórica total (precio + dividendos
// reinvertidos) con cifras. Reutiliza el endpoint del gráfico de la ficha.
import { useState, useEffect } from 'react'
import { computeBacktest } from '@/lib/backtest'

const fmtMoney = (v, cur) => v == null ? '—' : `${Math.round(v).toLocaleString('es-ES')} ${cur || ''}`.trim()
const fmtPct = (v, d = 1) => v == null ? '—' : (v > 0 ? '+' : '') + v.toFixed(d) + '%'

const RANGES = [['3A', '3 años'], ['5A', '5 años']]

export default function BacktestCard({ ticker, currency, divHistory }) {
  const [range, setRange] = useState('5A')
  const [state, setState] = useState('loading')
  const [bt, setBt] = useState(null)

  useEffect(() => {
    let cancelled = false
    setState('loading')
    fetch(`/api/empresa/${encodeURIComponent(ticker)}/chart?range=${range}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(d => {
        if (cancelled) return
        const b = computeBacktest({ timestamps: d?.timestamps, closes: d?.closes, divHistory, initial: 1000 })
        if (b.available) { setBt(b); setState('ok') } else setState('none')
      })
      .catch(() => { if (!cancelled) setState('none') })
    return () => { cancelled = true }
  }, [ticker, range, divHistory])

  if (state === 'none') return null

  const beatColor = bt && bt.totalCagr >= 0 ? 'var(--positive)' : 'var(--negative)'
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
        <p style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-strong)' }}>¿Y si hubieras invertido 1.000 €?</p>
        <div style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          {RANGES.map(([val, label]) => (
            <button key={val} onClick={() => setRange(val)}
              style={{ padding: '4px 11px', fontSize: 11.5, fontWeight: range === val ? 700 : 500, cursor: 'pointer', border: 'none',
                background: range === val ? 'var(--accent-bg)' : 'transparent', color: range === val ? 'var(--accent)' : 'var(--text-muted)' }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {state === 'loading' || !bt ? (
        <p style={{ fontSize: 12, color: 'var(--text-faint)', padding: '10px 0' }}>Calculando…</p>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-faint)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Valor hoy (con dividendos)</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-strong)', lineHeight: 1.1 }}>{fmtMoney(bt.endValue, currency)}</div>
            </div>
            <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: beatColor }}>{fmtPct(bt.totalCagr)} anual</div>
              <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>total {fmtPct(bt.totalReturn, 0)} en {bt.years} años</div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginTop: 14 }}>
            <Mini label="Solo precio" value={fmtMoney(bt.endValuePriceOnly, currency)} sub={`${fmtPct(bt.priceCagr)} anual`} />
            <Mini label="Dividendos cobrados" value={fmtMoney(bt.dividendsCollected, currency)} sub="sin reinvertir" />
            <Mini label="Aporte del dividendo" value={fmtPct(bt.totalReturn - bt.priceReturn, 0)} sub="extra vs solo precio" />
          </div>
          <p style={{ fontSize: 10, color: 'var(--text-faintest)', marginTop: 10 }}>
            Rentabilidad pasada ({bt.startDate} → {bt.endDate}) con dividendos reinvertidos. No garantiza resultados futuros.
          </p>
        </>
      )}
    </div>
  )
}

function Mini({ label, value, sub }) {
  return (
    <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 9, padding: '9px 11px' }}>
      <div style={{ fontSize: 10, color: 'var(--text-faint)', fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-strong)', marginTop: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--text-faint)' }}>{sub}</div>}
    </div>
  )
}
