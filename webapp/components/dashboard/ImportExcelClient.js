'use client'
import { useState, useEffect, useRef } from 'react'
import * as XLSX from 'xlsx'
import { Card, SectionTitle } from '@/components/dashboard/ui'
import { processSheet } from '@/lib/investing-parser'

const BLOCK_COLS = [6, 17, 28, 39, 50, 61]
const BLOCK_TITLES = [
  'Cuenta de resultados anual', 'Cuenta de resultados trimestral',
  'Balance anual', 'Balance trimestral', 'Flujo de caja anual', 'Flujo de caja trimestral',
]

function fmtDateTime(d) {
  if (!d) return '—'
  return new Date(d).toLocaleString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// Genera la matriz (aoa) de una pestaña vacía con la estructura de la plantilla
function emptySheetAoa() {
  const titleRow = []
  const headerRow = []
  BLOCK_COLS.forEach((c, i) => {
    titleRow[c] = BLOCK_TITLES[i]
    headerRow[c] = 'Período terminado:'
    for (let y = 1; y <= 7; y++) headerRow[c + 1 + y - 1] = `Año ${y}`
  })
  // Fila de etiquetas guía bajo cada bloque (columna c+1)
  const labelRow = []
  BLOCK_COLS.forEach(c => { labelRow[c + 1] = '(pega aquí las partidas de Investing.com)' })
  return [['Dividendos (col A: fecha, col B: importe)'], titleRow, headerRow, labelRow]
}

export default function ImportExcelClient() {
  const [file, setFile] = useState(null)
  const [overwrite, setOverwrite] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState(null)
  const [summary, setSummary] = useState(null)
  const [error, setError] = useState(null)
  const [showDetails, setShowDetails] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef(null)

  const [manualRows, setManualRows] = useState(null)
  const [stale, setStale] = useState(null)
  const [genBusy, setGenBusy] = useState(false)
  const [unprotecting, setUnprotecting] = useState(null)

  const loadTables = () => {
    fetch('/api/admin/import-excel?action=manual-status').then(r => r.json()).then(d => setManualRows(d.rows || [])).catch(() => setManualRows([]))
    fetch('/api/admin/import-excel?action=stale').then(r => r.json()).then(d => setStale(d)).catch(() => setStale({ stale: [], missing: [] }))
  }
  useEffect(() => { loadTables() }, [])

  const pickFile = (f) => {
    if (!f) return
    if (!f.name.toLowerCase().endsWith('.xlsx')) { setError('Solo se aceptan ficheros .xlsx'); return }
    if (f.size > 50 * 1024 * 1024) { setError('El fichero supera los 50MB'); return }
    setError(null); setSummary(null); setFile(f)
  }

  async function handleProcess() {
    if (!file || processing) return
    setProcessing(true); setError(null); setSummary(null); setProgress(null)
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const sheets = wb.SheetNames.filter(n => n.trim().toUpperCase() !== 'INSTRUCCIONES')
      const records = []
      for (let i = 0; i < sheets.length; i++) {
        const name = sheets[i]
        setProgress({ phase: 'parse', i: i + 1, total: sheets.length, ticker: name })
        try {
          const grid = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null })
          const rec = processSheet(grid, name)
          if (rec) records.push(rec)
        } catch {}
        if (i % 8 === 0) await new Promise(r => setTimeout(r, 0))
      }
      if (!records.length) { setError('No se encontraron datos financieros en ninguna pestaña (¿plantilla sin rellenar?).'); setProcessing(false); setProgress(null); return }

      const BATCH = 20
      const agg = { updated: 0, created: 0, errors: 0, total: records.length }
      const allResults = []
      for (let i = 0; i < records.length; i += BATCH) {
        const batch = records.slice(i, i + BATCH)
        setProgress({ phase: 'save', i: Math.min(i + BATCH, records.length), total: records.length })
        const res = await fetch('/api/admin/import-excel', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ records: batch, overwrite_manual: overwrite, silent: true }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Error en el servidor')
        agg.updated += json.updated; agg.created += json.created; agg.errors += json.errors
        allResults.push(...(json.results || []))
      }
      // Log final único
      await fetch('/api/admin/import-excel', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logOnly: true, aggregate: agg, overwrite_manual: overwrite }),
      }).catch(() => {})

      setSummary({ ...agg, results: allResults })
      setProgress(null)
      loadTables()
    } catch (e) {
      setError(String(e.message || e))
      setProgress(null)
    } finally {
      setProcessing(false)
    }
  }

  async function generateEmptyTemplate() {
    if (!stale || genBusy) return
    setGenBusy(true)
    try {
      const tickers = [...(stale.missing || []).map(m => m.ticker), ...(stale.stale || []).map(s => s.ticker)]
      const uniq = [...new Set(tickers)].slice(0, 200) // límite por seguridad
      if (!uniq.length) { setGenBusy(false); return }
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
        ['INSTRUCCIONES'], ['Rellena cada pestaña pegando los datos de Investing.com en los bloques marcados.'],
        ['Una pestaña por empresa. El nombre de la pestaña es el ticker.'],
      ]), 'INSTRUCCIONES')
      for (const t of uniq) {
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(emptySheetAoa()), t.slice(0, 31))
      }
      XLSX.writeFile(wb, 'plantilla_empresas_pendientes.xlsx')
    } finally {
      setGenBusy(false)
    }
  }

  function exportStaleCsv() {
    if (!stale) return
    const rows = [['ticker', 'nombre', 'tipo', 'ultimo_año', 'meses_sin_actualizar']]
    ;(stale.missing || []).forEach(m => rows.push([m.ticker, m.name, 'sin datos', '', '']))
    ;(stale.stale || []).forEach(s => rows.push([s.ticker, s.name, 'desactualizada', s.through, s.monthsBehind]))
    const csv = rows.map(r => r.map(c => `"${String(c ?? '')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'empresas_pendientes.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  async function unprotect(ticker) {
    setUnprotecting(ticker)
    try {
      await fetch('/api/admin/import-excel', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticker }) })
      loadTables()
    } finally { setUnprotecting(null) }
  }

  const pct = progress ? Math.round((progress.i / progress.total) * 100) : 0

  return (
    <div style={{ maxWidth: 1100, display: 'grid', gap: 16, marginBottom: 24 }}>
      {/* ── SUBSECCIÓN 1 — Subida ── */}
      <Card>
        <SectionTitle>Importar desde Excel</SectionTitle>
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); pickFile(e.dataTransfer.files?.[0]) }}
          style={{
            border: `2px dashed ${dragOver ? 'var(--accent)' : 'var(--border-strong)'}`, borderRadius: 12,
            padding: '28px 20px', textAlign: 'center', cursor: 'pointer',
            background: dragOver ? 'rgba(99,102,241,0.06)' : 'transparent', transition: 'all 0.15s',
          }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📊</div>
          <p style={{ fontSize: 14, color: 'var(--text)', fontWeight: 600 }}>
            {file ? file.name : 'Arrastra la plantilla aquí o pulsa para seleccionar'}
          </p>
          <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 4 }}>Solo .xlsx · máximo 50MB</p>
          <input ref={inputRef} type="file" accept=".xlsx" style={{ display: 'none' }}
            onChange={e => pickFile(e.target.files?.[0])} />
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, cursor: 'pointer' }}>
          <input type="checkbox" checked={overwrite} onChange={e => setOverwrite(e.target.checked)} style={{ accentColor: '#f59e0b' }} />
          <div>
            <p style={{ fontSize: 13, color: 'var(--warning)', fontWeight: 600 }}>⚠ Sobreescribir datos manuales existentes</p>
            <p style={{ fontSize: 11, color: 'var(--text-faint)' }}>Si está desactivado, los datos que introdujiste manualmente nunca se sobreescriben.</p>
          </div>
        </label>

        <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
          <button onClick={handleProcess} disabled={!file || processing} style={{
            fontSize: 13, fontWeight: 700, padding: '9px 18px', borderRadius: 8, border: 'none',
            cursor: file && !processing ? 'pointer' : 'not-allowed',
            background: file && !processing ? 'var(--accent)' : 'var(--border)',
            color: file && !processing ? '#fff' : 'var(--text-faint)',
          }}>{processing ? 'Procesando…' : 'Procesar Excel'}</button>
          <a href="/plantilla_investing.xlsx" download style={{
            fontSize: 13, fontWeight: 700, padding: '9px 18px', borderRadius: 8, textDecoration: 'none',
            background: 'var(--surface-3)', border: '1px solid var(--border-strong)', color: 'var(--text-muted)',
          }}>Descargar plantilla</a>
          <button onClick={generateEmptyTemplate} disabled={genBusy || !stale} style={{
            fontSize: 13, fontWeight: 700, padding: '9px 18px', borderRadius: 8, border: '1px solid var(--border-strong)',
            cursor: 'pointer', background: 'var(--surface-3)', color: 'var(--text-muted)',
          }}>{genBusy ? 'Generando…' : 'Plantilla con empresas sin datos'}</button>
        </div>

        {error && <p style={{ fontSize: 12, color: 'var(--negative)', marginTop: 12 }}>✗ {error}</p>}

        {/* ── SUBSECCIÓN 2 — Progreso / resultado ── */}
        {progress && (
          <div style={{ marginTop: 16 }}>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
              {progress.phase === 'parse'
                ? `Procesando pestaña ${progress.i} de ${progress.total}: ${progress.ticker}`
                : `Guardando ${progress.i} de ${progress.total} empresas…`}
            </p>
            <div style={{ height: 8, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct}%`, background: 'var(--accent)', borderRadius: 4, transition: 'width 0.2s' }} />
            </div>
          </div>
        )}

        {summary && (
          <div style={{ marginTop: 16, padding: '14px 16px', background: 'var(--surface)', borderRadius: 10 }}>
            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginBottom: summary.results?.length ? 10 : 0 }}>
              <span style={{ fontSize: 13, color: 'var(--positive)', fontWeight: 700 }}>✓ {summary.updated} actualizadas</span>
              <span style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 700 }}>✓ {summary.created} creadas</span>
              {summary.errors > 0 && <span style={{ fontSize: 13, color: 'var(--negative)', fontWeight: 700 }}>✗ {summary.errors} errores</span>}
            </div>
            {summary.results?.length > 0 && (
              <>
                <button onClick={() => setShowDetails(s => !s)} style={{ fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  {showDetails ? 'Ocultar detalle ▲' : 'Ver detalle por empresa ▼'}
                </button>
                {showDetails && (
                  <div style={{ marginTop: 10, maxHeight: 300, overflowY: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                      <thead><tr>
                        {['Ticker', 'Estado', 'Campos añadidos', 'Saltados (manual)'].map(h => (
                          <th key={h} style={{ padding: '5px 8px', textAlign: 'left', color: 'var(--text-faint)', borderBottom: '1px solid var(--border)' }}>{h}</th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {summary.results.map((r, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid var(--surface-2)' }}>
                            <td style={{ padding: '5px 8px', color: 'var(--text)', fontWeight: 600 }}>{r.ticker}</td>
                            <td style={{ padding: '5px 8px', color: r.status === 'error' ? 'var(--negative)' : r.status === 'created' ? 'var(--accent)' : 'var(--positive)' }}>{r.status === 'error' ? `error: ${r.error}` : r.status}</td>
                            <td style={{ padding: '5px 8px', color: 'var(--text-muted)' }}>{r.fieldsAdded?.length || 0}</td>
                            <td style={{ padding: '5px 8px', color: 'var(--warning)' }}>{r.fieldsSkipped?.length ? r.fieldsSkipped.join(', ') : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </Card>

      {/* ── SUBSECCIÓN 3 — Estado de datos manuales ── */}
      <Card>
        <SectionTitle>Empresas con datos manuales</SectionTitle>
        {manualRows == null ? <p style={{ fontSize: 12, color: 'var(--text-faint)' }}>Cargando…</p>
          : manualRows.length === 0 ? <p style={{ fontSize: 12, color: 'var(--text-faint)' }}>Aún no hay empresas con datos manuales.</p>
          : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 640 }}>
                <thead><tr>
                  {['Empresa', 'Campos protegidos', 'Última importación', 'Datos hasta', ''].map(h => (
                    <th key={h} style={{ padding: '6px 8px', textAlign: 'left', color: 'var(--text-faint)', borderBottom: '1px solid var(--border)', fontWeight: 600 }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {manualRows.map(r => (
                    <tr key={r.ticker} style={{ borderBottom: '1px solid var(--surface-2)' }}>
                      <td style={{ padding: '6px 8px', color: 'var(--text)' }}><b>{r.ticker}</b> <span style={{ color: 'var(--text-faint)' }}>{r.name}</span></td>
                      <td style={{ padding: '6px 8px', color: 'var(--text-muted)', maxWidth: 240 }}>{r.protectedFields.length} campos</td>
                      <td style={{ padding: '6px 8px', color: 'var(--text-muted)' }}>{fmtDateTime(r.lastImport)}</td>
                      <td style={{ padding: '6px 8px', color: 'var(--text-muted)' }}>{r.vintage?.income_statement_annual_through || '—'}</td>
                      <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>
                        <button onClick={() => unprotect(r.ticker)} disabled={unprotecting === r.ticker} style={{ fontSize: 11, color: 'var(--warning)', background: 'none', border: '1px solid rgba(251,191,36,0.3)', borderRadius: 6, padding: '3px 8px', cursor: 'pointer', marginRight: 6 }}>
                          {unprotecting === r.ticker ? '…' : 'Desproteger'}
                        </button>
                        <a href={`/empresa/${encodeURIComponent(r.ticker)}`} target="_blank" rel="noopener" style={{ fontSize: 11, color: 'var(--accent)', textDecoration: 'none' }}>Ver →</a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </Card>

      {/* ── SUBSECCIÓN 4 — Empresas desactualizadas ── */}
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
          <SectionTitle>Empresas sin datos o desactualizadas</SectionTitle>
          <button onClick={exportStaleCsv} disabled={!stale} style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', background: 'var(--surface-3)', border: '1px solid var(--border-strong)', borderRadius: 6, padding: '5px 10px', cursor: 'pointer' }}>Exportar CSV</button>
        </div>
        {stale == null ? <p style={{ fontSize: 12, color: 'var(--text-faint)' }}>Cargando…</p> : (
          <>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
              <b style={{ color: 'var(--negative)' }}>{stale.missing?.length || 0}</b> sin datos · <b style={{ color: 'var(--warning)' }}>{stale.stale?.length || 0}</b> con datos manuales atrasados (&gt;12 meses)
            </p>
            <div style={{ overflowX: 'auto', maxHeight: 360 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 520 }}>
                <thead><tr>
                  {['Empresa', 'Estado', 'Último año', 'Meses atrás'].map(h => (
                    <th key={h} style={{ padding: '6px 8px', textAlign: 'left', color: 'var(--text-faint)', borderBottom: '1px solid var(--border)', fontWeight: 600, position: 'sticky', top: 0, background: 'var(--bg-elev)' }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {(stale.stale || []).map(s => (
                    <tr key={s.ticker} style={{ borderBottom: '1px solid var(--surface-2)' }}>
                      <td style={{ padding: '6px 8px', color: 'var(--text)' }}><b>{s.ticker}</b> <span style={{ color: 'var(--text-faint)' }}>{s.name}</span></td>
                      <td style={{ padding: '6px 8px', color: 'var(--warning)' }}>desactualizada</td>
                      <td style={{ padding: '6px 8px', color: 'var(--text-muted)' }}>{s.through}</td>
                      <td style={{ padding: '6px 8px', color: 'var(--text-muted)' }}>{s.monthsBehind}</td>
                    </tr>
                  ))}
                  {(stale.missing || []).slice(0, 200).map(m => (
                    <tr key={m.ticker} style={{ borderBottom: '1px solid var(--surface-2)' }}>
                      <td style={{ padding: '6px 8px', color: 'var(--text)' }}><b>{m.ticker}</b> <span style={{ color: 'var(--text-faint)' }}>{m.name}</span></td>
                      <td style={{ padding: '6px 8px', color: 'var(--negative)' }}>sin datos</td>
                      <td style={{ padding: '6px 8px', color: 'var(--text-faint)' }}>—</td>
                      <td style={{ padding: '6px 8px', color: 'var(--text-faint)' }}>—</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>
    </div>
  )
}
