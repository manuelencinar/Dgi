'use client'
import { useState } from 'react'
import Link from 'next/link'

// Partidas que van en negrita y muestran variación YoY
const IMPORTANT_IS = new Set(['Ingresos Totales','Beneficio Bruto','EBIT / Bº Operativo','EBITDA','EBITDA Normalizado','Beneficio Neto'])
const IMPORTANT_BS = new Set(['Activos Totales','Deuda Total','Caja y Equivalentes','Patrimonio Neto','Deuda a L/P'])
const IMPORTANT_CF = new Set(['Cash Flow Operativo','Capex','Flujo de Caja Libre','Dividendos Pagados'])

// Partidas donde MENOR es mejor (para invertir el color de variación)
const LOWER_IS_BETTER = new Set(['Deuda Total','Deuda a L/P','Total Pasivo','Capex'])

const IMPORTANT_ALL = new Set([...IMPORTANT_IS, ...IMPORTANT_BS, ...IMPORTANT_CF])

// ── helpers ────────────────────────────────────────────────────────────────

function fmtM(v) {
  if (v == null) return '—'
  const m = v / 1e6
  if (Math.abs(m) >= 1000) return `${(m / 1000).toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}B`
  return `${m.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}M`
}

function formatPeriod(dateStr, isQuarterly) {
  try {
    const d = new Date(dateStr + 'T00:00:00Z')
    if (!isQuarterly) return String(d.getUTCFullYear())
    const q = Math.ceil((d.getUTCMonth() + 1) / 3)
    return `Q${q} ${d.getUTCFullYear()}`
  } catch { return dateStr }
}

function yoyPct(current, prev, lowerBetter) {
  if (current == null || prev == null || prev === 0) return null
  const pct = (current - prev) / Math.abs(prev)
  const improved = lowerBetter ? pct < 0 : pct > 0
  return { pct, improved }
}

// ── sub-components ─────────────────────────────────────────────────────────

function TableView({ stmt, isQuarterly, important }) {
  if (!stmt?.columns?.length || !stmt?.data) {
    return <p style={{ fontSize: 13, color: '#4a5270', textAlign: 'center', padding: '24px 0' }}>Datos no disponibles para esta empresa.</p>
  }

  const cols    = stmt.columns
  const data    = stmt.data
  const labels  = Object.keys(data)
  const periods = cols.map(c => formatPeriod(c, isQuarterly))

  return (
    <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: Math.max(400, cols.length * 110) }}>
        <thead>
          <tr>
            <th style={{ padding: '8px 10px', textAlign: 'left', color: '#4a5270', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.06)', whiteSpace: 'nowrap', minWidth: 180 }}>
              Partida
            </th>
            {periods.map(p => (
              <th key={p} style={{ padding: '8px 10px', textAlign: 'right', color: '#4a5270', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.06)', whiteSpace: 'nowrap' }}>
                {p}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {labels.map((label, ri) => {
            const vals = data[label]
            const isKey = important.has(label)
            const lowerBetter = LOWER_IS_BETTER.has(label)

            return (
              <tr key={label} style={{ background: ri % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}>
                <td style={{ padding: '7px 10px', color: isKey ? '#c8d0e0' : '#8090a8', fontWeight: isKey ? 700 : 400, whiteSpace: 'nowrap', borderBottom: isKey ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                  {label}
                </td>
                {vals.map((v, ci) => {
                  const prev = vals[ci + 1] ?? null
                  const yoy  = isKey ? yoyPct(v, prev, lowerBetter) : null
                  return (
                    <td key={ci} style={{ padding: '7px 10px', textAlign: 'right', color: isKey ? '#c8d0e0' : '#4a5270', fontWeight: isKey ? 700 : 400, whiteSpace: 'nowrap', borderBottom: isKey ? '1px solid rgba(255,255,255,0.04)' : 'none', verticalAlign: 'top' }}>
                      <div>{fmtM(v)}</div>
                      {yoy != null && (
                        <div style={{ fontSize: 10, color: yoy.improved ? '#34d399' : '#f87171', marginTop: 2 }}>
                          {yoy.pct > 0 ? '+' : ''}{(yoy.pct * 100).toFixed(1)}%
                        </div>
                      )}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── main export ────────────────────────────────────────────────────────────

const TABS = [
  { id: 'IS', label: 'Cuenta de resultados' },
  { id: 'BS', label: 'Balance' },
  { id: 'CF', label: 'Flujo de caja' },
]

export default function FinancialTables({
  isPremium,
  income_statement_annual,
  balance_sheet_annual,
  cashflow_annual,
  income_statement_quarterly,
  balance_sheet_quarterly,
  cashflow_quarterly,
}) {
  const [tab,    setTab]    = useState('IS')
  const [period, setPeriod] = useState('annual')

  const isQuarterly = period === 'quarterly'

  // Para usuarios free: solo IS anual con las 5 partidas principales
  if (!isPremium) {
    const freeStmt = income_statement_annual
    const freeData = freeStmt?.data
      ? Object.fromEntries(
          Object.entries(freeStmt.data)
            .filter(([k]) => IMPORTANT_IS.has(k))
            .slice(0, 5)
        )
      : null
    const freeStmtFiltered = freeData ? { ...freeStmt, data: freeData } : null

    return (
      <div>
        {freeStmtFiltered ? (
          <TableView stmt={freeStmtFiltered} isQuarterly={false} important={IMPORTANT_IS} />
        ) : (
          <p style={{ fontSize: 13, color: '#4a5270', textAlign: 'center', padding: '24px 0' }}>Datos no disponibles para esta empresa.</p>
        )}
        <div style={{ marginTop: 20, textAlign: 'center', padding: '16px', background: 'rgba(99,102,241,0.04)', border: '1px dashed rgba(99,102,241,0.2)', borderRadius: 10 }}>
          <p style={{ fontSize: 12, color: '#818cf8', fontWeight: 700, margin: '0 0 4px' }}>Sección Premium</p>
          <p style={{ fontSize: 12, color: '#4a5270', margin: '0 0 12px' }}>Activa Premium para ver Balance, Flujo de Caja y datos trimestrales con variaciones YoY.</p>
          <Link href="/pricing" style={{ fontSize: 12, fontWeight: 700, color: '#fff', background: 'rgba(99,102,241,0.8)', borderRadius: 8, padding: '7px 16px', textDecoration: 'none' }}>
            Ver planes →
          </Link>
        </div>
      </div>
    )
  }

  const stmts = {
    IS: { annual: income_statement_annual,    quarterly: income_statement_quarterly, important: IMPORTANT_IS },
    BS: { annual: balance_sheet_annual,       quarterly: balance_sheet_quarterly,    important: IMPORTANT_BS },
    CF: { annual: cashflow_annual,            quarterly: cashflow_quarterly,         important: IMPORTANT_CF },
  }

  const current = stmts[tab]
  const stmt    = isQuarterly ? current.quarterly : current.annual

  return (
    <div>
      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 14, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '6px 14px', fontSize: 12, fontWeight: 600, border: 'none', borderRadius: 8,
            cursor: 'pointer', fontFamily: 'inherit',
            background: tab === t.id ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.04)',
            color: tab === t.id ? '#818cf8' : '#4a5270',
          }}>
            {t.label}
          </button>
        ))}
        {/* Period toggle */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 2 }}>
          {['annual', 'quarterly'].map(p => (
            <button key={p} onClick={() => setPeriod(p)} style={{
              padding: '5px 10px', fontSize: 11, fontWeight: 600, border: 'none', borderRadius: 6,
              cursor: 'pointer', fontFamily: 'inherit',
              background: period === p ? 'rgba(255,255,255,0.08)' : 'transparent',
              color: period === p ? '#c8d0e0' : '#4a5270',
            }}>
              {p === 'annual' ? 'Anual' : 'Trimestral'}
            </button>
          ))}
        </div>
      </div>

      <TableView stmt={stmt} isQuarterly={isQuarterly} important={current.important} />

      <p style={{ fontSize: 10, color: '#4a5270', marginTop: 10, textAlign: 'right' }}>
        Cifras en millones. Fuente: yfinance.
      </p>
    </div>
  )
}
