'use client'
import { useState, useEffect } from 'react'
import { Card, SectionTitle } from '@/components/dashboard/ui'

const TYPES = ['general', 'banco', 'aseguradora', 'reit', 'bdc', 'utilities']
const inputStyle = { background: 'rgba(0,0,0,0.25)', border: '1px solid var(--border-strong)', borderRadius: 6, padding: '7px 9px', color: 'var(--text)', fontSize: 12, outline: 'none', fontFamily: 'inherit' }

export default function DictManagerClient() {
  const [data, setData] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [add, setAdd] = useState({ ticker: '', name: '', country: '', currency: 'USD', sector: '', subsector: '', type: 'general' })
  const [rmTicker, setRmTicker] = useState('')
  const [purge, setPurge] = useState(false)

  const load = () => fetch('/api/admin/dict').then(r => r.json()).then(setData).catch(() => setData({ removed: [], added: [], orphans: [] }))
  useEffect(() => { load() }, [])   // no devolver la Promise (sería tratada como cleanup)

  async function call(method, body) {
    setBusy(true); setMsg(null)
    try {
      const res = await fetch('/api/admin/dict', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Error')
      load()
      return true
    } catch (e) { setMsg({ type: 'err', text: String(e.message || e) }); return false }
    finally { setBusy(false) }
  }

  async function submitAdd() {
    if (!add.ticker.trim()) { setMsg({ type: 'err', text: 'El ticker es obligatorio' }); return }
    const ok = await call('POST', { action: 'add', ...add })
    if (ok) { setMsg({ type: 'ok', text: `${add.ticker.toUpperCase()} añadida al DICT` }); setAdd({ ticker: '', name: '', country: '', currency: 'USD', sector: '', subsector: '', type: 'general' }) }
  }
  async function submitRemove(ticker, purgeData) {
    const t = (ticker || rmTicker).trim()
    if (!t) { setMsg({ type: 'err', text: 'Indica el ticker a ocultar' }); return }
    const ok = await call('POST', { action: 'remove', ticker: t, purge: purgeData })
    if (ok) { setMsg({ type: 'ok', text: `${t.toUpperCase()} ocultada` }); setRmTicker(''); setPurge(false) }
  }
  const undo = (ticker) => call('DELETE', { ticker })
  const quickAdd = (o) => setAdd(a => ({ ...a, ticker: o.ticker, sector: o.sector || '', country: o.country || '' }))

  return (
    <div style={{ maxWidth: 1100, display: 'grid', gap: 16, marginBottom: 24 }}>
      <Card>
        <SectionTitle>Gestión del listado de empresas (DICT)</SectionTitle>
        <p style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 16 }}>
          Oculta empresas fusionadas o desaparecidas, o añade tickers que no están en el listado. Los cambios son inmediatos (sin redeploy).
        </p>

        {/* Añadir */}
        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8 }}>Añadir empresa</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginBottom: 10 }}>
          <input placeholder="Ticker *" value={add.ticker} onChange={e => setAdd({ ...add, ticker: e.target.value })} style={inputStyle} />
          <input placeholder="Nombre" value={add.name} onChange={e => setAdd({ ...add, name: e.target.value })} style={inputStyle} />
          <input placeholder="País (ES, US…)" value={add.country} onChange={e => setAdd({ ...add, country: e.target.value })} style={inputStyle} />
          <input placeholder="Divisa" value={add.currency} onChange={e => setAdd({ ...add, currency: e.target.value })} style={inputStyle} />
          <input placeholder="Sector" value={add.sector} onChange={e => setAdd({ ...add, sector: e.target.value })} style={inputStyle} />
          <input placeholder="Subsector" value={add.subsector} onChange={e => setAdd({ ...add, subsector: e.target.value })} style={inputStyle} />
          <select value={add.type} onChange={e => setAdd({ ...add, type: e.target.value })} style={inputStyle}>
            {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <button onClick={submitAdd} disabled={busy} style={{ fontSize: 12, fontWeight: 700, padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', background: 'var(--accent)', color: '#fff' }}>Añadir al DICT</button>

        {/* Ocultar */}
        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', margin: '20px 0 8px' }}>Ocultar empresa (fusionada / desaparecida)</p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input placeholder="Ticker a ocultar" value={rmTicker} onChange={e => setRmTicker(e.target.value)} style={{ ...inputStyle, width: 160 }} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer' }}>
            <input type="checkbox" checked={purge} onChange={e => setPurge(e.target.checked)} style={{ accentColor: 'var(--negative)' }} />
            Borrar también sus datos financieros
          </label>
          <button onClick={() => submitRemove(null, purge)} disabled={busy} style={{ fontSize: 12, fontWeight: 700, padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(248,113,113,0.3)', cursor: 'pointer', background: 'rgba(248,113,113,0.1)', color: 'var(--negative)' }}>Ocultar</button>
        </div>

        {msg && <p style={{ fontSize: 12, color: msg.type === 'ok' ? 'var(--positive)' : 'var(--negative)', marginTop: 12 }}>{msg.type === 'ok' ? '✓ ' : '✗ '}{msg.text}</p>}
      </Card>

      {/* Huérfanos: con datos pero fuera del DICT */}
      {data?.orphans?.length > 0 && (
        <Card>
          <SectionTitle>Tickers con datos pero fuera del listado ({data.orphans.length})</SectionTitle>
          <p style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 12 }}>Tienen fila en company_fundamentals pero no aparecen en la app. Añádelos al DICT para que se vean.</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {data.orphans.slice(0, 100).map(o => (
              <button key={o.ticker} onClick={() => quickAdd(o)} title={`${o.sector || ''} · ${o.country || ''}`} style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(99,102,241,0.3)', cursor: 'pointer', background: 'rgba(99,102,241,0.08)', color: 'var(--accent)' }}>
                + {o.ticker}
              </button>
            ))}
          </div>
        </Card>
      )}

      {/* Overrides activos */}
      {(data?.added?.length > 0 || data?.removed?.length > 0) && (
        <Card>
          <SectionTitle>Cambios activos en el DICT</SectionTitle>
          <div style={{ display: 'grid', gap: 6 }}>
            {(data.added || []).map(o => (
              <div key={'a' + o.ticker} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, padding: '6px 0', borderBottom: '1px solid var(--surface-2)' }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--positive)', background: 'rgba(52,211,153,0.12)', padding: '2px 7px', borderRadius: 5 }}>AÑADIDA</span>
                <span style={{ color: 'var(--text)', flex: 1 }}><b>{o.ticker}</b> {o.name} <span style={{ color: 'var(--text-faint)' }}>· {o.country} · {o.type}</span></span>
                <button onClick={() => undo(o.ticker)} disabled={busy} style={{ fontSize: 11, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Deshacer</button>
              </div>
            ))}
            {(data.removed || []).map(o => (
              <div key={'r' + o.ticker} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, padding: '6px 0', borderBottom: '1px solid var(--surface-2)' }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--negative)', background: 'rgba(248,113,113,0.12)', padding: '2px 7px', borderRadius: 5 }}>OCULTA</span>
                <span style={{ color: 'var(--text)', flex: 1 }}><b>{o.ticker}</b> {o.name}</span>
                <button onClick={() => undo(o.ticker)} disabled={busy} style={{ fontSize: 11, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Restaurar</button>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
