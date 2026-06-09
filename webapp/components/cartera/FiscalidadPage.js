'use client'
import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { buildFiscalSummary, yearlyPL, COUNTRY_NAMES, nameOf } from '@/lib/fiscalidad'

const CARD = { background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 20 }
const BOX  = { background: 'rgba(13,18,32,0.85)', border: '1px solid rgba(129,140,248,0.35)', borderRadius: 12, padding: '16px 18px' }

const fmtEUR = v => v == null || isNaN(v) ? '—' : v.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
const fmtPct = v => v == null ? '—' : v.toLocaleString('es-ES', { maximumFractionDigits: 2 }) + '%'
const fmtDate = d => d ? new Date(d).toLocaleDateString('es-ES') : '—'

function downloadCSV(filename, rows) {
  const csv = rows.map(r => r.map(c => {
    const s = c == null ? '' : String(c)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }).join(',')).join('\n')
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }))
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url)
}

function PremiumGate({ title }) {
  return (
    <div style={{ ...CARD, textAlign: 'center', padding: '32px 20px' }}>
      <p style={{ fontSize: 14, fontWeight: 700, color: '#818cf8', marginBottom: 6 }}>{title} — Premium</p>
      <p style={{ fontSize: 12, color: '#4a5270', marginBottom: 14, maxWidth: 420, marginInline: 'auto' }}>
        El desglose por empresa, las casillas de la renta, la compensación de pérdidas, la doble imposición y la exportación están disponibles con Premium.
      </p>
      <Link href="/pricing" style={{ padding: '9px 18px', background: 'rgba(99,102,241,0.85)', borderRadius: 8, color: '#fff', fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>Activar Premium →</Link>
    </div>
  )
}

function BoxCard({ box, concept, amount }) {
  return (
    <div style={BOX}>
      <p style={{ fontSize: 11, color: '#818cf8', fontWeight: 700, marginBottom: 2 }}>Casilla {box}</p>
      <p style={{ fontSize: 11, color: '#8090a8', marginBottom: 8 }}>{concept}</p>
      <p style={{ fontSize: 22, fontWeight: 900, color: '#e0e8f0' }}>{fmtEUR(amount)}</p>
    </div>
  )
}

const Th = (h, align = 'left') => <th key={h} style={{ padding: '6px 8px', textAlign: align, color: '#4a5270', borderBottom: '1px solid rgba(255,255,255,0.06)', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>

export default function FiscalidadPage({ isPremium, countryResidence }) {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [transactions, setTransactions] = useState([])
  const [dividends, setDividends] = useState([])
  const [countryFallback, setCountryFallback] = useState({})
  const [year, setYear] = useState(new Date().getFullYear())

  useEffect(() => {
    const load = async () => {
      const sb = createClient()
      const { data: { user } } = await sb.auth.getUser()
      if (!user) { router.push('/login'); return }
      const [{ data: tx }, { data: divs }, { data: pos }] = await Promise.all([
        sb.from('transactions').select('*').eq('user_id', user.id),
        sb.from('dividends_received').select('*').eq('user_id', user.id),
        sb.from('positions').select('ticker').eq('user_id', user.id),
      ])
      setTransactions(tx || [])
      setDividends(divs || [])
      const tickers = [...new Set([...(tx || []).map(t => t.ticker), ...(divs || []).map(d => d.ticker)])]
      if (tickers.length) {
        const { data: funds } = await sb.from('company_fundamentals').select('ticker, country').in('ticker', tickers)
        setCountryFallback(Object.fromEntries((funds || []).map(f => [f.ticker, f.country])))
      }
      setLoading(false)
    }
    load()
  }, [router])

  const years = useMemo(() => {
    const ys = new Set([new Date().getFullYear()])
    transactions.forEach(t => t.date && ys.add(new Date(t.date).getFullYear()))
    dividends.forEach(d => d.date && ys.add(new Date(d.date).getFullYear()))
    return [...ys].sort((a, b) => b - a)
  }, [transactions, dividends])

  const summary = useMemo(
    () => buildFiscalSummary(transactions, dividends, year, countryFallback),
    [transactions, dividends, year, countryFallback]
  )
  const compensation = useMemo(
    () => yearlyPL(transactions, year - 4, year),
    [transactions, year]
  )

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#4a5270' }}>Cargando…</div>

  // ── No residente en España ──────────────────────────────────────────────
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
          <Link href="/ajustes" style={{ padding: '10px 20px', background: 'rgba(99,102,241,0.85)', borderRadius: 9, color: '#fff', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
            Cambiar país de residencia
          </Link>
        </div>
      </div>
    )
  }

  const noDividends = dividends.length === 0
  const s = summary

  const exportBoxesCSV = () => {
    const rows = [['Casilla', 'Concepto', 'Importe (EUR)']]
    rows.push(['0029', 'Dividendos íntegros', s.boxes['0029'].toFixed(2)])
    rows.push(['0031', 'Retenciones sobre dividendos', s.boxes['0031'].toFixed(2)])
    rows.push(['0380', 'Ganancias patrimoniales', s.boxes['0380'].toFixed(2)])
    rows.push(['0382', 'Pérdidas patrimoniales', s.boxes['0382'].toFixed(2)])
    rows.push(['0588', 'Deducción doble imposición', s.boxes['0588'].toFixed(2)])
    downloadCSV(`fiscalidad_${year}.csv`, rows)
  }

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 16px 64px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, color: '#e0e8f0' }}>Fiscalidad</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: '#4a5270' }}>Ejercicio</span>
          <select value={year} onChange={e => setYear(Number(e.target.value))} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '7px 12px', color: '#c8d0e0', fontSize: 13, outline: 'none' }}>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {noDividends && (
        <div style={{ background: 'rgba(96,165,250,0.07)', border: '1px solid rgba(96,165,250,0.25)', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
          <p style={{ fontSize: 12.5, color: '#8090a8', lineHeight: 1.6 }}>
            Para calcular correctamente tu fiscalidad necesitas registrar los dividendos cobrados en{' '}
            <Link href="/cartera/historial" style={{ color: '#60a5fa', fontWeight: 700 }}>Historial → Dividendos cobrados</Link>.
          </p>
        </div>
      )}

      {/* ── SECCIÓN 1 — RESUMEN EJECUTIVO ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, marginBottom: 24 }}>
        <div style={{ ...CARD, padding: '16px 18px' }}>
          <p style={{ fontSize: 10.5, color: '#4a5270', marginBottom: 6 }}>Rendimientos de capital</p>
          <p style={{ fontSize: 22, fontWeight: 900, color: '#34d399' }}>{fmtEUR(s.grossDiv)}</p>
          <p style={{ fontSize: 10, color: '#3a4260', marginTop: 4 }}>Dividendos brutos cobrados</p>
        </div>
        <div style={{ ...CARD, padding: '16px 18px' }}>
          <p style={{ fontSize: 10.5, color: '#4a5270', marginBottom: 6 }}>Retenciones totales</p>
          <p style={{ fontSize: 22, fontWeight: 900, color: '#fb923c' }}>{fmtEUR(s.retTotal)}</p>
          <p style={{ fontSize: 10, color: '#3a4260', marginTop: 4 }}>Origen + destino</p>
        </div>
        <div style={{ ...CARD, padding: '16px 18px' }}>
          <p style={{ fontSize: 10.5, color: '#4a5270', marginBottom: 6 }}>Ganancias/pérdidas patrimoniales</p>
          <p style={{ fontSize: 22, fontWeight: 900, color: s.netCG >= 0 ? '#34d399' : '#f87171' }}>{(s.netCG >= 0 ? '+' : '') + fmtEUR(s.netCG)}</p>
          <p style={{ fontSize: 10, color: '#3a4260', marginTop: 4 }}>Resultado de transmisiones</p>
        </div>
        <div style={{ ...CARD, padding: '16px 18px' }}>
          <p style={{ fontSize: 10.5, color: '#4a5270', marginBottom: 6 }}>Base del ahorro estimada</p>
          <p style={{ fontSize: 22, fontWeight: 900, color: '#818cf8' }}>{fmtEUR(s.taxBase)}</p>
          <p style={{ fontSize: 10, color: '#3a4260', marginTop: 4 }}>Estimación orientativa — consulta con tu asesor</p>
        </div>
      </div>

      {!isPremium ? (
        <PremiumGate title="Desglose fiscal completo" />
      ) : (
        <>
          {/* ── SECCIÓN 2 — RCM ── */}
          <Section title="Rendimientos del capital mobiliario — Base del ahorro">
            {s.divRows.length === 0 ? (
              <p style={{ fontSize: 13, color: '#4a5270' }}>No hay dividendos registrados en {year}.</p>
            ) : (
              <>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 640 }}>
                    <thead><tr>{[Th('Empresa'), Th('País'), Th('Bruto', 'right'), Th('Retención origen', 'right'), Th('Neto', 'right')]}</tr></thead>
                    <tbody>
                      {s.divRows.map(r => (
                        <tr key={r.ticker} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          <td style={{ padding: '7px 8px', color: '#c8d0e0' }}>{r.name} <span style={{ color: '#3a4260', fontSize: 10 }}>{r.ticker}</span></td>
                          <td style={{ padding: '7px 8px', color: '#8090a8' }}>{r.country}</td>
                          <td style={{ padding: '7px 8px', textAlign: 'right', color: '#34d399', fontWeight: 600 }}>{fmtEUR(r.gross)}</td>
                          <td style={{ padding: '7px 8px', textAlign: 'right', color: '#fb923c', whiteSpace: 'nowrap' }}>{fmtPct(r.whtPct)} · {fmtEUR(r.retention)}</td>
                          <td style={{ padding: '7px 8px', textAlign: 'right', color: '#c8d0e0', fontWeight: 600 }}>{fmtEUR(r.net)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                        <td colSpan={2} style={{ padding: '8px', color: '#8090a8', fontWeight: 700 }}>Totales</td>
                        <td style={{ padding: '8px', textAlign: 'right', color: '#34d399', fontWeight: 700 }}>{fmtEUR(s.grossDiv)}</td>
                        <td style={{ padding: '8px', textAlign: 'right', color: '#fb923c', fontWeight: 700 }}>{fmtEUR(s.retTotal)}</td>
                        <td style={{ padding: '8px', textAlign: 'right', color: '#c8d0e0', fontWeight: 700 }}>{fmtEUR(s.netDiv)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <div style={{ ...BOX, marginTop: 16 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: '#818cf8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Casillas para tu declaración de la renta {year}</p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                    <BoxCard box="0029" concept="Dividendos íntegros" amount={s.boxes['0029']} />
                    <BoxCard box="0031" concept="Retenciones y pagos a cuenta" amount={s.boxes['0031']} />
                  </div>
                  <p style={{ fontSize: 10.5, color: '#4a5270', marginTop: 12, lineHeight: 1.5 }}>
                    Las retenciones en origen de países extranjeros se reflejan en las casillas de deducción por doble imposición — ver la sección correspondiente.
                  </p>
                </div>
              </>
            )}
          </Section>

          {/* ── SECCIÓN 3 — GANANCIAS Y PÉRDIDAS ── */}
          <Section title="Ganancias y pérdidas patrimoniales — Transmisiones de acciones">
            {!s.hasSells ? (
              <p style={{ fontSize: 13, color: '#4a5270' }}>No tienes transmisiones registradas en {year}.</p>
            ) : (
              <>
                {s.incompleteCost && (
                  <div style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.25)', borderRadius: 8, padding: '10px 14px', marginBottom: 12 }}>
                    <p style={{ fontSize: 11.5, color: '#fbbf24', lineHeight: 1.5 }}>⚠ Es posible que tengas compras anteriores a tu registro en la app no incluidas en este cálculo. Verifica los importes con tu broker.</p>
                  </div>
                )}
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 720 }}>
                    <thead><tr>{[Th('Empresa'), Th('F. compra'), Th('F. venta'), Th('Acciones', 'right'), Th('Coste compra', 'right'), Th('Venta neta', 'right'), Th('Resultado', 'right')]}</tr></thead>
                    <tbody>
                      {s.fifoRows.map((r, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          <td style={{ padding: '7px 8px', color: '#c8d0e0' }}>{nameOf(r.ticker)} <span style={{ color: '#3a4260', fontSize: 10 }}>{r.ticker}</span></td>
                          <td style={{ padding: '7px 8px', color: '#8090a8', whiteSpace: 'nowrap' }}>{r.incomplete ? '— (sin lote)' : fmtDate(r.buyDate)}</td>
                          <td style={{ padding: '7px 8px', color: '#8090a8', whiteSpace: 'nowrap' }}>{fmtDate(r.sellDate)}</td>
                          <td style={{ padding: '7px 8px', textAlign: 'right', color: '#8090a8' }}>{r.shares.toLocaleString('es-ES', { maximumFractionDigits: 4 })}</td>
                          <td style={{ padding: '7px 8px', textAlign: 'right', color: '#8090a8' }}>{r.costBasis != null ? fmtEUR(r.costBasis) : '—'}</td>
                          <td style={{ padding: '7px 8px', textAlign: 'right', color: '#8090a8' }}>{fmtEUR(r.proceeds)}</td>
                          <td style={{ padding: '7px 8px', textAlign: 'right', fontWeight: 700, color: r.gain == null ? '#4a5270' : r.gain >= 0 ? '#34d399' : '#f87171' }}>
                            {r.gain == null ? '—' : (r.gain >= 0 ? '+' : '') + fmtEUR(r.gain)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                        <td colSpan={6} style={{ padding: '8px', color: '#8090a8', fontWeight: 700 }}>Resultado neto</td>
                        <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700, color: s.netCG >= 0 ? '#34d399' : '#f87171' }}>{(s.netCG >= 0 ? '+' : '') + fmtEUR(s.netCG)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <div style={{ display: 'flex', gap: 20, marginTop: 12, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11.5, color: '#34d399' }}>Total ganancias: <b>{fmtEUR(s.gains)}</b></span>
                  <span style={{ fontSize: 11.5, color: '#f87171' }}>Total pérdidas: <b>{fmtEUR(s.losses)}</b></span>
                </div>
                <p style={{ fontSize: 10.5, color: '#4a5270', marginTop: 10, lineHeight: 1.5 }}>
                  El cálculo usa el método <b style={{ color: '#8090a8' }}>FIFO</b> (primera entrada, primera salida), el método establecido por la Agencia Tributaria española para acciones cotizadas.
                </p>
                <div style={{ ...BOX, marginTop: 16 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: '#818cf8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Casillas — Ganancias y pérdidas patrimoniales</p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                    <BoxCard box="0380" concept="Transmisiones con ganancia" amount={s.boxes['0380']} />
                    <BoxCard box="0382" concept="Transmisiones con pérdida" amount={s.boxes['0382']} />
                  </div>
                </div>
              </>
            )}
          </Section>

          {/* ── SECCIÓN 4 — COMPENSACIÓN ── */}
          {(s.losses > 0 || Object.entries(compensation).some(([y, v]) => Number(y) < year && v < 0)) && (
            <Section title="Compensación de pérdidas">
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 420 }}>
                  <thead><tr>{[Th('Ejercicio'), Th('Resultado patrimonial', 'right'), Th('Pérdida pendiente', 'right')]}</tr></thead>
                  <tbody>
                    {Object.entries(compensation).sort((a, b) => a[0] - b[0]).map(([y, v]) => (
                      <tr key={y} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td style={{ padding: '7px 8px', color: Number(y) === year ? '#c8d0e0' : '#8090a8', fontWeight: Number(y) === year ? 700 : 400 }}>{y}{Number(y) === year ? ' (actual)' : ''}</td>
                        <td style={{ padding: '7px 8px', textAlign: 'right', fontWeight: 600, color: v >= 0 ? '#34d399' : '#f87171' }}>{(v >= 0 ? '+' : '') + fmtEUR(v)}</td>
                        <td style={{ padding: '7px 8px', textAlign: 'right', color: '#f87171' }}>{v < 0 ? fmtEUR(Math.abs(v)) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p style={{ fontSize: 10.5, color: '#4a5270', marginTop: 12, lineHeight: 1.5 }}>
                Las pérdidas patrimoniales no compensadas en el ejercicio actual pueden compensarse con ganancias de los 4 ejercicios siguientes. Las pérdidas de capital solo pueden compensarse con ganancias de capital — no con dividendos.
              </p>
            </Section>
          )}

          {/* ── SECCIÓN 5 — DOBLE IMPOSICIÓN ── */}
          {s.hasForeign && (
            <Section title="Deducción por doble imposición internacional">
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 680 }}>
                  <thead><tr>{[Th('País'), Th('Empresa'), Th('Bruto', 'right'), Th('Retención origen', 'right'), Th('Límite (15%)', 'right'), Th('Deducible', 'right')]}</tr></thead>
                  <tbody>
                    {s.foreignRows.map(r => (
                      <tr key={r.ticker} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td style={{ padding: '7px 8px', color: '#8090a8' }}>{r.country}</td>
                        <td style={{ padding: '7px 8px', color: '#c8d0e0' }}>{r.name}</td>
                        <td style={{ padding: '7px 8px', textAlign: 'right', color: '#8090a8' }}>{fmtEUR(r.gross)}</td>
                        <td style={{ padding: '7px 8px', textAlign: 'right', color: '#fb923c', whiteSpace: 'nowrap' }}>{fmtPct(r.whtPct)} · {fmtEUR(r.retention)}</td>
                        <td style={{ padding: '7px 8px', textAlign: 'right', color: '#4a5270' }}>{fmtEUR(r.limit)}</td>
                        <td style={{ padding: '7px 8px', textAlign: 'right', color: '#34d399', fontWeight: 600 }}>{fmtEUR(r.deductible)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p style={{ fontSize: 10.5, color: '#4a5270', marginTop: 12, lineHeight: 1.5 }}>
                España tiene convenios de doble imposición con la mayoría de países. En general puedes deducir el impuesto pagado en el extranjero hasta el límite del 15% del dividendo bruto. Para EEUU el convenio establece un máximo del 15% de retención recuperable.
              </p>
              <div style={{ ...BOX, marginTop: 16 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1fr)', gap: 12 }}>
                  <BoxCard box="0588" concept="Deducción doble imposición internacional" amount={s.boxes['0588']} />
                </div>
              </div>
            </Section>
          )}

          {/* ── SECCIÓN 6 — RESUMEN FINAL ── */}
          <Section title={`Resumen final para la renta ${year}`}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr>{[Th('Casilla'), Th('Concepto'), Th('Importe', 'right')]}</tr></thead>
                <tbody>
                  {[
                    ['0029', 'Dividendos íntegros', s.boxes['0029']],
                    ['0031', 'Retenciones sobre dividendos', s.boxes['0031']],
                    ['0380', 'Ganancias patrimoniales', s.boxes['0380']],
                    ['0382', 'Pérdidas patrimoniales', s.boxes['0382']],
                    ['0588', 'Deducción doble imposición', s.boxes['0588']],
                  ].map(([box, concept, amount]) => (
                    <tr key={box} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding: '8px', color: '#818cf8', fontWeight: 700 }}>{box}</td>
                      <td style={{ padding: '8px', color: '#c8d0e0' }}>{concept}</td>
                      <td style={{ padding: '8px', textAlign: 'right', color: '#e0e8f0', fontWeight: 700 }}>{fmtEUR(amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
              <button onClick={() => window.print()} style={{ padding: '9px 16px', background: 'rgba(99,102,241,0.85)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Exportar como PDF</button>
              <button onClick={exportBoxesCSV} style={{ padding: '9px 16px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: '#c8d0e0', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Exportar como CSV</button>
            </div>
            <p style={{ fontSize: 10, color: '#2e3a55', marginTop: 12 }}>
              Las casillas son las vigentes para el ejercicio 2024-2025. Verifica que las casillas corresponden al ejercicio que estás declarando.
            </p>
          </Section>
        </>
      )}

      {/* ── AVISO LEGAL (siempre visible) ── */}
      <div style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.2)', borderRadius: 10, padding: '14px 18px', marginTop: 24 }}>
        <p style={{ fontSize: 11.5, color: '#a98a4a', lineHeight: 1.65 }}>
          ⚠ Esta información es orientativa y está basada en los datos que has introducido en la app. No constituye asesoramiento fiscal. Los importes calculados pueden diferir de los reales si hay operaciones no registradas, ajustes de valor o circunstancias fiscales particulares. Consulta siempre con un asesor fiscal antes de presentar tu declaración.
        </p>
      </div>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div style={{ ...CARD, marginBottom: 16 }}>
      <p style={{ fontSize: 13, fontWeight: 800, color: '#e0e8f0', marginBottom: 14 }}>{title}</p>
      {children}
    </div>
  )
}
