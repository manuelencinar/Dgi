'use client'
import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { createClient } from '@/lib/supabase/client'
import { DICT } from '@/data/dict'

const CARD     = { background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 20 }
const INPUT    = { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 12px', color: '#c8d0e0', fontSize: 13, outline: 'none', boxSizing: 'border-box' }
const TT_STYLE = { background: '#10172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11 }

function fmt(v, d = 2) { return v == null || isNaN(v) ? '—' : v.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d }) }
function fmtEUR(v) { return v == null ? '—' : v.toLocaleString('es-ES', { maximumFractionDigits: 2 }) + ' €' }
function nameOf(t) { return DICT.find(d => d[1] === t)?.[0] ?? t }
function currOf(t) { return DICT.find(d => d[1] === t)?.[3] ?? 'USD' }
function hrefFor(t, fundSet) { return fundSet?.has(t) ? `/fondo/${encodeURIComponent(t)}` : `/empresa/${encodeURIComponent(t)}` }

function downloadCSV(filename, rows) {
  const csv = rows.map(r => r.map(c => {
    const s = c == null ? '' : String(c)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }).join(',')).join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

function PremiumBadge() {
  return <span style={{ fontSize: 9, fontWeight: 700, color: '#818cf8', background: 'rgba(99,102,241,0.12)', padding: '1px 6px', borderRadius: 4, marginLeft: 6 }}>PREMIUM</span>
}

// ── Tab 1: Operaciones ─────────────────────────────────────────────────────
function TabOperations({ transactions, dividends, isPremium, fundTickers }) {
  const [filterTicker, setFilterTicker] = useState('all')
  const [filterType,   setFilterType]   = useState('all')

  const tickers = [...new Set(transactions.map(t => t.ticker))].sort()

  const filtered = useMemo(() => {
    let rows = [...transactions].sort((a, b) => new Date(b.date) - new Date(a.date))
    if (filterTicker !== 'all') rows = rows.filter(t => t.ticker === filterTicker)
    if (filterType   !== 'all') rows = rows.filter(t => t.type === filterType)
    if (!isPremium) rows = rows.slice(0, 10)
    return rows
  }, [transactions, filterTicker, filterType, isPremium])

  // Precio medio ponderado por ticker
  const avgCostByTicker = useMemo(() => {
    const map = {}
    tickers.forEach(tk => {
      const buys = transactions.filter(t => t.ticker === tk && t.type === 'buy')
      const totalShares = buys.reduce((s, t) => s + Number(t.shares), 0)
      const totalCost   = buys.reduce((s, t) => s + Number(t.shares) * Number(t.price), 0)
      map[tk] = totalShares > 0 ? totalCost / totalShares : null
    })
    return map
  }, [transactions, tickers])

  // Rendimiento realizado en ventas
  const realizedByTicker = useMemo(() => {
    const map = {}
    tickers.forEach(tk => {
      const sells = transactions.filter(t => t.ticker === tk && t.type === 'sell')
      if (!sells.length) return
      const avgCost = avgCostByTicker[tk] ?? 0
      const realized = sells.reduce((s, t) => s + (Number(t.price) - avgCost) * Number(t.shares), 0)
      const divs = dividends.filter(d => d.ticker === tk).reduce((s, d) => s + Number(d.amount), 0)
      map[tk] = realized + divs
    })
    return map
  }, [transactions, tickers, avgCostByTicker, dividends])

  const exportCSV = () => {
    const rows = [['Fecha', 'Empresa', 'Ticker', 'Tipo', 'Acciones', 'Precio', 'Importe total', 'Notas']]
    filtered.forEach(t => rows.push([
      t.date, nameOf(t.ticker), t.ticker, t.type === 'buy' ? 'Compra' : 'Venta',
      t.shares, t.price, (Number(t.shares) * Number(t.price)).toFixed(2), t.notes || '',
    ]))
    downloadCSV('operaciones.csv', rows)
  }

  return (
    <div>
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
        {isPremium && (
          <button onClick={exportCSV} style={{ ...INPUT, cursor: 'pointer', color: '#818cf8', fontWeight: 700, background: 'rgba(99,102,241,0.1)' }}>
            ↓ Exportar CSV
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <p style={{ fontSize: 13, color: '#4a5270', textAlign: 'center', padding: '30px 0' }}>No hay operaciones registradas.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 640 }}>
            <thead>
              <tr>
                {['Fecha', 'Empresa', 'Tipo', 'Acciones', 'Precio', 'Importe', 'Notas'].map(h => (
                  <th key={h} style={{ padding: '6px 8px', textAlign: ['Acciones','Precio','Importe'].includes(h) ? 'right' : 'left', color: '#4a5270', borderBottom: '1px solid rgba(255,255,255,0.06)', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(t => (
                <tr key={t.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '7px 8px', color: '#4a5270', whiteSpace: 'nowrap' }}>{new Date(t.date).toLocaleDateString('es-ES')}</td>
                  <td style={{ padding: '7px 8px' }}>
                    <Link href={hrefFor(t.ticker, fundTickers)} style={{ color: '#c8d0e0', textDecoration: 'none', fontWeight: 600 }}>{nameOf(t.ticker)}</Link>
                  </td>
                  <td style={{ padding: '7px 8px' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: t.type === 'buy' ? '#34d399' : '#f87171', background: t.type === 'buy' ? 'rgba(52,211,153,0.1)' : 'rgba(248,113,113,0.1)', padding: '2px 7px', borderRadius: 5 }}>
                      {t.type === 'buy' ? 'Compra' : 'Venta'}
                    </span>
                  </td>
                  <td style={{ padding: '7px 8px', textAlign: 'right', color: '#8090a8' }}>{fmt(Number(t.shares), 4)}</td>
                  <td style={{ padding: '7px 8px', textAlign: 'right', color: '#8090a8' }}>{fmt(Number(t.price))} {currOf(t.ticker)}</td>
                  <td style={{ padding: '7px 8px', textAlign: 'right', color: '#c8d0e0', fontWeight: 600 }}>{fmt(Number(t.shares) * Number(t.price))}</td>
                  <td style={{ padding: '7px 8px', color: '#4a5270', fontSize: 11, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Resumen por ticker: precio medio + realizado */}
      {isPremium && tickers.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#4a5270', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Resumen por empresa</p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr>
                  {['Empresa', 'Precio medio ponderado', 'Rendimiento realizado'].map(h => (
                    <th key={h} style={{ padding: '5px 8px', textAlign: h === 'Empresa' ? 'left' : 'right', color: '#4a5270', borderBottom: '1px solid rgba(255,255,255,0.06)', fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tickers.map(tk => (
                  <tr key={tk} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding: '6px 8px', color: '#c8d0e0' }}>{nameOf(tk)}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: '#8090a8' }}>{avgCostByTicker[tk] != null ? fmt(avgCostByTicker[tk]) + ' ' + currOf(tk) : '—'}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: realizedByTicker[tk] == null ? '#4a5270' : realizedByTicker[tk] >= 0 ? '#34d399' : '#f87171', fontWeight: 600 }}>
                      {realizedByTicker[tk] == null ? '— (sin ventas)' : (realizedByTicker[tk] >= 0 ? '+' : '') + fmt(realizedByTicker[tk]) + ' ' + currOf(tk)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ fontSize: 10, color: '#2e3a55', marginTop: 8 }}>Rendimiento realizado = (precio venta − precio medio) × acciones + dividendos cobrados.</p>
        </div>
      )}

      {!isPremium && transactions.length > 10 && (
        <div style={{ textAlign: 'center', marginTop: 16, padding: '12px', background: 'rgba(99,102,241,0.05)', borderRadius: 8 }}>
          <Link href="/pricing" style={{ fontSize: 12, color: '#818cf8', fontWeight: 700 }}>Ver historial completo y exportar CSV con Premium →</Link>
        </div>
      )}
    </div>
  )
}

// ── Tab 2: Dividendos cobrados ─────────────────────────────────────────────
function TabDividends({ dividends, positions, onAdd, isPremium }) {
  const [form, setForm] = useState({ ticker: '', amount: '', amount_net: '', date: new Date().toISOString().slice(0, 10) })
  const [saving, setSaving] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (!form.ticker || !form.amount) return
    setSaving(true)
    await onAdd(form.ticker, parseFloat(form.amount), form.amount_net ? parseFloat(form.amount_net) : null, form.date)
    setForm({ ticker: '', amount: '', amount_net: '', date: new Date().toISOString().slice(0, 10) })
    setSaving(false)
  }

  const byYear = useMemo(() => {
    const map = {}
    dividends.forEach(d => {
      const y = new Date(d.date).getFullYear()
      map[y] = (map[y] || 0) + Number(d.amount)
    })
    return Object.entries(map).map(([year, total]) => ({ year, total: Math.round(total * 100) / 100 })).sort((a, b) => a.year - b.year)
  }, [dividends])

  const totalAccum = dividends.reduce((s, d) => s + Number(d.amount), 0)
  const curYear  = new Date().getFullYear()
  const thisYear = byYear.find(y => +y.year === curYear)?.total ?? 0
  const lastYear = byYear.find(y => +y.year === curYear - 1)?.total ?? 0
  const yoyGrowth = lastYear > 0 ? (thisYear - lastYear) / lastYear * 100 : null
  const monthsElapsed = new Date().getMonth() + 1
  const avgThisYear = thisYear / monthsElapsed
  const avgLastYear = lastYear / 12

  const exportCSV = () => {
    const rows = [['Fecha', 'Empresa', 'Ticker', 'Importe bruto', 'Importe neto']]
    ;[...dividends].sort((a, b) => new Date(b.date) - new Date(a.date)).forEach(d =>
      rows.push([d.date, nameOf(d.ticker), d.ticker, d.amount, d.amount_net ?? '']))
    downloadCSV('dividendos_cobrados.csv', rows)
  }

  if (!isPremium) return (
    <div style={{ textAlign: 'center', padding: '40px 20px' }}>
      <p style={{ fontSize: 14, fontWeight: 700, color: '#818cf8', marginBottom: 8 }}>Registro de dividendos — solo Premium</p>
      <Link href="/pricing" style={{ padding: '9px 18px', background: 'rgba(99,102,241,0.85)', borderRadius: 8, color: '#fff', fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>Activar Premium →</Link>
    </div>
  )

  return (
    <div>
      {/* Form */}
      <form onSubmit={submit} style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr auto', gap: 8, marginBottom: 20, alignItems: 'end' }}>
        <div>
          <label style={{ fontSize: 10, color: '#4a5270', display: 'block', marginBottom: 4 }}>Empresa</label>
          <select value={form.ticker} onChange={e => setForm(f => ({ ...f, ticker: e.target.value }))} style={{ ...INPUT, width: '100%' }} required>
            <option value="">Selecciona…</option>
            {positions.map(p => <option key={p.ticker} value={p.ticker}>{nameOf(p.ticker)}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 10, color: '#4a5270', display: 'block', marginBottom: 4 }}>Bruto</label>
          <input style={{ ...INPUT, width: '100%' }} type="number" step="any" min="0" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} required />
        </div>
        <div>
          <label style={{ fontSize: 10, color: '#4a5270', display: 'block', marginBottom: 4 }}>Neto</label>
          <input style={{ ...INPUT, width: '100%' }} type="number" step="any" min="0" value={form.amount_net} onChange={e => setForm(f => ({ ...f, amount_net: e.target.value }))} />
        </div>
        <div>
          <label style={{ fontSize: 10, color: '#4a5270', display: 'block', marginBottom: 4 }}>Fecha</label>
          <input style={{ ...INPUT, width: '100%' }} type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} required />
        </div>
        <button type="submit" disabled={saving} style={{ padding: '9px 16px', background: 'rgba(52,211,153,0.8)', border: 'none', borderRadius: 8, color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 12 }}>
          {saving ? '…' : 'Añadir'}
        </button>
      </form>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 20 }}>
        {[
          { label: 'Total acumulado', value: fmtEUR(totalAccum), col: '#34d399' },
          { label: `Cobrado ${curYear}`, value: fmtEUR(thisYear), col: '#c8d0e0' },
          { label: 'Crecim. vs año anterior', value: yoyGrowth != null ? (yoyGrowth >= 0 ? '+' : '') + yoyGrowth.toFixed(1) + '%' : '—', col: yoyGrowth >= 0 ? '#34d399' : '#f87171' },
          { label: 'Media mensual (este año)', value: fmtEUR(avgThisYear), col: '#818cf8' },
        ].map(it => (
          <div key={it.label} style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 8, padding: '12px' }}>
            <p style={{ fontSize: 10, color: '#4a5270', marginBottom: 4 }}>{it.label}</p>
            <p style={{ fontSize: 17, fontWeight: 800, color: it.col }}>{it.value}</p>
          </div>
        ))}
      </div>

      {/* Bar chart */}
      {byYear.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#4a5270', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Renta cobrada por año</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={byYear}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="year" stroke="#4a5270" fontSize={11} />
              <YAxis stroke="#4a5270" fontSize={10} tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}K` : v} />
              <Tooltip contentStyle={TT_STYLE} formatter={v => [fmtEUR(v), 'Cobrado']} />
              <Bar dataKey="total" fill="#34d399" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* List */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: '#4a5270', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Dividendos registrados</p>
        {dividends.length > 0 && (
          <button onClick={exportCSV} style={{ ...INPUT, cursor: 'pointer', color: '#818cf8', fontWeight: 700, fontSize: 11, padding: '6px 12px' }}>↓ CSV</button>
        )}
      </div>
      {dividends.length === 0 ? (
        <p style={{ fontSize: 13, color: '#4a5270', textAlign: 'center', padding: '20px 0' }}>Aún no has registrado dividendos cobrados.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                {['Fecha', 'Empresa', 'Bruto', 'Neto'].map(h => (
                  <th key={h} style={{ padding: '6px 8px', textAlign: ['Bruto','Neto'].includes(h) ? 'right' : 'left', color: '#4a5270', borderBottom: '1px solid rgba(255,255,255,0.06)', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...dividends].sort((a, b) => new Date(b.date) - new Date(a.date)).map(d => (
                <tr key={d.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '7px 8px', color: '#4a5270' }}>{new Date(d.date).toLocaleDateString('es-ES')}</td>
                  <td style={{ padding: '7px 8px', color: '#c8d0e0' }}>{nameOf(d.ticker)}</td>
                  <td style={{ padding: '7px 8px', textAlign: 'right', color: '#34d399', fontWeight: 600 }}>{fmt(Number(d.amount))}</td>
                  <td style={{ padding: '7px 8px', textAlign: 'right', color: '#8090a8' }}>{d.amount_net != null ? fmt(Number(d.amount_net)) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Tab 3: Yield on cost histórico ─────────────────────────────────────────
function TabYieldOnCost({ positions, transactions, fundamentals, isPremium }) {
  if (!isPremium) return (
    <div style={{ textAlign: 'center', padding: '40px 20px' }}>
      <p style={{ fontSize: 14, fontWeight: 700, color: '#818cf8', marginBottom: 8 }}>Yield on cost histórico — solo Premium</p>
      <Link href="/pricing" style={{ padding: '9px 18px', background: 'rgba(99,102,241,0.85)', borderRadius: 8, color: '#fff', fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>Activar Premium →</Link>
    </div>
  )

  const fundSet = new Set(positions.filter(p => (p.asset_type || 'stock') !== 'stock').map(p => p.ticker))

  const rows = useMemo(() => {
    return positions.map(pos => {
      const fund = fundamentals[pos.ticker] || {}
      const buys = transactions.filter(t => t.ticker === pos.ticker && t.type === 'buy').sort((a, b) => new Date(a.date) - new Date(b.date))
      const firstBuy = buys[0]
      const firstDate = firstBuy ? new Date(firstBuy.date) : null
      const avgCost = pos.avg_cost

      // DPS en el momento de la compra desde div_history
      let dpsAtPurchase = null
      const divHistory = Array.isArray(fund.div_history) ? fund.div_history : []
      if (firstDate && divHistory.length) {
        const buyYear = firstDate.getFullYear()
        const prior = divHistory.filter(h => h.year <= buyYear && h.dps > 0).sort((a, b) => b.year - a.year)
        dpsAtPurchase = prior[0]?.dps ?? null
      }

      const dpsNow = fund.dps ?? null
      const yocInitial = (dpsAtPurchase != null && avgCost > 0) ? dpsAtPurchase / avgCost * 100 : null
      const yocCurrent = (dpsNow != null && avgCost > 0) ? dpsNow / avgCost * 100 : null
      const yocGrowth  = (yocInitial != null && yocCurrent != null && yocInitial > 0) ? (yocCurrent - yocInitial) / yocInitial * 100 : null

      return {
        ticker: pos.ticker, name: nameOf(pos.ticker), currency: pos.currency,
        firstDate, avgCost, dpsAtPurchase, dpsNow, yocInitial, yocCurrent, yocGrowth,
      }
    }).sort((a, b) => (b.yocGrowth ?? -Infinity) - (a.yocGrowth ?? -Infinity))
  }, [positions, transactions, fundamentals])

  return (
    <div>
      <p style={{ fontSize: 12, color: '#4a5270', marginBottom: 14 }}>
        El yield on cost crece con el tiempo a medida que las empresas suben su dividendo. Las mejores inversiones aparecen arriba.
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, minWidth: 700 }}>
          <thead>
            <tr>
              {['Empresa', '1ª compra', 'P. medio', 'DPS compra', 'YoC inicial', 'DPS actual', 'YoC actual', 'Crecim. YoC'].map(h => (
                <th key={h} style={{ padding: '6px 8px', textAlign: h === 'Empresa' ? 'left' : 'right', color: '#4a5270', borderBottom: '1px solid rgba(255,255,255,0.06)', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.ticker} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <td style={{ padding: '7px 8px' }}>
                  <Link href={hrefFor(r.ticker, fundSet)} style={{ color: '#c8d0e0', textDecoration: 'none', fontWeight: 600 }}>{r.name}</Link>
                  {r.yocCurrent != null && r.yocCurrent > 10 && (
                    <span style={{ fontSize: 9, fontWeight: 700, color: '#fbbf24', background: 'rgba(251,191,36,0.12)', padding: '1px 6px', borderRadius: 4, marginLeft: 6 }}>YoC 10%+</span>
                  )}
                </td>
                <td style={{ padding: '7px 8px', textAlign: 'right', color: '#4a5270', whiteSpace: 'nowrap' }}>{r.firstDate ? r.firstDate.toLocaleDateString('es-ES', { month: 'short', year: 'numeric' }) : '—'}</td>
                <td style={{ padding: '7px 8px', textAlign: 'right', color: '#8090a8' }}>{fmt(r.avgCost)}</td>
                <td style={{ padding: '7px 8px', textAlign: 'right', color: '#8090a8' }}>{r.dpsAtPurchase != null ? fmt(r.dpsAtPurchase, 3) : '—'}</td>
                <td style={{ padding: '7px 8px', textAlign: 'right', color: '#818cf8' }}>{r.yocInitial != null ? r.yocInitial.toFixed(2) + '%' : '—'}</td>
                <td style={{ padding: '7px 8px', textAlign: 'right', color: '#8090a8' }}>{r.dpsNow != null ? fmt(r.dpsNow, 3) : '—'}</td>
                <td style={{ padding: '7px 8px', textAlign: 'right', color: '#34d399', fontWeight: 700 }}>{r.yocCurrent != null ? r.yocCurrent.toFixed(2) + '%' : '—'}</td>
                <td style={{ padding: '7px 8px', textAlign: 'right', color: r.yocGrowth == null ? '#4a5270' : r.yocGrowth >= 0 ? '#34d399' : '#f87171', fontWeight: 700 }}>
                  {r.yocGrowth != null ? (r.yocGrowth >= 0 ? '+' : '') + r.yocGrowth.toFixed(0) + '%' : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────
export default function HistorialPage({ isPremium }) {
  const router = useRouter()
  const [tab, setTab] = useState('ops')
  const [loading, setLoading] = useState(true)
  const [transactions, setTransactions] = useState([])
  const [dividends, setDividends] = useState([])
  const [positions, setPositions] = useState([])
  const [fundamentals, setFundamentals] = useState({})

  const sb = createClient()

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    const { data: { user } } = await sb.auth.getUser()
    if (!user) { router.push('/login'); return }

    const [{ data: tx }, { data: divs }, { data: pos }] = await Promise.all([
      sb.from('transactions').select('*').eq('user_id', user.id),
      sb.from('dividends_received').select('*').eq('user_id', user.id),
      sb.from('positions').select('*').eq('user_id', user.id),
    ])

    setTransactions(tx || [])
    setDividends(divs || [])
    setPositions(pos || [])

    if (pos?.length) {
      const tickers = [...new Set(pos.map(p => p.ticker))]
      const { data: funds } = await sb.from('company_fundamentals').select('ticker, dps, div_history').in('ticker', tickers)
      setFundamentals(Object.fromEntries((funds || []).map(f => [f.ticker, f])))
    }
    setLoading(false)
  }

  const handleAddDividend = async (ticker, amount, amount_net, date) => {
    const { data: { user } } = await sb.auth.getUser()
    await sb.from('dividends_received').insert({ user_id: user.id, ticker, amount, amount_net, date })
    load()
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#4a5270' }}>Cargando historial…</div>

  const TABS = [
    { key: 'ops',  label: 'Operaciones' },
    { key: 'divs', label: 'Dividendos cobrados', premium: true },
    { key: 'yoc',  label: 'Yield on cost', premium: true },
  ]

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 16px 64px' }}>
      <h1 style={{ fontSize: 22, fontWeight: 900, color: '#e0e8f0', marginBottom: 20 }}>Historial</h1>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '7px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: tab === t.key ? 700 : 500,
            background: tab === t.key ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.04)',
            color: tab === t.key ? '#818cf8' : '#4a5270', display: 'flex', alignItems: 'center',
          }}>
            {t.label}{t.premium && !isPremium && <PremiumBadge />}
          </button>
        ))}
      </div>

      <div style={CARD}>
        {tab === 'ops'  && <TabOperations transactions={transactions} dividends={dividends} isPremium={isPremium} fundTickers={new Set(positions.filter(p => (p.asset_type || 'stock') !== 'stock').map(p => p.ticker))} />}
        {tab === 'divs' && <TabDividends dividends={dividends} positions={positions} onAdd={handleAddDividend} isPremium={isPremium} />}
        {tab === 'yoc'  && <TabYieldOnCost positions={positions} transactions={transactions} fundamentals={fundamentals} isPremium={isPremium} />}
      </div>
    </div>
  )
}
