'use client'
import { useState, useEffect, useMemo, useRef } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { DICT } from '@/data/dict'
import { enrichPositions, calcConcentration } from '@/lib/portfolio'
import { getCountry } from '@/lib/helpers'
import {
  buildHypotheticalPositions, entriesWithinHorizon, entryShares, entryCostEUR,
  entryMidPrice, monthsSinceNewPosition, positionWeights, equalWeightFit,
} from '@/lib/purchase-plan'

const BASE_COLS = 'ticker, current_price, dps, payout_fcf, payout_eps, debt_ebitda, interest_coverage, fcf_cagr5, div_cagr5, div_history, sector, industry, country'
const CARD = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 18, marginBottom: 16 }
const INPUT = { background: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: 7, padding: '7px 9px', color: 'var(--text)', fontSize: 12.5, outline: 'none' }
const LABEL = { fontSize: 10.5, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }
const GREEN = 'var(--positive)', RED = 'var(--negative)', AMBER = 'var(--warning)', ACCENT = 'var(--accent)'
const fmtEUR = (v, d = 0) => v == null ? '—' : v.toLocaleString('es-ES', { maximumFractionDigits: d }) + ' €'
const fmtPct = (v, d = 1) => v == null ? '—' : v.toFixed(d) + '%'
const todayStr = () => new Date().toISOString().slice(0, 10)
const STATUS = { pending: { label: 'Pendiente', col: AMBER }, executed: { label: 'Ejecutada', col: GREEN }, discarded: { label: 'Descartada', col: 'var(--text-faint)' } }
const EMPTY = { query: '', ticker: '', company_name: '', currency: 'EUR', target_date: '', mode: 'amount', amount_eur: '', shares: '', price_min: '', price_max: '', notes: '' }

// Distribución por PAÍS (%). Agrupa el valor por countryCode; no reimplementa la
// concentración por sector/zona (calcConcentration), solo aporta granularidad de país.
function byCountry(enriched) {
  const total = enriched.reduce((s, p) => s + (p.valueEUR ?? 0), 0)
  if (!total) return []
  const map = {}
  enriched.forEach(p => { const k = p.countryCode || '—'; map[k] = (map[k] || 0) + (p.valueEUR ?? 0) })
  return Object.entries(map).map(([code, v]) => {
    const c = getCountry(code)
    return { name: `${c.flag || ''} ${c.name || code}`.trim(), value: v / total * 100 }
  }).sort((a, b) => b.value - a.value)
}

export default function CalendarioComprasClient() {
  const sb = useRef(createClient()).current
  const [positions, setPositions] = useState([])
  const [plan, setPlan] = useState([])
  const [transactions, setTransactions] = useState([])
  const [fundMap, setFundMap] = useState({})
  const [fundsMap, setFundsMap] = useState({})
  const [watchMap, setWatchMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [horizon, setHorizon] = useState(12)
  const [cfg, setCfg] = useState({ seqMonths: 3, concPct: 15 })
  const [draft, setDraft] = useState(EMPTY)
  const [editId, setEditId] = useState(null)
  const [adding, setAdding] = useState(false)

  useEffect(() => { try { const s = JSON.parse(localStorage.getItem('purchasePlanCfg') || 'null'); if (s) setCfg(c => ({ ...c, ...s })) } catch {} }, [])
  const saveCfg = patch => setCfg(c => { const n = { ...c, ...patch }; try { localStorage.setItem('purchasePlanCfg', JSON.stringify(n)) } catch {} ; return n })

  const load = async () => {
    setLoading(true)
    const { data: { user } } = await sb.auth.getUser()
    if (!user) { setLoading(false); return }
    const [{ data: pos }, { data: pl }, { data: txs }, { data: wl }] = await Promise.all([
      sb.from('positions').select('*').eq('user_id', user.id),
      sb.from('purchase_plan').select('*').eq('user_id', user.id),
      sb.from('transactions').select('ticker, type, date').eq('user_id', user.id),
      sb.from('watchlist').select('ticker, target_price, target_yield').eq('user_id', user.id),
    ])
    setPositions(pos || [])
    setPlan(pl || [])
    setTransactions(txs || [])
    setWatchMap(Object.fromEntries((wl || []).map(w => [w.ticker, w])))

    const tickers = [...new Set([...(pos || []).map(p => p.ticker), ...(pl || []).map(p => p.ticker)])]
    const stockTk = tickers.filter(t => !(pos || []).some(p => p.ticker === t && p.asset_type && p.asset_type !== 'stock'))
    const fundTk = (pos || []).filter(p => p.asset_type && p.asset_type !== 'stock').map(p => p.ticker)
    if (stockTk.length) {
      let res = await sb.from('company_fundamentals').select(`${BASE_COLS}, payout_affo, payout_nii`).in('ticker', stockTk)
      if (res.error) res = await sb.from('company_fundamentals').select(BASE_COLS).in('ticker', stockTk)
      setFundMap(Object.fromEntries((res.data || []).map(f => [f.ticker, f])))
    }
    if (fundTk.length) {
      const { data: fn } = await sb.from('funds').select('*').in('ticker', fundTk)
      setFundsMap(Object.fromEntries((fn || []).map(f => [f.ticker, f])))
    }
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  // ── Enriquecido actual + hipotético (reutiliza enrichPositions + calcConcentration) ──
  const enriched = useMemo(() => enrichPositions(positions, fundMap, fundsMap), [positions, fundMap, fundsMap])
  const pendingHorizon = useMemo(() => entriesWithinHorizon(plan, horizon), [plan, horizon])
  const hypEnriched = useMemo(() => enrichPositions(buildHypotheticalPositions(positions, pendingHorizon), fundMap, fundsMap), [positions, pendingHorizon, fundMap, fundsMap])
  const curConc = useMemo(() => calcConcentration(enriched), [enriched])
  const hypConc = useMemo(() => calcConcentration(hypEnriched), [hypEnriched])
  const curWeights = useMemo(() => positionWeights(enriched), [enriched])
  const hypWeights = useMemo(() => positionWeights(hypEnriched), [hypEnriched])
  const curTotal = useMemo(() => enriched.reduce((s, p) => s + (p.valueEUR ?? 0), 0), [enriched])
  const hypTotal = useMemo(() => hypEnriched.reduce((s, p) => s + (p.valueEUR ?? 0), 0), [hypEnriched])

  // ── Avisos de secuencia ──
  const monthsSince = useMemo(() => monthsSinceNewPosition(transactions), [transactions])
  const noNewAlert = monthsSince != null && monthsSince >= cfg.seqMonths
  // Impacto de concentración por entrada pendiente (aplicada individualmente)
  const entryImpacts = useMemo(() => {
    return (plan || []).filter(e => e.status === 'pending').map(e => {
      const he = enrichPositions(buildHypotheticalPositions(positions, [e]), fundMap, fundsMap)
      const conc = calcConcentration(he)
      const w = positionWeights(he)
      const overSector = conc.bySector.find(s => s.value > cfg.concPct) || null
      const posW = w.find(x => x.ticker === e.ticker)
      const overPos = posW && posW.pct > cfg.concPct ? posW : null
      return { id: e.id, ticker: e.ticker, name: e.company_name || e.ticker, overSector, overPos }
    }).filter(x => x.overSector || x.overPos)
  }, [plan, positions, fundMap, fundsMap, cfg.concPct])

  // ── Búsqueda de empresa (todo el universo) ──
  const results = useMemo(() => {
    const q = draft.query.trim().toLowerCase()
    if (q.length < 1) return []
    return DICT.filter(d => d[0].toLowerCase().includes(q) || d[1].toLowerCase().includes(q)).slice(0, 8)
  }, [draft.query])
  const pick = d => setDraft(a => ({ ...a, ticker: d[1], company_name: d[0], currency: d[3] || 'EUR', query: d[0] }))

  // ── CRUD ──
  const resetForm = () => { setDraft(EMPTY); setEditId(null); setAdding(false) }
  const rowFromDraft = () => ({
    ticker: draft.ticker.trim().toUpperCase(), company_name: draft.company_name || null, currency: draft.currency || 'EUR',
    target_date: draft.target_date || null,
    amount_eur: draft.mode === 'amount' && draft.amount_eur !== '' ? Number(draft.amount_eur) : null,
    shares: draft.mode === 'shares' && draft.shares !== '' ? Number(draft.shares) : null,
    price_min: draft.price_min !== '' ? Number(draft.price_min) : null,
    price_max: draft.price_max !== '' ? Number(draft.price_max) : null,
    notes: draft.notes || null,
  })
  const save = async () => {
    if (!draft.ticker) return
    const { data: { user } } = await sb.auth.getUser(); if (!user) return
    const row = rowFromDraft()
    if (editId) {
      await sb.from('purchase_plan').update({ ...row, updated_at: new Date().toISOString() }).eq('id', editId).eq('user_id', user.id)
    } else {
      await sb.from('purchase_plan').insert({ ...row, user_id: user.id, status: 'pending' })
    }
    resetForm(); await load()
  }
  const startEdit = e => {
    setEditId(e.id); setAdding(true)
    setDraft({ query: e.company_name || e.ticker, ticker: e.ticker, company_name: e.company_name || '', currency: e.currency || 'EUR',
      target_date: e.target_date || '', mode: e.shares != null ? 'shares' : 'amount',
      amount_eur: e.amount_eur ?? '', shares: e.shares ?? '', price_min: e.price_min ?? '', price_max: e.price_max ?? '', notes: e.notes || '' })
  }
  const setStatus = async (id, status) => { const { data: { user } } = await sb.auth.getUser(); if (!user) return; await sb.from('purchase_plan').update({ status, updated_at: new Date().toISOString() }).eq('id', id).eq('user_id', user.id); await load() }
  const remove = async id => { if (!confirm('¿Eliminar esta entrada del plan?')) return; const { data: { user } } = await sb.auth.getUser(); if (!user) return; await sb.from('purchase_plan').delete().eq('id', id).eq('user_id', user.id); await load() }

  const sortedPlan = useMemo(() => [...plan].sort((a, b) => (a.target_date || '9999').localeCompare(b.target_date || '9999')), [plan])
  const plannedCostHorizon = useMemo(() => pendingHorizon.reduce((s, e) => s + entryCostEUR(e), 0), [pendingHorizon])

  if (loading) return <div style={{ maxWidth: 980, margin: '0 auto', padding: '40px 16px', color: 'var(--text-faint)' }}>Cargando…</div>

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: '20px 16px 70px' }}>
      <h1 style={{ fontSize: 22, fontWeight: 900, color: 'var(--text-strong)', marginBottom: 4 }}>Calendario de compras</h1>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 18 }}>Planifica tus próximas aportaciones y proyecta cómo quedaría tu cartera si ejecutas el plan.</p>

      {/* ── Avisos de secuencia ── */}
      {(noNewAlert || entryImpacts.length > 0) && (
        <div style={{ ...CARD, borderColor: 'rgba(251,191,36,0.35)', background: 'rgba(251,191,36,0.06)' }}>
          <p style={{ fontSize: 11, fontWeight: 800, color: AMBER, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>⚠️ Avisos de secuencia</p>
          <div style={{ display: 'grid', gap: 8 }}>
            {noNewAlert && (
              <p style={{ fontSize: 13, color: 'var(--text)' }}>
                Llevas <strong>{monthsSince} meses</strong> aportando sin abrir ninguna posición nueva. Quizá toque diversificar con una empresa nueva.
              </p>
            )}
            {entryImpacts.map(im => (
              <p key={im.id} style={{ fontSize: 13, color: 'var(--text)' }}>
                Ejecutar <strong>{im.name}</strong> dejaría {im.overPos ? <>tu posición en <strong style={{ color: RED }}>{im.overPos.pct.toFixed(1)}%</strong></> : <>el sector <strong>{im.overSector.name}</strong> en <strong style={{ color: RED }}>{im.overSector.value.toFixed(1)}%</strong></>} de la cartera (umbral {cfg.concPct}%).
              </p>
            ))}
          </div>
        </div>
      )}

      {/* ── Cola de compras ── */}
      <div style={CARD}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <p style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-strong)' }}>Cola de compras planificadas</p>
          {!adding && <button onClick={() => { setDraft(EMPTY); setEditId(null); setAdding(true) }} style={{ ...INPUT, cursor: 'pointer', color: '#fff', background: ACCENT, border: 'none', fontWeight: 700 }}>+ Planificar compra</button>}
        </div>

        {adding && (
          <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: 14, marginBottom: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
              <div style={{ position: 'relative', gridColumn: '1 / -1' }}>
                <label style={LABEL}>Empresa</label>
                <input style={{ ...INPUT, width: '100%' }} placeholder="Buscar por nombre o ticker (ej. Iberdrola)" value={draft.query} onChange={e => setDraft(a => ({ ...a, query: e.target.value, ticker: '' }))} />
                {results.length > 0 && !draft.ticker && (
                  <div style={{ position: 'absolute', zIndex: 20, top: '100%', left: 0, right: 0, background: 'var(--bg-elev)', border: '1px solid var(--border-strong)', borderRadius: 8, marginTop: 3, overflow: 'hidden' }}>
                    {results.map(d => (
                      <button key={d[1]} onClick={() => pick(d)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', background: 'none', border: 'none', color: 'var(--text)', fontSize: 12.5, cursor: 'pointer' }}>
                        {d[0]} <span style={{ color: 'var(--text-faint)' }}>· {d[1]} · {d[3]}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div><label style={LABEL}>Fecha objetivo</label><input type="date" style={{ ...INPUT, width: '100%' }} value={draft.target_date} onChange={e => setDraft(a => ({ ...a, target_date: e.target.value }))} /></div>
              <div>
                <label style={LABEL}>Estimar por</label>
                <div style={{ display: 'flex', gap: 4 }}>
                  {[['amount', 'Importe €'], ['shares', 'Acciones']].map(([k, l]) => (
                    <button key={k} onClick={() => setDraft(a => ({ ...a, mode: k }))} style={{ ...INPUT, flex: 1, cursor: 'pointer', fontSize: 11, background: draft.mode === k ? ACCENT : 'var(--surface-3)', color: draft.mode === k ? '#fff' : 'var(--text-muted)', border: 'none' }}>{l}</button>
                  ))}
                </div>
              </div>
              {draft.mode === 'amount'
                ? <div><label style={LABEL}>Importe (€)</label><input type="number" step="any" style={{ ...INPUT, width: '100%' }} value={draft.amount_eur} onChange={e => setDraft(a => ({ ...a, amount_eur: e.target.value }))} /></div>
                : <div><label style={LABEL}>Nº acciones</label><input type="number" step="any" style={{ ...INPUT, width: '100%' }} value={draft.shares} onChange={e => setDraft(a => ({ ...a, shares: e.target.value }))} /></div>}
              <div><label style={LABEL}>Precio mín. ({draft.currency})</label><input type="number" step="any" style={{ ...INPUT, width: '100%' }} value={draft.price_min} onChange={e => setDraft(a => ({ ...a, price_min: e.target.value }))} /></div>
              <div><label style={LABEL}>Precio máx. ({draft.currency})</label><input type="number" step="any" style={{ ...INPUT, width: '100%' }} value={draft.price_max} onChange={e => setDraft(a => ({ ...a, price_max: e.target.value }))} /></div>
              <div style={{ gridColumn: '1 / -1' }}><label style={LABEL}>Notas</label><input style={{ ...INPUT, width: '100%' }} value={draft.notes} onChange={e => setDraft(a => ({ ...a, notes: e.target.value }))} /></div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button onClick={save} disabled={!draft.ticker} style={{ ...INPUT, cursor: draft.ticker ? 'pointer' : 'default', color: '#fff', background: draft.ticker ? ACCENT : 'var(--surface-3)', border: 'none', fontWeight: 700 }}>{editId ? 'Guardar cambios' : 'Añadir al plan'}</button>
              <button onClick={resetForm} style={{ ...INPUT, cursor: 'pointer', background: 'var(--surface-3)', border: 'none' }}>Cancelar</button>
            </div>
          </div>
        )}

        {sortedPlan.length === 0 && !adding && <p style={{ fontSize: 13, color: 'var(--text-faint)', padding: '10px 0' }}>Aún no has planificado ninguna compra. Pulsa "Planificar compra" para empezar.</p>}

        {sortedPlan.length > 0 && (
          <div style={{ display: 'grid', gap: 8 }}>
            {sortedPlan.map(e => {
              const wl = watchMap[e.ticker]
              const st = STATUS[e.status] || STATUS.pending
              const range = e.price_min != null && e.price_max != null ? `${e.price_min}–${e.price_max} ${e.currency}` : (e.price_min != null ? `≥${e.price_min} ${e.currency}` : null)
              const est = e.amount_eur != null ? fmtEUR(e.amount_eur) : (e.shares != null ? `${e.shares} acc.` : '—')
              return (
                <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '9px 11px', background: 'var(--surface-2)', borderRadius: 9, opacity: e.status === 'discarded' ? 0.55 : 1 }}>
                  <div style={{ flex: '1 1 180px', minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>{e.company_name || e.ticker}</span>
                      <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>{e.ticker}</span>
                      {wl && <Link href="/watchlist" style={{ fontSize: 9.5, fontWeight: 700, color: ACCENT, background: 'rgba(99,102,241,0.12)', padding: '1px 6px', borderRadius: 5, textDecoration: 'none' }}>👁 En watchlist{wl.target_price ? ` · obj. ${wl.target_price}` : ''}</Link>}
                    </div>
                    <div style={{ fontSize: 10.5, color: 'var(--text-faint)', marginTop: 2 }}>
                      {e.target_date || 'sin fecha'}{range ? ` · ${range}` : ''}{e.notes ? ` · ${e.notes}` : ''}
                    </div>
                  </div>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)' }}>{est}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: st.col, background: `${st.col}18`, padding: '2px 8px', borderRadius: 5 }}>{st.label}</span>
                  <div style={{ display: 'flex', gap: 3 }}>
                    {e.status !== 'executed' && <button title="Marcar ejecutada" onClick={() => setStatus(e.id, 'executed')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: GREEN, fontSize: 13 }}>✓</button>}
                    {e.status !== 'discarded' && <button title="Descartar" onClick={() => setStatus(e.id, 'discarded')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', fontSize: 13 }}>✕</button>}
                    {e.status !== 'pending' && <button title="Reactivar" onClick={() => setStatus(e.id, 'pending')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: AMBER, fontSize: 12 }}>↻</button>}
                    <button title="Editar" onClick={() => startEdit(e)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: ACCENT, fontSize: 13 }}>✏</button>
                    <button title="Eliminar" onClick={() => remove(e.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: RED, fontSize: 13 }}>🗑</button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Config ── */}
      <div style={{ ...CARD, display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <div>
          <label style={LABEL}>Horizonte de proyección</label>
          <div style={{ display: 'flex', gap: 4 }}>
            {[6, 12, 24].map(h => <button key={h} onClick={() => setHorizon(h)} style={{ ...INPUT, cursor: 'pointer', background: horizon === h ? ACCENT : 'var(--surface-3)', color: horizon === h ? '#fff' : 'var(--text-muted)', border: 'none' }}>{h}m</button>)}
          </div>
        </div>
        <div><label style={LABEL}>Aviso "sin posición nueva" tras</label><input type="number" min="1" style={{ ...INPUT, width: 70 }} value={cfg.seqMonths} onChange={e => saveCfg({ seqMonths: Math.max(1, Number(e.target.value) || 3) })} /> <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>meses</span></div>
        <div><label style={LABEL}>Umbral de concentración</label><input type="number" min="1" style={{ ...INPUT, width: 70 }} value={cfg.concPct} onChange={e => saveCfg({ concPct: Math.max(1, Number(e.target.value) || 15) })} /> <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>%</span></div>
      </div>

      {/* ── Proyección "si ejecuto el plan" ── */}
      <div style={CARD}>
        <p style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-strong)', marginBottom: 4 }}>Si ejecuto el plan ({horizon} meses)</p>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
          {pendingHorizon.length} aportación{pendingHorizon.length === 1 ? '' : 'es'} pendiente{pendingHorizon.length === 1 ? '' : 's'} en el horizonte · inversión planificada <strong style={{ color: 'var(--text)' }}>{fmtEUR(plannedCostHorizon)}</strong> · valor de cartera {fmtEUR(curTotal)} → <strong style={{ color: GREEN }}>{fmtEUR(hypTotal)}</strong>
        </p>

        {/* Por posición con banda de equiponderación 4-6% */}
        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '6px 0 8px' }}>Peso por posición (objetivo 4–6%)</p>
        <div style={{ display: 'grid', gap: 5 }}>
          {hypWeights.slice(0, 20).map(w => {
            const cur = curWeights.find(x => x.ticker === w.ticker)
            const fit = equalWeightFit(w.pct)
            const col = fit === 'over' ? RED : fit === 'under' ? 'var(--text-faint)' : GREEN
            return (
              <div key={w.ticker} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--text)', flex: '0 0 150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.name}</span>
                <div style={{ flex: 1, height: 7, background: 'var(--surface-3)', borderRadius: 4, position: 'relative', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', left: `${4}%`, width: `${2}%`, height: '100%', background: 'rgba(52,211,153,0.18)' }} />
                  <div style={{ height: '100%', width: `${Math.min(100, w.pct)}%`, background: col, borderRadius: 4 }} />
                </div>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: col, flex: '0 0 90px', textAlign: 'right' }}>
                  {cur ? `${cur.pct.toFixed(1)}→` : 'nueva '}{w.pct.toFixed(1)}%
                </span>
              </div>
            )
          })}
        </div>

        {/* Sector + país/divisa (reutiliza calcConcentration) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, marginTop: 18 }}>
          <BreakdownCompare title="Por sector" cur={curConc.bySector} hyp={hypConc.bySector} threshold={cfg.concPct} />
          <BreakdownCompare title="Por país" cur={byCountry(enriched)} hyp={byCountry(hypEnriched)} threshold={cfg.concPct} />
          <BreakdownCompare title="Por divisa" cur={curConc.byCurrency} hyp={hypConc.byCurrency} threshold={cfg.concPct} />
        </div>
      </div>
    </div>
  )
}

// Compara la distribución actual vs proyectada de un breakdown (sector/zona/divisa).
function BreakdownCompare({ title, cur, hyp, threshold }) {
  const curMap = Object.fromEntries((cur || []).map(x => [x.name, x.value]))
  const rows = (hyp || []).slice(0, 8)
  return (
    <div>
      <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>{title}</p>
      <div style={{ display: 'grid', gap: 5 }}>
        {rows.map(r => {
          const c0 = curMap[r.name]
          const over = r.value > threshold
          return (
            <div key={r.name} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
              <span style={{ flex: 1, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
              <span style={{ fontWeight: 700, color: over ? 'var(--negative)' : 'var(--text)' }}>
                {c0 != null ? `${c0.toFixed(0)}→` : ''}{r.value.toFixed(0)}%
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
