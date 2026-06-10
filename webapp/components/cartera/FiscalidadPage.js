'use client'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { DICT } from '@/data/dict'
import { computeAutoEntries, countryCodeOf, fiscalWHT, COUNTRY_NAMES, nameOf } from '@/lib/fiscalidad'

const CARD = { background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 20 }
const BOX  = { background: 'rgba(13,18,32,0.85)', border: '1px solid rgba(129,140,248,0.35)', borderRadius: 12, padding: '16px 18px' }
const INPUT = { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(129,140,248,0.4)', borderRadius: 6, padding: '5px 7px', color: '#e0e8f0', fontSize: 12, outline: 'none', width: '100%', fontFamily: 'inherit', boxSizing: 'border-box' }

const fmtEUR = v => v == null || isNaN(v) ? '—' : Number(v).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
const fmtPct = v => v == null ? '—' : Number(v).toLocaleString('es-ES', { maximumFractionDigits: 3 }) + '%'
const fmtDate = d => d ? new Date(d).toLocaleDateString('es-ES') : '—'
const num = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n }
function flag(code) { if (!code || code.length !== 2) return '🌐'; try { return String.fromCodePoint(...[...code.toUpperCase()].map(c => 127397 + c.charCodeAt(0))) } catch { return '🌐' } }

function downloadCSV(filename, rows) {
  const csv = rows.map(r => r.map(c => { const s = c == null ? '' : String(c); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }).join(',')).join('\n')
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }))
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url)
}

const Th = (h, align = 'left') => <th key={h} style={{ padding: '6px 8px', textAlign: align, color: '#4a5270', borderBottom: '1px solid rgba(255,255,255,0.06)', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>

function StatusBadges({ e }) {
  return (
    <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
      {e.source === 'manual'
        ? <span style={{ fontSize: 9.5, fontWeight: 700, color: '#fb923c', background: 'rgba(251,146,60,0.14)', padding: '1px 6px', borderRadius: 4 }}>Editado ✏</span>
        : <span style={{ fontSize: 9.5, fontWeight: 700, color: '#60a5fa', background: 'rgba(96,165,250,0.14)', padding: '1px 6px', borderRadius: 4 }}>Auto 🤖</span>}
      {e.is_confirmed && <span style={{ fontSize: 9.5, fontWeight: 700, color: '#34d399', background: 'rgba(52,211,153,0.14)', padding: '1px 6px', borderRadius: 4 }}>✓ Confirmado</span>}
    </span>
  )
}

function Progress({ confirmed, total }) {
  const pct = total > 0 ? confirmed / total * 100 : 0
  const done = total > 0 && confirmed === total
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
        <span style={{ fontSize: 11, color: done ? '#34d399' : '#8090a8', fontWeight: done ? 700 : 500 }}>
          {done ? '✓ Todas las entradas confirmadas — tu resumen fiscal está listo' : `${confirmed} de ${total} entradas confirmadas`}
        </span>
      </div>
      <div style={{ height: 5, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: done ? '#34d399' : '#818cf8', borderRadius: 3, transition: 'width 0.2s' }} />
      </div>
    </div>
  )
}

function ActionBtns({ children }) {
  return <span style={{ display: 'inline-flex', gap: 2, whiteSpace: 'nowrap' }}>{children}</span>
}
const mini = c => ({ background: 'none', border: 'none', cursor: 'pointer', color: c, fontSize: 13, padding: '2px 4px' })

export default function FiscalidadPage({ isPremium, countryResidence }) {
  const router = useRouter()
  const sb = useMemo(() => createClient(), [])
  const [loading, setLoading] = useState(true)
  const [prefilling, setPrefilling] = useState(false)
  const [entries, setEntries] = useState([])
  const [positions, setPositions] = useState([])
  const [transactions, setTransactions] = useState([])
  const [fundamentals, setFundamentals] = useState({})
  const [year, setYear] = useState(new Date().getFullYear())
  const [editId, setEditId] = useState(null)
  const [draft, setDraft] = useState({})
  const [adding, setAdding] = useState(false)
  const [addDraft, setAddDraft] = useState({ query: '', ticker: '', company_name: '', country: '', shares: '', dps: '', pct: '' })
  const [delId, setDelId] = useState(null)
  const [showExcluded, setShowExcluded] = useState(false)

  const fetchEntries = useCallback(async (uid, ex) => {
    const { data } = await sb.from('fiscal_entries').select('*').eq('user_id', uid).eq('exercise', ex).eq('deleted', false)
    setEntries(data || [])
    return data || []
  }, [sb])

  const load = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await sb.auth.getUser()
    if (!user) { router.push('/login'); return }
    const [{ data: pos }, { data: tx }] = await Promise.all([
      sb.from('positions').select('*').eq('user_id', user.id),
      sb.from('transactions').select('*').eq('user_id', user.id),
    ])
    setPositions(pos || []); setTransactions(tx || [])
    const tickers = [...new Set([...(pos || []).map(p => p.ticker), ...(tx || []).map(t => t.ticker)])]
    if (tickers.length) {
      const { data: funds } = await sb.from('company_fundamentals').select('ticker, country, div_history, dividend_events').in('ticker', tickers)
      setFundamentals(Object.fromEntries((funds || []).map(f => [f.ticker, f])))
    }
    // Prefill automático si no hay entradas para el ejercicio
    let data = await fetchEntries(user.id, year)
    if (data.length === 0 && countryResidence === 'ES') {
      setPrefilling(true)
      try { await fetch('/api/fiscal/prefill', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ exercise: year }) }) } catch {}
      data = await fetchEntries(user.id, year)
      setPrefilling(false)
    }
    setLoading(false)
  }, [sb, router, year, countryResidence, fetchEntries])

  useEffect(() => { load() }, [load])

  const recalc = async () => {
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return
    setPrefilling(true)
    try { await fetch('/api/fiscal/prefill', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ exercise: year, force: true }) }) } catch {}
    await fetchEntries(user.id, year)
    setPrefilling(false)
  }

  // Avisos (recalculados en cliente)
  const { missingDivHistory, excludedSells } = useMemo(
    () => computeAutoEntries({ positions, transactions, fundamentals, exercise: year }),
    [positions, transactions, fundamentals, year]
  )

  const years = useMemo(() => {
    const ys = new Set([new Date().getFullYear()])
    transactions.forEach(t => t.date && ys.add(new Date(t.date).getFullYear()))
    entries.forEach(e => ys.add(e.exercise))
    return [...ys].sort((a, b) => b - a)
  }, [transactions, entries])

  const divs  = useMemo(() => entries.filter(e => e.type === 'dividend').sort((a, b) => (b.gross_amount || 0) - (a.gross_amount || 0)), [entries])
  const gains = useMemo(() => entries.filter(e => e.type === 'gain' || e.type === 'loss').sort((a, b) => new Date(a.sell_date) - new Date(b.sell_date)), [entries])

  // ── Totales / casillas (en tiempo real desde las entradas) ──
  const totals = useMemo(() => {
    const grossDiv = divs.reduce((s, e) => s + num(e.gross_amount), 0)
    const retTotal = divs.reduce((s, e) => s + num(e.withholding_origin), 0)
    const retSpain = divs.filter(e => e.country === 'ES').reduce((s, e) => s + num(e.withholding_origin), 0)
    const deductible = divs.filter(e => e.country !== 'ES').reduce((s, e) => s + Math.min(num(e.withholding_origin), num(e.gross_amount) * 0.15), 0)
    const gainsSum = gains.filter(e => num(e.gain_loss) > 0).reduce((s, e) => s + num(e.gain_loss), 0)
    const lossesSum = gains.filter(e => num(e.gain_loss) < 0).reduce((s, e) => s + Math.abs(num(e.gain_loss)), 0)
    const netCG = gainsSum - lossesSum
    const taxBase = (grossDiv - retTotal) + netCG
    const total = entries.length
    const confirmed = entries.filter(e => e.is_confirmed).length
    return {
      grossDiv, retTotal, retSpain, deductible, gainsSum, lossesSum, netCG, taxBase,
      total, confirmed, allConfirmed: total > 0 && confirmed === total,
      boxes: { '0029': grossDiv, '0031': retSpain, '0380': gainsSum, '0382': lossesSum, '0588': deductible },
    }
  }, [divs, gains, entries])

  // ── CRUD ──
  const patch = async (id, fields) => {
    await sb.from('fiscal_entries').update({ ...fields, updated_at: new Date().toISOString() }).eq('id', id)
    setEntries(es => es.map(e => e.id === id ? { ...e, ...fields } : e))
  }
  const confirm = id => patch(id, { is_confirmed: true })
  const softDelete = async id => { await patch(id, { deleted: true }); setEntries(es => es.filter(e => e.id !== id)); setDelId(null) }

  const startEdit = e => {
    setEditId(e.id)
    if (e.type === 'dividend') setDraft({ shares: e.shares ?? '', dps: e.dps ?? '', pct: e.withholding_origin_pct ?? '' })
    else setDraft({ buy: e.buy_price_total ?? '', sell: e.sell_price_total ?? '' })
  }
  const saveDiv = async (e) => {
    const shares = num(draft.shares), dps = num(draft.dps), pct = num(draft.pct)
    const gross = shares * dps, wh = gross * pct / 100
    await patch(e.id, { shares, dps, withholding_origin_pct: pct, gross_amount: gross, withholding_origin: wh, net_amount: gross - wh, source: 'manual', is_manual: true, is_confirmed: true })
    setEditId(null)
  }
  const saveGain = async (e) => {
    const buy = num(draft.buy), sell = num(draft.sell), gl = sell - buy
    await patch(e.id, { buy_price_total: buy, sell_price_total: sell, gain_loss: gl, type: gl >= 0 ? 'gain' : 'loss', source: 'manual', is_manual: true, is_confirmed: true })
    setEditId(null)
  }

  const addResults = useMemo(() => {
    const q = addDraft.query.trim().toLowerCase()
    if (q.length < 1) return []
    return DICT.filter(d => d[0].toLowerCase().includes(q) || d[1].toLowerCase().includes(q)).slice(0, 6)
  }, [addDraft.query])
  const pickAdd = d => setAddDraft(a => ({ ...a, query: d[0], ticker: d[1], company_name: d[0], country: d[2], pct: String(fiscalWHT(d[2])) }))
  const saveAdd = async () => {
    const { data: { user } } = await sb.auth.getUser()
    if (!user || !addDraft.ticker) return
    const shares = num(addDraft.shares), dps = num(addDraft.dps), pct = num(addDraft.pct)
    const gross = shares * dps, wh = gross * pct / 100
    const row = {
      user_id: user.id, exercise: year, type: 'dividend', ticker: addDraft.ticker, company_name: addDraft.company_name,
      country: addDraft.country, shares, dps, gross_amount: gross, withholding_origin_pct: pct,
      withholding_origin: wh, net_amount: gross - wh, source: 'manual', is_manual: true, is_confirmed: true, deleted: false,
    }
    const { data } = await sb.from('fiscal_entries').insert(row).select().single()
    if (data) setEntries(es => [...es, data])
    setAdding(false); setAddDraft({ query: '', ticker: '', company_name: '', country: '', shares: '', dps: '', pct: '' })
  }

  const exportBoxesCSV = () => {
    const r = [['Casilla', 'Concepto', 'Importe (EUR)'],
      ['0029', 'Dividendos íntegros', totals.boxes['0029'].toFixed(2)],
      ['0031', 'Retenciones sobre dividendos', totals.boxes['0031'].toFixed(2)],
      ['0380', 'Ganancias patrimoniales', totals.boxes['0380'].toFixed(2)],
      ['0382', 'Pérdidas patrimoniales', totals.boxes['0382'].toFixed(2)],
      ['0588', 'Deducción doble imposición', totals.boxes['0588'].toFixed(2)]]
    downloadCSV(`fiscalidad_${year}.csv`, r)
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#4a5270' }}>Cargando…{prefilling ? ' calculando prefill fiscal…' : ''}</div>

  // ── No residente en España ──
  if (countryResidence !== 'ES') {
    const pais = COUNTRY_NAMES[countryResidence] || countryResidence
    return (
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '40px 16px 64px' }}>
        <div style={{ background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 14, padding: '32px 28px', textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🌍</div>
          <h2 style={{ fontSize: 20, fontWeight: 900, color: '#e0e8f0', marginBottom: 12 }}>Fiscalidad internacional — Próximamente</h2>
          <p style={{ fontSize: 14, color: '#8090a8', lineHeight: 1.7, maxWidth: 480, margin: '0 auto 20px' }}>
            Estamos trabajando en el módulo fiscal para {pais}. Por ahora solo tenemos disponible el módulo para residentes en España. Te avisaremos cuando esté disponible para tu país.
          </p>
          <Link href="/ajustes" style={{ padding: '10px 20px', background: 'rgba(99,102,241,0.85)', borderRadius: 9, color: '#fff', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>Cambiar país de residencia</Link>
        </div>
      </div>
    )
  }

  const t = totals

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 16px 64px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, color: '#e0e8f0' }}>Fiscalidad</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={recalc} disabled={prefilling} style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 8, padding: '7px 12px', color: '#818cf8', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            {prefilling ? '…' : '↻ Recalcular automáticamente'}
          </button>
          <span style={{ fontSize: 12, color: '#4a5270' }}>Ejercicio</span>
          <select value={year} onChange={e => setYear(Number(e.target.value))} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '7px 12px', color: '#c8d0e0', fontSize: 13, outline: 'none' }}>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {/* Resumen ejecutivo */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, marginBottom: 16 }}>
        <SummaryCard label="Rendimientos de capital" value={fmtEUR(t.grossDiv)} sub="Dividendos brutos cobrados" col="#34d399" />
        <SummaryCard label="Retenciones totales" value={fmtEUR(t.retTotal)} sub="Origen + destino" col="#fb923c" />
        <SummaryCard label="Ganancias/pérdidas" value={(t.netCG >= 0 ? '+' : '') + fmtEUR(t.netCG)} sub="Resultado de transmisiones" col={t.netCG >= 0 ? '#34d399' : '#f87171'} />
        <SummaryCard label="Base del ahorro estimada" value={fmtEUR(t.taxBase)} sub="Estimación orientativa" col="#818cf8" />
      </div>

      {/* Indicador de confirmación global */}
      <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 8, background: t.allConfirmed ? 'rgba(52,211,153,0.06)' : 'rgba(251,191,36,0.06)', border: `1px solid ${t.allConfirmed ? 'rgba(52,211,153,0.2)' : 'rgba(251,191,36,0.2)'}` }}>
        <p style={{ fontSize: 12, color: t.allConfirmed ? '#34d399' : '#fbbf24' }}>
          {t.total === 0 ? 'Sin entradas fiscales todavía para este ejercicio.'
            : t.allConfirmed ? `✓ Resumen basado en ${t.confirmed} entradas confirmadas`
            : `⚠ ${t.total - t.confirmed} entradas pendientes de confirmar — los importes pueden variar`}
        </p>
      </div>

      {!isPremium ? (
        <div style={{ ...CARD, textAlign: 'center', padding: '32px 20px' }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: '#818cf8', marginBottom: 6 }}>Prefill fiscal y casillas de la renta — Premium</p>
          <p style={{ fontSize: 12, color: '#4a5270', marginBottom: 14, maxWidth: 440, marginInline: 'auto' }}>El cálculo automático de dividendos y plusvalías, la edición y las casillas de la renta están disponibles con Premium.</p>
          <Link href="/pricing" style={{ padding: '9px 18px', background: 'rgba(99,102,241,0.85)', borderRadius: 8, color: '#fff', fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>Activar Premium →</Link>
        </div>
      ) : (
        <>
          {/* ── DIVIDENDOS ── */}
          <div style={{ ...CARD, marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              <p style={{ fontSize: 13, fontWeight: 800, color: '#e0e8f0' }}>Rendimientos del capital mobiliario — Dividendos</p>
              <button onClick={() => setAdding(a => !a)} style={{ background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.3)', borderRadius: 7, padding: '6px 12px', color: '#34d399', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>+ Añadir dividendo</button>
            </div>
            <Progress confirmed={divs.filter(e => e.is_confirmed).length} total={divs.length} />

            {missingDivHistory.length > 0 && (
              <div style={{ background: 'rgba(251,191,36,0.07)', border: '1px solid rgba(251,191,36,0.2)', borderRadius: 8, padding: '9px 13px', marginBottom: 12 }}>
                <p style={{ fontSize: 11.5, color: '#fbbf24' }}>{missingDivHistory.length} empresa(s) sin historial de dividendos disponible — añade manualmente si procede: {missingDivHistory.map(m => m.name).join(', ')}</p>
              </div>
            )}

            {divs.length === 0 && !adding ? (
              <p style={{ fontSize: 13, color: '#4a5270' }}>No hay dividendos calculados para {year}.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 820 }}>
                  <thead><tr>{[Th('Empresa'), Th('Acciones', 'right'), Th('DPS', 'right'), Th('Bruto', 'right'), Th('País / %ret.', 'right'), Th('Retención', 'right'), Th('Neto', 'right'), Th('Estado'), Th('')]}</tr></thead>
                  <tbody>
                    {divs.map(e => {
                      const editing = editId === e.id
                      const g = editing ? num(draft.shares) * num(draft.dps) : num(e.gross_amount)
                      const wh = editing ? g * num(draft.pct) / 100 : num(e.withholding_origin)
                      return (
                        <tr key={e.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          <td style={{ padding: '7px 8px', color: '#c8d0e0' }}>{flag(e.country)} {e.company_name || nameOf(e.ticker)} <span style={{ color: '#3a4260', fontSize: 10 }}>{e.ticker}</span></td>
                          <td style={{ padding: '7px 8px', textAlign: 'right' }}>{editing ? <input style={INPUT} type="number" step="any" value={draft.shares} onChange={ev => setDraft(d => ({ ...d, shares: ev.target.value }))} /> : <span style={{ color: '#8090a8' }}>{Number(e.shares).toLocaleString('es-ES', { maximumFractionDigits: 4 })}</span>}</td>
                          <td style={{ padding: '7px 8px', textAlign: 'right' }}>{editing ? <input style={INPUT} type="number" step="0.0001" value={draft.dps} onChange={ev => setDraft(d => ({ ...d, dps: ev.target.value }))} /> : <span style={{ color: '#8090a8' }}>{Number(e.dps).toLocaleString('es-ES', { maximumFractionDigits: 4 })}</span>}</td>
                          <td style={{ padding: '7px 8px', textAlign: 'right', color: '#34d399', fontWeight: 600 }}>{fmtEUR(g)}</td>
                          <td style={{ padding: '7px 8px', textAlign: 'right', whiteSpace: 'nowrap' }}>{COUNTRY_NAMES[e.country] || e.country} · {editing ? <input style={{ ...INPUT, width: 56, display: 'inline-block' }} type="number" step="any" value={draft.pct} onChange={ev => setDraft(d => ({ ...d, pct: ev.target.value }))} /> : fmtPct(e.withholding_origin_pct)}</td>
                          <td style={{ padding: '7px 8px', textAlign: 'right', color: '#fb923c' }}>{fmtEUR(wh)}</td>
                          <td style={{ padding: '7px 8px', textAlign: 'right', color: '#c8d0e0', fontWeight: 600 }}>{fmtEUR(g - wh)}</td>
                          <td style={{ padding: '7px 8px' }}><StatusBadges e={e} /></td>
                          <td style={{ padding: '7px 8px', textAlign: 'right' }}>
                            {editing ? (
                              <ActionBtns><button onClick={() => saveDiv(e)} style={mini('#34d399')} title="Guardar">💾</button><button onClick={() => setEditId(null)} style={mini('#8090a8')} title="Cancelar">✕</button></ActionBtns>
                            ) : delId === e.id ? (
                              <span style={{ fontSize: 10.5, color: '#fbbf24' }}>¿Eliminar? <button onClick={() => softDelete(e.id)} style={mini('#f87171')}>Sí</button><button onClick={() => setDelId(null)} style={mini('#8090a8')}>No</button></span>
                            ) : (
                              <ActionBtns>
                                <button onClick={() => startEdit(e)} style={mini('#818cf8')} title="Editar">✏</button>
                                {!e.is_confirmed && <button onClick={() => confirm(e.id)} style={mini('#34d399')} title="Confirmar">✓</button>}
                                <button onClick={() => setDelId(e.id)} style={mini('#f87171')} title="Eliminar">🗑</button>
                              </ActionBtns>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                    {adding && (
                      <tr style={{ background: 'rgba(52,211,153,0.04)' }}>
                        <td style={{ padding: '7px 8px', position: 'relative' }}>
                          <input style={INPUT} placeholder="Buscar empresa…" value={addDraft.query} onChange={ev => setAddDraft(a => ({ ...a, query: ev.target.value, ticker: '' }))} />
                          {addResults.length > 0 && !addDraft.ticker && (
                            <div style={{ position: 'absolute', zIndex: 20, top: '100%', left: 0, right: 0, background: '#10172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, marginTop: 2, maxHeight: 200, overflowY: 'auto' }}>
                              {addResults.map(d => <button key={d[1]} onClick={() => pickAdd(d)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px', background: 'none', border: 'none', cursor: 'pointer', color: '#c8d0e0', fontSize: 12 }}>{d[0]} <span style={{ color: '#4a5270' }}>{d[1]}</span></button>)}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '7px 8px' }}><input style={INPUT} type="number" step="any" placeholder="acc." value={addDraft.shares} onChange={ev => setAddDraft(a => ({ ...a, shares: ev.target.value }))} /></td>
                        <td style={{ padding: '7px 8px' }}><input style={INPUT} type="number" step="0.0001" placeholder="DPS" value={addDraft.dps} onChange={ev => setAddDraft(a => ({ ...a, dps: ev.target.value }))} /></td>
                        <td style={{ padding: '7px 8px', textAlign: 'right', color: '#34d399' }}>{fmtEUR(num(addDraft.shares) * num(addDraft.dps))}</td>
                        <td style={{ padding: '7px 8px' }}><input style={INPUT} type="number" step="any" placeholder="% ret." value={addDraft.pct} onChange={ev => setAddDraft(a => ({ ...a, pct: ev.target.value }))} /></td>
                        <td colSpan={2} style={{ padding: '7px 8px', textAlign: 'right', color: '#4a5270' }}>{addDraft.country ? `${COUNTRY_NAMES[addDraft.country] || addDraft.country}` : ''}</td>
                        <td colSpan={2} style={{ padding: '7px 8px', textAlign: 'right' }}>
                          <ActionBtns><button onClick={saveAdd} disabled={!addDraft.ticker} style={mini('#34d399')} title="Guardar">💾</button><button onClick={() => { setAdding(false); setAddDraft({ query: '', ticker: '', company_name: '', country: '', shares: '', dps: '', pct: '' }) }} style={mini('#8090a8')} title="Cancelar">✕</button></ActionBtns>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── GANANCIAS Y PÉRDIDAS ── */}
          <div style={{ ...CARD, marginBottom: 16 }}>
            <p style={{ fontSize: 13, fontWeight: 800, color: '#e0e8f0', marginBottom: 12 }}>Ganancias y pérdidas patrimoniales — Transmisiones (FIFO)</p>
            <Progress confirmed={gains.filter(e => e.is_confirmed).length} total={gains.length} />
            {gains.length === 0 ? (
              <p style={{ fontSize: 13, color: '#4a5270' }}>No tienes transmisiones registradas en {year}.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 820 }}>
                  <thead><tr>{[Th('Empresa'), Th('F. compra'), Th('F. venta'), Th('Acciones', 'right'), Th('Coste compra', 'right'), Th('Venta neta', 'right'), Th('Resultado', 'right'), Th('Estado'), Th('')]}</tr></thead>
                  <tbody>
                    {gains.map(e => {
                      const editing = editId === e.id
                      const gl = editing ? num(draft.sell) - num(draft.buy) : num(e.gain_loss)
                      return (
                        <tr key={e.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          <td style={{ padding: '7px 8px', color: '#c8d0e0' }}>{e.company_name || nameOf(e.ticker)} <span style={{ color: '#3a4260', fontSize: 10 }}>{e.ticker}</span></td>
                          <td style={{ padding: '7px 8px', color: '#8090a8', whiteSpace: 'nowrap' }}>{fmtDate(e.buy_date)}</td>
                          <td style={{ padding: '7px 8px', color: '#8090a8', whiteSpace: 'nowrap' }}>{fmtDate(e.sell_date)}</td>
                          <td style={{ padding: '7px 8px', textAlign: 'right', color: '#8090a8' }}>{Number(e.shares).toLocaleString('es-ES', { maximumFractionDigits: 4 })}</td>
                          <td style={{ padding: '7px 8px', textAlign: 'right' }}>{editing ? <input style={INPUT} type="number" step="any" value={draft.buy} onChange={ev => setDraft(d => ({ ...d, buy: ev.target.value }))} /> : <span style={{ color: '#8090a8' }}>{fmtEUR(e.buy_price_total)}</span>}</td>
                          <td style={{ padding: '7px 8px', textAlign: 'right' }}>{editing ? <input style={INPUT} type="number" step="any" value={draft.sell} onChange={ev => setDraft(d => ({ ...d, sell: ev.target.value }))} /> : <span style={{ color: '#8090a8' }}>{fmtEUR(e.sell_price_total)}</span>}</td>
                          <td style={{ padding: '7px 8px', textAlign: 'right', fontWeight: 700, color: gl >= 0 ? '#34d399' : '#f87171' }}>{(gl >= 0 ? '+' : '') + fmtEUR(gl)}</td>
                          <td style={{ padding: '7px 8px' }}><StatusBadges e={e} /></td>
                          <td style={{ padding: '7px 8px', textAlign: 'right' }}>
                            {editing ? (
                              <ActionBtns><button onClick={() => saveGain(e)} style={mini('#34d399')} title="Guardar">💾</button><button onClick={() => setEditId(null)} style={mini('#8090a8')} title="Cancelar">✕</button></ActionBtns>
                            ) : delId === e.id ? (
                              <span style={{ fontSize: 10.5, color: '#fbbf24' }}>¿Eliminar? <button onClick={() => softDelete(e.id)} style={mini('#f87171')}>Sí</button><button onClick={() => setDelId(null)} style={mini('#8090a8')}>No</button></span>
                            ) : (
                              <ActionBtns>
                                <button onClick={() => startEdit(e)} style={mini('#818cf8')} title="Editar">✏</button>
                                {!e.is_confirmed && <button onClick={() => confirm(e.id)} style={mini('#34d399')} title="Confirmar">✓</button>}
                                <button onClick={() => setDelId(e.id)} style={mini('#f87171')} title="Eliminar">🗑</button>
                              </ActionBtns>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p style={{ fontSize: 10.5, color: '#4a5270', marginTop: 10 }}>Cálculo por método <b style={{ color: '#8090a8' }}>FIFO</b> (primera entrada, primera salida), el establecido por la Agencia Tributaria para acciones cotizadas.</p>

            {excludedSells.length > 0 && (
              <div style={{ background: 'rgba(251,191,36,0.07)', border: '1px solid rgba(251,191,36,0.2)', borderRadius: 8, padding: '10px 14px', marginTop: 12 }}>
                <button onClick={() => setShowExcluded(s => !s)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fbbf24', fontSize: 12, fontWeight: 700, padding: 0 }}>
                  ⚠ {excludedSells.length} venta(s) no incluida(s) por falta de compra registrada {showExcluded ? '▲' : '▼'}
                </button>
                {showExcluded && (
                  <div style={{ marginTop: 8 }}>
                    {excludedSells.map((x, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11.5, color: '#8090a8', padding: '4px 0', gap: 10 }}>
                        <span>{x.name} <span style={{ color: '#3a4260' }}>{x.ticker}</span> · {Number(x.shares).toLocaleString('es-ES', { maximumFractionDigits: 4 })} acc. · venta {fmtDate(x.sell_date)}</span>
                        <Link href={`/cartera/nueva-posicion?ticker=${encodeURIComponent(x.ticker)}&type=stock`} style={{ color: '#60a5fa', fontWeight: 700, whiteSpace: 'nowrap' }}>Añadir compra →</Link>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── RESUMEN DE CASILLAS ── */}
          <div style={{ ...CARD, marginBottom: 16 }}>
            <p style={{ fontSize: 13, fontWeight: 800, color: '#e0e8f0', marginBottom: 12 }}>Resumen para la renta {year}</p>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr>{[Th('Casilla'), Th('Concepto'), Th('Importe', 'right')]}</tr></thead>
                <tbody>
                  {[['0029', 'Dividendos íntegros', t.boxes['0029']], ['0031', 'Retenciones sobre dividendos', t.boxes['0031']], ['0380', 'Ganancias patrimoniales', t.boxes['0380']], ['0382', 'Pérdidas patrimoniales', t.boxes['0382']], ['0588', 'Deducción doble imposición', t.boxes['0588']]].map(([b, c, a]) => (
                    <tr key={b} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding: '8px', color: '#818cf8', fontWeight: 700 }}>{b}</td>
                      <td style={{ padding: '8px', color: '#c8d0e0' }}>{c}</td>
                      <td style={{ padding: '8px', textAlign: 'right', color: '#e0e8f0', fontWeight: 700 }}>{fmtEUR(a)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ fontSize: 11.5, color: t.allConfirmed ? '#34d399' : '#fbbf24', marginTop: 10 }}>
              {t.allConfirmed ? `✓ Basado en ${t.confirmed} entradas confirmadas` : `⚠ ${t.total - t.confirmed} entradas pendientes de confirmar — los importes pueden variar`}
            </p>
            <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
              <button onClick={() => window.print()} style={{ padding: '9px 16px', background: 'rgba(99,102,241,0.85)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Exportar como PDF</button>
              <button onClick={exportBoxesCSV} style={{ padding: '9px 16px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: '#c8d0e0', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Exportar como CSV</button>
            </div>
            <p style={{ fontSize: 10, color: '#2e3a55', marginTop: 12 }}>Las casillas son las vigentes para el ejercicio 2024-2025. Verifica que las casillas corresponden al ejercicio que estás declarando.</p>
          </div>
        </>
      )}

      {/* Aviso legal */}
      <div style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.2)', borderRadius: 10, padding: '14px 18px', marginTop: 8 }}>
        <p style={{ fontSize: 11.5, color: '#a98a4a', lineHeight: 1.65 }}>
          ⚠ Esta información es orientativa y está basada en los datos que has introducido en la app. No constituye asesoramiento fiscal. Los importes calculados pueden diferir de los reales si hay operaciones no registradas, ajustes de valor o circunstancias fiscales particulares. Consulta siempre con un asesor fiscal antes de presentar tu declaración.
        </p>
      </div>
    </div>
  )
}

function SummaryCard({ label, value, sub, col }) {
  return (
    <div style={{ ...CARD, padding: '16px 18px' }}>
      <p style={{ fontSize: 10.5, color: '#4a5270', marginBottom: 6 }}>{label}</p>
      <p style={{ fontSize: 21, fontWeight: 900, color: col }}>{value}</p>
      <p style={{ fontSize: 10, color: '#3a4260', marginTop: 4 }}>{sub}</p>
    </div>
  )
}
