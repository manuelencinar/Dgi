'use client'
import { useState } from 'react'
import Link from 'next/link'

// Traducciones de fallback para etiquetas que lleguen en inglés
const T = {
  // ── Cuenta de resultados ──────────────────────────────────────────────
  'Total Revenue':                                              'Ingresos Totales',
  'Net Income':                                                 'Beneficio Neto',
  'Net Income Common Stockholders':                             'Beneficio Neto',
  'EBITDA':                                                     'EBITDA',
  'Normalized EBITDA':                                          'EBITDA Normalizado',
  'Gross Profit':                                               'Beneficio Bruto',
  'Operating Income':                                           'EBIT / Bº Operativo',
  'Ebit':                                                       'EBIT / Bº Operativo',
  'Research And Development':                                   'I+D',
  'Selling General And Administration':                         'Gastos Generales y Admin.',
  'Total Expenses':                                             'Gastos Totales',
  'Depreciation And Amortization':                              'Amortización y Depreciación',
  'Income Tax Expense':                                         'Impuesto sobre Beneficio',
  'Diluted EPS':                                                'BPA Diluido',
  'Basic EPS':                                                  'BPA Básico',
  'Interest Expense':                                           'Gasto por Intereses',
  'Net Interest Income':                                        'Ingreso Neto por Intereses',
  'Cost Of Revenue':                                            'Coste de Ventas',
  'Cost Of Goods Sold':                                         'Coste de Bienes Vendidos',
  'Other Income Expense':                                       'Otros Ingresos / Gastos',
  'Pretax Income':                                              'Beneficio Antes de Impuestos',
  'Tax Provision':                                              'Provisión de Impuestos',
  'Minority Interest':                                          'Interés Minoritario',
  'Other Non Operating Income Expenses':                        'Otros Resultados No Operativos',
  'Net Income From Continuing Operations':                      'Bº Operaciones Continuadas',
  'Interest Income':                                            'Ingresos por Intereses',
  'Normalized Income':                                          'Beneficio Normalizado',
  'Operating Expense':                                          'Gastos Operativos',
  'Operating Revenue':                                          'Ingresos Operativos',
  'Tax Rate For Calcs':                                         'Tasa Impositiva',
  'Basic Average Shares':                                       'Acciones Medias Básicas',
  'Diluted Average Shares':                                     'Acciones Medias Diluidas',
  'Reconciled Depreciation':                                    'Amortización Reconciliada',
  'Reconciled Cost Of Revenue':                                 'Coste de Ventas Reconciliado',
  'Tax Effect Of Unusual Items':                                'Efecto Fiscal de Partidas Extraordinarias',
  'Interest Income Non Operating':                              'Ingresos por Intereses No Operativos',
  'Interest Expense Non Operating':                             'Gastos por Intereses No Operativos',
  'Net Income Continuous Operations':                           'Beneficio Neto de Operaciones Continuadas',
  'Total Operating Income As Reported':                         'Resultado Operativo Reportado',
  'Diluted NI Availto Com Stockholders':                        'Beneficio Neto Diluido para Accionistas',
  'Net Non Operating Interest Income Expense':                  'Resultado Neto por Intereses No Operativos',
  'Net Income Including Noncontrolling Interests':              'Beneficio Neto Incluyendo Intereses Minoritarios',
  'Net Income From Continuing And Discontinued Operation':      'Beneficio Neto de Operaciones Continuadas y Discontinuas',
  'Net Income From Continuing Operation Net Minority Interest': 'Beneficio Neto de Operaciones Continuadas',
  'Otros no Operativos':                                        'Otros Resultados No Operativos',

  // ── Balance ────────────────────────────────────────────────────────────
  'Total Assets':                                               'Activos Totales',
  'Total Liabilities Net Minority Interest':                    'Total Pasivo',
  'Current Assets':                                             'Activos Corrientes',
  'Total Non Current Assets':                                   'Activos No Corrientes',
  'Current Liabilities':                                        'Pasivo Corriente',
  'Long Term Debt':                                             'Deuda a L/P',
  'Total Debt':                                                 'Deuda Total',
  'Net Debt':                                                   'Deuda Neta',
  'Cash And Cash Equivalents':                                  'Caja y Equivalentes',
  'Cash Cash Equivalents And Short Term Investments':           'Caja y Equivalentes',
  'Inventory':                                                  'Inventario',
  'Accounts Receivable':                                        'Cuentas a Cobrar',
  'Common Stock Equity':                                        'Patrimonio Neto',
  'Stockholders Equity':                                        'Patrimonio Neto',
  'Retained Earnings':                                          'Ganancias Retenidas',
  'Long Term Capital Lease Obligation':                         'Arrendamientos a L/P',
  'Short Long Term Debt':                                       'Deuda a C/P',
  'Other Current Assets':                                       'Otros Activos Corrientes',
  'Other Current Liabilities':                                  'Otros Pasivos Corrientes',
  'Goodwill':                                                   'Fondo de Comercio',
  'Intangible Assets':                                          'Activos Intangibles',
  'Goodwill And Other Intangible Assets':                       'Fondo de Comercio e Intangibles',
  'Long Term Investments':                                      'Inversiones a L/P',
  'Other Long Term Assets':                                     'Otros Activos a L/P',
  'Accounts Payable':                                           'Cuentas a Pagar',
  'Other Non Current Liabilities':                              'Otros Pasivos No Corrientes',
  'Additional Paid In Capital':                                 'Prima de Emisión',
  'Treasury Stock':                                             'Acciones Propias',
  'Common Stock':                                               'Capital Social',
  'Leases':                                                     'Arrendamientos',
  'Net PPE':                                                    'Inmovilizado Material Neto',
  'Payables':                                                   'Cuentas a Pagar',
  'Gross PPE':                                                  'Inmovilizado Material Bruto',
  'Properties':                                                 'Propiedades',
  'Current Debt':                                               'Deuda a Corto Plazo',
  'Share Issued':                                               'Acciones Emitidas',
  'Capital Stock':                                              'Capital en Acciones',
  'Cash Financial':                                             'Efectivo Financiero',
  'Working Capital':                                            'Capital de Trabajo',
  'Cash Equivalents':                                           'Equivalentes de Caja',
  'Commercial Paper':                                           'Papel Comercial',
  'Invested Capital':                                           'Capital Invertido',
  'Other Properties':                                           'Otras Propiedades',
  'Other Investments':                                          'Otras Inversiones',
  'Other Receivables':                                          'Otros Deudores',
  'Total Tax Payable':                                          'Impuestos a Pagar',
  'Income Tax Payable':                                         'Impuesto sobre Beneficios a Pagar',
  'Net Tangible Assets':                                        'Activos Tangibles Netos',
  'Tangible Book Value':                                        'Valor Contable Tangible',
  'Total Capitalization':                                       'Capitalización Total',
  'Land And Improvements':                                      'Terrenos y Mejoras',
  'Ordinary Shares Number':                                     'Número de Acciones Ordinarias',
  'Treasury Shares Number':                                     'Número de Acciones en Autocartera',
  'Accumulated Depreciation':                                   'Amortización Acumulada',
  'Current Accrued Expenses':                                   'Gastos Devengados Corrientes',
  'Current Deferred Revenue':                                   'Ingresos Diferidos Corrientes',
  'Investments And Advances':                                   'Inversiones y Anticipos',
  'Other Current Borrowings':                                   'Otros Préstamos Corrientes',
  'Other Equity Adjustments':                                   'Otros Ajustes de Patrimonio',
  'Other Non Current Assets':                                   'Otros Activos No Corrientes',
  'Capital Lease Obligations':                                  'Obligaciones por Arrendamiento',
  'Non Current Deferred Assets':                                'Activos Diferidos No Corrientes',
  'Current Deferred Liabilities':                               'Pasivos Diferidos Corrientes',
  'Other Short Term Investments':                               'Otras Inversiones a Corto Plazo',
  'Available For Sale Securities':                              'Valores Disponibles para la Venta',
  'Investmentin Financial Assets':                              'Inversión en Activos Financieros',
  'Machinery Furniture Equipment':                              'Maquinaria, Mobiliario y Equipos',
  'Payables And Accrued Expenses':                              'Cuentas a Pagar y Gastos Devengados',
  'Current Capital Lease Obligation':                           'Arrendamiento Corriente',
  'Non Current Deferred Taxes Assets':                          'Activos por Impuestos Diferidos No Corrientes',
  'Tradeand Other Payables Non Current':                        'Proveedores y Otros Acreedores No Corrientes',
  'Total Equity Gross Minority Interest':                       'Patrimonio Neto Total con Interés Minoritario',
  'Current Debt And Capital Lease Obligation':                  'Deuda Corriente y Arrendamientos',
  'Long Term Debt And Capital Lease Obligation':                'Deuda a Largo Plazo y Arrendamientos',
  'Gains Losses Not Affecting Retained Earnings':               'Pérdidas y Ganancias No Realizadas',
  'Total Non Current Liabilities Net Minority Interest':        'Total Pasivo No Corriente',
  'Receivables':                                                'Cuentas a Cobrar',

  // ── Flujo de caja ─────────────────────────────────────────────────────
  'Operating Cash Flow':                                        'Cash Flow Operativo',
  'Capital Expenditure':                                        'Capex',
  'Free Cash Flow':                                             'Flujo de Caja Libre',
  'Dividends Paid':                                             'Dividendos Pagados',
  'Repurchase Of Capital Stock':                                'Recompra de Acciones',
  'Issuance Of Debt':                                           'Emisión de Deuda',
  'Repayment Of Debt':                                          'Amortización de Deuda',
  'Changes In Cash':                                            'Variación de Caja',
  'Total Cash From Operating Activities':                       'Cash Flow Operativo',
  'Capital Expenditures':                                       'Capex',
  'Change In Cash':                                             'Variación de Caja',
  'Investing Cash Flow':                                        'Cash Flow de Inversión',
  'Financing Cash Flow':                                        'Cash Flow de Financiación',
  'End Cash Position':                                          'Posición de Caja Final',
  'Other Investing Activities':                                 'Otras Actividades de Inversión',
  'Other Financing Activities':                                 'Otras Actividades de Financiación',
  'Depreciation Amortization Depletion':                        'Amortización y Depreciación',
  'Stock Based Compensation':                                   'Compensación en Acciones',
  'Other Non Cash Items':                                       'Otros No Monetarios',
  'Gross Dividend Paid':                                        'Dividendos Brutos',
  'D&A':                                                        'Amortización y Depreciación',
  'Capex':                                                      'Inversión en Activos (Capex)',
  'Deferred Tax':                                               'Impuesto Diferido',
  'Purchase Of PPE':                                            'Compra de Inmovilizado',
  'Change In Payable':                                          'Variación de Cuentas a Pagar',
  'Sale Of Investment':                                         'Venta de Inversiones',
  'Cash Dividends Paid':                                        'Dividendos Pagados',
  'Change In Inventory':                                        'Variación de Inventario',
  'Deferred Income Tax':                                        'Impuesto sobre Beneficios Diferido',
  'Purchase Of Business':                                       'Adquisición de Negocios',
  'Change In Receivables':                                      'Variación de Cuentas a Cobrar',
  'Common Stock Issuance':                                      'Emisión de Acciones Ordinarias',
  'Common Stock Payments':                                      'Pagos por Acciones Ordinarias',
  'Purchase Of Investment':                                     'Compra de Inversiones',
  'Beginning Cash Position':                                    'Posición de Caja Inicial',
  'Long Term Debt Issuance':                                    'Emisión de Deuda a Largo Plazo',
  'Long Term Debt Payments':                                    'Amortización de Deuda a Largo Plazo',
  'Change In Account Payable':                                  'Variación de Proveedores',
  'Change In Working Capital':                                  'Variación del Capital de Trabajo',
  'Issuance Of Capital Stock':                                  'Emisión de Capital',
  'Net Common Stock Issuance':                                  'Emisión Neta de Acciones',
  'Net PPE Purchase And Sale':                                  'Compraventa Neta de Inmovilizado',
  'Common Stock Dividend Paid':                                 'Dividendos Pagados a Accionistas',
  'Net Long Term Debt Issuance':                                'Emisión Neta de Deuda a Largo Plazo',
  'Net Other Financing Charges':                                'Otros Cargos de Financiación',
  'Net Other Investing Changes':                                'Otros Cambios de Inversión',
  'Net Short Term Debt Issuance':                               'Emisión Neta de Deuda a Corto Plazo',
  'Net Issuance Payments Of Debt':                              'Emisión y Amortización Neta de Deuda',
  'Change In Other Current Assets':                             'Variación de Otros Activos Corrientes',
  'Changes In Account Receivables':                             'Variación de Cuentas a Cobrar',
  'Net Business Purchase And Sale':                             'Compraventa Neta de Negocios',
  'Change In Other Working Capital':                            'Variación de Otro Capital de Trabajo',
  'Interest Paid Supplemental Data':                            'Intereses Pagados',
  'Net Investment Purchase And Sale':                           'Compraventa Neta de Inversiones',
  'Income Tax Paid Supplemental Data':                          'Impuestos sobre Beneficios Pagados',
  'Change In Other Current Liabilities':                        'Variación de Otros Pasivos Corrientes',
  'Change In Payables And Accrued Expense':                     'Variación de Proveedores y Gastos Devengados',
  'Cash Flow From Continuing Financing Activities':             'Flujo de Caja de Financiación',
  'Cash Flow From Continuing Investing Activities':             'Flujo de Caja de Inversión',
  'Cash Flow From Continuing Operating Activities':             'Flujo de Caja Operativo',
}

function translate(label) {
  return T[label] || label
}

// Partidas importantes (en español)
const IMPORTANT_IS = new Set(['Ingresos Totales','Beneficio Bruto','EBIT / Bº Operativo','EBITDA','EBITDA Normalizado','Beneficio Neto'])
const IMPORTANT_BS = new Set(['Activos Totales','Deuda Total','Caja y Equivalentes','Patrimonio Neto','Deuda a L/P'])
const IMPORTANT_CF = new Set(['Cash Flow Operativo','Capex','Flujo de Caja Libre','Dividendos Pagados'])
const LOWER_IS_BETTER = new Set(['Deuda Total','Deuda a L/P','Total Pasivo','Capex'])

// ── helpers ────────────────────────────────────────────────────────────────

function fmtM(v) {
  if (v == null) return '—'
  const m   = v / 1e6
  const abs = Math.abs(m)
  const sign = m < 0 ? '−' : ''
  if (abs >= 1000) return sign + (abs / 1000).toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + 'B'
  return sign + abs.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + 'M'
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

// ── Filas con formateo especial (no millones) ──────────────────────────────

const EPS_ROWS = new Set(['BPA Básico', 'BPA Diluido'])
const TAX_ROWS = new Set(['Tasa Impositiva'])

function fmtEPS(v) {
  if (v == null) return '—'
  return v.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtTax(v) {
  if (v == null) return '—'
  return v.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%'
}

function taxColor(v) {
  if (v == null) return '#4a5270'
  if (v < 0)    return '#34d399'   // crédito fiscal
  if (v < 10)   return '#34d399'   // tasa muy baja
  if (v > 60)   return '#fbbf24'   // anomalía
  if (v > 35)   return '#fbbf24'   // tasa elevada
  return '#c8d0e0'
}

function epsColor(v) {
  return v != null && v < 0 ? '#f87171' : '#c8d0e0'
}

function findRow(data, ...keys) {
  for (const k of keys) { if (data[k] != null) return data[k] }
  return null
}

// ── TableView ──────────────────────────────────────────────────────────────

function TableView({ stmt, isQuarterly, important }) {
  if (!stmt?.columns?.length || !stmt?.data) {
    return <p style={{ fontSize: 13, color: '#4a5270', textAlign: 'center', padding: '24px 0' }}>Datos no disponibles para esta empresa.</p>
  }

  const cols    = stmt.columns
  const periods = cols.map(c => formatPeriod(c, isQuarterly))

  // Traducción on-the-fly
  const translatedData = Object.fromEntries(
    Object.entries(stmt.data).map(([k, v]) => [translate(k), v])
  )

  // ── BPA calculado cuando el valor es 0 o falta ─────────────────────────
  const ni      = findRow(translatedData, 'Beneficio Neto', 'Net Income')
  const sharesB = findRow(translatedData, 'Acciones Medias Básicas', 'Basic Average Shares')
  const sharesD = findRow(translatedData, 'Acciones Medias Diluidas', 'Diluted Average Shares')

  if (ni) {
    const rawB = findRow(translatedData, 'BPA Básico', 'Basic EPS') || ni.map(() => null)
    translatedData['BPA Básico'] = rawB.map((v, i) => {
      if (v != null && v !== 0) return v
      const sh = sharesB?.[i]
      return (ni[i] != null && sh != null && sh > 0) ? ni[i] / sh : null
    })

    const rawD = findRow(translatedData, 'BPA Diluido', 'Diluted EPS') || ni.map(() => null)
    translatedData['BPA Diluido'] = rawD.map((v, i) => {
      if (v != null && v !== 0) return v
      const sh = sharesD?.[i] ?? sharesB?.[i]
      return (ni[i] != null && sh != null && sh > 0) ? ni[i] / sh : null
    })
  }

  // ── Tasa Impositiva calculada ──────────────────────────────────────────
  const taxProv = findRow(translatedData, 'Provisión de Impuestos', 'Tax Provision')
  const pretax  = findRow(translatedData, 'Beneficio Antes de Impuestos', 'Pretax Income')
  if (taxProv && pretax) {
    const existing = findRow(translatedData, 'Tasa Impositiva', 'Tax Rate For Calcs')
    if (!existing || existing.every(v => v == null || v === 0)) {
      translatedData['Tasa Impositiva'] = taxProv.map((tax, i) => {
        const pt = pretax[i]
        return (tax != null && pt != null && pt > 0) ? (tax / pt) * 100 : null
      })
    }
  }

  const labels = Object.keys(translatedData)

  return (
    <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: Math.max(400, cols.length * 110) }}>
        <thead>
          <tr>
            <th style={{ padding: '8px 10px', textAlign: 'left', color: '#4a5270', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.06)', whiteSpace: 'nowrap', minWidth: 200 }}>
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
            const vals        = translatedData[label]
            const isKey       = important.has(label)
            const lowerBetter = LOWER_IS_BETTER.has(label)
            const isEPS       = EPS_ROWS.has(label)
            const isTax       = TAX_ROWS.has(label)
            const isSpecial   = isEPS || isTax

            return (
              <tr key={label} style={{ background: ri % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}>
                <td style={{ padding: '7px 10px', color: isKey || isSpecial ? '#c8d0e0' : '#8090a8', fontWeight: isKey || isSpecial ? 700 : 400, whiteSpace: 'nowrap', borderBottom: isKey ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                  {label}
                </td>
                {vals.map((v, ci) => {
                  const prev    = vals[ci + 1] ?? null
                  const yoy     = (isKey && !isSpecial) ? yoyPct(v, prev, lowerBetter) : null
                  const display = isEPS ? fmtEPS(v) : isTax ? fmtTax(v) : fmtM(v)
                  const color   = isEPS ? epsColor(v) : isTax ? taxColor(v) : (isKey ? '#c8d0e0' : '#4a5270')

                  return (
                    <td key={ci} style={{ padding: '7px 10px', textAlign: 'right', color, fontWeight: isKey || isSpecial ? 700 : 400, whiteSpace: 'nowrap', borderBottom: isKey ? '1px solid rgba(255,255,255,0.04)' : 'none', verticalAlign: 'top' }}>
                      <div>{display}</div>
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

// ── Main export ────────────────────────────────────────────────────────────

const TABS = [
  { id: 'IS', label: 'Cuenta de resultados' },
  { id: 'BS', label: 'Balance' },
  { id: 'CF', label: 'Flujo de caja' },
]

function ManualBadge({ manualImport }) {
  if (!manualImport?.active) return null
  const date = manualImport.date ? new Date(manualImport.date).toLocaleDateString('es-ES') : null
  return (
    <span
      title={`Algunos campos de esta empresa han sido introducidos manualmente${date ? ` (última importación: ${date})` : ''} y tienen prioridad sobre los datos automáticos.`}
      style={{ fontSize: 10, fontWeight: 700, color: '#fbbf24', background: 'rgba(251,191,36,0.12)', padding: '2px 8px', borderRadius: 5, cursor: 'help', whiteSpace: 'nowrap' }}
    >✏ Datos parcialmente manuales</span>
  )
}

export default function FinancialTables({
  isPremium,
  income_statement_annual,
  balance_sheet_annual,
  cashflow_annual,
  income_statement_quarterly,
  balance_sheet_quarterly,
  cashflow_quarterly,
  manualImport,
}) {
  const [tab,    setTab]    = useState('IS')
  const [period, setPeriod] = useState('annual')
  const [open,   setOpen]   = useState(false)

  const isQuarterly = period === 'quarterly'

  // ── Versión free ─────────────────────────────────────────────────────────
  if (!isPremium) {
    const freeStmt = income_statement_annual
    const freeData = freeStmt?.data
      ? Object.fromEntries(
          Object.entries(freeStmt.data)
            .map(([k, v]) => [translate(k), v])
            .filter(([k]) => IMPORTANT_IS.has(k))
            .slice(0, 5)
        )
      : null
    const freeStmtFiltered = freeData ? { ...freeStmt, data: freeData } : null

    return (
      <div>
        {/* Acordeón header */}
        <button
          onClick={() => setOpen(o => !o)}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit', marginBottom: open ? 14 : 0 }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#4a5270', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Cuenta de resultados</span>
            <ManualBadge manualImport={manualImport} />
          </span>
          <span style={{ fontSize: 14, color: '#4a5270', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▾</span>
        </button>

        {open && (
          <>
            {freeStmtFiltered
              ? <TableView stmt={freeStmtFiltered} isQuarterly={false} important={IMPORTANT_IS} />
              : <p style={{ fontSize: 13, color: '#4a5270', textAlign: 'center', padding: '24px 0' }}>Datos no disponibles para esta empresa.</p>
            }
            <div style={{ marginTop: 16, textAlign: 'center', padding: '14px', background: 'rgba(99,102,241,0.04)', border: '1px dashed rgba(99,102,241,0.2)', borderRadius: 10 }}>
              <p style={{ fontSize: 12, color: '#818cf8', fontWeight: 700, marginBottom: 4 }}>Contenido Premium</p>
              <p style={{ fontSize: 12, color: '#4a5270', marginBottom: 10 }}>Balance, flujo de caja y datos trimestrales con variaciones YoY.</p>
              <Link href="/pricing" style={{ fontSize: 12, fontWeight: 700, color: '#fff', background: 'rgba(99,102,241,0.8)', borderRadius: 8, padding: '7px 16px', textDecoration: 'none' }}>
                Ver planes →
              </Link>
            </div>
          </>
        )}
      </div>
    )
  }

  // ── Versión premium ───────────────────────────────────────────────────────
  const stmts = {
    IS: { annual: income_statement_annual,    quarterly: income_statement_quarterly, important: IMPORTANT_IS },
    BS: { annual: balance_sheet_annual,       quarterly: balance_sheet_quarterly,    important: IMPORTANT_BS },
    CF: { annual: cashflow_annual,            quarterly: cashflow_quarterly,         important: IMPORTANT_CF },
  }
  const current = stmts[tab]
  const stmt    = isQuarterly ? current.quarterly : current.annual

  return (
    <div>
      {/* Acordeón header */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit', marginBottom: open ? 16 : 0 }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#4a5270', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Estados financieros completos</span>
          <ManualBadge manualImport={manualImport} />
        </span>
        <span style={{ fontSize: 14, color: '#4a5270', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▾</span>
      </button>

      {open && (
        <>
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
            Cifras en millones · Fuente: yfinance
          </p>
        </>
      )}
    </div>
  )
}
