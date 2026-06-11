'use client'
import { useState, useMemo } from 'react'

const CARD  = { background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 20 }
const INPUT = { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '9px 12px', color: '#c8d0e0', fontSize: 13, outline: 'none', boxSizing: 'border-box' }

function fmtEUR(v) { return v != null ? v.toLocaleString('es-ES', { maximumFractionDigits: 0 }) + ' €' : '—' }
function fmtPct(v) { return v != null ? v.toFixed(1) + '%' : '—' }

function Slider({ label, value, min, max, step = 1, onChange, format }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, color: '#4a5270' }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#818cf8' }}>{format ? format(value) : value}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width: '100%', accentColor: '#818cf8' }}
      />
    </div>
  )
}

function Toggle({ value, onChange, label }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: 11, color: '#4a5270' }}>{label}</span>
      <button type="button" onClick={() => onChange(!value)} style={{
        width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
        background: value ? 'rgba(52,211,153,0.7)' : 'rgba(255,255,255,0.1)', position: 'relative',
      }}>
        <span style={{ position: 'absolute', top: 3, left: value ? 22 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
      </button>
    </div>
  )
}

// What-if: ¿qué pasa con mi renta si una empresa recorta el dividendo?
// Antes era la pestaña "Recorte dividendo" del simulador; ahora vive en el home
// junto a "Dividendos en riesgo", que es su contexto natural.
export default function DividendCutSimulator({ enriched, summary, isPremium }) {
  const [selectedTicker, setSelectedTicker] = useState('')
  const [cutPct,   setCutPct]   = useState(50)
  const [autoMode, setAutoMode] = useState(false)
  const [open,     setOpen]     = useState(false)

  const selected = enriched.find(p => p.ticker === selectedTicker)
  const atRisk   = enriched.filter(p => (p.payoutFCF || 0) > 80)

  const manualImpact = useMemo(() => {
    if (!selected || !selected.annualIncomeEUR) return null
    const lost = selected.annualIncomeEUR * cutPct / 100
    const newTotal = (summary.totalIncomeEUR || 0) - lost
    const pctLost  = summary.totalIncomeEUR > 0 ? lost / summary.totalIncomeEUR * 100 : 0
    const newYoC   = summary.totalCostEUR   > 0 ? newTotal / summary.totalCostEUR * 100 : null
    return { lost, newTotal, pctLost, newYoC }
  }, [selected, cutPct, summary])

  const autoImpact = useMemo(() => {
    const totalLost = atRisk.reduce((s, p) => s + (p.annualIncomeEUR || 0) * 0.50, 0)
    const newTotal  = (summary.totalIncomeEUR || 0) - totalLost
    const pctLost   = summary.totalIncomeEUR > 0 ? totalLost / summary.totalIncomeEUR * 100 : 0
    return { totalLost, newTotal, pctLost, affected: atRisk.map(p => p.name) }
  }, [atRisk, summary])

  const body = (
    <div style={{ ...CARD, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#4a5270', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Simular un recorte de dividendo</p>
          <p style={{ fontSize: 12, color: '#4a5270', marginTop: 2 }}>¿Cuánta renta perderías si una empresa recorta su dividendo?</p>
        </div>
        <button onClick={() => setOpen(o => !o)} style={{
          fontSize: 12, fontWeight: 700, color: '#818cf8', background: 'rgba(99,102,241,0.12)',
          border: '1px solid rgba(99,102,241,0.25)', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', flexShrink: 0,
        }}>
          {open ? 'Ocultar' : 'Simular →'}
        </button>
      </div>

      {open && (
        <div style={{ marginTop: 16 }}>
          <Toggle value={autoMode} onChange={setAutoMode} label="Recorte automático (50% en empresas con payout FCF >80%)" />

          {!autoMode ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginTop: 16 }}>
              <style>{`@media(max-width:560px){.cut-grid{grid-template-columns:1fr!important}}`}</style>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ fontSize: 11, color: '#4a5270', marginBottom: 6, display: 'block' }}>Empresa</label>
                  <select value={selectedTicker} onChange={e => setSelectedTicker(e.target.value)} style={{ ...INPUT, width: '100%' }}>
                    <option value="">Selecciona empresa…</option>
                    {enriched.filter(p => p.annualIncomeEUR > 0).map(p => (
                      <option key={p.ticker} value={p.ticker}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <Slider label="Porcentaje de recorte" value={cutPct} min={10} max={100} step={5} onChange={setCutPct} format={v => `${v}%`} />
              </div>
              {manualImpact ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: '#4a5270', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Impacto</p>
                  {[
                    { label: 'Dividendo perdido', value: `-${fmtEUR(manualImpact.lost)}`, col: '#f87171' },
                    { label: 'Nueva renta anual', value: fmtEUR(manualImpact.newTotal), col: '#c8d0e0' },
                    { label: '% de renta total perdida', value: `-${fmtPct(manualImpact.pctLost)}`, col: '#f87171' },
                    { label: 'Nuevo yield on cost', value: fmtPct(manualImpact.newYoC), col: '#818cf8' },
                  ].map(it => (
                    <div key={it.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 10px', background: 'rgba(255,255,255,0.02)', borderRadius: 8 }}>
                      <span style={{ fontSize: 11, color: '#4a5270' }}>{it.label}</span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: it.col }}>{it.value}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2e3a55', fontSize: 13 }}>
                  Selecciona una empresa para ver el impacto
                </div>
              )}
            </div>
          ) : (
            <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              <div>
                <p style={{ fontSize: 12, color: '#fbbf24', marginBottom: 10 }}>
                  {atRisk.length} empresa{atRisk.length !== 1 ? 's' : ''} con payout FCF {'>'} 80%:
                </p>
                {atRisk.length === 0 ? (
                  <p style={{ fontSize: 12, color: '#34d399' }}>✓ Ninguna empresa con payout elevado.</p>
                ) : atRisk.map(p => (
                  <div key={p.ticker} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 10px', background: 'rgba(248,113,113,0.06)', borderRadius: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 12, color: '#c8d0e0' }}>{p.name}</span>
                    <span style={{ fontSize: 11, color: '#fbbf24' }}>Payout: {p.payoutFCF?.toFixed(0)}%</span>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#4a5270', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Impacto agregado</p>
                {[
                  { label: 'Dividendo perdido total', value: `-${fmtEUR(autoImpact.totalLost)}`, col: '#f87171' },
                  { label: 'Nueva renta anual', value: fmtEUR(autoImpact.newTotal), col: '#c8d0e0' },
                  { label: '% de renta total perdida', value: `-${fmtPct(autoImpact.pctLost)}`, col: '#f87171' },
                ].map(it => (
                  <div key={it.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 10px', background: 'rgba(255,255,255,0.02)', borderRadius: 8 }}>
                    <span style={{ fontSize: 11, color: '#4a5270' }}>{it.label}</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: it.col }}>{it.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )

  if (!enriched.length) return null
  if (!isPremium) return null
  return body
}
