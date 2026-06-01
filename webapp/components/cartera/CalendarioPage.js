'use client'
import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { createClient } from '@/lib/supabase/client'
import { enrichPositions } from '@/lib/portfolio'
import { buildCalendar } from '@/lib/portfolio-calc'

const CARD    = { background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 20 }
const MONTHS  = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
const TYPE_DOT = { stock: '#34d399', etf: '#60a5fa', fund: '#a78bfa' }
const Dot = ({ type }) => <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: TYPE_DOT[type] || '#34d399', marginRight: 6, flexShrink: 0 }} />
const hrefFor = e => e.type && e.type !== 'stock' ? `/fondo/${encodeURIComponent(e.ticker)}` : `/empresa/${encodeURIComponent(e.ticker)}`
const TT_STYLE= { background: '#10172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11 }

function fmtEUR(v) {
  if (!v) return '—'
  return v.toLocaleString('es-ES', { maximumFractionDigits: 0 }) + ' €'
}

function intensityColor(value, maxValue) {
  if (!value || !maxValue) return 'rgba(52,211,153,0.08)'
  const ratio = value / maxValue
  return `rgba(52,211,153,${0.08 + ratio * 0.4})`
}

export default function CalendarioPage({ isPremium }) {
  const router = useRouter()
  const [enriched, setEnriched] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [view,     setView]     = useState('calendar')  // 'calendar' | 'list'
  const [expanded, setExpanded] = useState(null)

  useEffect(() => { load() }, [])

  const load = async () => {
    const sb = createClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data: positions } = await sb.from('positions').select('*').eq('user_id', user.id)
    if (!positions?.length) { setEnriched([]); setLoading(false); return }

    const stockTickers = [...new Set(positions.filter(p => (p.asset_type || 'stock') === 'stock').map(p => p.ticker))]
    const fundTickers  = [...new Set(positions.filter(p => (p.asset_type || 'stock') !== 'stock').map(p => p.ticker))]
    const [{ data: funds }, { data: fundsData }] = await Promise.all([
      stockTickers.length ? sb.from('company_fundamentals').select('ticker,current_price,dps,div_cagr5,sector,industry,country').in('ticker', stockTickers) : Promise.resolve({ data: [] }),
      fundTickers.length ? sb.from('funds').select('*').in('ticker', fundTickers) : Promise.resolve({ data: [] }),
    ])
    const fundMap = Object.fromEntries((funds || []).map(f => [f.ticker, f]))
    const fundsMap = Object.fromEntries((fundsData || []).map(f => [f.ticker, f]))
    setEnriched(enrichPositions(positions, fundMap, fundsMap))
    setLoading(false)
  }

  const { months, upcoming } = useMemo(() => buildCalendar(enriched), [enriched])
  const totalYear   = months.reduce((s, m) => s + m.total, 0)
  const avgMonthly  = totalYear / 12
  const maxMonth    = Math.max(...months.map(m => m.total))
  const bestMonth   = months.indexOf(months.reduce((a, b) => a.total > b.total ? a : b)) + 1
  const worstMonth  = months.indexOf(months.reduce((a, b) => a.total > 0 && (b.total === 0 || a.total < b.total) ? a : b)) + 1
  const weakMonths  = months.filter(m => m.total < avgMonthly * 0.3 && m.total > 0)

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#4a5270' }}>Cargando…</div>

  if (!enriched.length) return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '40px 16px', textAlign: 'center' }}>
      <p style={{ color: '#4a5270', marginBottom: 16 }}>Añade posiciones para ver el calendario de dividendos.</p>
      <Link href="/cartera" style={{ color: '#818cf8', fontSize: 13 }}>← Ir a la cartera</Link>
    </div>
  )

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 16px 64px' }}>
      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'Total estimado año', value: fmtEUR(totalYear), col: '#34d399' },
          { label: 'Media mensual', value: fmtEUR(avgMonthly), col: '#818cf8' },
          { label: 'Mejor mes', value: MONTHS[bestMonth - 1], col: '#fbbf24' },
        ].map(it => (
          <div key={it.label} style={{ ...CARD, padding: '14px 16px' }}>
            <p style={{ fontSize: 10, color: '#4a5270', marginBottom: 4 }}>{it.label}</p>
            <p style={{ fontSize: 20, fontWeight: 800, color: it.col }}>{it.value}</p>
          </div>
        ))}
      </div>

      {/* Bar chart + toggle */}
      <div style={{ ...CARD, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#4a5270', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Distribución mensual</p>
          <div style={{ display: 'flex', gap: 4 }}>
            {['calendar','list'].map(v => (
              <button key={v} onClick={() => setView(v)} style={{
                padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 11,
                background: view === v ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.04)',
                color: view === v ? '#818cf8' : '#4a5270', fontWeight: view === v ? 700 : 400,
              }}>
                {v === 'calendar' ? '📅 Calendario' : '📋 Lista'}
              </button>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={months.map((m, i) => ({ name: MONTHS[i], total: Math.round(m.total) }))}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="name" stroke="#4a5270" fontSize={10} tickLine={false} />
            <YAxis stroke="#4a5270" fontSize={10} tickLine={false} tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}K` : v} />
            <Tooltip contentStyle={TT_STYLE} formatter={v => [fmtEUR(v), 'Dividendos']} />
            <Bar dataKey="total" fill="#34d399" radius={[4,4,0,0]} opacity={0.8} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Weak month alerts */}
      {isPremium && weakMonths.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          {weakMonths.map((m, i) => (
            <div key={i} style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', borderRadius: 8, padding: '8px 12px', display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ color: '#fbbf24' }}>⚠</span>
              <p style={{ fontSize: 11, color: '#fbbf24' }}>{MONTHS[m.month - 1]} — mes débil. Considera diversificar pagos.</p>
            </div>
          ))}
        </div>
      )}

      {/* Calendar view */}
      {view === 'calendar' && (
        <div style={{ ...CARD }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#4a5270', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>Calendario {new Date().getFullYear()}</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
            {months.map((m, i) => (
              <div key={i}
                onClick={() => isPremium && setExpanded(expanded === i ? null : i)}
                style={{
                  borderRadius: 10, padding: 12, cursor: isPremium ? 'pointer' : 'default',
                  background: intensityColor(m.total, maxMonth),
                  border: expanded === i ? '1px solid rgba(52,211,153,0.3)' : '1px solid rgba(255,255,255,0.04)',
                  transition: 'border 0.15s',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: '#c8d0e0' }}>{MONTHS[i]}</p>
                  {weakMonths.some(w => w.month === m.month) && (
                    <span title="Mes débil" style={{ fontSize: 11 }}>⚠</span>
                  )}
                </div>
                <p style={{ fontSize: 16, fontWeight: 800, color: m.total > 0 ? '#34d399' : '#2e3a55', marginTop: 4 }}>
                  {fmtEUR(m.total)}
                </p>
                {m.entries.length > 0 && (
                  <p style={{ fontSize: 10, color: '#4a5270', marginTop: 2 }}>{m.entries.length} cobro{m.entries.length > 1 ? 's' : ''}</p>
                )}

                {/* Expanded detail — premium */}
                {expanded === i && isPremium && m.entries.length > 0 && (
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    {m.entries.map((e, j) => (
                      <div key={j} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10, color: '#8090a8', marginBottom: 3 }}>
                        <span style={{ display: 'flex', alignItems: 'center' }}><Dot type={e.type} />{e.name}</span>
                        <span style={{ color: '#34d399' }}>{fmtEUR(e.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Premium gate blur */}
                {!isPremium && m.entries.length > 0 && (
                  <p style={{ fontSize: 9, color: '#4a5270', marginTop: 4, filter: 'blur(3px)' }}>Premium para desglose</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* List view */}
      {view === 'list' && (
        <div style={CARD}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#4a5270', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>
            Próximos cobros estimados
          </p>
          {upcoming.length === 0 ? (
            <p style={{ fontSize: 12, color: '#4a5270' }}>No hay cobros estimados disponibles.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    {['Fecha estimada','Empresa','Importe estimado'].map(h => (
                      <th key={h} style={{ padding: '6px 8px', textAlign: h === 'Empresa' ? 'left' : h === 'Fecha estimada' ? 'left' : 'right', color: '#4a5270', borderBottom: '1px solid rgba(255,255,255,0.06)', fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(isPremium ? upcoming : upcoming.slice(0, 6)).map((e, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding: '7px 8px', color: '#4a5270' }}>
                        {e.date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
                        <span style={{ marginLeft: 4, fontSize: 9, color: '#2e3a55' }}>est.</span>
                      </td>
                      <td style={{ padding: '7px 8px' }}>
                        <Link href={hrefFor(e)} style={{ color: '#c8d0e0', textDecoration: 'none', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center' }}><Dot type={e.type} />{e.name}</Link>
                      </td>
                      <td style={{ padding: '7px 8px', textAlign: 'right', color: '#34d399', fontWeight: 700 }}>{fmtEUR(e.amount)}</td>
                    </tr>
                  ))}
                  {!isPremium && upcoming.length > 6 && (
                    <tr><td colSpan={3} style={{ padding: '10px 8px', textAlign: 'center' }}>
                      <Link href="/pricing" style={{ fontSize: 11, color: '#818cf8' }}>Ver todos los cobros con Premium →</Link>
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          <p style={{ fontSize: 9, color: '#2e3a55', marginTop: 10 }}>Las fechas son estimaciones basadas en el historial de pagos. Pueden variar.</p>
        </div>
      )}
    </div>
  )
}
