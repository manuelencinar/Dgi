'use client'
import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts'
import { createClient } from '@/lib/supabase/client'
import { enrichPositions } from '@/lib/portfolio'
import { buildDividendCalendar, MONTHS_ES } from '@/lib/dividend-calendar'
import { getLatestExchangeRate } from '@/lib/currency'

const CARD     = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }
const TYPE_DOT = { stock: 'var(--positive)', etf: '#60a5fa', fund: '#a78bfa' }
const Dot = ({ type }) => <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: TYPE_DOT[type] || 'var(--positive)', marginRight: 6, flexShrink: 0 }} />
const hrefFor = e => e.type && e.type !== 'stock' ? `/fondo/${encodeURIComponent(e.ticker)}` : `/empresa/${encodeURIComponent(e.ticker)}`
const TT_STYLE = { background: 'var(--bg-elev)', border: '1px solid var(--border-strong)', borderRadius: 8, fontSize: 11 }

// Iconos de estado del dividendo (Mejora 1)
const STATUS = {
  confirmed: { icon: '✓', color: 'var(--positive)', label: 'Confirmado — la empresa ya anunció el dividendo' },
  estimated: { icon: '📅', color: '#60a5fa', label: 'Estimado — basado en el patrón histórico' },
  unknown:   { icon: '?', color: 'var(--text-faint)', label: 'Sin historial suficiente para estimar' },
}
const StatusIcon = ({ status }) => {
  const s = STATUS[status] || STATUS.estimated
  return <span title={s.label} style={{ fontSize: 11, color: s.color, fontWeight: 700, flexShrink: 0 }}>{s.icon}</span>
}

function fmtEUR(v, forceDec) {
  if (v == null || isNaN(v)) return '—'
  const dec = forceDec != null ? forceDec : (Math.abs(v) < 100 ? (Math.abs(v) < 10 ? 2 : 1) : 0)
  return v.toLocaleString('es-ES', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + ' €'
}
function fmtDay(d) { return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) }
function fmtFull(d) { return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) }
function intensityColor(value, maxValue) {
  if (!value || !maxValue) return 'rgba(52,211,153,0.06)'
  return `rgba(52,211,153,${0.06 + (value / maxValue) * 0.38})`
}

export default function CalendarioPage({ isPremium }) {
  const router = useRouter()
  const [enriched, setEnriched]   = useState([])
  const [fundMap, setFundMap]     = useState({})
  const [fxToEUR, setFxToEUR]     = useState({})
  const [destWHT, setDestWHT]     = useState(19)
  const [whtOverrides, setWhtOverrides] = useState(null)
  const [received, setReceived]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [view, setView]           = useState('calendar')   // 'calendar' | 'list'
  const [expanded, setExpanded]   = useState(null)
  const [compare, setCompare]     = useState(false)        // comparativa año anterior
  const [filter, setFilter]       = useState('all')        // 30d | 3m | year | confirmed | all

  useEffect(() => { load() }, [])

  const load = async () => {
    const sb = createClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data: positions } = await sb.from('positions').select('*').eq('user_id', user.id)
    if (!positions?.length) { setEnriched([]); setLoading(false); return }

    const stockTickers = [...new Set(positions.filter(p => (p.asset_type || 'stock') === 'stock').map(p => p.ticker))]
    const fundTickers  = [...new Set(positions.filter(p => (p.asset_type || 'stock') !== 'stock').map(p => p.ticker))]
    const yearNow = new Date().getFullYear()

    const [{ data: funds }, { data: fundsData }, { data: settings }, { data: divsRec }] = await Promise.all([
      stockTickers.length
        ? sb.from('company_fundamentals').select('ticker,current_price,dps,div_cagr5,sector,industry,country,div_history,dividend_events,next_ex_date,next_pay_date').in('ticker', stockTickers)
        : Promise.resolve({ data: [] }),
      fundTickers.length ? sb.from('funds').select('*').in('ticker', fundTickers) : Promise.resolve({ data: [] }),
      sb.from('user_settings').select('dest_wht,wht_overrides').eq('user_id', user.id).maybeSingle(),
      sb.from('dividends_received').select('ticker,amount,amount_net,date').eq('user_id', user.id),
    ])

    const fMap     = Object.fromEntries((funds || []).map(f => [f.ticker, f]))
    const fundsMap = Object.fromEntries((fundsData || []).map(f => [f.ticker, f]))
    const enr = enrichPositions(positions, fMap, fundsMap)

    // FX real (exchange_rates) para cada divisa presente
    const currencies = [...new Set(enr.map(p => p.currency || 'EUR'))].filter(c => c && c !== 'EUR')
    const fxEntries = await Promise.all(currencies.map(async c => {
      try { const r = await getLatestExchangeRate(c, 'EUR'); return [c, r?.rate ?? null] }
      catch { return [c, null] }
    }))
    const fx = Object.fromEntries(fxEntries.filter(([, r]) => r != null))

    setEnriched(enr)
    setFundMap(fMap)
    setFxToEUR(fx)
    setDestWHT(settings?.dest_wht != null ? Number(settings.dest_wht) : 19)
    setWhtOverrides(settings?.wht_overrides && typeof settings.wht_overrides === 'object' ? settings.wht_overrides : null)
    setReceived((divsRec || []).filter(d => d.date && new Date(d.date).getFullYear() === yearNow))
    setLoading(false)
  }

  const cal = useMemo(
    () => buildDividendCalendar(enriched, fundMap, fxToEUR, destWHT, { whtOverrides }),
    [enriched, fundMap, fxToEUR, destWHT, whtOverrides]
  )
  const { months, upcoming, nextPayment, totals } = cal
  const maxMonth = Math.max(1, ...months.map(m => m.total))
  const year = new Date().getFullYear()
  const today = new Date()

  const receivedTotal = received.reduce((s, d) => s + (Number(d.amount) || 0), 0)

  // Filtros de la vista lista
  const filtered = useMemo(() => {
    let list = upcoming
    if (filter === 'confirmed') return upcoming.filter(e => e.confirmed)
    if (filter === '30d') { const lim = new Date(today); lim.setDate(lim.getDate() + 30); list = upcoming.filter(e => e.date <= lim) }
    else if (filter === '3m') { const lim = new Date(today); lim.setMonth(lim.getMonth() + 3); list = upcoming.filter(e => e.date <= lim) }
    return list
  }, [upcoming, filter])

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-faint)' }}>Cargando…</div>

  if (!enriched.length) return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '40px 16px', textAlign: 'center' }}>
      <p style={{ color: 'var(--text-faint)', marginBottom: 16 }}>Añade posiciones para ver el calendario de dividendos.</p>
      <Link href="/cartera" style={{ color: 'var(--accent)', fontSize: 13 }}>← Ir a la cartera</Link>
    </div>
  )

  const chartData = months.map(m => ({
    name: m.monthName,
    estimated: Math.round(m.estimatedTotal),
    confirmed: Math.round(m.confirmedTotal),
    prior: Math.round(m.priorTotal),
    total: Math.round(m.total),
    entries: m.entries,
  }))

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 16px 64px' }}>
      <style>{`
        .cal-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 8px; }
        .cal-summary { display: grid; grid-template-columns: repeat(${receivedTotal > 0 ? 4 : 3},1fr); gap: 10px; }
        @media (max-width: 640px) {
          .cal-grid { grid-template-columns: 1fr; }
          .cal-summary { grid-template-columns: 1fr 1fr; }
        }
      `}</style>

      {/* ── Resumen superior (Mejora 4) ── */}
      <div className="cal-summary" style={{ marginBottom: 16 }}>
        <div style={{ ...CARD, padding: '14px 16px' }}>
          <p style={{ fontSize: 10, color: 'var(--text-faint)', marginBottom: 4 }}>Total estimado {year}</p>
          <p style={{ fontSize: 20, fontWeight: 800, color: 'var(--positive)' }}>{fmtEUR(totals.totalYear, 0)}</p>
          {totals.confirmedYear > 0 && (
            <p style={{ fontSize: 10.5, color: 'var(--positive)', marginTop: 3, fontWeight: 600 }}>
              De los cuales {fmtEUR(totals.confirmedYear, 0)} ya confirmados
            </p>
          )}
        </div>

        <div style={{ ...CARD, padding: '14px 16px' }}>
          <p style={{ fontSize: 10, color: 'var(--text-faint)', marginBottom: 4 }}>Media mensual</p>
          <p style={{ fontSize: 20, fontWeight: 800, color: 'var(--accent)' }}>{fmtEUR(totals.avgMonthly, 0)}</p>
        </div>

        <div style={{ ...CARD, padding: '14px 16px' }}>
          <p style={{ fontSize: 10, color: 'var(--text-faint)', marginBottom: 4 }}>Próximo cobro</p>
          {nextPayment ? (
            <>
              <Link href={hrefFor(nextPayment)} style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', textDecoration: 'none', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {nextPayment.name}
              </Link>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                {fmtFull(nextPayment.date)} · <span style={{ color: 'var(--positive)', fontWeight: 700 }}>{fmtEUR(nextPayment.grossEUR)}</span>
              </p>
            </>
          ) : <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-faintest)' }}>—</p>}
        </div>

        {receivedTotal > 0 && (
          <div style={{ ...CARD, padding: '14px 16px' }}>
            <p style={{ fontSize: 10, color: 'var(--text-faint)', marginBottom: 4 }}>Cobrado este año</p>
            <p style={{ fontSize: 20, fontWeight: 800, color: 'var(--warning)' }}>{fmtEUR(receivedTotal, 0)}</p>
            {(() => {
              const diff = receivedTotal - totals.estimatedToDate
              const pos = diff >= 0
              return (
                <p style={{ fontSize: 10.5, color: pos ? 'var(--positive)' : 'var(--negative)', marginTop: 3, fontWeight: 600 }}>
                  {pos ? '+' : ''}{fmtEUR(diff, 0)} vs estimación
                </p>
              )
            })()}
          </div>
        )}
      </div>

      {/* ── Controles ── */}
      <div style={{ ...CARD, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Distribución mensual</p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button onClick={() => setCompare(c => !c)} style={{
              padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 11,
              background: compare ? 'rgba(148,163,184,0.18)' : 'var(--surface-2)',
              color: compare ? 'var(--text)' : 'var(--text-faint)', fontWeight: compare ? 700 : 400,
            }}>
              {compare ? '✓ ' : ''}Comparativa año anterior
            </button>
            <div style={{ display: 'flex', gap: 4 }}>
              {['calendar', 'list'].map(v => (
                <button key={v} onClick={() => setView(v)} style={{
                  padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 11,
                  background: view === v ? 'rgba(99,102,241,0.2)' : 'var(--surface-2)',
                  color: view === v ? 'var(--accent)' : 'var(--text-faint)', fontWeight: view === v ? 700 : 400,
                }}>
                  {v === 'calendar' ? '📅 Calendario' : '📋 Lista'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Gráfico de barras (Mejora 3) */}
        <ResponsiveContainer width="100%" height={200}>
          <ComposedChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-3)" />
            <XAxis dataKey="name" stroke="var(--text-faint)" fontSize={10} tickLine={false} />
            <YAxis stroke="var(--text-faint)" fontSize={10} tickLine={false} tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v} />
            <Tooltip content={<MonthTooltip />} cursor={{ fill: 'var(--surface-2)' }} />
            <ReferenceLine y={Math.round(totals.avgMonthly)} stroke="var(--accent)" strokeDasharray="4 4" strokeWidth={1}
              label={{ value: 'media', position: 'right', fill: 'var(--accent)', fontSize: 9 }} />
            <Bar dataKey="estimated" stackId="a" fill="#15803d" radius={[0, 0, 0, 0]} />
            <Bar dataKey="confirmed" stackId="a" fill="var(--positive)" radius={[4, 4, 0, 0]} />
            {compare && <Line type="monotone" dataKey="prior" stroke="#94a3b8" strokeDasharray="5 4" strokeWidth={1.5} dot={{ r: 2, fill: '#94a3b8' }} />}
          </ComposedChart>
        </ResponsiveContainer>
        <div style={{ display: 'flex', gap: 16, marginTop: 8, flexWrap: 'wrap', fontSize: 10, color: 'var(--text-faint)' }}>
          <span><span style={{ display: 'inline-block', width: 9, height: 9, background: 'var(--positive)', borderRadius: 2, marginRight: 5 }} />Confirmado</span>
          <span><span style={{ display: 'inline-block', width: 9, height: 9, background: '#15803d', borderRadius: 2, marginRight: 5 }} />Estimado</span>
          <span><span style={{ display: 'inline-block', width: 12, height: 0, borderTop: '2px dashed var(--accent)', marginRight: 5, verticalAlign: 'middle' }} />Media mensual</span>
          {compare && <span><span style={{ display: 'inline-block', width: 12, height: 0, borderTop: '2px dashed #94a3b8', marginRight: 5, verticalAlign: 'middle' }} />Año anterior</span>}
        </div>
      </div>

      {/* ── Vista calendario (Mejora 1 + 6) ── */}
      {view === 'calendar' && (
        <div style={{ ...CARD }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>Calendario {year}</p>
          <div className="cal-grid">
            {months.map((m, i) => {
              const variation = m.priorTotal > 0 ? (m.total - m.priorTotal) / m.priorTotal * 100 : null
              return (
                <div key={i}
                  onClick={() => isPremium && m.entries.length > 0 && setExpanded(expanded === i ? null : i)}
                  style={{
                    borderRadius: 10, padding: 12,
                    cursor: isPremium && m.entries.length > 0 ? 'pointer' : 'default',
                    background: intensityColor(m.total, maxMonth),
                    border: expanded === i ? '1px solid rgba(52,211,153,0.3)' : '1px solid var(--surface-2)',
                  }}
                >
                  {/* Cabecera */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{m.monthName} {year}</p>
                    {m.confirmedTotal > 0 && <span title="Incluye dividendos confirmados" style={{ fontSize: 10, color: 'var(--positive)' }}>✓</span>}
                  </div>
                  <p style={{ fontSize: 18, fontWeight: 800, color: m.total > 0 ? 'var(--positive)' : 'var(--text-faintest)', marginTop: 4 }}>{fmtEUR(m.total, 0)}</p>
                  <p style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 1 }}>
                    {m.count > 0 ? `${m.count} cobro${m.count > 1 ? 's' : ''} esperado${m.count > 1 ? 's' : ''}` : 'Sin cobros'}
                  </p>

                  {/* Comparativa año anterior (Mejora 6) */}
                  {compare && m.priorTotal > 0 && (
                    <p style={{ fontSize: 9.5, color: 'var(--text-muted)', marginTop: 4 }}>
                      Año anterior: {fmtEUR(m.priorTotal, 0)}
                      {variation != null && (
                        <span style={{ color: variation >= 0 ? 'var(--positive)' : 'var(--negative)', marginLeft: 5, fontWeight: 700 }}>
                          {variation >= 0 ? '+' : ''}{variation.toFixed(0)}%
                        </span>
                      )}
                    </p>
                  )}

                  {/* Detalle por empresa (premium) */}
                  {expanded === i && isPremium && m.entries.length > 0 && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                      {m.entries.map((e, j) => (
                        <Link key={j} href={hrefFor(e)} style={{ textDecoration: 'none' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10.5, marginBottom: 5, gap: 6 }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
                              <StatusIcon status={e.status} />
                              <span style={{ color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.name}</span>
                              <span style={{ color: 'var(--text-faintest)', flexShrink: 0 }}>{e.day} {m.monthName.toLowerCase()}</span>
                            </span>
                            <span style={{ color: 'var(--positive)', fontWeight: 700, flexShrink: 0 }}>{fmtEUR(e.grossEUR)}</span>
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}

                  {!isPremium && m.entries.length > 0 && (
                    <p style={{ fontSize: 9, color: 'var(--text-faint)', marginTop: 4, filter: 'blur(3px)' }}>Premium para desglose</p>
                  )}
                </div>
              )
            })}
          </div>
          {isPremium && (
            <div style={{ display: 'flex', gap: 16, marginTop: 12, flexWrap: 'wrap', fontSize: 10, color: 'var(--text-faint)' }}>
              {Object.entries(STATUS).map(([k, s]) => (
                <span key={k}><span style={{ color: s.color, fontWeight: 700, marginRight: 4 }}>{s.icon}</span>{s.label.split(' — ')[0]}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Vista lista (Mejora 5) ── */}
      {view === 'list' && (
        <div style={CARD}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Próximos cobros</p>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {[['30d', '30 días'], ['3m', '3 meses'], ['year', 'Año'], ['confirmed', 'Confirmados']].map(([k, lbl]) => (
                <button key={k} onClick={() => setFilter(filter === k ? 'all' : k)} style={{
                  padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 10.5,
                  background: filter === k ? 'rgba(99,102,241,0.2)' : 'var(--surface-2)',
                  color: filter === k ? 'var(--accent)' : 'var(--text-faint)', fontWeight: filter === k ? 700 : 400,
                }}>{lbl}</button>
              ))}
            </div>
          </div>
          {filtered.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--text-faint)' }}>No hay cobros que mostrar con este filtro.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 640 }}>
                <thead>
                  <tr>
                    {['Fecha', 'Empresa', 'Acciones', 'DPS est.', 'Bruto', 'Estado', 'Retención', 'Neto'].map((h, k) => (
                      <th key={h} style={{ padding: '6px 8px', textAlign: k <= 1 ? 'left' : k === 5 ? 'center' : 'right', color: 'var(--text-faint)', borderBottom: '1px solid var(--border)', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(isPremium ? filtered : filtered.slice(0, 6)).map((e, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--surface-2)' }}>
                      <td style={{ padding: '7px 8px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{fmtFull(e.date)}</td>
                      <td style={{ padding: '7px 8px' }}>
                        <Link href={hrefFor(e)} style={{ color: 'var(--text)', textDecoration: 'none', fontWeight: 600, display: 'flex', alignItems: 'center' }}>
                          <Dot type={e.type} />{e.name} <span style={{ color: 'var(--text-faintest)', marginLeft: 5, fontSize: 10 }}>{e.ticker}</span>
                        </Link>
                      </td>
                      <td style={{ padding: '7px 8px', textAlign: 'right', color: 'var(--text-muted)' }}>{e.shares}</td>
                      <td style={{ padding: '7px 8px', textAlign: 'right', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{e.perLocal != null ? `${e.perLocal.toLocaleString('es-ES', { maximumFractionDigits: 3 })} ${e.currency}` : '—'}</td>
                      <td style={{ padding: '7px 8px', textAlign: 'right', color: 'var(--text)', fontWeight: 700, whiteSpace: 'nowrap' }}>{fmtEUR(e.grossEUR)}</td>
                      <td style={{ padding: '7px 8px', textAlign: 'center' }}><StatusIcon status={e.status} /></td>
                      <td style={{ padding: '7px 8px', textAlign: 'right', color: 'var(--negative)', whiteSpace: 'nowrap' }}>−{fmtEUR(e.retEUR)} <span style={{ color: 'var(--text-faintest)', fontSize: 9 }}>({e.retPct}%)</span></td>
                      <td style={{ padding: '7px 8px', textAlign: 'right', color: 'var(--positive)', fontWeight: 700, whiteSpace: 'nowrap' }}>{fmtEUR(e.netEUR)}</td>
                    </tr>
                  ))}
                  {!isPremium && filtered.length > 6 && (
                    <tr><td colSpan={8} style={{ padding: '10px 8px', textAlign: 'center' }}>
                      <Link href="/pricing" style={{ fontSize: 11, color: 'var(--accent)' }}>Ver todos los cobros con Premium →</Link>
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          <p style={{ fontSize: 9, color: 'var(--text-faintest)', marginTop: 10 }}>
            Importes en EUR (tipos reales). Retención efectiva = retención en origen + impuesto español ({destWHT}%) − crédito por doble imposición (acreditable hasta el 15% del bruto; el exceso de retención en origen no es deducible). Las fechas y los importes son estimaciones salvo los marcados como confirmados.
          </p>
        </div>
      )}
    </div>
  )
}

// Tooltip del gráfico (Mejora 3)
function MonthTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  if (!d) return null
  return (
    <div style={{ ...TT_STYLE, padding: '10px 12px', maxWidth: 240 }}>
      <p style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>{label} · {fmtEUR(d.total, 0)}</p>
      {d.entries?.length > 0 && (
        <div style={{ marginBottom: 6 }}>
          {d.entries.slice(0, 6).map((e, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, color: 'var(--text-muted)', marginBottom: 2 }}>
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 140 }}>{e.name}</span>
              <span style={{ color: 'var(--positive)' }}>{fmtEUR(e.grossEUR)}</span>
            </div>
          ))}
          {d.entries.length > 6 && <p style={{ color: 'var(--text-faint)' }}>+{d.entries.length - 6} más…</p>}
        </div>
      )}
      <div style={{ borderTop: '1px solid var(--surface-3)', paddingTop: 5, color: 'var(--text-faint)' }}>
        <span style={{ color: 'var(--positive)' }}>Confirmados: {fmtEUR(d.confirmed, 0)}</span>
        {' · '}
        <span style={{ color: '#15a34a' }}>Estimados: {fmtEUR(d.estimated, 0)}</span>
      </div>
    </div>
  )
}
