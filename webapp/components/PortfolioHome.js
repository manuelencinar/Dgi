'use client'
import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import CompanyLogo from '@/components/CompanyLogo'
import { enrichPositions, calcSummary, calcFiscal } from '@/lib/portfolio'
import { resolveDestWHT } from '@/lib/fiscal-es'
import { buildDividendCalendar, MONTHS_ES } from '@/lib/dividend-calendar'
import { estimateMonthInterest } from '@/lib/cash-fund'
import { getLatestExchangeRate } from '@/lib/currency'

const CARD = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 20 }
const LABEL = { fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.09em' }
const fmtEUR = (v, d = 0) => v == null || isNaN(v) ? '—' : Number(v).toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d }) + ' €'
const todayStr = () => new Date().toISOString().slice(0, 10)
const daysBetween = (a, b) => Math.round((a - b) / 86400000)

// Payout medio saneado, ponderado por valor (FCF preferido, EPS de respaldo).
function avgPayout(enriched) {
  let w = 0, s = 0
  for (const p of enriched) {
    if (p.isFund) continue
    const fcf = p.payoutFCF, eps = p.payoutEPS
    const pay = (fcf != null && fcf > 0 && fcf <= 300) ? fcf : (eps != null && eps > 0 && eps <= 300 ? eps : null)
    const wt = p.valueEUR ?? 0
    if (pay == null || wt <= 0) continue
    s += pay * wt; w += wt
  }
  return w > 0 ? s / w : null
}

export default function PortfolioHome() {
  const sb = useMemo(() => createClient(), [])
  const [state, setState] = useState(null)   // null = cargando
  const [expDraft, setExpDraft] = useState('')
  const [editingExp, setEditingExp] = useState(false)

  useEffect(() => {
    let cancel = false
    ;(async () => {
      const { data: { user } } = await sb.auth.getUser()
      if (!user) { if (!cancel) setState({ empty: true }); return }

      const [{ data: positions }, { data: divsRec }] = await Promise.all([
        sb.from('positions').select('*').eq('user_id', user.id),
        sb.from('dividends_received').select('ticker, amount_net, amount, date, status').eq('user_id', user.id).eq('status', 'received').order('date', { ascending: false }).limit(8),
      ])
      if (!positions?.length) { if (!cancel) setState({ empty: true, hasUser: true }); return }

      const stockTickers = [...new Set(positions.filter(p => (p.asset_type || 'stock') === 'stock').map(p => p.ticker))]
      const fundTickers = [...new Set(positions.filter(p => (p.asset_type || 'stock') !== 'stock').map(p => p.ticker))]

      const COLS = 'ticker,current_price,dps,payout_fcf,payout_eps,div_cagr5,div_history,dividend_events,next_ex_date,next_pay_date,sector,country'
      const [{ data: funds }, { data: fundsData }, settingsRes, cashRes, notifRes] = await Promise.all([
        stockTickers.length ? sb.from('company_fundamentals').select(COLS).in('ticker', stockTickers) : Promise.resolve({ data: [] }),
        fundTickers.length ? sb.from('funds').select('*').in('ticker', fundTickers) : Promise.resolve({ data: [] }),
        fetch('/api/ajustes').then(r => r.ok ? r.json() : null).catch(() => null),
        fetch('/api/cartera/liquidez').then(r => r.ok ? r.json() : null).catch(() => null),
        fetch('/api/notifications').then(r => r.ok ? r.json() : null).catch(() => null),
      ])
      const fundMap = Object.fromEntries((funds || []).map(f => [f.ticker, f]))
      const fundsMap = Object.fromEntries((fundsData || []).map(f => [f.ticker, f]))

      // Precios frescos
      try {
        const res = await fetch('/api/precios', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tickers: [...stockTickers, ...fundTickers] }) })
        const json = await res.json().catch(() => ({}))
        for (const t of Object.keys(json.prices || {})) {
          const dp = json.prices[t]; if (dp?.price == null) continue
          if (fundMap[t]) fundMap[t] = { ...fundMap[t], current_price: dp.price }
          if (fundsMap[t]) fundsMap[t] = { ...fundsMap[t], current_price: dp.price }
        }
      } catch {}

      const settings = settingsRes?.settings || {}
      const destWHT = resolveDestWHT(settings)
      const whtOverrides = (settings.wht_overrides && typeof settings.wht_overrides === 'object') ? settings.wht_overrides : null
      const monthlyExpenses = settings.monthly_expenses != null ? Number(settings.monthly_expenses) : null
      const cashBalance = cashRes?.ready !== false ? (Number(cashRes?.balance) || 0) : 0
      const cashRate = Number(cashRes?.rate) || 0

      const enriched = enrichPositions(positions, fundMap, fundsMap)
      const summary = calcSummary(enriched)
      const fiscal = calcFiscal(enriched, whtOverrides, destWHT)
      const netAnnual = (fiscal || []).reduce((s, r) => s + (r.net || 0), 0)

      // FX para el calendario
      const currencies = [...new Set(enriched.map(p => p.currency || 'EUR'))].filter(c => c && c !== 'EUR')
      const fxEntries = await Promise.all(currencies.map(async c => {
        try { const r = await getLatestExchangeRate(c, 'EUR'); return [c, r?.rate ?? null] } catch { return [c, null] }
      }))
      const fx = Object.fromEntries(fxEntries.filter(([, r]) => r != null))
      const cal = buildDividendCalendar(enriched, fundMap, fx, destWHT, { whtOverrides })

      const monthlyNet = cal.months.map(m => m.entries.reduce((s, e) => s + (e.netEUR || 0), 0))
      const now = new Date()
      const thisMonthDiv = monthlyNet[now.getMonth()] || 0
      const monthlyInterest = estimateMonthInterest(cashBalance, cashRate)
      const thisMonthPassive = thisMonthDiv + monthlyInterest
      const avgMonthlyPassive = netAnnual / 12 + monthlyInterest

      // Eventos del feed
      const nameByTicker = Object.fromEntries(enriched.map(p => [p.ticker, p.name]))
      const events = []
      ;(divsRec || []).forEach(d => {
        const amt = Number(d.amount_net ?? d.amount) || 0
        if (amt <= 0 || !d.date) return
        events.push({ kind: 'cobro', date: new Date(d.date + 'T12:00:00'), ticker: d.ticker, name: nameByTicker[d.ticker] || d.ticker, amount: amt })
      })
      ;(notifRes?.notifications || notifRes?.items || []).slice(0, 12).forEach(n => {
        if (!['dividend_increase', 'dividend_cut', 'watchlist_buyzone'].includes(n.type)) return
        events.push({ kind: n.type, date: new Date(n.created_at), ticker: n.ticker, name: nameByTicker[n.ticker] || n.ticker, message: n.message })
      })
      // Ex-dividend próximos (acciones en cartera, ≤10 días)
      const tIn = new Date(now); tIn.setDate(tIn.getDate() + 10)
      enriched.forEach(p => {
        if (p.isFund) return
        const ex = fundMap[p.ticker]?.next_ex_date
        if (!ex) return
        const d = new Date(ex)
        if (isNaN(d) || d < now || d > tIn) return
        events.push({ kind: 'exdiv', date: d, ticker: p.ticker, name: p.name })
      })
      events.sort((a, b) => b.date - a.date)

      if (cancel) return
      setState({
        empty: false,
        totalValue: summary.totalValueEUR,
        yieldOnCost: summary.yieldOnCost,
        currentYield: summary.totalValueEUR > 0 ? summary.totalIncomeEUR / summary.totalValueEUR * 100 : null,
        payout: avgPayout(enriched),
        netAnnual, thisMonthDiv, monthlyInterest, thisMonthPassive, avgMonthlyPassive,
        monthlyExpenses, cashBalance, cashRate,
        monthlyNet, nextPayment: cal.nextPayment,
        events: events.slice(0, 8),
        currentMonth: now.getMonth(),
      })
      setExpDraft(monthlyExpenses ? String(monthlyExpenses) : '')
    })().catch(() => { if (!cancel) setState({ empty: true }) })
    return () => { cancel = true }
  }, [sb])

  const saveExpenses = async () => {
    const n = Number(expDraft)
    const val = (!isNaN(n) && n > 0) ? n : null
    setEditingExp(false)
    setState(s => s ? { ...s, monthlyExpenses: val } : s)
    await fetch('/api/ajustes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ monthly_expenses: val }) }).catch(() => {})
  }

  if (!state) return <div style={{ maxWidth: 1000, margin: '0 auto', padding: '28px 16px' }}><div style={{ ...CARD, height: 140, opacity: 0.5 }} /></div>

  // Estado sin cartera → bienvenida + CTA
  if (state.empty) {
    return (
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '28px 16px 8px' }}>
        <div style={{ ...CARD, textAlign: 'center', padding: '34px 20px' }}>
          <p style={{ fontSize: 20, fontWeight: 900, color: 'var(--text-strong)', marginBottom: 8 }}>Empieza tu camino hacia la libertad financiera</p>
          <p style={{ fontSize: 13.5, color: 'var(--text-muted)', maxWidth: 480, margin: '0 auto 18px', lineHeight: 1.5 }}>Añade tus posiciones o construye una cartera DGI desde cero. Verás aquí tu progreso, tus próximos cobros y el interés compuesto trabajando para ti.</p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/construir-cartera" style={{ padding: '11px 20px', background: 'rgba(52,211,153,0.85)', borderRadius: 9, color: '#06281d', fontSize: 13, fontWeight: 800, textDecoration: 'none' }}>🧭 Construir mi cartera</Link>
            <Link href="/cartera/nueva-posicion" style={{ padding: '11px 20px', background: 'var(--accent)', borderRadius: 9, color: '#fff', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>Añadir posición</Link>
          </div>
        </div>
      </div>
    )
  }

  const s = state
  const freedomPct = s.monthlyExpenses > 0 ? (s.avgMonthlyPassive / s.monthlyExpenses * 100) : null
  const maxMonth = Math.max(1, ...s.monthlyNet)
  const next = s.nextPayment
  const daysToPay = next ? Math.max(0, daysBetween(new Date(next.date), new Date())) : null

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 16px 56px', display: 'grid', gap: 16 }}>
      <style>{`
        .home-grid2 { display: grid; grid-template-columns: 1fr; gap: 16px; }
        @media(min-width:760px){ .home-grid2 { grid-template-columns: 1fr 1fr; } }
        .home-hero { display: grid; grid-template-columns: 1fr; gap: 18px; }
        @media(min-width:680px){ .home-hero { grid-template-columns: 1.1fr 1fr; align-items: center; } }
      `}</style>

      {/* ── 1. HERO ── */}
      <div style={{ ...CARD, background: 'linear-gradient(135deg, var(--accent-bg), var(--surface) 60%)', borderColor: 'var(--border-strong)' }}>
        <div className="home-hero">
          <div>
            <p style={LABEL}>Valor total de la cartera</p>
            <p style={{ fontSize: 38, fontWeight: 900, color: 'var(--text-strong)', lineHeight: 1.05, margin: '4px 0 14px' }}>{fmtEUR(s.totalValue)}</p>
            <p style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
              Ingresos pasivos estimados <b style={{ color: 'var(--text)' }}>este mes</b>:{' '}
              <b style={{ color: 'var(--positive)', fontSize: 15 }}>{fmtEUR(s.thisMonthPassive, 2)}</b>
            </p>
            <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 3 }}>
              <span style={{ color: 'var(--accent)' }}>● {fmtEUR(s.thisMonthDiv, 2)} dividendos</span>{'   '}
              <span style={{ color: 'var(--warning)' }}>● {fmtEUR(s.monthlyInterest, 2)} intereses</span>
            </p>
          </div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
              <p style={LABEL}>Libertad financiera</p>
              {freedomPct != null && <p style={{ fontSize: 24, fontWeight: 900, color: freedomPct >= 100 ? 'var(--positive)' : 'var(--accent)' }}>{freedomPct.toFixed(freedomPct >= 10 ? 0 : 1)}%</p>}
            </div>
            {freedomPct != null ? (
              <>
                <div style={{ height: 12, background: 'var(--surface-2)', borderRadius: 7, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: Math.min(100, freedomPct) + '%', background: freedomPct >= 100 ? 'var(--positive)' : 'linear-gradient(90deg, var(--accent), var(--positive))', borderRadius: 7, transition: 'width .4s' }} />
                </div>
                <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 7 }}>
                  Tus ingresos pasivos cubren el <b style={{ color: 'var(--text-muted)' }}>{freedomPct.toFixed(0)}%</b> de tus gastos ({fmtEUR(s.monthlyExpenses)}/mes).{' '}
                  <button onClick={() => { setEditingExp(true); setExpDraft(String(s.monthlyExpenses)) }} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 11, padding: 0, textDecoration: 'underline' }}>editar</button>
                </p>
              </>
            ) : (
              <div>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>Define tus gastos mensuales para ver qué porcentaje cubren ya tus ingresos pasivos.</p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input type="number" min="0" placeholder="€/mes" value={expDraft} onChange={e => setExpDraft(e.target.value)} style={{ background: 'var(--bg-elev)', border: '1px solid var(--border-strong)', borderRadius: 7, padding: '8px 10px', color: 'var(--text)', fontSize: 13, width: 120, outline: 'none' }} />
                  <button onClick={saveExpenses} style={{ padding: '8px 14px', background: 'var(--accent)', border: 'none', borderRadius: 7, color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>Guardar</button>
                </div>
              </div>
            )}
            {editingExp && freedomPct != null && (
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <input type="number" min="0" value={expDraft} onChange={e => setExpDraft(e.target.value)} autoFocus style={{ background: 'var(--bg-elev)', border: '1px solid var(--border-strong)', borderRadius: 7, padding: '7px 10px', color: 'var(--text)', fontSize: 13, width: 120, outline: 'none' }} />
                <button onClick={saveExpenses} style={{ padding: '7px 13px', background: 'var(--accent)', border: 'none', borderRadius: 7, color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>Guardar</button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="home-grid2">
        {/* ── 2. PÓLVORA SECA ── */}
        <div style={CARD}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <p style={LABEL}>🪙 Pólvora seca</p>
            <Link href="/cartera/liquidez" style={{ fontSize: 11.5, color: 'var(--accent)', textDecoration: 'none' }}>Gestionar →</Link>
          </div>
          <p style={{ fontSize: 28, fontWeight: 900, color: 'var(--text-strong)' }}>{fmtEUR(s.cashBalance)}</p>
          <p style={{ fontSize: 11, color: 'var(--text-faintest)', marginTop: 2, marginBottom: 14 }}>Liquidez disponible para invertir</p>
          <div style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.25)', borderRadius: 9, padding: '10px 13px' }}>
            <p style={{ fontSize: 10.5, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Intereses este mes</p>
            <p style={{ fontSize: 20, fontWeight: 900, color: 'var(--warning)' }}>{s.cashRate > 0 ? fmtEUR(s.monthlyInterest, 2) : '—'}</p>
            <p style={{ fontSize: 10.5, color: 'var(--text-faintest)' }}>{s.cashRate > 0 ? `${s.cashRate}% TAE sobre el saldo` : 'Fija la TAE de tu cuenta para verlos'}</p>
          </div>
        </div>

        {/* ── 5. SALUD DE LA CARTERA ── */}
        <div style={CARD}>
          <p style={{ ...LABEL, marginBottom: 14 }}>🩺 Salud de la cartera</p>
          <div style={{ display: 'flex', gap: 18, marginBottom: 16 }}>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 10.5, color: 'var(--text-faint)' }}>Yield on Cost</p>
              <p style={{ fontSize: 22, fontWeight: 900, color: 'var(--accent)' }}>{s.yieldOnCost != null ? s.yieldOnCost.toFixed(2) + '%' : '—'}</p>
            </div>
            <div style={{ width: 1, background: 'var(--border)' }} />
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 10.5, color: 'var(--text-faint)' }}>Yield actual</p>
              <p style={{ fontSize: 22, fontWeight: 900, color: 'var(--positive)' }}>{s.currentYield != null ? s.currentYield.toFixed(2) + '%' : '—'}</p>
            </div>
          </div>
          <PayoutThermometer payout={s.payout} />
        </div>
      </div>

      <div className="home-grid2">
        {/* ── 3. CALENDARIO + PRÓXIMO PAYDAY ── */}
        <div style={CARD}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <p style={LABEL}>📅 Renta por meses</p>
            <Link href="/cartera/calendario" style={{ fontSize: 11.5, color: 'var(--accent)', textDecoration: 'none' }}>Ver calendario →</Link>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 72, marginBottom: 6 }}>
            {s.monthlyNet.map((v, i) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }} title={`${MONTHS_ES[i]}: ${fmtEUR(v, 0)}`}>
                <div style={{ width: '100%', height: Math.max(2, (v / maxMonth) * 60), background: i === s.currentMonth ? 'var(--accent)' : 'var(--surface-3)', borderRadius: '3px 3px 0 0' }} />
                <span style={{ fontSize: 8, color: i === s.currentMonth ? 'var(--accent)' : 'var(--text-faintest)', fontWeight: i === s.currentMonth ? 700 : 400 }}>{MONTHS_ES[i][0]}</span>
              </div>
            ))}
          </div>
          {next && (
            <div style={{ marginTop: 12, background: 'rgba(52,211,153,0.07)', border: '1px solid rgba(52,211,153,0.25)', borderRadius: 10, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <CompanyLogo ticker={next.ticker} name={next.name} size={34} rounded />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 11, color: 'var(--text-faint)' }}>Próximo cobro {next.confirmed ? '· confirmado' : '· estimado'}</p>
                <p style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--text)' }}>
                  {daysToPay === 0 ? '¡Hoy!' : `Faltan ${daysToPay} día${daysToPay === 1 ? '' : 's'}`} para cobrar <span style={{ color: 'var(--positive)' }}>{fmtEUR(next.netEUR, 2)}</span> de {next.name}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* ── 4. FEED DE EVENTOS DGI ── */}
        <div style={CARD}>
          <p style={{ ...LABEL, marginBottom: 14 }}>⚡ Tu actividad DGI</p>
          {s.events.length === 0 ? (
            <p style={{ fontSize: 12.5, color: 'var(--text-faint)', padding: '8px 0' }}>Sin eventos recientes. Cuando cobres dividendos o una empresa los suba, aparecerá aquí.</p>
          ) : (
            <div style={{ display: 'grid', gap: 0 }}>
              {s.events.map((e, i) => <EventRow key={i} e={e} last={i === s.events.length - 1} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Termómetro de payout (seguridad del dividendo).
function PayoutThermometer({ payout }) {
  if (payout == null) return <p style={{ fontSize: 11, color: 'var(--text-faint)' }}>Payout medio no disponible.</p>
  const pct = Math.min(120, payout)
  const col = payout < 60 ? 'var(--positive)' : payout < 80 ? 'var(--warning)' : 'var(--negative)'
  const label = payout < 60 ? 'Holgado y seguro' : payout < 80 ? 'Vigilar' : 'Ajustado'
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
        <p style={{ fontSize: 10.5, color: 'var(--text-faint)' }}>Payout medio (seguridad del dividendo)</p>
        <p style={{ fontSize: 14, fontWeight: 800, color: col }}>{payout.toFixed(0)}%</p>
      </div>
      <div style={{ position: 'relative', height: 9, background: 'var(--surface-2)', borderRadius: 6, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, var(--positive) 0%, var(--positive) 50%, var(--warning) 67%, var(--negative) 100%)', opacity: 0.28 }} />
        <div style={{ position: 'absolute', top: -2, bottom: -2, left: `calc(${(pct / 120) * 100}% - 2px)`, width: 4, background: col, borderRadius: 2 }} />
      </div>
      <p style={{ fontSize: 10.5, color: col, marginTop: 5, fontWeight: 600 }}>{label}</p>
    </div>
  )
}

function EventRow({ e, last }) {
  const meta = {
    cobro:            { icon: '💰', color: 'var(--positive)' },
    dividend_increase:{ icon: '📈', color: 'var(--positive)' },
    dividend_cut:     { icon: '⚠️', color: 'var(--negative)' },
    watchlist_buyzone:{ icon: '🟢', color: 'var(--accent)' },
    exdiv:            { icon: '🗓️', color: 'var(--warning)' },
  }[e.kind] || { icon: '•', color: 'var(--text-faint)' }
  const text = buildEventText(e)
  return (
    <div style={{ display: 'flex', gap: 11, alignItems: 'flex-start', padding: '9px 0', borderBottom: last ? 'none' : '1px solid var(--surface-2)' }}>
      <span style={{ fontSize: 15, flexShrink: 0, lineHeight: 1.3 }}>{meta.icon}</span>
      <p style={{ fontSize: 12.5, color: 'var(--text)', lineHeight: 1.45 }}>{text}</p>
    </div>
  )
}

function buildEventText(e) {
  const when = relDay(e.date)
  if (e.kind === 'cobro') return <>{when} cobraste <b style={{ color: 'var(--positive)' }}>{fmtEUR(e.amount, 2)}</b> de {e.name}</>
  if (e.kind === 'exdiv') return <>{when} es la fecha límite para comprar <b>{e.name}</b> con derecho a dividendo</>
  // increase / cut / buyzone → usa el mensaje de la notificación
  return e.message || e.name
}

function relDay(date) {
  const d = daysBetween(new Date(date.getFullYear(), date.getMonth(), date.getDate()), new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()))
  if (d === 0) return 'Hoy'
  if (d === -1) return 'Ayer'
  if (d === 1) return 'Mañana'
  if (d < 0) return `Hace ${-d} días`
  return `En ${d} días`
}
