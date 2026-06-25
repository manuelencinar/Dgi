'use client'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { DICT } from '@/data/dict'
import { countryCodeOf, fiscalWHT, nameOf, COUNTRY_NAMES } from '@/lib/fiscalidad'
import { detectFreqMonths, monthLabel } from '@/lib/dividends'

const CARD = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }
const INPUT = { background: 'var(--border)', border: '1px solid rgba(129,140,248,0.4)', borderRadius: 6, padding: '5px 7px', color: 'var(--text-strong)', fontSize: 12, outline: 'none', width: '100%', fontFamily: 'inherit', boxSizing: 'border-box' }
const GREEN = 'var(--positive)', ORANGE = '#fb923c', BLUE = '#60a5fa'

const fmtEUR = (v, d = 2) => v == null || isNaN(v) ? '—' : Number(v).toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d }) + ' €'
const fmtNum = (v, d = 4) => v == null || isNaN(v) ? '—' : Number(v).toLocaleString('es-ES', { maximumFractionDigits: d })
const fmtDate = d => d ? new Date(String(d).slice(0, 10) + 'T12:00:00').toLocaleDateString('es-ES') : '—'
const num = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n }
const FREQ_LABEL = { 1: 'Anual', 2: 'Semestral', 4: 'Trimestral', 12: 'Mensual' }
function flag(code) { if (!code || code.length !== 2) return '🌐'; try { return String.fromCodePoint(...[...code.toUpperCase()].map(c => 127397 + c.charCodeAt(0))) } catch { return '🌐' } }
const mini = c => ({ background: 'none', border: 'none', cursor: 'pointer', color: c, fontSize: 13, padding: '2px 4px' })
const todayStr = () => new Date().toISOString().slice(0, 10)

export default function DividendosPage({ isPremium }) {
  const router = useRouter()
  const sb = useMemo(() => createClient(), [])
  const [tab, setTab] = useState('cobros')
  const [loading, setLoading] = useState(true)
  const [records, setRecords] = useState([])
  const [positions, setPositions] = useState([])
  const [funds, setFunds] = useState({})
  const [config, setConfig] = useState({})
  const [destWHT, setDestWHT] = useState(19)
  const [year, setYear] = useState(new Date().getFullYear())
  const [notice, setNotice] = useState(null)
  const showNotice = useCallback((msg) => { setNotice(msg); setTimeout(() => setNotice(null), 8000) }, [])

  const fetchRecords = useCallback(async (uid) => {
    const { data } = await sb.from('dividends_received').select('*').eq('user_id', uid).order('payment_date_estimated', { ascending: true })
    setRecords(data || []); return data || []
  }, [sb])

  const load = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await sb.auth.getUser()
    if (!user) { router.push('/login'); return }
    const [{ data: pos }, { data: cfg }, { data: settings }] = await Promise.all([
      sb.from('positions').select('*').eq('user_id', user.id),
      sb.from('dividend_config').select('*').eq('user_id', user.id),
      sb.from('user_settings').select('dest_wht').eq('user_id', user.id).maybeSingle(),
    ])
    setPositions(pos || [])
    setConfig(Object.fromEntries((cfg || []).map(c => [c.ticker, c])))
    setDestWHT(settings?.dest_wht != null ? Number(settings.dest_wht) : 19)
    const tickers = [...new Set((pos || []).map(p => p.ticker))]
    if (tickers.length) {
      const { data: f } = await sb.from('company_fundamentals').select('ticker, country, current_price, dps, div_history, dividend_events, next_ex_date, next_pay_date').in('ticker', tickers)
      setFunds(Object.fromEntries((f || []).map(x => [x.ticker, x])))
    }
    let recs = await fetchRecords(user.id)
    if (!recs.length) {
      try { await fetch('/api/dividends/prefill', { method: 'POST' }); recs = await fetchRecords(user.id) } catch {}
    }
    setLoading(false)
  }, [sb, router, fetchRecords])

  useEffect(() => { load() }, [load])

  const refresh = useCallback(async () => {
    const { data: { user } } = await sb.auth.getUser()
    if (user) await fetchRecords(user.id)
  }, [sb, fetchRecords])

  const recalc = async () => {
    const { data: { user } } = await sb.auth.getUser(); if (!user) return
    setLoading(true)
    try { await fetch('/api/dividends/prefill', { method: 'POST' }); await fetchRecords(user.id) } catch {}
    setLoading(false)
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-faint)' }}>Cargando dividendos…</div>

  const TABS = [['cobros', 'Cobros'], ['calendario', 'Calendario'], ['config', 'Configuración']]

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 16px 64px' }}>
      {notice && (
        <div style={{ background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.35)', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
          <p style={{ fontSize: 12.5, color: 'var(--positive)', lineHeight: 1.5, whiteSpace: 'pre-line' }}>{notice}</p>
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, color: 'var(--text-strong)' }}>Dividendos</h1>
        <button onClick={recalc} style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 8, padding: '7px 12px', color: 'var(--accent)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>↻ Actualizar</button>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 18, flexWrap: 'wrap' }}>
        {TABS.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            padding: '7px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: tab === k ? 700 : 500,
            background: tab === k ? 'rgba(99,102,241,0.2)' : 'var(--surface-2)', color: tab === k ? 'var(--accent)' : 'var(--text-faint)',
          }}>{l}</button>
        ))}
      </div>

      {tab === 'cobros' && <Cobros sb={sb} records={records} setRecords={setRecords} positions={positions} funds={funds} year={year} setYear={setYear} destWHT={destWHT} refresh={refresh} showNotice={showNotice} />}
      {tab === 'calendario' && <Calendario records={records} year={year} setYear={setYear} />}
      {tab === 'config' && <Configuracion sb={sb} positions={positions} setPositions={setPositions} funds={funds} config={config} setConfig={setConfig} reload={recalc} />}
    </div>
  )
}

// ───────────────────────── COBROS ─────────────────────────
function Cobros({ sb, records, setRecords, positions, funds, year, setYear, destWHT = 19, refresh, showNotice }) {
  const methodByTicker = useMemo(() => Object.fromEntries(positions.map(p => [p.ticker, p.dividend_payment_method || 'cash'])), [positions])
  const [filter, setFilter] = useState('all')
  const [editId, setEditId] = useState(null)
  const [draft, setDraft] = useState({})
  const [confirmId, setConfirmId] = useState(null)
  const [confDraft, setConfDraft] = useState({})
  const [delId, setDelId] = useState(null)
  const [adding, setAdding] = useState(false)
  const [addDraft, setAddDraft] = useState({ query: '', ticker: '', shares: '', dps: '', pctO: '', pctD: '', date: todayStr() })

  const years = useMemo(() => {
    const ys = new Set([new Date().getFullYear()])
    records.forEach(r => { const d = r.payment_date_estimated || r.date; if (d) ys.add(new Date(d).getFullYear()) })
    return [...ys].sort((a, b) => b - a)
  }, [records])

  const yearRecs = useMemo(() => records.filter(r => {
    const d = r.payment_date_estimated || r.date
    return d && new Date(d).getFullYear() === year
  }).sort((a, b) => new Date(a.payment_date_estimated || a.date) - new Date(b.payment_date_estimated || b.date)), [records, year])

  const today = todayStr()
  const cobrado = yearRecs.filter(r => r.status === 'received').reduce((s, r) => s + num(r.amount_net), 0)
  const pendientePasado = yearRecs.filter(r => r.status === 'pending' && (r.payment_date_estimated || r.date) <= today).reduce((s, r) => s + num(r.amount), 0)
  const esperado = yearRecs.filter(r => r.status === 'pending' && (r.payment_date_estimated || r.date) > today).reduce((s, r) => s + num(r.amount), 0)

  const filtered = yearRecs.filter(r => filter === 'all' || (filter === 'received' ? r.status === 'received' : r.status === 'pending'))

  // Importes con doble retención: origen (país) + destino (usuario).
  const calcNet = (amount, pctO, pctD) => {
    const originW = amount * pctO / 100
    const destW = (amount - originW) * pctD / 100
    return { originW, destW, net: amount - originW - destW }
  }

  const patch = async (id, fields) => {
    const { error } = await sb.from('dividends_received').update({ ...fields, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) { alert('No se pudo guardar: ' + error.message); return false }
    if (refresh) await refresh()
    return true
  }
  const startEdit = r => { setEditId(r.id); setConfirmId(null); setDraft({ shares: r.shares ?? '', dps: r.dps ?? '', pctO: r.withholding_origin_pct ?? '', pctD: r.withholding_dest_pct ?? '' }) }
  const saveEdit = async (r) => {
    const shares = num(draft.shares), dps = num(draft.dps), pctO = num(draft.pctO), pctD = num(draft.pctD)
    const amount = shares * dps, { originW, destW, net } = calcNet(amount, pctO, pctD)
    if (await patch(r.id, { shares, dps, withholding_origin_pct: pctO, withholding_origin: originW, withholding_dest_pct: pctD, withholding_dest: destW, amount, amount_net: net, source: 'manual' })) setEditId(null)
  }
  const startConfirm = async r => {
    setEditId(null); setConfirmId(r.id)
    const payDate = r.payment_date_estimated || r.date || today
    if (methodByTicker[r.ticker] !== 'stock') { setConfDraft({ mode: 'cash', amount_net: r.amount_net ?? r.amount ?? '', date: payDate }); return }
    // Dividendo en acciones: prefill del precio de cierre en la fecha de pago.
    let price = funds[r.ticker]?.current_price != null ? Number(funds[r.ticker].current_price) : null
    try {
      const { data } = await sb.from('daily_prices').select('close_price').eq('ticker', r.ticker).lte('date', payDate).order('date', { ascending: false }).limit(1)
      if (data?.[0]?.close_price != null) price = Number(data[0].close_price)
    } catch {}
    const gross = num(r.amount)
    const shares = price > 0 ? Math.round(gross / price * 10000) / 10000 : ''
    setConfDraft({ mode: 'stock', shares, price: price ?? '', date: payDate })
  }
  const doConfirm = async (r) => {
    if (confDraft.mode === 'stock') return doConfirmStock(r)
    const newNet = num(confDraft.amount_net), newDate = confDraft.date
    const changed = newNet !== num(r.amount_net) || newDate !== (r.payment_date_estimated || r.date)
    if (await patch(r.id, { status: 'received', amount_net: newNet, date: newDate, source: changed ? 'manual' : r.source })) setConfirmId(null)
  }
  // Cobro en acciones: 3 operaciones atómicas (con rollback si alguna falla).
  const doConfirmStock = async (r) => {
    const shares = num(confDraft.shares), price = num(confDraft.price), date = confDraft.date
    if (shares <= 0 || price <= 0) { alert('Introduce acciones y precio válidos'); return }
    const amount = Math.round(shares * price * 100) / 100
    const { data: { user } } = await sb.auth.getUser(); if (!user) return
    const changed = confDraft._touched
    const fiscalNote = `Dividendo en acciones — valor fiscal: ${amount.toFixed(2)}€`

    // Op1 — dividends_received
    const { error: e1 } = await sb.from('dividends_received').update({
      status: 'received', payment_method: 'stock', amount, amount_net: amount,
      withholding_origin: 0, withholding_origin_pct: 0, withholding_dest: 0, withholding_dest_pct: 0,
      shares_received: shares, price_per_share_at_payment: price, date, source: changed ? 'manual' : r.source, updated_at: new Date().toISOString(),
    }).eq('id', r.id)
    if (e1) { alert('No se pudo registrar el dividendo: ' + e1.message); return }

    // Op2 — transactions (stock_dividend)
    const { data: txRow, error: e2 } = await sb.from('transactions').insert({
      user_id: user.id, ticker: r.ticker, type: 'stock_dividend', shares, price, date,
      commission: 0, fx_commission_eur: 0, total_cost: 0, notes: fiscalNote,
    }).select('id').single()
    if (e2) {
      // rollback Op1
      await sb.from('dividends_received').update({ status: r.status, payment_method: r.payment_method || 'cash', amount: r.amount, amount_net: r.amount_net, withholding_origin: r.withholding_origin, withholding_origin_pct: r.withholding_origin_pct, shares_received: null, price_per_share_at_payment: null }).eq('id', r.id)
      alert('No se pudo registrar la operación: ' + e2.message); return
    }

    // Op3 — positions (recalcular precio medio)
    const { data: pos } = await sb.from('positions').select('*').eq('user_id', user.id).eq('ticker', r.ticker).maybeSingle()
    if (pos) {
      const newShares = num(pos.shares) + shares
      const newAvg = newShares > 0 ? (num(pos.shares) * num(pos.avg_cost) + shares * price) / newShares : price
      const { error: e3 } = await sb.from('positions').update({ shares: newShares, avg_cost: newAvg, updated_at: new Date().toISOString() }).eq('id', pos.id)
      if (e3) {
        // rollback Op2 y Op1
        await sb.from('transactions').delete().eq('id', txRow.id)
        await sb.from('dividends_received').update({ status: r.status, payment_method: r.payment_method || 'cash', amount: r.amount, amount_net: r.amount_net, withholding_origin: r.withholding_origin, withholding_origin_pct: r.withholding_origin_pct, shares_received: null, price_per_share_at_payment: null }).eq('id', r.id)
        alert('No se pudo actualizar la posición: ' + e3.message); return
      }
    }

    setConfirmId(null)
    if (showNotice) showNotice(`✓ Se han añadido ${shares.toLocaleString('es-ES', { maximumFractionDigits: 4 })} acciones de ${nameOf(r.ticker)} a tu cartera\nValor fiscal declarable: ${amount.toFixed(2)}€ — recuerda incluirlo en tu declaración de la renta`)
    if (refresh) await refresh()
  }
  const del = async (r, exclude) => {
    const { data: { user } } = await sb.auth.getUser()
    if (exclude && r.source === 'auto') {
      const period = (r.payment_date_estimated || r.date || '').slice(0, 7)
      try { await sb.from('dividend_prefill_exclusions').insert({ user_id: user.id, ticker: r.ticker, period }) } catch {}
    }
    const { error } = await sb.from('dividends_received').delete().eq('id', r.id)
    if (error) { alert('No se pudo eliminar: ' + error.message); return }
    setDelId(null)
    if (refresh) await refresh()
  }

  const addResults = useMemo(() => {
    const q = addDraft.query.trim().toLowerCase()
    const tickers = new Set(positions.map(p => p.ticker))
    if (q.length < 1) return DICT.filter(d => tickers.has(d[1])).slice(0, 8)
    return DICT.filter(d => tickers.has(d[1]) && (d[0].toLowerCase().includes(q) || d[1].toLowerCase().includes(q))).slice(0, 8)
  }, [addDraft.query, positions])
  const pickAdd = d => setAddDraft(a => ({ ...a, ticker: d[1], query: d[0], pctO: String(fiscalWHT(d[2])), pctD: d[2] === 'ES' ? '0' : String(destWHT) }))
  const saveAdd = async () => {
    const { data: { user } } = await sb.auth.getUser()
    if (!user || !addDraft.ticker) return
    const shares = num(addDraft.shares), dps = num(addDraft.dps), pctO = num(addDraft.pctO), pctD = num(addDraft.pctD)
    const amount = shares * dps, { originW, destW, net } = calcNet(amount, pctO, pctD)
    const row = { user_id: user.id, ticker: addDraft.ticker, date: addDraft.date, payment_date_estimated: addDraft.date, amount, amount_net: net, shares, dps, withholding_origin_pct: pctO, withholding_origin: originW, withholding_dest_pct: pctD, withholding_dest: destW, status: 'received', source: 'manual' }
    const { error } = await sb.from('dividends_received').insert(row)
    if (error) { alert('No se pudo guardar el cobro: ' + error.message); return }
    setAdding(false); setAddDraft({ query: '', ticker: '', shares: '', dps: '', pctO: '', pctD: '', date: todayStr() })
    if (refresh) await refresh()
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
        <p style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-strong)' }}>Dividendos {year}</p>
        <select value={year} onChange={e => setYear(Number(e.target.value))} style={{ background: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: 8, padding: '6px 11px', color: 'var(--text)', fontSize: 13, outline: 'none' }}>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 18 }}>
        <Sum label={`Cobrado en ${year}`} value={fmtEUR(cobrado, 0)} col={GREEN} sub="Neto confirmado" />
        <Sum label="Pendiente de confirmar" value={fmtEUR(pendientePasado, 0)} col={ORANGE} sub="Ya debería estar cobrado" />
        <Sum label="Esperado resto del año" value={fmtEUR(esperado, 0)} col={BLUE} sub="Pagos futuros" />
      </div>

      <div style={{ ...CARD }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {[['all', 'Todos'], ['received', 'Cobrados'], ['pending', 'Pendientes']].map(([k, l]) => (
              <button key={k} onClick={() => setFilter(k)} style={{ padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 11.5, background: filter === k ? 'rgba(99,102,241,0.2)' : 'var(--surface-2)', color: filter === k ? 'var(--accent)' : 'var(--text-faint)', fontWeight: filter === k ? 700 : 400 }}>{l}</button>
            ))}
          </div>
          <button onClick={() => setAdding(a => !a)} style={{ background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.3)', borderRadius: 7, padding: '6px 12px', color: GREEN, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>+ Añadir cobro</button>
        </div>

        {filtered.length === 0 && !adding ? (
          <p style={{ fontSize: 13, color: 'var(--text-faint)', padding: '16px 0' }}>No hay dividendos para este filtro.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 920 }}>
              <thead><tr>{['Empresa', 'Acciones', 'DPS', 'Bruto', 'Ret. origen', 'Ret. destino', 'Neto', 'Fecha pago', 'Estado', '', ''].map((h, i) => (
                <th key={i} style={{ padding: '6px 8px', textAlign: i >= 1 && i <= 6 ? 'right' : 'left', color: 'var(--text-faint)', borderBottom: '1px solid var(--border)', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
              ))}</tr></thead>
              <tbody>
                {filtered.map(r => {
                  const code = countryCodeOf(r.ticker, null)
                  const editing = editId === r.id
                  const amount = editing ? num(draft.shares) * num(draft.dps) : num(r.amount)
                  const pctO = editing ? num(draft.pctO) : num(r.withholding_origin_pct)
                  const pctD = editing ? num(draft.pctD) : num(r.withholding_dest_pct)
                  const originW = editing ? amount * pctO / 100 : num(r.withholding_origin)
                  const destW = editing ? (amount - originW) * pctD / 100 : num(r.withholding_dest)
                  const net = editing ? amount - originW - destW : (r.amount_net != null ? num(r.amount_net) : amount - originW - destW)
                  return (
                    <Fragmentish key={r.id}>
                      <tr style={{ borderBottom: confirmId === r.id ? 'none' : '1px solid var(--surface-2)' }}>
                        <td style={{ padding: '7px 8px', color: 'var(--text)', whiteSpace: 'nowrap' }}>{flag(code)} {nameOf(r.ticker)} <span style={{ color: 'var(--text-faintest)', fontSize: 10 }}>{r.ticker}</span></td>
                        <td style={{ padding: '7px 8px', textAlign: 'right' }}>{editing ? <input style={INPUT} type="number" step="any" value={draft.shares} onChange={e => setDraft(d => ({ ...d, shares: e.target.value }))} /> : <span style={{ color: 'var(--text-muted)' }}>{fmtNum(r.shares)}</span>}</td>
                        <td style={{ padding: '7px 8px', textAlign: 'right' }}>{editing ? <input style={INPUT} type="number" step="0.0001" value={draft.dps} onChange={e => setDraft(d => ({ ...d, dps: e.target.value }))} /> : <span style={{ color: 'var(--text-muted)' }}>{fmtNum(r.dps)}</span>}</td>
                        <td style={{ padding: '7px 8px', textAlign: 'right', color: 'var(--positive)', fontWeight: 600 }}>{fmtEUR(amount)}</td>
                        <td style={{ padding: '7px 8px', textAlign: 'right', color: ORANGE, whiteSpace: 'nowrap' }}>{editing ? <input style={{ ...INPUT, width: 46, display: 'inline-block' }} type="number" step="any" value={draft.pctO} onChange={e => setDraft(d => ({ ...d, pctO: e.target.value }))} /> : `${pctO || 0}%`} · {fmtEUR(originW)}</td>
                        <td style={{ padding: '7px 8px', textAlign: 'right', color: ORANGE, whiteSpace: 'nowrap' }}>{editing ? <input style={{ ...INPUT, width: 46, display: 'inline-block' }} type="number" step="any" value={draft.pctD} onChange={e => setDraft(d => ({ ...d, pctD: e.target.value }))} /> : `${pctD || 0}%`} · {fmtEUR(destW)}</td>
                        <td style={{ padding: '7px 8px', textAlign: 'right', color: 'var(--text)', fontWeight: 600 }}>{fmtEUR(net)}</td>
                        <td style={{ padding: '7px 8px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{fmtDate(r.payment_date_estimated || r.date)}</td>
                        <td style={{ padding: '7px 8px' }}>
                          {r.status === 'received'
                            ? <span style={{ fontSize: 10, fontWeight: 700, color: GREEN, background: 'rgba(52,211,153,0.14)', padding: '2px 7px', borderRadius: 5, whiteSpace: 'nowrap' }}>✓ Cobrado</span>
                            : <span style={{ fontSize: 10, fontWeight: 700, color: ORANGE, background: 'rgba(251,146,60,0.14)', padding: '2px 7px', borderRadius: 5 }}>Pendiente</span>}
                        </td>
                        <td style={{ padding: '7px 8px', textAlign: 'center' }} title={r.source === 'auto' ? 'Generado automáticamente' : 'Introducido manualmente'}>{r.source === 'auto' ? '🤖' : '✏'}</td>
                        <td style={{ padding: '7px 8px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {editing ? (
                            <><button onClick={() => saveEdit(r)} style={mini(GREEN)} title="Guardar">💾</button><button onClick={() => setEditId(null)} style={mini('var(--text-muted)')} title="Cancelar">✕</button></>
                          ) : delId === r.id ? null : (
                            <>
                              {r.status === 'pending' && <button onClick={() => startConfirm(r)} style={{ ...mini(GREEN), fontSize: 16 }} title="Confirmar cobro">✓</button>}
                              <button onClick={() => startEdit(r)} style={mini('var(--accent)')} title="Editar">✏</button>
                              <button onClick={() => setDelId(r.id)} style={mini('var(--negative)')} title="Eliminar">🗑</button>
                            </>
                          )}
                        </td>
                      </tr>
                      {confirmId === r.id && (
                        <tr style={{ borderBottom: '1px solid var(--surface-2)', background: 'rgba(52,211,153,0.04)' }}>
                          <td colSpan={11} style={{ padding: '10px 12px' }}>
                            {confDraft.mode === 'stock' ? (
                              <div>
                                <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>📈 Confirmar dividendo en acciones de {nameOf(r.ticker)}</p>
                                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                                  <label style={{ fontSize: 10, color: 'var(--text-muted)' }}>Acciones recibidas<br /><input style={{ ...INPUT, width: 120 }} type="number" step="0.0001" value={confDraft.shares} onChange={e => setConfDraft(d => ({ ...d, shares: e.target.value, _touched: true }))} /></label>
                                  <label style={{ fontSize: 10, color: 'var(--text-muted)' }}>Precio/acción (fecha pago)<br /><input style={{ ...INPUT, width: 120 }} type="number" step="any" value={confDraft.price} onChange={e => setConfDraft(d => ({ ...d, price: e.target.value, _touched: true }))} /></label>
                                  <label style={{ fontSize: 10, color: 'var(--text-muted)' }}>Valor total recibido<br /><input style={{ ...INPUT, width: 120, opacity: 0.7 }} value={fmtEUR(num(confDraft.shares) * num(confDraft.price))} readOnly /></label>
                                  <label style={{ fontSize: 10, color: 'var(--text-muted)' }}>Fecha de cobro<br /><input style={{ ...INPUT, width: 140 }} type="date" value={confDraft.date} onChange={e => setConfDraft(d => ({ ...d, date: e.target.value, _touched: true }))} /></label>
                                </div>
                                <p style={{ fontSize: 10.5, color: 'var(--text-muted)', margin: '8px 0 10px', maxWidth: 560, lineHeight: 1.5 }}>Las acciones se añadirán automáticamente a tu cartera con precio de compra igual al valor de mercado en esta fecha — necesario para el cálculo fiscal correcto.</p>
                                <div style={{ display: 'flex', gap: 10 }}>
                                  <button onClick={() => doConfirm(r)} style={{ background: GREEN, border: 'none', borderRadius: 7, padding: '8px 16px', color: '#06281c', fontWeight: 800, fontSize: 12, cursor: 'pointer' }}>Confirmar y añadir acciones</button>
                                  <button onClick={() => setConfirmId(null)} style={{ background: 'none', border: '1px solid var(--border-strong)', borderRadius: 7, padding: '8px 14px', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer' }}>Cancelar</button>
                                </div>
                              </div>
                            ) : (
                              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>Confirmar cobro de {nameOf(r.ticker)}</span>
                                <label style={{ fontSize: 10, color: 'var(--text-muted)' }}>Neto recibido<br /><input style={{ ...INPUT, width: 110 }} type="number" step="any" value={confDraft.amount_net} onChange={e => setConfDraft(d => ({ ...d, amount_net: e.target.value }))} /></label>
                                <label style={{ fontSize: 10, color: 'var(--text-muted)' }}>Fecha de cobro<br /><input style={{ ...INPUT, width: 140 }} type="date" value={confDraft.date} onChange={e => setConfDraft(d => ({ ...d, date: e.target.value }))} /></label>
                                <button onClick={() => doConfirm(r)} style={{ background: GREEN, border: 'none', borderRadius: 7, padding: '7px 16px', color: '#06281c', fontWeight: 800, fontSize: 12, cursor: 'pointer' }}>Confirmar</button>
                                <button onClick={() => setConfirmId(null)} style={{ background: 'none', border: '1px solid var(--border-strong)', borderRadius: 7, padding: '7px 14px', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer' }}>Cancelar</button>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                      {delId === r.id && (
                        <tr style={{ borderBottom: '1px solid var(--surface-2)', background: 'rgba(248,113,113,0.05)' }}>
                          <td colSpan={11} style={{ padding: '10px 12px' }}>
                            <DeleteConfirm r={r} onDelete={del} onCancel={() => setDelId(null)} />
                          </td>
                        </tr>
                      )}
                    </Fragmentish>
                  )
                })}
                {adding && (
                  <tr style={{ background: 'rgba(52,211,153,0.04)' }}>
                    <td style={{ padding: '7px 8px', position: 'relative' }}>
                      <input style={INPUT} placeholder="Empresa…" value={addDraft.query} onChange={e => setAddDraft(a => ({ ...a, query: e.target.value, ticker: '' }))} />
                      {!addDraft.ticker && addResults.length > 0 && (
                        <div style={{ position: 'absolute', zIndex: 20, top: '100%', left: 0, right: 0, background: 'var(--bg-elev)', border: '1px solid var(--border-strong)', borderRadius: 8, marginTop: 2, maxHeight: 200, overflowY: 'auto' }}>
                          {addResults.map(d => <button key={d[1]} onClick={() => pickAdd(d)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text)', fontSize: 12 }}>{d[0]} <span style={{ color: 'var(--text-faint)' }}>{d[1]}</span></button>)}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '7px 8px' }}><input style={INPUT} type="number" step="any" placeholder="acc." value={addDraft.shares} onChange={e => setAddDraft(a => ({ ...a, shares: e.target.value }))} /></td>
                    <td style={{ padding: '7px 8px' }}><input style={INPUT} type="number" step="0.0001" placeholder="DPS" value={addDraft.dps} onChange={e => setAddDraft(a => ({ ...a, dps: e.target.value }))} /></td>
                    <td style={{ padding: '7px 8px', textAlign: 'right', color: GREEN }}>{fmtEUR(num(addDraft.shares) * num(addDraft.dps))}</td>
                    <td style={{ padding: '7px 8px' }}><input style={INPUT} type="number" step="any" placeholder="% orig." value={addDraft.pctO} onChange={e => setAddDraft(a => ({ ...a, pctO: e.target.value }))} /></td>
                    <td style={{ padding: '7px 8px' }}><input style={INPUT} type="number" step="any" placeholder="% dest." value={addDraft.pctD} onChange={e => setAddDraft(a => ({ ...a, pctD: e.target.value }))} /></td>
                    <td style={{ padding: '7px 8px', textAlign: 'right', color: 'var(--text)' }}>{fmtEUR(calcNet(num(addDraft.shares) * num(addDraft.dps), num(addDraft.pctO), num(addDraft.pctD)).net)}</td>
                    <td style={{ padding: '7px 8px' }}><input style={INPUT} type="date" value={addDraft.date} onChange={e => setAddDraft(a => ({ ...a, date: e.target.value }))} /></td>
                    <td colSpan={2} />
                    <td style={{ padding: '7px 8px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button onClick={saveAdd} disabled={!addDraft.ticker} style={mini(GREEN)} title="Guardar">💾</button>
                      <button onClick={() => { setAdding(false); setAddDraft({ query: '', ticker: '', shares: '', dps: '', pctO: '', pctD: '', date: todayStr() }) }} style={mini('var(--text-muted)')} title="Cancelar">✕</button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function DeleteConfirm({ r, onDelete, onCancel }) {
  const [noRegen, setNoRegen] = useState(false)
  return (
    <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={{ fontSize: 12, color: 'var(--warning)' }}>¿Eliminar este registro?</span>
      {r.source === 'auto' && (
        <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
          <input type="checkbox" checked={noRegen} onChange={e => setNoRegen(e.target.checked)} /> No volver a generar automáticamente
        </label>
      )}
      <button onClick={() => onDelete(r, noRegen)} style={{ background: 'rgba(248,113,113,0.85)', border: 'none', borderRadius: 7, padding: '6px 14px', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>Eliminar</button>
      <button onClick={onCancel} style={{ background: 'none', border: '1px solid var(--border-strong)', borderRadius: 7, padding: '6px 12px', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer' }}>Cancelar</button>
    </div>
  )
}
function Fragmentish({ children }) { return <>{children}</> }
function Sum({ label, value, col, sub }) {
  return (
    <div style={{ ...CARD, padding: '16px 18px' }}>
      <p style={{ fontSize: 10.5, color: 'var(--text-faint)', marginBottom: 6 }}>{label}</p>
      <p style={{ fontSize: 21, fontWeight: 900, color: col }}>{value}</p>
      <p style={{ fontSize: 10, color: 'var(--text-faintest)', marginTop: 4 }}>{sub}</p>
    </div>
  )
}

// ───────────────────────── CALENDARIO ─────────────────────────
function Calendario({ records, year, setYear }) {
  const years = useMemo(() => {
    const ys = new Set([new Date().getFullYear()])
    records.forEach(r => { const d = r.payment_date_estimated || r.date; if (d) ys.add(new Date(d).getFullYear()) })
    return [...ys].sort((a, b) => b - a)
  }, [records])

  const months = useMemo(() => {
    const arr = Array.from({ length: 12 }, () => ({ received: 0, pending: 0, entries: [] }))
    records.forEach(r => {
      const ds = r.payment_date_estimated || r.date
      if (!ds) return
      const d = new Date(ds); if (d.getFullYear() !== year) return
      const m = d.getMonth()
      if (r.status === 'received') arr[m].received += num(r.amount_net)
      else arr[m].pending += num(r.amount)
      arr[m].entries.push(r)
    })
    return arr
  }, [records, year])
  const max = Math.max(1, ...months.map(m => m.received + m.pending))

  return (
    <div style={{ ...CARD }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Calendario {year}</p>
        <select value={year} onChange={e => setYear(Number(e.target.value))} style={{ background: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: 8, padding: '6px 11px', color: 'var(--text)', fontSize: 13, outline: 'none' }}>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
        <style>{`@media (max-width:560px){.divcal-grid{grid-template-columns:1fr!important}}`}</style>
        {months.map((mo, i) => {
          const total = mo.received + mo.pending
          const isReceived = mo.received > 0
          const col = mo.pending > 0 && mo.received === 0 ? ORANGE : isReceived && mo.pending === 0 ? GREEN : mo.received >= mo.pending ? GREEN : ORANGE
          return (
            <div key={i} style={{ borderRadius: 10, padding: 12, background: total > 0 ? `rgba(52,211,153,${0.05 + (total / max) * 0.12})` : 'var(--surface)', border: '1px solid var(--surface-2)' }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{monthLabel(i + 1)} {year}</p>
              <p style={{ fontSize: 17, fontWeight: 800, color: total > 0 ? col : 'var(--text-faintest)', marginTop: 4 }}>{total > 0 ? fmtEUR(total, 0) : '—'}</p>
              {total > 0 && (
                <p style={{ fontSize: 9.5, color: 'var(--text-faint)', marginTop: 2 }}>
                  {mo.received > 0 && <span style={{ color: GREEN }}>{fmtEUR(mo.received, 0)} cobrado</span>}
                  {mo.received > 0 && mo.pending > 0 && ' · '}
                  {mo.pending > 0 && <span style={{ color: ORANGE }}>{fmtEUR(mo.pending, 0)} pendiente</span>}
                </p>
              )}
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: 16, marginTop: 12, fontSize: 10.5, color: 'var(--text-faint)' }}>
        <span><span style={{ display: 'inline-block', width: 9, height: 9, background: GREEN, borderRadius: 2, marginRight: 5 }} />Cobrado</span>
        <span><span style={{ display: 'inline-block', width: 9, height: 9, background: ORANGE, borderRadius: 2, marginRight: 5 }} />Pendiente</span>
      </div>
    </div>
  )
}

// ───────────────────────── CONFIGURACIÓN ─────────────────────────
function Configuracion({ sb, positions, setPositions, funds, config, setConfig, reload }) {
  const [editId, setEditId] = useState(null)
  const [draft, setDraft] = useState({ frequency: 4, months: [] })
  const [methodSaved, setMethodSaved] = useState(null)   // ticker con checkmark temporal
  const stocks = positions.filter(p => (p.asset_type || 'stock') === 'stock' && Number(p.shares) > 0)

  const setMethod = async (ticker, method) => {
    const { data: { user } } = await sb.auth.getUser(); if (!user) return
    const { error } = await sb.from('positions').update({ dividend_payment_method: method }).eq('user_id', user.id).eq('ticker', ticker)
    if (error) { alert('No se pudo guardar: ' + error.message); return }
    if (setPositions) setPositions(ps => ps.map(p => p.ticker === ticker ? { ...p, dividend_payment_method: method } : p))
    setMethodSaved(ticker); setTimeout(() => setMethodSaved(s => s === ticker ? null : s), 2000)
  }

  const saveCfg = async (ticker, fields) => {
    const { data: { user } } = await sb.auth.getUser(); if (!user) return
    const existing = config[ticker]
    const row = { user_id: user.id, ticker, frequency: existing?.frequency ?? null, months: existing?.months ?? null, excluded: existing?.excluded ?? false, ...fields, updated_at: new Date().toISOString() }
    await sb.from('dividend_config').upsert(row, { onConflict: 'user_id,ticker' })
    setConfig(c => ({ ...c, [ticker]: { ...c[ticker], ...row } }))
  }
  const toggleExcl = (ticker, val) => saveCfg(ticker, { excluded: val })
  const startEdit = (ticker, freq, months) => { setEditId(ticker); setDraft({ frequency: freq, months: [...months] }) }
  const toggleMonth = m => setDraft(d => ({ ...d, months: d.months.includes(m) ? d.months.filter(x => x !== m) : [...d.months, m].sort((a, b) => a - b) }))
  const saveEdit = async (ticker) => { await saveCfg(ticker, { frequency: Number(draft.frequency), months: draft.months }); setEditId(null) }

  return (
    <div style={{ ...CARD }}>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>Ajusta la frecuencia y los meses de pago de cada empresa cuando la detección automática no acierte. Excluye las que prefieras gestionar a mano.</p>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 640 }}>
          <thead><tr>{['Empresa', 'Frecuencia', 'Meses de pago', 'Método de cobro', 'Excluir prefill', ''].map((h, i) => (
            <th key={i} style={{ padding: '6px 8px', textAlign: 'left', color: 'var(--text-faint)', borderBottom: '1px solid var(--border)', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
          ))}</tr></thead>
          <tbody>
            {stocks.map(p => {
              const cfg = config[p.ticker]
              const det = detectFreqMonths(funds[p.ticker] || {}, p.currency)
              const freq = cfg?.frequency || det.freq
              const months = (Array.isArray(cfg?.months) && cfg.months.length) ? cfg.months : det.months
              const editing = editId === p.ticker
              return (
                <tr key={p.ticker} style={{ borderBottom: '1px solid var(--surface-2)' }}>
                  <td style={{ padding: '8px', color: 'var(--text)' }}>{nameOf(p.ticker)} <span style={{ color: 'var(--text-faintest)', fontSize: 10 }}>{p.ticker}</span></td>
                  <td style={{ padding: '8px' }}>
                    {editing ? (
                      <select value={draft.frequency} onChange={e => setDraft(d => ({ ...d, frequency: Number(e.target.value) }))} style={{ ...INPUT, width: 110 }}>
                        {[[12, 'Mensual'], [4, 'Trimestral'], [2, 'Semestral'], [1, 'Anual']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    ) : <span style={{ color: 'var(--text-muted)' }}>{FREQ_LABEL[freq] || `${freq}×`}</span>}
                  </td>
                  <td style={{ padding: '8px' }}>
                    {editing ? (
                      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                        {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                          <button key={m} onClick={() => toggleMonth(m)} style={{ fontSize: 9.5, padding: '2px 5px', borderRadius: 4, border: 'none', cursor: 'pointer', background: draft.months.includes(m) ? 'rgba(99,102,241,0.3)' : 'var(--surface-3)', color: draft.months.includes(m) ? 'var(--accent)' : 'var(--text-faint)' }}>{monthLabel(m)}</button>
                        ))}
                      </div>
                    ) : (
                      <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>{months.map(m => <span key={m} style={{ fontSize: 9.5, color: 'var(--text-muted)', background: 'var(--surface-3)', padding: '1px 6px', borderRadius: 4 }}>{monthLabel(m)}</span>)}</span>
                    )}
                  </td>
                  <td style={{ padding: '8px' }}>
                    {(() => { const method = p.dividend_payment_method || 'cash'; return (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <button onClick={() => setMethod(p.ticker, 'cash')} title="En efectivo" style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, border: 'none', cursor: 'pointer', background: method === 'cash' ? 'rgba(99,102,241,0.25)' : 'var(--surface-2)', color: method === 'cash' ? 'var(--accent)' : 'var(--text-faint)' }}>💵 Efectivo</button>
                        <button onClick={() => setMethod(p.ticker, 'stock')} title="En acciones" style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, border: 'none', cursor: 'pointer', background: method === 'stock' ? 'rgba(52,211,153,0.22)' : 'var(--surface-2)', color: method === 'stock' ? 'var(--positive)' : 'var(--text-faint)' }}>📈 Acciones</button>
                        {methodSaved === p.ticker && <span style={{ color: 'var(--positive)', fontSize: 13 }}>✓</span>}
                      </span>
                    ) })()}
                  </td>
                  <td style={{ padding: '8px' }}>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 11, color: cfg?.excluded ? 'var(--warning)' : 'var(--text-faint)' }}>
                      <input type="checkbox" checked={!!cfg?.excluded} onChange={e => toggleExcl(p.ticker, e.target.checked)} /> {cfg?.excluded ? 'Excluida' : ''}
                    </label>
                  </td>
                  <td style={{ padding: '8px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {editing ? (
                      <><button onClick={() => saveEdit(p.ticker)} style={mini(GREEN)} title="Guardar">💾</button><button onClick={() => setEditId(null)} style={mini('var(--text-muted)')} title="Cancelar">✕</button></>
                    ) : <button onClick={() => startEdit(p.ticker, freq, months)} style={mini('var(--accent)')} title="Editar">✏</button>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {stocks.length === 0 && <p style={{ fontSize: 13, color: 'var(--text-faint)', padding: '12px 0' }}>Añade acciones a tu cartera para configurar sus dividendos.</p>}
    </div>
  )
}
