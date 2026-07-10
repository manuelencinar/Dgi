'use client'
import { useState, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { DICT } from '@/data/dict'
import { weightedAvgCost } from '@/lib/portfolio'
import { parseIngRows, buildImportRows, computeFinancials, computeDividend,
  tradeSignature, divKey, existingTradeSigs, existingDivIds } from '@/lib/broker-import'
import { countryCodeOf } from '@/lib/fiscalidad'

// Mapa ticker → { name, currency } del DICT (validación y edición manual).
const TICKER_MAP = Object.fromEntries(DICT.map(([name, ticker, , currency]) => [ticker, { name, currency }]))

const fmt = (n, d = 2) => n == null || isNaN(n) ? '—' : Number(n).toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d })
const r2 = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100
const TYPE_ES = { buy: 'Compra', sell: 'Venta', dividend: 'Dividendo' }

// Estado de cada fila para la previsualización.
function classify(row, tradeSigs, divIds) {
  if (row.type === 'dividend') {
    if (!row.totalEur || row.totalEur <= 0) return 'cero'
    if (!row.ticker) return 'sin'
    return divIds.has(divKey(row.ticker, row.date, row.divNet)) ? 'actualizar' : 'nuevo'
  }
  if (!row.ticker) return 'sin'
  return tradeSigs.has(tradeSignature(row.type, row.ticker, row.date, row.shares)) ? 'dup' : 'nuevo'
}

const STATUS_INFO = {
  nuevo:      { label: 'Nuevo',         color: 'var(--positive)' },
  actualizar: { label: 'Se actualiza',  color: '#60a5fa' },
  dup:        { label: 'Ya registrado', color: 'var(--text-muted)' },
  sin:        { label: 'Sin ticker',    color: 'var(--warning)' },
  cero:       { label: 'Importe 0',     color: 'var(--text-muted)' },
}
const INCLUDE_DEFAULT = new Set(['nuevo', 'actualizar'])

export default function ImportPage() {
  const router = useRouter()
  const sb = createClient()
  const fileRef = useRef(null)
  const [status, setStatus] = useState('idle')   // idle | parsing | preview | importing | done
  const [error, setError]   = useState(null)
  const [rows, setRows]     = useState([])
  const [tradeSigs, setTradeSigs] = useState(new Set())
  const [divIds, setDivIds] = useState(new Map())
  const [result, setResult] = useState(null)
  const [whtOverrides, setWhtOverrides] = useState(null)   // retenciones en origen por usuario/bróker

  const handleFile = async (file) => {
    if (!file) return
    setError(null); setStatus('parsing')
    try {
      const XLSX = await import('xlsx')
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const sheet = wb.Sheets[wb.SheetNames[0]]
      const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true })
      const { movements, error: perr } = parseIngRows(aoa)
      if (perr) { setError(perr); setStatus('idle'); return }
      if (!movements.length) { setError('No se encontraron movimientos en el fichero.'); setStatus('idle'); return }

      const { data: { user } } = await sb.auth.getUser()
      const [{ data: txs }, { data: divs }, { data: settings }] = await Promise.all([
        sb.from('transactions').select('ticker, type, shares, date').eq('user_id', user.id),
        sb.from('dividends_received').select('id, ticker, date, amount, amount_net').eq('user_id', user.id),
        sb.from('user_settings').select('wht_overrides').eq('user_id', user.id).maybeSingle(),
      ])
      const ov = (settings?.wht_overrides && typeof settings.wht_overrides === 'object') ? settings.wht_overrides : null
      setWhtOverrides(ov)
      const tsigs = existingTradeSigs(txs || [])
      const dids = existingDivIds(divs || [])
      setTradeSigs(tsigs); setDivIds(dids)

      const built = buildImportRows(movements, ov).map(r => {
        const st = classify(r, tsigs, dids)
        return { ...r, _status: st, include: INCLUDE_DEFAULT.has(st) }
      })
      setRows(built)
      setStatus('preview')
    } catch (e) {
      setError('No se pudo leer el fichero: ' + (e.message || e)); setStatus('idle')
    }
  }

  const onTicker = (id, ticker) => {
    setRows(prev => prev.map(r => {
      if (r.id !== id) return r
      const tk = ticker.trim().toUpperCase()
      const info = TICKER_MAP[tk]
      const currency = info?.currency || r.currency
      const fin = r.type === 'dividend' ? computeDividend(r, currency, countryCodeOf(tk, null), whtOverrides) : computeFinancials(r, currency)
      const next = { ...r, ticker: tk || null, matchedName: info?.name || null, currency, confidence: 'manual', ...fin }
      const st = classify(next, tradeSigs, divIds)
      return { ...next, _status: st, include: INCLUDE_DEFAULT.has(st) }
    }))
  }

  const toggle = (id) => setRows(prev => prev.map(r => r.id === id ? { ...r, include: !r.include } : r))

  const importable = useMemo(() => rows.filter(r => r.include && r.ticker && r._status !== 'cero'), [rows])

  const doImport = async () => {
    setStatus('importing'); setError(null)
    const { data: { user } } = await sb.auth.getUser()
    if (!user) { setError('Sesión expirada.'); setStatus('preview'); return }

    const batch = [...importable].sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0)
    let imported = 0, updated = 0, skipped = 0, errors = 0
    const seen = new Set(tradeSigs)

    for (const r of batch) {
      try {
        if (r.type === 'dividend') {
          const divFields = {
            amount: r.divGross, amount_net: r.divNet, shares: r.shares, dps: r.dps,
            withholding_origin: r.whOrigin, withholding_origin_pct: r.whOriginPct,
            withholding_dest: r.whDest, withholding_dest_pct: r.whDestPct,
            status: 'received', source: 'manual', date: r.date,
          }
          // Respaldo si alguna columna opcional no existe: conserva al menos estado/acciones.
          const safe = { amount: r.divGross, amount_net: r.divNet, shares: r.shares, dps: r.dps, status: 'received', date: r.date }
          const existingId = divIds.get(divKey(r.ticker, r.date, r.divNet))
          if (existingId) {
            let { error } = await sb.from('dividends_received').update(divFields).eq('id', existingId)
            if (error) ({ error } = await sb.from('dividends_received').update(safe).eq('id', existingId))
            if (error) { errors++; continue }
            updated++
          } else {
            let { error } = await sb.from('dividends_received').insert({ user_id: user.id, ticker: r.ticker, ...divFields })
            if (error) ({ error } = await sb.from('dividends_received').insert({ user_id: user.id, ticker: r.ticker, ...safe }))
            if (error) { errors++; continue }
            imported++
          }
          continue
        }

        // Compra / venta — saltar si ya existe.
        const sig = tradeSignature(r.type, r.ticker, r.date, r.shares)
        if (seen.has(sig)) { skipped++; continue }
        seen.add(sig)

        const baseTx = {
          user_id: user.id, ticker: r.ticker, type: r.type,
          shares: r.shares, price: r.price, date: r.date,
          currency: r.currency, amount_original: r.amountOriginal,
          exchange_rate: r.exchangeRate, exchange_rate_date: r.date,
          total_cost_base_currency: r.totalEur, notes: 'Importado de ING',
        }
        let { error: txErr } = await sb.from('transactions').insert({
          ...baseTx, commission: r.commission ?? 0, commission_currency: r.commissionCur, total_cost: r.totalEur,
        })
        if (txErr && /commission|total_cost|exchange_rate|amount_original|currency/.test(txErr.message)) {
          ;({ error: txErr } = await sb.from('transactions').insert({ user_id: user.id, ticker: r.ticker, type: r.type, shares: r.shares, price: r.price, date: r.date, notes: 'Importado de ING' }))
        }
        if (txErr) { errors++; continue }

        const { data: pos } = await sb.from('positions').select('*').eq('user_id', user.id).eq('ticker', r.ticker).maybeSingle()
        if (r.type === 'buy') {
          if (pos) {
            await sb.from('positions').update({ shares: pos.shares + r.shares, avg_cost: weightedAvgCost(pos.shares, pos.avg_cost, r.shares, r.price), updated_at: new Date().toISOString() }).eq('id', pos.id)
          } else {
            let { error: pErr } = await sb.from('positions').insert({ user_id: user.id, ticker: r.ticker, shares: r.shares, avg_cost: r.price, currency: r.currency, asset_type: 'stock' })
            if (pErr && /asset_type/.test(pErr.message)) await sb.from('positions').insert({ user_id: user.id, ticker: r.ticker, shares: r.shares, avg_cost: r.price, currency: r.currency })
          }
        } else if (pos) {
          const remaining = pos.shares - r.shares
          if (remaining <= 0.0000001) await sb.from('positions').delete().eq('id', pos.id)
          else await sb.from('positions').update({ shares: remaining, updated_at: new Date().toISOString() }).eq('id', pos.id)
        }
        imported++
      } catch { errors++ }
    }
    setResult({ imported, updated, skipped, errors })
    setStatus('done')
  }

  const counts = useMemo(() => {
    const c = { nuevo: 0, actualizar: 0, dup: 0, sin: 0, cero: 0 }
    rows.forEach(r => { c[r._status] = (c[r._status] || 0) + 1 })
    return c
  }, [rows])

  return (
    <div style={{ maxWidth: 1040, margin: '0 auto', padding: '24px 16px 60px' }}>
      <Link href="/cartera" style={{ fontSize: 12, color: 'var(--accent)', textDecoration: 'none' }}>← Volver a la cartera</Link>
      <h1 style={{ fontSize: 22, fontWeight: 900, color: 'var(--text-strong)', margin: '10px 0 4px' }}>Importar movimientos</h1>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20, lineHeight: 1.55 }}>
        Sube el fichero de movimientos de <b style={{ color: 'var(--text)' }}>ING</b> (Cartera → Movimientos → Exportar a Excel). Detectamos compras, ventas y dividendos, calculamos comisiones y retenciones, y no duplicamos lo que ya tengas registrado.
      </p>

      {(status === 'idle' || status === 'parsing') && (
        <div
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files?.[0]) }}
          onClick={() => fileRef.current?.click()}
          style={{ border: '1.5px dashed rgba(99,102,241,0.4)', borderRadius: 14, padding: '40px 20px', textAlign: 'center', cursor: 'pointer', background: 'rgba(99,102,241,0.04)' }}
        >
          <p style={{ fontSize: 14, color: 'var(--text)', fontWeight: 700 }}>{status === 'parsing' ? 'Leyendo fichero…' : 'Arrastra aquí tu fichero .xls de ING'}</p>
          <p style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 6 }}>o haz clic para seleccionarlo (.xls / .xlsx)</p>
          <input ref={fileRef} type="file" accept=".xls,.xlsx" style={{ display: 'none' }} onChange={e => handleFile(e.target.files?.[0])} />
        </div>
      )}

      {error && <p style={{ fontSize: 13, color: 'var(--negative)', marginTop: 14 }}>{error}</p>}

      {status === 'preview' && (
        <>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', margin: '18px 0 12px', fontSize: 12 }}>
            <span style={{ color: 'var(--positive)' }}>● {counts.nuevo} nuevos</span>
            {counts.actualizar > 0 && <span style={{ color: '#60a5fa' }}>● {counts.actualizar} dividendos a actualizar</span>}
            <span style={{ color: 'var(--text-muted)' }}>● {counts.dup} ya registrados</span>
            {counts.sin > 0 && <span style={{ color: 'var(--warning)' }}>● {counts.sin} sin ticker (asígnalos abajo)</span>}
            {counts.cero > 0 && <span style={{ color: 'var(--text-muted)' }}>● {counts.cero} con importe 0 (se omiten)</span>}
          </div>

          <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 10 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5, minWidth: 820 }}>
              <thead>
                <tr style={{ background: 'var(--surface-2)' }}>
                  {['', 'Fecha', 'Tipo', 'Valor (ING)', 'Ticker', 'Títulos', 'Precio / DPS', 'Comis. / Retenc.', 'Importe €', 'Estado'].map((h, i) => (
                    <th key={i} style={{ padding: '8px', textAlign: i > 4 ? 'right' : 'left', color: 'var(--text-faint)', fontWeight: 600, whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const si = STATUS_INFO[r._status] || STATUS_INFO.nuevo
                  const canImport = r._status !== 'cero' && !!r.ticker
                  const isDiv = r.type === 'dividend'
                  return (
                    <tr key={r.id} style={{ opacity: r._status === 'cero' || r._status === 'dup' ? 0.55 : 1, borderBottom: '1px solid var(--surface-2)' }}>
                      <td style={{ padding: '6px 8px' }}>
                        <input type="checkbox" checked={r.include} disabled={!canImport} onChange={() => toggle(r.id)} />
                      </td>
                      <td style={{ padding: '6px 8px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{r.date}</td>
                      <td style={{ padding: '6px 8px', color: r.type === 'sell' ? 'var(--negative)' : isDiv ? 'var(--warning)' : 'var(--positive)' }}>{TYPE_ES[r.type]}</td>
                      <td style={{ padding: '6px 8px', color: 'var(--text)', maxWidth: 170, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={`${r.ingName} · ${r.market}`}>{r.ingName}</td>
                      <td style={{ padding: '6px 8px' }}>
                        <input
                          value={r.ticker || ''} list="dict-tickers"
                          onChange={e => onTicker(r.id, e.target.value)}
                          placeholder="ticker"
                          style={{ width: 86, background: 'var(--bg-elev)', border: `1px solid ${r.ticker ? 'var(--border-strong)' : 'rgba(251,191,36,0.5)'}`, borderRadius: 6, color: r.ticker ? 'var(--text)' : 'var(--warning)', fontSize: 11.5, padding: '4px 6px' }}
                        />
                        {r.matchedName && <div style={{ fontSize: 9.5, color: 'var(--text-faint)', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.matchedName}>{r.matchedName}</div>}
                      </td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--text)' }}>{fmt(r.shares, 0)}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--text)', whiteSpace: 'nowrap' }}>
                        {isDiv ? (r.dps != null ? `${fmt(r.dps, 3)} ${r.currency}` : '—') : `${fmt(r.price, 2)} ${r.currency}`}
                      </td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {isDiv ? (r.whAmount != null ? `${fmt(r.whAmount)} (${fmt(r.whPct, 0)}%)` : '—') : (r.commission != null ? fmt(r.commission) : '—')}
                      </td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--text)' }}>{fmt(r.totalEur)}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right' }}><span style={{ color: si.color, fontSize: 10.5, fontWeight: 700 }}>{si.label}</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <datalist id="dict-tickers">{DICT.slice(0, 4000).map(([, t]) => <option key={t} value={t} />)}</datalist>
          </div>

          <p style={{ fontSize: 10.5, color: 'var(--text-faintest)', marginTop: 10, lineHeight: 1.5 }}>
            En mercados en euros la comisión se deriva (compra: sumada al precio; venta: descontada) y la retención del dividendo se calcula (bruto − neto). En divisa extranjera el precio queda en su divisa y la retención va incluida en el cambio (no se desglosa).
          </p>

          <div style={{ display: 'flex', gap: 10, marginTop: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <button onClick={doImport} disabled={!importable.length} style={{ fontSize: 13, fontWeight: 700, color: '#fff', background: importable.length ? 'rgba(52,211,153,0.85)' : 'var(--border)', border: 'none', borderRadius: 9, padding: '10px 18px', cursor: importable.length ? 'pointer' : 'default' }}>
              Importar {importable.length} movimiento{importable.length === 1 ? '' : 's'}
            </button>
            <button onClick={() => { setRows([]); setStatus('idle'); setError(null) }} style={{ fontSize: 13, color: 'var(--text-muted)', background: 'none', border: '1px solid var(--border-strong)', borderRadius: 9, padding: '10px 16px', cursor: 'pointer' }}>Cancelar</button>
          </div>
        </>
      )}

      {status === 'importing' && <p style={{ fontSize: 14, color: 'var(--accent)', marginTop: 20 }}>Importando movimientos…</p>}

      {status === 'done' && result && (
        <div style={{ marginTop: 20, background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.25)', borderRadius: 12, padding: 20 }}>
          <p style={{ fontSize: 15, fontWeight: 800, color: 'var(--positive)', marginBottom: 6 }}>✓ Importación completada</p>
          <p style={{ fontSize: 13, color: 'var(--text)' }}>
            {result.imported} importados{result.updated ? ` · ${result.updated} dividendos actualizados` : ''} · {result.skipped} omitidos (duplicados){result.errors ? ` · ${result.errors} con error` : ''}.
          </p>
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <Link href="/cartera" style={{ fontSize: 13, fontWeight: 700, color: '#fff', background: 'var(--accent)', borderRadius: 9, padding: '10px 18px', textDecoration: 'none' }}>Ver mi cartera →</Link>
            <button onClick={() => { setRows([]); setResult(null); setStatus('idle') }} style={{ fontSize: 13, color: 'var(--text-muted)', background: 'none', border: '1px solid var(--border-strong)', borderRadius: 9, padding: '10px 16px', cursor: 'pointer' }}>Importar otro fichero</button>
          </div>
        </div>
      )}
    </div>
  )
}
