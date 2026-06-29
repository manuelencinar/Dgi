'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { DICT } from '@/data/dict'
import { weightedAvgCost } from '@/lib/portfolio'
import PositionImpactPreview from '@/components/cartera/PositionImpactPreview'

const CARD = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }
const INPUT = { width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: 8, padding: '10px 12px', color: 'var(--text)', fontSize: 14, outline: 'none', boxSizing: 'border-box' }
const LABEL = { fontSize: 12, color: 'var(--text-faint)', marginBottom: 6, display: 'block' }
const BTN_PRIMARY = { padding: '11px 24px', background: 'var(--accent)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }
const BTN_GHOST = { padding: '11px 24px', background: 'transparent', border: '1px solid var(--border-strong)', borderRadius: 8, color: 'var(--text-faint)', fontSize: 14, cursor: 'pointer' }

const ASSET_TYPES = [
  { v: 'stock', l: 'Acción' },
  { v: 'etf',   l: 'ETF' },
  { v: 'fund',  l: 'Fondo de inversión' },
]

export default function NewPositionPage() {
  const router = useRouter()
  const sb     = useMemo(() => createClient(), [])

  const [assetType, setAssetType] = useState('stock')

  // Acción (búsqueda DICT)
  const [query, setQuery]       = useState('')
  const [results, setResults]   = useState([])
  const [selected, setSelected] = useState(null)  // {ticker, name, currency, assetType}

  // ETF/Fondo (lookup)
  const [lookupTicker, setLookupTicker] = useState('')
  const [lookupState, setLookupState]   = useState('idle') // idle|loading|ok|notfound
  const [fundData, setFundData]         = useState(null)
  const [manual, setManual]             = useState({ name: '', currency: 'EUR', current_price: '', annual_distribution: '' })

  const [form, setForm]   = useState({ shares: '', price: '', commission: '', date: new Date().toISOString().slice(0, 10), type: 'buy', notes: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState(null)
  const [fxAlertPending, setFxAlertPending] = useState(false)
  const [divModal, setDivModal] = useState(null)   // { ticker, name } — preguntar método de cobro
  const [divSaved, setDivSaved] = useState(false)

  // Ajustes del usuario
  const [userSettings, setUserSettings] = useState({ base_currency: 'EUR', fx_commission_pct: 0 })

  // Fondo de oportunidad: saldo disponible + si se paga la compra con esa liquidez
  const [fundBalance, setFundBalance] = useState(null)
  const [payFromFund, setPayFromFund] = useState(false)

  // FX en tiempo real
  const [fxInfo,       setFxInfo]       = useState(null)  // { rate, rateDate, loading, notFound }
  const [fxManualRate, setFxManualRate] = useState('')
  const [useManualFx,  setUseManualFx]  = useState(false)

  // Cargar ajustes del usuario al montar
  useEffect(() => {
    const loadSettings = async () => {
      const { data: { user } } = await sb.auth.getUser()
      if (!user) return
      const { data } = await sb.from('user_settings')
        .select('base_currency, fx_commission_pct')
        .eq('user_id', user.id)
        .maybeSingle()
      if (data) setUserSettings({ base_currency: data.base_currency || 'EUR', fx_commission_pct: data.fx_commission_pct || 0 })
    }
    loadSettings()
  }, [sb])

  // Saldo del fondo de oportunidad (para ofrecer pagar la compra con esa liquidez)
  useEffect(() => {
    let cancel = false
    fetch('/api/cartera/liquidez').then(r => r.ok ? r.json() : null).then(d => {
      if (cancel || !d || d.ready === false) return
      setFundBalance(Number(d.balance) || 0)
    }).catch(() => {})
    return () => { cancel = true }
  }, [])

  // Prefill desde query params
  useEffect(() => {
    if (typeof window === 'undefined') return
    const p = new URLSearchParams(window.location.search)
    const t = p.get('type'); const tk = p.get('ticker')
    if (t && ['stock', 'etf', 'fund'].includes(t)) setAssetType(t)
    if (p.get('shares')) setForm(f => ({ ...f, shares: p.get('shares') }))
    if (p.get('price'))  setForm(f => ({ ...f, price: p.get('price') }))
    if (tk) {
      if (t === 'etf' || t === 'fund') { setLookupTicker(tk) }
      else {
        const d = DICT.find(x => x[1] === tk)
        if (d) setSelected({ ticker: d[1], name: d[0], currency: d[3], assetType: 'stock' })
      }
    }
  }, [])

  // Buscar tipo de cambio cuando cambia el activo seleccionado o la fecha
  const lookupFxRate = useCallback(async (currency, date) => {
    if (!currency || currency === userSettings.base_currency) { setFxInfo(null); return }
    setFxInfo({ loading: true })
    const start = new Date(date)
    start.setDate(start.getDate() - 7)
    const { data } = await sb.from('exchange_rates')
      .select('rate, date')
      .eq('base_currency', currency)
      .eq('quote_currency', userSettings.base_currency)
      .lte('date', date)
      .gte('date', start.toISOString().slice(0, 10))
      .order('date', { ascending: false })
      .limit(1)
    if (data?.[0]) {
      setFxInfo({ rate: Number(data[0].rate), rateDate: data[0].date, loading: false, notFound: false })
      setUseManualFx(false)
    } else {
      setFxInfo({ loading: false, notFound: true })
      setUseManualFx(true)
      setFxManualRate('')
    }
  }, [sb, userSettings.base_currency])

  useEffect(() => {
    if (!selected) { setFxInfo(null); return }
    lookupFxRate(selected.currency, form.date)
  }, [selected?.currency, form.date, lookupFxRate])

  const search = useCallback((q) => {
    setQuery(q)
    if (q.length < 1) { setResults([]); return }
    const lower = q.toLowerCase()
    setResults(DICT.filter(d => d[0].toLowerCase().includes(lower) || d[1].toLowerCase().includes(lower))
      .slice(0, 8).map(d => ({ ticker: d[1], name: d[0], currency: d[3] })))
  }, [])

  const selectStock = (item) => { setSelected({ ...item, assetType: 'stock' }); setQuery(item.name); setResults([]) }

  const doLookup = async () => {
    if (!lookupTicker.trim()) return
    setLookupState('loading'); setFundData(null); setSelected(null); setError(null)
    try {
      const res = await fetch('/api/fund/lookup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticker: lookupTicker, assetType }) })
      const data = await res.json()
      if (!res.ok) { setLookupState('notfound'); return }
      const f = data.fund
      setFundData(f)
      setSelected({ ticker: f.ticker, name: f.name, currency: f.currency, assetType })
      setForm(fm => ({ ...fm, price: fm.price || (f.current_price != null ? String(f.current_price) : '') }))
      setLookupState('ok')
    } catch { setLookupState('notfound') }
  }

  const saveManual = async () => {
    if (!manual.name) { setError('Nombre obligatorio'); return }
    setError(null)
    const res = await fetch('/api/fund/lookup', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticker: lookupTicker || manual.name.replace(/\s+/g, '').toUpperCase().slice(0, 12), ...manual }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error || 'Error'); return }
    const f = data.fund
    setFundData(f)
    setSelected({ ticker: f.ticker, name: f.name, currency: f.currency, assetType: 'fund' })
    setForm(fm => ({ ...fm, price: fm.price || (f.current_price != null ? String(f.current_price) : '') }))
    setLookupState('ok')
  }

  const field = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // ── FX computed values ──────────────────────────────────────────────────────
  const fxCurrency  = selected?.currency
  const needsFx     = fxCurrency && fxCurrency !== userSettings.base_currency
  const effectiveRate = useManualFx && fxManualRate ? parseFloat(fxManualRate) : (fxInfo?.rate || null)

  const fxBreakdown = useMemo(() => {
    if (!needsFx || !effectiveRate) return null
    const shares = parseFloat(form.shares)
    const price  = parseFloat(form.price)
    if (!shares || !price || shares <= 0 || price <= 0) return null
    const totalOrig    = shares * price
    const totalBase    = totalOrig * effectiveRate
    const commission   = totalBase * userSettings.fx_commission_pct / 100
    const totalReal    = totalBase + commission
    return { totalOrig, totalBase, commission, totalReal }
  }, [needsFx, effectiveRate, form.shares, form.price, userSettings.fx_commission_pct])

  // ── Submit ──────────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!selected) { setError('Selecciona o busca un activo'); return }
    const shares = parseFloat(form.shares), price = parseFloat(form.price)
    if (!shares || shares <= 0) { setError('Número de participaciones inválido'); return }
    if (!price || price <= 0)   { setError('Precio inválido'); return }
    if (needsFx && useManualFx && !fxManualRate) { setError('Introduce el tipo de cambio manualmente'); return }

    // Alerta de comisión elevada — pedir confirmación antes de guardar
    const threshold = userSettings.fx_alert_threshold ?? 10
    if (!fxAlertPending && fxBreakdown?.commission > 0 && fxBreakdown.commission > threshold) {
      setFxAlertPending(true)
      return
    }
    setFxAlertPending(false)

    setSaving(true); setError(null)
    const { data: { user } } = await sb.auth.getUser()
    if (!user) { setError('Sesión expirada'); setSaving(false); return }

    const totalOrig = shares * price
    const commission = parseFloat(form.commission) || 0
    const fxFields = needsFx ? {
      currency:                selected.currency,
      amount_original:         totalOrig,
      exchange_rate:           effectiveRate,
      exchange_rate_date:      useManualFx ? null : (fxInfo?.rateDate || null),
      fx_commission_pct:       userSettings.fx_commission_pct,
      fx_commission_eur:       fxBreakdown?.commission ?? null,
      total_cost_base_currency: fxBreakdown?.totalReal ?? (totalOrig * (effectiveRate || 1)),
    } : {
      currency:                selected.currency,
      amount_original:         totalOrig,
      exchange_rate:           1,
      exchange_rate_date:      form.date,
      fx_commission_pct:       0,
      fx_commission_eur:       0,
      total_cost_base_currency: totalOrig,
    }

    // Coste real total = (acciones × precio) + comisión broker + comisión de cambio (EUR)
    const totalCost = totalOrig + commission + (fxFields.fx_commission_eur || 0)
    // Coste en EUR (para el fondo de oportunidad): en divisa extranjera todo se pasa
    // a EUR con el tipo de cambio; en EUR es directo.
    const eurCost = needsFx
      ? ((fxBreakdown?.totalReal ?? totalOrig * (effectiveRate || 1)) + commission * (effectiveRate || 1))
      : totalOrig + commission

    const baseTx = {
      user_id: user.id, ticker: selected.ticker, type: form.type,
      shares, price, date: form.date, notes: form.notes || null,
      ...fxFields,
    }
    let { error: txErr } = await sb.from('transactions').insert({
      ...baseTx, commission, commission_currency: selected.currency, total_cost: totalCost,
    })
    // Si aún no se ha ejecutado commissions.sql, reintentar sin esas columnas
    if (txErr && /commission|total_cost/.test(txErr.message)) {
      ;({ error: txErr } = await sb.from('transactions').insert(baseTx))
    }
    if (txErr) { setError('Error al guardar la transacción: ' + txErr.message); setSaving(false); return }

    const { data: existing } = await sb.from('positions').select('*').eq('user_id', user.id).eq('ticker', selected.ticker).maybeSingle()

    let posErr = null
    if (form.type === 'buy') {
      if (existing) {
        const newShares = existing.shares + shares
        const newAvg = weightedAvgCost(existing.shares, existing.avg_cost, shares, price)
        ;({ error: posErr } = await sb.from('positions').update({ shares: newShares, avg_cost: newAvg, updated_at: new Date().toISOString() }).eq('id', existing.id))
      } else {
        ;({ error: posErr } = await sb.from('positions').insert({
          user_id: user.id, ticker: selected.ticker, shares, avg_cost: price,
          currency: selected.currency, asset_type: selected.assetType,
        }))
      }
    } else if (existing) {
      const remaining = existing.shares - shares
      if (remaining <= 0) ({ error: posErr } = await sb.from('positions').delete().eq('id', existing.id))
      else ({ error: posErr } = await sb.from('positions').update({ shares: remaining, updated_at: new Date().toISOString() }).eq('id', existing.id))
    }
    if (posErr) {
      const hint = /asset_type/.test(posErr.message) ? ' (falta ejecutar el SQL que añade asset_type a positions)' : ''
      setError('Error al guardar la posición: ' + posErr.message + hint); setSaving(false); return
    }

    // Si se paga desde el fondo de oportunidad, registra la salida de liquidez
    // (movimiento 'investment' con importe negativo). Tolerante si la tabla no existe.
    if (form.type === 'buy' && payFromFund && eurCost > 0) {
      try {
        await sb.from('cash_movements').insert({
          user_id: user.id, type: 'investment',
          amount: -Math.round(eurCost * 100) / 100,
          date: form.date, note: `Compra ${selected.name}`,
        })
      } catch {}
    }

    // Primera vez que se añade esta empresa (acción): preguntar método de cobro.
    if (form.type === 'buy' && !existing && selected.assetType === 'stock') {
      setSaving(false)
      setDivModal({ ticker: selected.ticker, name: selected.name })
      return
    }
    router.push('/cartera')
  }

  const saveDivMethod = async (method) => {
    const { data: { user } } = await sb.auth.getUser()
    if (user && divModal) {
      try { await sb.from('positions').update({ dividend_payment_method: method }).eq('user_id', user.id).eq('ticker', divModal.ticker) } catch {}
    }
    setDivSaved(true)
    setTimeout(() => { router.push('/cartera') }, 1200)
  }

  const unit = assetType === 'stock' ? 'acciones' : 'participaciones'

  // ── FX section ──────────────────────────────────────────────────────────────
  const fxSection = needsFx && (
    <div style={{ background: 'rgba(129,140,248,0.05)', border: '1px solid rgba(129,140,248,0.15)', borderRadius: 8, padding: 14 }}>
      {fxInfo?.loading ? (
        <p style={{ fontSize: 12, color: 'var(--text-faint)' }}>Buscando tipo de cambio…</p>
      ) : fxInfo?.notFound ? (
        <div>
          <p style={{ fontSize: 12, color: 'var(--warning)', marginBottom: 10 }}>
            Tipo de cambio {fxCurrency}/{userSettings.base_currency} no disponible para esta fecha — introduce el tipo manualmente
          </p>
          <input
            style={{ ...INPUT, marginBottom: 8 }}
            type="number" step="any" placeholder={`Tipo de cambio ${fxCurrency}/${userSettings.base_currency}`}
            value={fxManualRate}
            onChange={e => { setFxManualRate(e.target.value); setUseManualFx(true) }}
          />
          {fxBreakdown && renderBreakdown(fxBreakdown, fxCurrency, userSettings)}
        </div>
      ) : fxInfo ? (
        <div style={{ display: 'grid', gap: 6 }}>
          <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Tipo de cambio {fxCurrency}/{userSettings.base_currency} del{' '}
            {new Date(fxInfo.rateDate + 'T12:00:00').toLocaleDateString('es-ES')}:{' '}
            <span style={{ color: 'var(--text)', fontWeight: 700 }}>{fxInfo.rate.toFixed(4)}</span>
          </p>
          {fxBreakdown && renderBreakdown(fxBreakdown, fxCurrency, userSettings)}
        </div>
      ) : null}
    </div>
  )

  return (
    <div style={{ maxWidth: 540, margin: '0 auto', padding: '24px 16px 64px' }}>
      {divModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(4,6,12,0.72)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ width: '100%', maxWidth: 460, background: 'var(--bg-elev)', border: '1px solid var(--border-strong)', borderRadius: 14, padding: 24 }}>
            {divSaved ? (
              <p style={{ fontSize: 13, color: 'var(--positive)', textAlign: 'center', padding: '14px 0' }}>✓ Preferencia guardada — puedes cambiarla en cualquier momento desde Dividendos → Configuración</p>
            ) : (
              <>
                <h2 style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-strong)', marginBottom: 16 }}>¿Cómo quieres cobrar los dividendos de {divModal.name}?</h2>
                <div style={{ display: 'grid', gap: 10, marginBottom: 14 }}>
                  <button onClick={() => saveDivMethod('cash')} style={{ textAlign: 'left', padding: '14px 16px', borderRadius: 10, cursor: 'pointer', background: 'rgba(99,102,241,0.12)', border: '2px solid rgba(99,102,241,0.5)', color: 'var(--text-strong)' }}>
                    <p style={{ fontSize: 14, fontWeight: 800, marginBottom: 3 }}>💵 En efectivo</p>
                    <p style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>Los dividendos se abonan en tu cuenta. Opción por defecto.</p>
                  </button>
                  <button onClick={() => saveDivMethod('stock')} style={{ textAlign: 'left', padding: '14px 16px', borderRadius: 10, cursor: 'pointer', background: 'var(--surface-2)', border: '1px solid var(--border-strong)', color: 'var(--text-strong)' }}>
                    <p style={{ fontSize: 14, fontWeight: 800, marginBottom: 3 }}>📈 En acciones</p>
                    <p style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>Recibes acciones adicionales en lugar de efectivo. Se añaden automáticamente a tu cartera.</p>
                  </button>
                </div>
                <button onClick={() => { setDivModal(null); router.push('/cartera') }} style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', fontSize: 12, padding: '6px' }}>Decidir más tarde — usar efectivo por ahora</button>
              </>
            )}
          </div>
        </div>
      )}
      <div style={{ marginBottom: 20 }}>
        <Link href="/cartera" style={{ fontSize: 12, color: 'var(--text-faint)', textDecoration: 'none' }}>← Volver a cartera</Link>
      </div>
      <h1 style={{ fontSize: 22, fontWeight: 900, color: 'var(--text-strong)', marginBottom: 24 }}>Añadir operación</h1>

      <form onSubmit={handleSubmit}>
        <div style={{ ...CARD, display: 'grid', gap: 18 }}>

          {/* Selector tipo de activo */}
          <div>
            <label style={LABEL}>Tipo de activo</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {ASSET_TYPES.map(a => (
                <button key={a.v} type="button" onClick={() => { setAssetType(a.v); setSelected(null); setFundData(null); setLookupState('idle'); setFxInfo(null) }} style={{
                  flex: 1, padding: '8px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700,
                  border: assetType === a.v ? 'none' : '1px solid var(--border-strong)',
                  background: assetType === a.v ? 'rgba(99,102,241,0.2)' : 'var(--surface-2)',
                  color: assetType === a.v ? 'var(--accent)' : 'var(--text-faint)',
                }}>{a.l}</button>
              ))}
            </div>
          </div>

          {/* Búsqueda según tipo */}
          {assetType === 'stock' ? (
            <div style={{ position: 'relative' }}>
              <label style={LABEL}>Empresa</label>
              <input style={INPUT} placeholder="Busca por nombre o ticker..." autoComplete="off" value={query} onChange={e => search(e.target.value)} />
              {results.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, background: 'var(--bg-elev)', border: '1px solid var(--border-strong)', borderRadius: 8, overflow: 'hidden', marginTop: 4, maxHeight: 280, overflowY: 'auto' }}>
                  {results.map(r => (
                    <button key={r.ticker} type="button" onClick={() => selectStock(r)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', borderBottom: '1px solid var(--surface-2)' }}>
                      <span style={{ fontSize: 13, color: 'var(--text)' }}>{r.name}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-faint)', marginLeft: 8, flexShrink: 0 }}>{r.ticker} · {r.currency}</span>
                    </button>
                  ))}
                </div>
              )}
              {selected && (
                <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 6 }}>
                  Seleccionado: <span style={{ color: 'var(--text)' }}>{selected.name}</span> · cotiza en <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{selected.currency}</span>
                </p>
              )}
            </div>
          ) : (
            <div>
              <label style={LABEL}>{assetType === 'etf' ? 'Ticker del ETF (ej: SCHD, VHYL.L, TDIV.AS)' : 'ISIN o ticker del fondo'}</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input style={INPUT} placeholder={assetType === 'etf' ? 'SCHD' : 'IE00B...'} value={lookupTicker} onChange={e => setLookupTicker(e.target.value)} />
                <button type="button" onClick={doLookup} disabled={lookupState === 'loading'} style={{ ...BTN_PRIMARY, padding: '10px 18px', flexShrink: 0 }}>
                  {lookupState === 'loading' ? '…' : 'Buscar'}
                </button>
              </div>

              {fundData && lookupState === 'ok' && (
                <div style={{ marginTop: 10, padding: '12px', background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.2)', borderRadius: 8 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{fundData.name}</p>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                    Precio: {fundData.current_price != null ? `${fundData.current_price} ${fundData.currency}` : '—'}
                    {fundData.ter != null && ` · TER ${fundData.ter}%`}
                    {fundData.yield_ttm != null && ` · Yield TTM ${fundData.yield_ttm}%`}
                  </p>
                </div>
              )}

              {lookupState === 'notfound' && (
                <div style={{ marginTop: 10 }}>
                  <p style={{ fontSize: 12, color: 'var(--warning)', marginBottom: assetType === 'fund' ? 10 : 0 }}>
                    No encontrado{assetType === 'fund' ? ' — introduce los datos manualmente:' : '. Verifica el ticker.'}
                  </p>
                  {assetType === 'fund' && (
                    <div style={{ display: 'grid', gap: 8, padding: '12px', background: 'var(--surface)', borderRadius: 8 }}>
                      <input style={INPUT} placeholder="Nombre del fondo" value={manual.name} onChange={e => setManual(m => ({ ...m, name: e.target.value }))} />
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <input style={INPUT} placeholder="Divisa (EUR)" value={manual.currency} onChange={e => setManual(m => ({ ...m, currency: e.target.value.toUpperCase() }))} />
                        <input style={INPUT} type="number" step="any" placeholder="Valor liquidativo" value={manual.current_price} onChange={e => setManual(m => ({ ...m, current_price: e.target.value }))} />
                      </div>
                      <input style={INPUT} type="number" step="any" placeholder="Distribución anual (opcional)" value={manual.annual_distribution} onChange={e => setManual(m => ({ ...m, annual_distribution: e.target.value }))} />
                      <button type="button" onClick={saveManual} style={{ ...BTN_PRIMARY, padding: '9px' }}>Guardar fondo manual</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Tipo operación */}
          <div>
            <label style={LABEL}>Tipo de operación</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {['buy', 'sell'].map(t => (
                <button key={t} type="button" onClick={() => field('type', t)} style={{
                  flex: 1, padding: '8px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700,
                  border: form.type === t ? 'none' : '1px solid var(--border-strong)',
                  background: form.type === t ? (t === 'buy' ? 'rgba(52,211,153,0.2)' : 'rgba(248,113,113,0.2)') : 'var(--surface-2)',
                  color: form.type === t ? (t === 'buy' ? 'var(--positive)' : 'var(--negative)') : 'var(--text-faint)',
                }}>{t === 'buy' ? 'Compra' : 'Venta'}</button>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={LABEL}>Nº de {unit}</label>
              <input style={INPUT} type="number" step="any" min="0" placeholder="100" value={form.shares} onChange={e => field('shares', e.target.value)} required />
            </div>
            <div>
              <label style={LABEL}>
                Precio {selected ? `(${selected.currency})` : ''}
                {needsFx && <span style={{ color: 'var(--accent)', marginLeft: 4 }}>· cotiza en {selected.currency}</span>}
              </label>
              <input style={INPUT} type="number" step="any" min="0" placeholder="45.50" value={form.price} onChange={e => field('price', e.target.value)} required />
            </div>
          </div>

          {/* Comisión del broker */}
          <div>
            <label style={LABEL}>Comisión del broker {selected ? `(${selected.currency})` : ''} <span style={{ color: 'var(--text-faintest)' }}>· opcional</span></label>
            <input style={INPUT} type="number" step="any" min="0" placeholder="ej. 3.95" value={form.commission} onChange={e => field('commission', e.target.value)} />
            <p style={{ fontSize: 11, color: 'var(--text-faintest)', marginTop: 5 }}>Incluye aquí la comisión de compraventa y el canon de bolsa si aplica.</p>
          </div>

          {/* Sección FX — solo si la empresa cotiza en divisa distinta a la del usuario */}
          {fxSection}

          <div>
            <label style={LABEL}>Fecha de la operación</label>
            <input style={INPUT} type="date" value={form.date} onChange={e => field('date', e.target.value)} required />
          </div>

          <div>
            <label style={LABEL}>Notas (opcional)</label>
            <textarea style={{ ...INPUT, minHeight: 64, resize: 'vertical' }} value={form.notes} onChange={e => field('notes', e.target.value)} />
          </div>

          {/* Pagar desde el fondo de oportunidad (solo compra, si hay liquidez) */}
          {form.type === 'buy' && fundBalance > 0 && (
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 9, cursor: 'pointer', background: 'rgba(52,211,153,0.05)', border: '1px solid rgba(52,211,153,0.25)', borderRadius: 8, padding: '11px 13px' }}>
              <input type="checkbox" checked={payFromFund} onChange={e => setPayFromFund(e.target.checked)} style={{ marginTop: 2 }} />
              <span>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Pagar desde el fondo de oportunidad</span>
                <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>
                  Disponible: <b style={{ color: 'var(--positive)' }}>{fundBalance.toLocaleString('es-ES', { maximumFractionDigits: 0 })} €</b>. Se descontará el coste de esta compra de tu liquidez.
                </span>
              </span>
            </label>
          )}

          {error && <p style={{ fontSize: 12, color: 'var(--negative)' }}>{error}</p>}

          {/* Banner de alerta de comisión elevada */}
          {fxAlertPending && fxBreakdown && (
            <div style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.3)', borderRadius: 8, padding: '14px 16px' }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--warning)', marginBottom: 6 }}>
                ⚠ La comisión de cambio de esta operación es de {fxBreakdown.commission.toFixed(2)} {userSettings.base_currency}
              </p>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
                Supera tu umbral de alerta de {userSettings.fx_alert_threshold ?? 10} {userSettings.base_currency}. ¿Deseas continuar?
              </p>
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="submit" style={{ ...BTN_PRIMARY, padding: '9px 20px' }}>Continuar</button>
                <button type="button" onClick={() => setFxAlertPending(false)} style={{ ...BTN_GHOST, padding: '9px 20px' }}>Cancelar</button>
              </div>
            </div>
          )}

          {!fxAlertPending && (
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <Link href="/cartera"><button type="button" style={BTN_GHOST}>Cancelar</button></Link>
              <button type="submit" style={{ ...BTN_PRIMARY, opacity: saving ? 0.6 : 1 }} disabled={saving}>
                {saving ? 'Guardando…' : 'Guardar operación'}
              </button>
            </div>
          )}
        </div>
      </form>

      {/* Previsualización del impacto en la cartera (solo acciones, en compra) */}
      {selected && selected.assetType === 'stock' && form.type === 'buy' && (
        <PositionImpactPreview
          ticker={selected.ticker} name={selected.name} currency={selected.currency}
          shares={form.shares} price={form.price} type={form.type}
        />
      )}
    </div>
  )
}

function renderBreakdown(bd, fxCurrency, userSettings) {
  return (
    <div style={{ display: 'grid', gap: 4, marginTop: 6 }}>
      <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
        Total en {fxCurrency}: <span style={{ color: 'var(--text)' }}>{bd.totalOrig.toFixed(2)} {fxCurrency}</span>
      </p>
      <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
        Total en {userSettings.base_currency}: <span style={{ color: 'var(--text)' }}>{bd.totalBase.toFixed(2)} {userSettings.base_currency}</span>
      </p>
      {userSettings.fx_commission_pct > 0 && (
        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          Comisión de cambio ({userSettings.fx_commission_pct}%): <span style={{ color: 'var(--warning)', fontWeight: 700 }}>{bd.commission.toFixed(2)} {userSettings.base_currency}</span>
        </p>
      )}
      <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--positive)', borderTop: '1px solid var(--border)', paddingTop: 6, marginTop: 2 }}>
        Coste total real: {bd.totalReal.toFixed(2)} {userSettings.base_currency}
      </p>
    </div>
  )
}
