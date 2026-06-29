'use client'
import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { DICT } from '@/data/dict'
import { FX } from '@/lib/portfolio'

const CARD  = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 'var(--cdp-pad, 20px)', marginBottom: 16 }
const INPUT = { background: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 13, outline: 'none', boxSizing: 'border-box' }

function fmt(v, d = 2) { return v == null || isNaN(v) ? '—' : v.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d }) }
function nameOf(t) { return DICT.find(d => d[1] === t)?.[0] ?? t }
function currOf(t) { return DICT.find(d => d[1] === t)?.[3] ?? 'USD' }
function hrefFor(t, fundSet) { return fundSet?.has(t) ? `/fondo/${encodeURIComponent(t)}` : `/empresa/${encodeURIComponent(t)}` }

// Recalcula acciones y precio medio ponderado de un ticker desde sus operaciones.
function recomputePosition(txs) {
  const sorted = [...txs].sort((a, b) => new Date(a.date) - new Date(b.date))
  let shares = 0, avg = 0
  for (const t of sorted) {
    const sh = Number(t.shares) || 0, px = Number(t.price) || 0
    if (t.type === 'sell') shares = Math.max(0, shares - sh)
    else { const total = shares + sh; avg = total > 0 ? (shares * avg + sh * px) / total : px; shares = total }
  }
  return { shares, avg }
}

function downloadCSV(filename, rows) {
  const csv = rows.map(r => r.map(c => { const s = c == null ? '' : String(c); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }).join(',')).join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url)
}

// Operaciones + comisiones de la cartera. El resumen de comisiones es SIEMPRE visible
// (para que el usuario sea consciente del coste de operar); el detalle de operaciones
// va en un desplegable.
export default function OperationsCard({ isPremium }) {
  const sb = useMemo(() => createClient(), [])
  const [open, setOpen] = useState(false)
  const [transactions, setTransactions] = useState([])
  const [dividends, setDividends] = useState([])
  const [fundTickers, setFundTickers] = useState(new Set())
  const [loaded, setLoaded] = useState(false)
  const [filterTicker, setFilterTicker] = useState('all')
  const [filterType, setFilterType] = useState('all')
  const [confirmDel, setConfirmDel] = useState(null)

  const load = async () => {
    const { data: { user } } = await sb.auth.getUser()
    if (!user) { setLoaded(true); return }
    const [{ data: tx }, { data: divs }, { data: pos }] = await Promise.all([
      sb.from('transactions').select('*').eq('user_id', user.id),
      sb.from('dividends_received').select('ticker, amount, amount_net, status').eq('user_id', user.id),
      sb.from('positions').select('ticker, asset_type').eq('user_id', user.id),
    ])
    setTransactions(tx || [])
    setDividends(divs || [])
    setFundTickers(new Set((pos || []).filter(p => (p.asset_type || 'stock') !== 'stock').map(p => p.ticker)))
    setLoaded(true)
  }
  useEffect(() => { load() }, [])   // eslint-disable-line react-hooks/exhaustive-deps

  const tickers = useMemo(() => [...new Set(transactions.map(t => t.ticker))].sort(), [transactions])

  const filtered = useMemo(() => {
    let rows = [...transactions].sort((a, b) => new Date(b.date) - new Date(a.date))
    if (filterTicker !== 'all') rows = rows.filter(t => t.ticker === filterTicker)
    if (filterType !== 'all') rows = rows.filter(t => t.type === filterType)
    if (!isPremium) rows = rows.slice(0, 10)
    return rows
  }, [transactions, filterTicker, filterType, isPremium])

  const avgCostByTicker = useMemo(() => {
    const map = {}
    tickers.forEach(tk => {
      const buys = transactions.filter(t => t.ticker === tk && t.type !== 'sell')
      const totalShares = buys.reduce((s, t) => s + Number(t.shares), 0)
      const totalCost = buys.reduce((s, t) => s + Number(t.shares) * Number(t.price), 0)
      map[tk] = totalShares > 0 ? totalCost / totalShares : null
    })
    return map
  }, [transactions, tickers])

  const realizedByTicker = useMemo(() => {
    const map = {}
    tickers.forEach(tk => {
      const sells = transactions.filter(t => t.ticker === tk && t.type === 'sell')
      if (!sells.length) return
      const avgCost = avgCostByTicker[tk] ?? 0
      const realized = sells.reduce((s, t) => s + (Number(t.price) - avgCost) * Number(t.shares), 0)
      const divs = dividends.filter(d => d.ticker === tk).reduce((s, d) => s + (Number(d.amount_net ?? d.amount) || 0), 0)
      map[tk] = realized + divs
    })
    return map
  }, [transactions, tickers, avgCostByTicker, dividends])

  const hasFx = filtered.some(t => t.exchange_rate != null && t.exchange_rate !== 1)

  // Comisiones de TODAS las operaciones (resumen siempre visible).
  const comm = useMemo(() => {
    let broker = 0, fx = 0
    transactions.forEach(t => {
      const cur = t.commission_currency || t.currency || currOf(t.ticker)
      broker += (Number(t.commission) || 0) * (FX[cur] || 1)
      fx += Number(t.fx_commission_eur) || 0
    })
    const total = broker + fx
    return { broker, fx, total, avg: transactions.length ? total / transactions.length : 0, count: transactions.length }
  }, [transactions])

  const handleDeleteTx = async (tx) => {
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return
    await sb.from('transactions').delete().eq('id', tx.id).eq('user_id', user.id)
    const { data: remaining } = await sb.from('transactions').select('*').eq('user_id', user.id).eq('ticker', tx.ticker)
    const { shares, avg } = recomputePosition(remaining || [])
    const { data: pos } = await sb.from('positions').select('*').eq('user_id', user.id).eq('ticker', tx.ticker).maybeSingle()
    if (pos) {
      if (shares <= 1e-9) await sb.from('positions').delete().eq('id', pos.id)
      else await sb.from('positions').update({ shares, avg_cost: avg, updated_at: new Date().toISOString() }).eq('id', pos.id)
    }
    load()
  }

  const exportCSV = () => {
    const headers = ['Fecha', 'Empresa', 'Ticker', 'Tipo', 'Acciones', 'Precio', 'Importe total', 'Divisa', 'Com. broker', 'Tipo cambio', 'Com. FX (EUR)', 'Coste total EUR', 'Coste real', 'Notas']
    const rows = [headers]
    filtered.forEach(t => rows.push([
      t.date, nameOf(t.ticker), t.ticker, t.type === 'buy' ? 'Compra' : t.type === 'sell' ? 'Venta' : t.type,
      t.shares, t.price, (Number(t.shares) * Number(t.price)).toFixed(2), t.currency || currOf(t.ticker),
      t.commission ?? '', t.exchange_rate ?? '', t.fx_commission_eur ?? '', t.total_cost_base_currency ?? '', t.total_cost ?? '', t.notes || '',
    ]))
    downloadCSV('operaciones.csv', rows)
  }

  if (!loaded || transactions.length === 0) return null

  const RIGHT = { textAlign: 'right' }
  const TH = (label, right) => <th key={label} style={{ padding: '6px 8px', textAlign: right ? 'right' : 'left', color: 'var(--text-faint)', borderBottom: '1px solid var(--border)', fontWeight: 600, whiteSpace: 'nowrap' }}>{label}</th>

  return (
    <div style={CARD}>
      <button onClick={() => setOpen(o => !o)} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left' }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Operaciones</p>
        <span style={{ fontSize: 12, color: 'var(--text-faint)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>{transactions.length} operación{transactions.length === 1 ? '' : 'es'} {open ? '▾' : '▸'}</span>
      </button>

      {/* Resumen de comisiones — siempre visible (lo que cuesta operar) */}
      {comm.total > 0 && (
        <div style={{ display: 'flex', gap: 22, marginTop: 14, padding: '12px 16px', background: 'rgba(251,191,36,0.05)', border: '1px solid rgba(251,191,36,0.15)', borderRadius: 8, flexWrap: 'wrap' }}>
          <div>
            <p style={{ fontSize: 10, color: 'var(--text-faint)', marginBottom: 2 }}>Comisiones de broker</p>
            <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--warning)' }}>{fmt(comm.broker)} €</p>
          </div>
          {comm.fx > 0 && (
            <div>
              <p style={{ fontSize: 10, color: 'var(--text-faint)', marginBottom: 2 }}>Comisiones de cambio</p>
              <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--warning)' }}>{fmt(comm.fx)} €</p>
            </div>
          )}
          <div>
            <p style={{ fontSize: 10, color: 'var(--text-faint)', marginBottom: 2 }}>Total en comisiones</p>
            <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--negative)' }}>{fmt(comm.total)} €</p>
          </div>
          <div>
            <p style={{ fontSize: 10, color: 'var(--text-faint)', marginBottom: 2 }}>Media / operación</p>
            <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{fmt(comm.avg)} €</p>
          </div>
          <p style={{ fontSize: 9, color: 'var(--text-faintest)', width: '100%', marginTop: 2 }}>Lo que te ha costado operar. Comisiones en divisa extranjera convertidas a EUR con el tipo de cambio aproximado.</p>
        </div>
      )}

      {open && (
        <div style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <select value={filterTicker} onChange={e => setFilterTicker(e.target.value)} style={{ ...INPUT, fontSize: 12 }}>
                <option value="all">Todas las empresas</option>
                {tickers.map(t => <option key={t} value={t}>{nameOf(t)}</option>)}
              </select>
              <select value={filterType} onChange={e => setFilterType(e.target.value)} style={{ ...INPUT, fontSize: 12 }}>
                <option value="all">Compra y venta</option>
                <option value="buy">Solo compras</option>
                <option value="sell">Solo ventas</option>
              </select>
            </div>
            {isPremium && <button onClick={exportCSV} style={{ ...INPUT, cursor: 'pointer', color: 'var(--accent)', fontWeight: 700, background: 'rgba(99,102,241,0.1)' }}>↓ Exportar CSV</button>}
          </div>

          {filtered.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text-faint)', textAlign: 'center', padding: '30px 0' }}>No hay operaciones con este filtro.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: hasFx ? 1020 : 760 }}>
                <thead><tr>
                  {TH('Fecha')}{TH('Empresa')}{TH('Tipo')}{TH('Acciones', true)}{TH('Precio', true)}{TH('Importe orig.', true)}{TH('Com. broker', true)}
                  {hasFx && TH('Tipo cambio', true)}{hasFx && TH('Com. FX', true)}{hasFx && TH('Coste EUR', true)}{TH('Coste real', true)}{TH('Notas')}{TH('')}
                </tr></thead>
                <tbody>
                  {filtered.map(t => {
                    const txCurrency = t.currency || currOf(t.ticker)
                    const isManualFx = t.exchange_rate != null && t.exchange_rate_date == null
                    return (
                      <tr key={t.id} style={{ borderBottom: '1px solid var(--surface-2)' }}>
                        <td style={{ padding: '7px 8px', color: 'var(--text-faint)', whiteSpace: 'nowrap' }}>{new Date(t.date).toLocaleDateString('es-ES')}</td>
                        <td style={{ padding: '7px 8px' }}><Link href={hrefFor(t.ticker, fundTickers)} style={{ color: 'var(--text)', textDecoration: 'none', fontWeight: 600 }}>{nameOf(t.ticker)}</Link></td>
                        <td style={{ padding: '7px 8px' }}>
                          {t.type === 'stock_dividend' ? (
                            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--positive)', background: 'rgba(52,211,153,0.1)', padding: '2px 7px', borderRadius: 5, whiteSpace: 'nowrap' }}>📈 Dividendo en acciones</span>
                          ) : (
                            <span style={{ fontSize: 11, fontWeight: 700, color: t.type === 'sell' ? 'var(--negative)' : 'var(--positive)', background: t.type === 'sell' ? 'rgba(248,113,113,0.1)' : 'rgba(52,211,153,0.1)', padding: '2px 7px', borderRadius: 5 }}>{t.type === 'sell' ? 'Venta' : t.type === 'buy_recurring' ? 'Aportación' : 'Compra'}</span>
                          )}
                        </td>
                        <td style={{ padding: '7px 8px', ...RIGHT, color: 'var(--text-muted)' }}>{fmt(Number(t.shares), 4)}</td>
                        <td style={{ padding: '7px 8px', ...RIGHT, color: 'var(--text-muted)' }}>{fmt(Number(t.price))} {txCurrency}</td>
                        <td style={{ padding: '7px 8px', ...RIGHT, color: 'var(--text)', fontWeight: 600 }}>{t.amount_original != null ? fmt(Number(t.amount_original)) : fmt(Number(t.shares) * Number(t.price))} {txCurrency}</td>
                        <td style={{ padding: '7px 8px', ...RIGHT, color: t.commission > 0 ? 'var(--warning)' : 'var(--text-faint)', whiteSpace: 'nowrap' }}>{t.commission != null && t.commission > 0 ? `${fmt(Number(t.commission))} ${t.commission_currency || txCurrency}` : '—'}</td>
                        {hasFx && <td style={{ padding: '7px 8px', ...RIGHT, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{t.exchange_rate != null && t.exchange_rate !== 1 ? <span title={isManualFx ? 'Tipo introducido manualmente' : `Fecha: ${t.exchange_rate_date}`}>{Number(t.exchange_rate).toFixed(4)}{isManualFx && <span style={{ marginLeft: 4 }}>✏</span>}</span> : '—'}</td>}
                        {hasFx && <td style={{ padding: '7px 8px', ...RIGHT, color: t.fx_commission_eur > 0 ? 'var(--warning)' : 'var(--text-faint)' }}>{t.fx_commission_eur != null && t.fx_commission_eur > 0 ? `${fmt(Number(t.fx_commission_eur))} €` : '—'}</td>}
                        {hasFx && <td style={{ padding: '7px 8px', ...RIGHT, color: 'var(--positive)', fontWeight: 600 }}>{t.total_cost_base_currency != null ? `${fmt(Number(t.total_cost_base_currency))} €` : '—'}</td>}
                        <td style={{ padding: '7px 8px', ...RIGHT, color: 'var(--text)', fontWeight: 600, whiteSpace: 'nowrap' }}>{t.total_cost != null ? `${fmt(Number(t.total_cost))} ${txCurrency}` : '—'}</td>
                        <td style={{ padding: '7px 8px', color: 'var(--text-faint)', fontSize: 11, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.notes || '—'}</td>
                        <td style={{ padding: '7px 8px', whiteSpace: 'nowrap', textAlign: 'right' }}>
                          {confirmDel === t.id ? (
                            <span style={{ fontSize: 10.5, color: 'var(--warning)' }}>¿Borrar? <button onClick={() => { handleDeleteTx(t); setConfirmDel(null) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--negative)', fontWeight: 700, padding: '0 3px' }}>Sí</button><button onClick={() => setConfirmDel(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '0 3px' }}>No</button></span>
                          ) : (
                            <button onClick={() => setConfirmDel(t.id)} title="Borrar operación (recalcula la posición)" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--negative)', fontSize: 13, padding: '2px 4px' }}>🗑</button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {isPremium && tickers.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Resumen por empresa</p>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead><tr>{['Empresa', 'Precio medio ponderado', 'Rendimiento realizado'].map(h => <th key={h} style={{ padding: '5px 8px', textAlign: h === 'Empresa' ? 'left' : 'right', color: 'var(--text-faint)', borderBottom: '1px solid var(--border)', fontWeight: 600 }}>{h}</th>)}</tr></thead>
                  <tbody>
                    {tickers.map(tk => (
                      <tr key={tk} style={{ borderBottom: '1px solid var(--surface-2)' }}>
                        <td style={{ padding: '6px 8px', color: 'var(--text)' }}>{nameOf(tk)}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--text-muted)' }}>{avgCostByTicker[tk] != null ? fmt(avgCostByTicker[tk]) + ' ' + currOf(tk) : '—'}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', color: realizedByTicker[tk] == null ? 'var(--text-faint)' : realizedByTicker[tk] >= 0 ? 'var(--positive)' : 'var(--negative)', fontWeight: 600 }}>{realizedByTicker[tk] == null ? '— (sin ventas)' : (realizedByTicker[tk] >= 0 ? '+' : '') + fmt(realizedByTicker[tk]) + ' ' + currOf(tk)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p style={{ fontSize: 10, color: 'var(--text-faintest)', marginTop: 8 }}>Rendimiento realizado = (precio venta − precio medio) × acciones + dividendos netos cobrados.</p>
            </div>
          )}

          {!isPremium && transactions.length > 10 && (
            <div style={{ textAlign: 'center', marginTop: 16, padding: '12px', background: 'rgba(99,102,241,0.05)', borderRadius: 8 }}>
              <Link href="/pricing" style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 700 }}>Ver todas las operaciones y exportar CSV con Premium →</Link>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
