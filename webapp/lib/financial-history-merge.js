// Extiende los estados financieros de yfinance (~4 años) con los años ANTIGUOS del
// backfill (financial_history) para que la ficha muestre más historia donde exista.
// PRIORIDAD: yfinance manda siempre (se conservan sus años tal cual); solo se AÑADEN
// los ejercicios que yfinance no cubre. Entre fuentes del backfill: sec_edgar >
// stockanalysis > macrotrends. Devuelve estados en el MISMO formato {columns, data}
// que consume FinanzasSections / buildPeHistory / buildEvEbitdaHistory.
import { SOURCE_PRIORITY } from '@/lib/financial-history-stats'

// financial_history (columna) → etiqueta de fila que busca readRow en cada estado.
const INCOME_MAP = {
  revenue: 'Total Revenue', net_income: 'Net Income', operating_income: 'Operating Income',
  gross_profit: 'Gross Profit', eps_diluted: 'Diluted EPS', shares_diluted: 'Diluted Average Shares',
}
const CASHFLOW_MAP = {
  operating_cash_flow: 'Operating Cash Flow', free_cash_flow: 'Free Cash Flow',
  capex: 'Capital Expenditure', dividends_paid_total: 'Cash Dividends Paid',
  buybacks_total: 'Repurchase Of Capital Stock',
}
const BALANCE_MAP = {
  total_assets: 'Total Assets', total_liabilities: 'Total Liabilities Net Minority Interest',
  stockholders_equity: 'Stockholders Equity', cash_and_equivalents: 'Cash And Cash Equivalents',
  // financial_history no guarda la deuda total (corto+largo); usamos la deuda a largo como
  // aproximación para los años antiguos del gráfico de deuda (los recientes de yfinance
  // conservan su Total Debt real). Domina el total en la mayoría de grandes empresas.
  long_term_debt: 'Total Debt',
}

// Un registro por ejercicio, escogiendo la fuente de MAYOR prioridad del backfill.
export function bestByYear(rows) {
  const rank = s => { const i = SOURCE_PRIORITY.indexOf(s); return i < 0 ? 99 : i }
  const by = {}
  for (const r of rows || []) {
    const y = r.fiscal_year
    if (y == null) continue
    if (!by[y] || rank(r.source) < rank(by[y].source)) by[y] = r
  }
  return by
}

// Extiende un estado con los ejercicios que yfinance NO tiene (más antiguos).
export function extendStatement(stmt, byYear, colMap) {
  const baseCols = (stmt?.columns || []).slice()
  const yfYears = new Set(baseCols.map(c => parseInt(String(c).slice(0, 4))))
  const data = {}
  for (const [k, v] of Object.entries(stmt?.data || {})) data[k] = (v || []).slice()
  // Asegura que las filas mapeadas existen (padded a los años de yfinance)
  for (const label of Object.values(colMap)) {
    if (!data[label]) data[label] = new Array(baseCols.length).fill(null)
  }
  const labelToFh = Object.fromEntries(Object.entries(colMap).map(([c, l]) => [l, c]))

  const extras = Object.values(byYear)
    .filter(r => !yfYears.has(r.fiscal_year))
    .sort((a, b) => b.fiscal_year - a.fiscal_year)   // más recientes primero (van tras yfinance)
  if (!extras.length) return stmt || null

  const cols = baseCols.slice()
  for (const r of extras) {
    cols.push(`${r.fiscal_year}-12-31`)
    for (const k of Object.keys(data)) {
      const fhCol = labelToFh[k]
      data[k].push(fhCol ? (r[fhCol] ?? null) : null)
    }
  }
  return { columns: cols, data }
}

// Extiende los tres estados de una empresa. `history` = filas de financial_history.
export function extendStatements(detail, history) {
  if (!history?.length) {
    return {
      income: detail?.income_statement_annual ?? null,
      cashflow: detail?.cashflow_annual ?? null,
      balance: detail?.balance_sheet_annual ?? null,
      extraYears: 0,
    }
  }
  const byYear = bestByYear(history)
  const yfYears = new Set(Object.keys(detail?.income_statement_annual?.columns
    ? detail.income_statement_annual.columns.map(c => parseInt(String(c).slice(0, 4))) : []))
  const extraYears = Object.keys(byYear).map(Number).filter(y => !yfYears.has(y)).length
  return {
    income: extendStatement(detail?.income_statement_annual, byYear, INCOME_MAP),
    cashflow: extendStatement(detail?.cashflow_annual, byYear, CASHFLOW_MAP),
    balance: extendStatement(detail?.balance_sheet_annual, byYear, BALANCE_MAP),
    extraYears,
  }
}
