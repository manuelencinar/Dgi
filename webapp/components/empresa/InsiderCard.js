'use client'
import { useState, useEffect } from 'react'

const CARD = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 20 }
const fmtVal = v => {
  if (v == null) return '—'
  const a = Math.abs(v)
  if (a >= 1e9) return (v / 1e9).toFixed(1) + ' B$'
  if (a >= 1e6) return (v / 1e6).toFixed(1) + ' M$'
  if (a >= 1e3) return (v / 1e3).toFixed(0) + ' k$'
  return v.toFixed(0) + ' $'
}
const fmtSh = v => v == null ? '—' : Math.abs(v).toLocaleString('es-ES')

const VERDICT = {
  compradores: { label: 'Insiders compradores netos', color: 'var(--positive)', icon: '↑', desc: 'Los directivos han comprado más de lo que han vendido en los últimos 12 meses — señal de convicción.' },
  vendedores:  { label: 'Insiders vendedores netos',  color: 'var(--negative)', icon: '↓', desc: 'Predominan las ventas de directivos en los últimos 12 meses (a menudo por diversificación o impuestos, no siempre negativo).' },
  mixto:       { label: 'Actividad mixta',            color: 'var(--warning)', icon: '·', desc: 'Compras y ventas equilibradas entre los directivos.' },
  neutral:     { label: 'Sin operaciones de mercado', color: 'var(--text-muted)', icon: '·', desc: 'No hay compras ni ventas de directivos en mercado abierto en los últimos 12 meses.' },
}

const KIND = {
  buy:   { label: 'Compra', color: 'var(--positive)' },
  sell:  { label: 'Venta',  color: 'var(--negative)' },
  other: { label: 'Opciones/grant', color: 'var(--text-muted)' },
}

export default function InsiderCard({ ticker, isPremium }) {
  const [status, setStatus] = useState('loading')  // loading | ok | none | locked
  const [data, setData] = useState(null)

  useEffect(() => {
    if (!ticker || !isPremium) { setStatus(isPremium ? 'loading' : 'locked'); return }
    let cancelled = false
    setStatus('loading')
    fetch(`/api/insiders?ticker=${encodeURIComponent(ticker)}`)
      .then(r => r.json())
      .then(d => {
        if (cancelled) return
        if (d?.locked) { setStatus('locked'); return }
        if (d?.data?.hasData) { setData(d.data); setStatus('ok') }
        else setStatus('none')
      })
      .catch(() => { if (!cancelled) setStatus('none') })
    return () => { cancelled = true }
  }, [ticker, isPremium])

  // Sin datos (típico fuera de EE. UU.) → no mostramos la sección.
  if (status === 'none' || status === 'loading') return null
  if (status === 'locked') {
    return (
      <div style={{ ...CARD, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Operaciones de directivos (insiders)</p>
          <p style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 2 }}>Quién de la directiva ha comprado o vendido, y si son compradores o vendedores netos.</p>
        </div>
        <a href="/pricing" style={{ fontSize: 12, fontWeight: 700, color: '#fff', textDecoration: 'none', padding: '8px 16px', background: 'var(--accent)', borderRadius: 8 }}>Premium →</a>
      </div>
    )
  }

  const v = VERDICT[data.net12m.verdict] || VERDICT.neutral
  const n = data.net12m

  return (
    <div style={CARD}>
      <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14 }}>Operaciones de directivos (insiders)</p>

      {/* Veredicto 12 meses */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, background: `${v.color}12`, border: `1px solid ${v.color}33`, borderRadius: 10, padding: '12px 14px', marginBottom: 14 }}>
        <span style={{ color: v.color, fontSize: 18, fontWeight: 800, lineHeight: 1 }}>{v.icon}</span>
        <div>
          <p style={{ fontSize: 13.5, fontWeight: 700, color: v.color }}>{v.label}</p>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3, lineHeight: 1.5 }}>{v.desc}</p>
          {(n.buyCount > 0 || n.sellCount > 0) && (
            <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 6 }}>
              Últimos 12 meses: <b style={{ color: 'var(--positive)' }}>{n.buyers} {n.buyers === 1 ? 'comprador' : 'compradores'}</b> ({fmtVal(n.buyValue)}) ·{' '}
              <b style={{ color: 'var(--negative)' }}>{n.sellers} {n.sellers === 1 ? 'vendedor' : 'vendedores'}</b> ({fmtVal(n.sellValue)}).
            </p>
          )}
        </div>
      </div>

      {/* Resumen 6m de Yahoo */}
      {data.summary6m && (data.summary6m.buyCount > 0 || data.summary6m.sellCount > 0) && (
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginBottom: 14, fontSize: 12, color: 'var(--text-muted)' }}>
          <span>Compras 6m: <b style={{ color: 'var(--positive)' }}>{data.summary6m.buyCount}</b> ({fmtSh(data.summary6m.buyShares)} acc.)</span>
          <span>Ventas 6m: <b style={{ color: 'var(--negative)' }}>{data.summary6m.sellCount}</b> ({fmtSh(data.summary6m.sellShares)} acc.)</span>
          {data.summary6m.netPct != null && <span>Variación neta: <b style={{ color: 'var(--text)' }}>{(data.summary6m.netShares >= 0 ? '+' : '') + (data.summary6m.netPct * 100).toFixed(2)}%</b> de las acciones de insiders</span>}
        </div>
      )}

      {/* Operaciones recientes */}
      {data.transactions.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5, minWidth: 520 }}>
            <thead>
              <tr>
                {['Directivo', 'Cargo', 'Operación', 'Acciones', 'Importe', 'Fecha'].map((h, i) => (
                  <th key={i} style={{ padding: '6px 8px', textAlign: i > 2 ? 'right' : 'left', color: 'var(--text-faint)', fontWeight: 600, whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.transactions.map((t, i) => {
                const k = KIND[t.kind] || KIND.other
                return (
                  <tr key={i} style={{ borderBottom: '1px solid var(--surface-2)' }}>
                    <td style={{ padding: '6px 8px', color: 'var(--text)', whiteSpace: 'nowrap', textTransform: 'capitalize' }}>{t.name.toLowerCase()}</td>
                    <td style={{ padding: '6px 8px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{t.relation}</td>
                    <td style={{ padding: '6px 8px', color: k.color, fontWeight: 600 }}>{k.label}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--text)' }}>{fmtSh(t.shares)}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--text)' }}>{fmtVal(t.value)}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{t.date}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <p style={{ fontSize: 10, color: 'var(--text-faintest)', marginTop: 12 }}>Fuente: Yahoo Finance. Las ventas de directivos no siempre son una señal negativa (impuestos, diversificación); las compras en mercado abierto son la señal de convicción más fiable.</p>
    </div>
  )
}
