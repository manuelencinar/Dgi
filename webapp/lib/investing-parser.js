// Port a JS de scripts/import_investing.py — parsea una hoja del Excel de
// Investing.com (matriz de celdas de SheetJS) y devuelve el registro para
// company_fundamentals. Réplica fiel de la lógica del script Python.
//
// Se ejecuta en el NAVEGADOR (SheetJS parsea el .xlsx y envía el JSON al API).

// ── Diccionario etiqueta Investing.com → campo interno ──────────────────────
export const FIELD_MAP = {
  // Cuenta de resultados
  'ingresos totales': 'revenue',
  'total revenue': 'revenue',
  'crecimiento de los ingresos totales': 'revenue_growth',
  'beneficio neto': 'net_income',
  'net income': 'net_income',
  'crecimiento del beneficio neto': 'net_income_growth',
  'ebitda': 'ebitda',
  'ebit': 'ebit',
  'margen ebitda %': 'ebitda_margin',
  'margen del beneficio neto %': 'net_margin',
  'margen neto': 'net_income_value',
  'margen ebit %': 'ebit_margin',
  'impuesto sobre la renta': 'tax_provision',
  'ebt excepto elementos no habituales': 'pretax_income',
  'ebt incluyendo las partidas inusuales': 'pretax_income_total',
  'gastos de explotación totales': 'operating_expense',
  'bpa básico: crecimiento de actividades continuadas': 'eps_basic',
  'bpa diluido: actividades continuadas': 'eps_diluted',
  'promedio ponderado básico de acciones en circulación': 'shares_basic',
  'promedio ponderado diluido de acciones en circulación': 'shares_diluted',
  'dividendo por acción': 'dps_year',
  'crecimiento del dividendo por acción': 'dps_growth',
  'i+d': 'research_development',
  'investigación y desarrollo': 'research_development',
  // Balance
  'activos totales': 'total_assets',
  'total assets': 'total_assets',
  'pasivos totales': 'total_liabilities',
  'total liabilities': 'total_liabilities',
  'patrimonio neto': 'stockholders_equity',
  'total stockholders equity': 'stockholders_equity',
  'caja y equivalentes': 'cash_and_equivalents',
  'cash and equivalents': 'cash_and_equivalents',
  'deuda total': 'total_debt',
  'total debt': 'total_debt',
  'deuda a largo plazo': 'long_term_debt',
  'long term debt': 'long_term_debt',
  'deuda a corto plazo': 'short_term_debt',
  'current debt': 'short_term_debt',
  'inventario': 'inventory',
  'inventory': 'inventory',
  'fondo de comercio': 'goodwill',
  'goodwill': 'goodwill',
  'activos corrientes': 'current_assets',
  'total current assets': 'current_assets',
  'pasivo corriente': 'current_liabilities',
  'total current liabilities': 'current_liabilities',
  'capital de trabajo': 'working_capital',
  'working capital': 'working_capital',
  'ganancias retenidas': 'retained_earnings',
  'retained earnings': 'retained_earnings',
  'inmovilizado material neto': 'net_ppe',
  'net ppe': 'net_ppe',
  // Flujo de caja
  'caja generada por las operaciones': 'operating_cash_flow',
  'operating cash flow': 'operating_cash_flow',
  'flujo de caja libre': 'free_cash_flow',
  'free cash flow': 'free_cash_flow',
  'capex': 'capex',
  'inversión en activos': 'capex',
  'compra de inmovilizado': 'capex',
  'purchase of ppe': 'capex',
  'dividendos pagados': 'dividends_paid',
  'cash dividends paid': 'dividends_paid',
  'recompra de acciones': 'share_repurchases',
  'common stock payments': 'share_repurchases',
  'amortización y depreciación': 'depreciation',
  'total de depreciación, agotamiento y amortización': 'depreciation',
  'depreciación y amortización': 'depreciation',
  'emisión de deuda': 'debt_issuance',
  'amortización de deuda': 'debt_repayment',
  'variación de caja': 'change_in_cash',
  'posición de caja final': 'ending_cash',
  'compensación en acciones': 'stock_compensation',
}

// Campos históricos (jsonb {año: valor})
export const HISTORY_FIELDS = {
  revenue: 'revenue_history',
  net_income: 'net_income_history',
  ebitda: 'ebitda_history',
  operating_cash_flow: 'ocf_history',
  free_cash_flow: 'fcf_history',
  total_assets: 'assets_history',
  total_debt: 'debt_history',
  stockholders_equity: 'equity_history',
  dps_year: 'dps_annual_history',
  eps_diluted: 'eps_history',
}

// Campos de valor único (más reciente)
export const SINGLE_FIELDS = {
  net_margin: 'net_margin',
  ebitda_margin: 'ebitda_margin',
  ebit_margin: 'op_margin',
  research_development: 'research_development',
  goodwill: 'goodwill',
  total_assets: 'total_assets',
  total_debt: 'total_debt',
  current_assets: 'current_assets',
  current_liabilities: 'current_liabilities',
  stockholders_equity: 'stockholders_equity',
  cash_and_equivalents: 'cash',
  working_capital: 'working_capital',
  net_ppe: 'net_ppe',
  operating_cash_flow: 'operating_cash_flow',
  free_cash_flow: 'free_cash_flow',
  capex: 'capex',
  shares_diluted: 'shares_outstanding_m',
  eps_diluted: 'eps_diluted',
  eps_basic: 'eps_basic',
}

// Columnas jsonb planas {año: valor} (merge por año)
export const HISTORY_COLS = new Set([
  ...Object.values(HISTORY_FIELDS), 'div_history',
])
// Columnas jsonb anidadas {partida: {año: valor}} (merge por partida y año)
export const STATEMENT_COLS = new Set([
  'income_statement_annual', 'income_statement_quarterly',
  'balance_sheet_annual', 'balance_sheet_quarterly',
  'cashflow_annual', 'cashflow_quarterly',
])

const STATEMENT_NAMES = [
  'income_statement_annual', 'income_statement_quarterly',
  'balance_sheet_annual', 'balance_sheet_quarterly',
  'cashflow_annual', 'cashflow_quarterly',
]

// Campo interno → etiqueta en español usada por la app (FinancialTables / lib).
// Las etiquetas "importantes" coinciden con IMPORTANT_IS/BS/CF para que se rendericen en negrita.
const INTERNAL_TO_LABEL = {
  // Cuenta de resultados
  revenue: 'Ingresos Totales', net_income: 'Beneficio Neto', ebitda: 'EBITDA',
  ebit: 'EBIT / Bº Operativo', tax_provision: 'Provisión de Impuestos',
  pretax_income: 'Beneficio Antes de Impuestos', operating_expense: 'Gastos Operativos',
  eps_basic: 'BPA Básico', eps_diluted: 'BPA Diluido',
  shares_basic: 'Acciones Medias Básicas', shares_diluted: 'Acciones Medias Diluidas',
  research_development: 'I+D', dps_year: 'Dividendo por Acción',
  // Balance
  total_assets: 'Activos Totales', total_liabilities: 'Total Pasivo',
  stockholders_equity: 'Patrimonio Neto', cash_and_equivalents: 'Caja y Equivalentes',
  total_debt: 'Deuda Total', long_term_debt: 'Deuda a L/P', short_term_debt: 'Deuda a C/P',
  inventory: 'Inventario', goodwill: 'Fondo de Comercio',
  current_assets: 'Activos Corrientes', current_liabilities: 'Pasivo Corriente',
  retained_earnings: 'Ganancias Retenidas', net_ppe: 'Inmovilizado Material Neto',
  working_capital: 'Capital de Trabajo',
  // Flujo de caja
  operating_cash_flow: 'Cash Flow Operativo', free_cash_flow: 'Flujo de Caja Libre',
  capex: 'Capex', dividends_paid: 'Dividendos Pagados', share_repurchases: 'Recompra de Acciones',
  depreciation: 'Amortización y Depreciación', debt_issuance: 'Emisión de Deuda',
  debt_repayment: 'Amortización de Deuda', change_in_cash: 'Variación de Caja',
  ending_cash: 'Posición de Caja Final', stock_compensation: 'Compensación en Acciones',
}

// Construye un estado financiero en formato {columns:[años desc], data:{etiqueta:[vals]}}.
function buildStmt(raw) {
  const labeled = {}
  const yearsSet = new Set()
  for (const [internal, yd] of Object.entries(raw)) {
    const label = INTERNAL_TO_LABEL[internal]
    if (!label) continue
    labeled[label] = yd
    Object.keys(yd).forEach(y => yearsSet.add(parseInt(y, 10)))
  }
  const years = [...yearsSet].filter(y => !isNaN(y)).sort((a, b) => b - a)
  if (!years.length || !Object.keys(labeled).length) return null
  const columns = years.map(String)
  const data = {}
  for (const [label, yd] of Object.entries(labeled)) {
    data[label] = years.map(y => (yd[y] != null ? yd[y] : (yd[String(y)] != null ? yd[String(y)] : null)))
  }
  return { columns, data }
}

// ── helpers de matriz ───────────────────────────────────────────────────────
function cell(grid, r, c) {
  const row = grid[r]
  if (!row) return null
  const v = row[c]
  return v === undefined ? null : v
}
function isNil(v) { return v == null || (typeof v === 'number' && isNaN(v)) }
function nrows(grid) { return grid.length }
function ncols(grid) { return grid.reduce((m, row) => Math.max(m, row ? row.length : 0), 0) }

function normalizeLabel(s) {
  return String(s).toLowerCase().trim().replace(/\s+/g, ' ')
}

export function parseValue(v) {
  if (isNil(v)) return null
  let s = String(v).trim().replace(/,/g, '.').replace(/ /g, '')
  s = s.replace(/[€$£¥%]/g, '')
  if (['-', '', 'nan', 'n/a', 'nd'].includes(s.toLowerCase())) return null
  const m = s.match(/^(-?\d+\.?\d*)(B|M|K)?$/i)
  if (m) {
    let val = parseFloat(m[1])
    const suffix = (m[2] || '').toUpperCase()
    if (suffix === 'B') val *= 1_000_000_000
    else if (suffix === 'M') val *= 1_000_000
    else if (suffix === 'K') val *= 1_000
    return val
  }
  const f = parseFloat(s)
  return isNaN(f) ? null : f
}

function findBlocks(grid) {
  const blocks = []
  const R = Math.min(5, nrows(grid))
  const C = ncols(grid)
  for (let r = 0; r < R; r++) {
    for (let c = 0; c < C; c++) {
      const val = String(cell(grid, r, c) ?? '')
      if (val.includes('Período terminado') || /period ending/i.test(val)) {
        blocks.push([r, c])
      }
    }
  }
  return blocks
}

function parseBlock(grid, headerRow, headerCol) {
  const labelCol = headerCol + 1
  const dataStart = headerCol + 2
  const C = ncols(grid)

  // Años en la fila de cabecera
  const years = []
  const seen = new Set()
  for (let c = dataStart; c < Math.min(dataStart + 20, C); c++) {
    const val = cell(grid, headerRow, c)
    if (isNil(val)) break
    const y = parseInt(String(val).trim(), 10)
    if (!isNaN(y) && y >= 2000 && y <= 2035 && !seen.has(y)) {
      years.push([c, y]); seen.add(y)
    }
  }
  if (!years.length) return {}

  const result = {}
  const R = nrows(grid)
  for (let r = headerRow + 1; r < Math.min(headerRow + 100, R); r++) {
    const rawLabel = cell(grid, r, labelCol)
    if (isNil(rawLabel) || ['', '-', 'nan'].includes(String(rawLabel).trim().toLowerCase())) continue
    const label = normalizeLabel(rawLabel)
    let field = FIELD_MAP[label]
    if (!field) {
      for (const [key, val] of Object.entries(FIELD_MAP)) {
        if (label.includes(key) || key.includes(label)) { field = val; break }
      }
    }
    if (!field) continue

    const yearData = {}
    for (const [c, y] of years) {
      const v = parseValue(cell(grid, r, c))
      if (v != null) yearData[y] = v
    }
    if (Object.keys(yearData).length) {
      const isGrowth = ['crecimiento', 'growth', 'margen ', 'margin '].some(x => label.includes(x))
      const isAbsolute = ['revenue', 'net_income', 'ebitda', 'operating_cash_flow',
        'free_cash_flow', 'total_assets', 'total_debt', 'stockholders_equity', 'cash_and_equivalents'].includes(field)
      if (isGrowth && isAbsolute) continue
      if (!result[field]) result[field] = {}
      if (Object.keys(yearData).length >= Object.keys(result[field]).length) {
        Object.assign(result[field], yearData)
      }
    }
  }
  return result
}

function parseDividends(grid) {
  const dividends = {}
  const R = nrows(grid)
  for (let r = 1; r < R; r++) {
    const exDate = cell(grid, r, 0)
    const amount = cell(grid, r, 1)
    if (isNil(exDate) || isNil(amount)) continue
    const dateStr = String(exDate).trim()
    let year = null
    if (/^\d{2}\.\d{2}\.\d{4}/.test(dateStr)) year = parseInt(dateStr.split('.')[2], 10)
    else if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) year = parseInt(dateStr.slice(0, 4), 10)
    else continue
    const v = parseValue(amount)
    if (v != null && !isNaN(year)) dividends[year] = (dividends[year] || 0) + v
  }
  return dividends
}

function round(v, d) { const p = Math.pow(10, d); return Math.round(v * p) / p }

function calcDerived(rec, hist) {
  const derived = {}
  if (rec.total_debt != null && rec.cash != null) {
    derived.net_debt = rec.total_debt - rec.cash
  }
  if (rec.current_assets != null && rec.current_liabilities != null && rec.current_liabilities !== 0) {
    derived.current_ratio = round(rec.current_assets / rec.current_liabilities, 2)
  }
  const cagr = (h) => {
    const ys = Object.keys(h).map(Number).filter(y => h[y] > 0).sort((a, b) => a - b)
    if (ys.length < 2) return null
    const yEnd = ys[ys.length - 1]
    const yStart = ys[Math.max(0, ys.length - 6)]
    const n = yEnd - yStart
    if (n > 0 && h[yStart] > 0) return round((Math.pow(h[yEnd] / h[yStart], 1 / n) - 1) * 100, 2)
    return null
  }
  if (hist._revenue_hist && Object.keys(hist._revenue_hist).length >= 2) {
    const c = cagr(hist._revenue_hist); if (c != null) derived.revenue_cagr5 = c
  }
  if (hist._fcf_hist && Object.keys(hist._fcf_hist).length >= 2) {
    const c = cagr(hist._fcf_hist); if (c != null) derived.fcf_cagr5 = c
  }
  if (hist._ebitda_hist && derived.net_debt != null) {
    const eYears = Object.keys(hist._ebitda_hist).map(Number)
    if (eYears.length) {
      const latest = hist._ebitda_hist[Math.max(...eYears)]
      if (latest && latest !== 0) derived.net_debt_ebitda = round(derived.net_debt / latest, 2)
    }
  }
  return derived
}

// ── Procesa una hoja completa → registro para company_fundamentals ──────────
export function processSheet(grid, ticker) {
  const blocks = findBlocks(grid)
  if (!blocks.length) return null

  // Parsear los 6 bloques y combinar por campo
  const allData = {}
  for (let i = 0; i < Math.min(blocks.length, 6); i++) {
    const [br, bc] = blocks[i]
    const blockData = parseBlock(grid, br, bc)
    for (const [field, yearData] of Object.entries(blockData)) {
      if (!allData[field]) allData[field] = {}
      Object.assign(allData[field], yearData)
    }
  }

  const divHistory = parseDividends(grid)
  const record = { ticker }

  // Históricos jsonb {año: valor}
  for (const [internal, col] of Object.entries(HISTORY_FIELDS)) {
    if (allData[internal]) {
      const hist = {}
      for (const y of Object.keys(allData[internal]).map(Number).sort((a, b) => a - b)) {
        hist[String(y)] = round(allData[internal][y], 4)
      }
      if (Object.keys(hist).length) record[col] = hist
    }
  }

  // Históricos auxiliares para derivadas
  const calcHist = {}
  if (allData.revenue) calcHist._revenue_hist = allData.revenue
  if (allData.free_cash_flow) calcHist._fcf_hist = allData.free_cash_flow
  if (allData.ebitda) calcHist._ebitda_hist = allData.ebitda

  // Valores únicos (más reciente)
  for (const [internal, col] of Object.entries(SINGLE_FIELDS)) {
    if (allData[internal]) {
      const yd = allData[internal]
      const yrs = Object.keys(yd).map(Number)
      if (yrs.length) {
        const val = yd[Math.max(...yrs)]
        if (val != null) record[col] = round(val, 4)
      }
    }
  }

  // Dividendos
  if (Object.keys(divHistory).length) {
    const dh = {}
    for (const y of Object.keys(divHistory).map(Number).sort((a, b) => a - b)) dh[String(y)] = round(divHistory[y], 6)
    record.div_history = dh
    const curYear = new Date().getFullYear()
    const prev = Object.keys(divHistory).map(Number).filter(y => y < curYear)
    if (prev.length) record.dps = round(divHistory[Math.max(...prev)], 6)
  }

  // Derivadas
  const derived = calcDerived(record, calcHist)
  for (const [k, v] of Object.entries(derived)) if (v != null) record[k] = v

  // Estados financieros completos en formato {columns,data} (el mismo que yfinance
  // y FinancialTables) — así las empresas sin datos de yfinance también muestran
  // las tablas. En el API se mergean por año con lo existente.
  for (let i = 0; i < STATEMENT_NAMES.length; i++) {
    if (i < blocks.length) {
      const [br, bc] = blocks[i]
      const stmt = buildStmt(parseBlock(grid, br, bc))
      if (stmt) record[STATEMENT_NAMES[i]] = stmt
    }
  }

  return record
}

// Año más reciente de un jsonb plano {año:val} o anidado {campo:{año:val}}
export function vintageOf(value, nested) {
  if (!value) return null
  let years = []
  if (nested) {
    for (const field of Object.values(value)) years.push(...Object.keys(field || {}))
  } else {
    years = Object.keys(value)
  }
  const nums = years.map(y => parseInt(String(y).slice(0, 4), 10)).filter(n => !isNaN(n))
  return nums.length ? Math.max(...nums) : null
}
