'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { FX } from '@/lib/portfolio'
import { FREQ_LABEL, monthlyEquivalent } from '@/lib/recurring'
import { RecurringModal } from '@/components/cartera/RecurringButton'

const CARD = { background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 20 }
function fmtEUR(v) { return v == null ? '—' : v.toLocaleString('es-ES', { maximumFractionDigits: 0 }) + ' €' }
function fmtDate(d) { return d ? new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : '—' }

export default function RecurringSection() {
  const [rows, setRows]       = useState([])
  const [funds, setFunds]     = useState({})
  const [stats, setStats]     = useState({})
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)

  const sb = createClient()

  const load = async () => {
    setLoading(true)
    const { data: { user } } = await sb.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data: contribs } = await sb.from('recurring_contributions').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
    if (!contribs?.length) { setRows([]); setLoading(false); return }

    const tickers = [...new Set(contribs.map(c => c.ticker))]
    const [{ data: fundsData }, { data: txs }] = await Promise.all([
      sb.from('funds').select('ticker, name, currency, current_price').in('ticker', tickers),
      sb.from('transactions').select('ticker, shares, price').eq('user_id', user.id).eq('type', 'buy_recurring'),
    ])
    const fundMap = Object.fromEntries((fundsData || []).map(f => [f.ticker, f]))
    const st = {}
    ;(txs || []).forEach(t => {
      const f = fundMap[t.ticker]
      const cur = f?.currency || 'EUR'
      const investedEur = Number(t.shares) * Number(t.price) * (FX[cur] || 1)
      st[t.ticker] = st[t.ticker] || { count: 0, total: 0 }
      st[t.ticker].count++; st[t.ticker].total += investedEur
    })
    setRows(contribs); setFunds(fundMap); setStats(st); setLoading(false)
  }

  useEffect(() => { load() }, [])

  const togglePause = async (c) => { await sb.from('recurring_contributions').update({ active: !c.active }).eq('id', c.id); load() }
  const remove = async (c) => { if (confirm('¿Eliminar esta aportación periódica?')) { await sb.from('recurring_contributions').delete().eq('id', c.id); load() } }

  const monthlyTotal = rows.filter(c => c.active).reduce((s, c) => s + monthlyEquivalent(c.amount_eur, c.frequency), 0)

  if (loading) return null

  return (
    <div style={{ ...CARD, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: '#4a5270', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Aportaciones periódicas activas</p>
        {rows.length > 0 && <span style={{ fontSize: 12, color: '#818cf8', fontWeight: 700 }}>{fmtEUR(monthlyTotal)}/mes comprometido</span>}
      </div>

      {rows.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '28px 0' }}>
          <p style={{ fontSize: 13, color: '#4a5270', marginBottom: 14 }}>No tienes aportaciones periódicas configuradas.</p>
          <Link href="/etfs" style={{ padding: '9px 18px', background: 'rgba(99,102,241,0.85)', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
            Configurar primera aportación periódica
          </Link>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 720 }}>
            <thead>
              <tr>
                {['Fondo', 'Importe', 'Frecuencia', 'Próxima', 'Part. est.', 'Hechas', 'Total aportado', ''].map(h => (
                  <th key={h} style={{ padding: '6px 8px', textAlign: h === 'Fondo' ? 'left' : 'right', color: '#4a5270', borderBottom: '1px solid rgba(255,255,255,0.06)', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(c => {
                const f = funds[c.ticker]
                const priceEur = f?.current_price != null ? f.current_price * (FX[f.currency] || 1) : null
                const estShares = priceEur ? c.amount_eur / priceEur : null
                const s = stats[c.ticker] || { count: 0, total: 0 }
                return (
                  <tr key={c.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', opacity: c.active ? 1 : 0.5 }}>
                    <td style={{ padding: '8px' }}>
                      <Link href={`/fondo/${encodeURIComponent(c.ticker)}`} style={{ color: '#c8d0e0', textDecoration: 'none', fontWeight: 600 }}>{f?.name || c.ticker}</Link>
                      {!c.active && <span style={{ fontSize: 9, fontWeight: 700, color: '#fbbf24', background: 'rgba(251,191,36,0.12)', padding: '1px 6px', borderRadius: 4, marginLeft: 6 }}>PAUSADA</span>}
                      {c.notes && <p style={{ fontSize: 10, color: '#2e3a55' }}>{c.notes}</p>}
                    </td>
                    <td style={{ padding: '8px', textAlign: 'right', color: '#c8d0e0', fontWeight: 700 }}>{fmtEUR(c.amount_eur)}</td>
                    <td style={{ padding: '8px', textAlign: 'right', color: '#8090a8' }}>{FREQ_LABEL[c.frequency]}</td>
                    <td style={{ padding: '8px', textAlign: 'right', color: '#818cf8' }}>{fmtDate(c.next_date)}</td>
                    <td style={{ padding: '8px', textAlign: 'right', color: '#8090a8' }}>{estShares != null ? estShares.toFixed(3) : '—'}</td>
                    <td style={{ padding: '8px', textAlign: 'right', color: '#8090a8' }}>{s.count}</td>
                    <td style={{ padding: '8px', textAlign: 'right', color: '#34d399', fontWeight: 600 }}>{fmtEUR(s.total)}</td>
                    <td style={{ padding: '8px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button onClick={() => setEditing(c)} title="Editar" style={btn('#818cf8')}>✏</button>
                      <button onClick={() => togglePause(c)} title={c.active ? 'Pausar' : 'Reactivar'} style={btn('#fbbf24')}>{c.active ? '⏸' : '▶'}</button>
                      <button onClick={() => remove(c)} title="Eliminar" style={btn('#f87171')}>🗑</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <RecurringModal
          ticker={editing.ticker} assetType={editing.asset_type}
          currency={funds[editing.ticker]?.currency || 'EUR'} fundName={funds[editing.ticker]?.name}
          existing={editing} onClose={() => setEditing(null)} onSaved={load}
        />
      )}
    </div>
  )
}
const btn = col => ({ background: 'none', border: 'none', cursor: 'pointer', color: col, fontSize: 14, padding: '2px 4px' })
