// Estadísticas de cobertura del histórico financiero (tabla financial_history) para la
// subsección "Cobertura histórica" del dashboard. Recibe un cliente con service_role.
// Pagina con .range() (financial_history puede superar 1000 filas holgadamente).

async function fetchAll(supabase, table, cols) {
  const rows = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select(cols).range(from, from + 999)
    if (error) throw error
    if (!data?.length) break
    rows.push(...data)
    if (data.length < 1000) break
  }
  return rows
}

// Cobertura por empresa: primer/último ejercicio, nº de años, fuentes y completitud por
// bloque (income / balance / cashflow / acciones-dividendo).
export async function getCoverageByCompany(supabase) {
  let rows = []
  try {
    rows = await fetchAll(supabase, 'financial_history',
      'ticker, fiscal_year, source, revenue, eps_diluted, total_assets, operating_cash_flow, shares_diluted, dividend_per_share')
  } catch { return [] }   // tabla aún no creada → sin cobertura

  const by = {}
  for (const r of rows) {
    const t = r.ticker
    let c = by[t]
    if (!c) c = by[t] = { ticker: t, years: new Set(), sources: new Set(), income: 0, balance: 0, cashflow: 0, shares: 0 }
    c.years.add(r.fiscal_year)
    if (r.source) c.sources.add(r.source)
    if (r.revenue != null || r.eps_diluted != null) c.income++
    if (r.total_assets != null) c.balance++
    if (r.operating_cash_flow != null) c.cashflow++
    if (r.shares_diluted != null || r.dividend_per_share != null) c.shares++
  }

  return Object.values(by).map(c => {
    const yrs = [...c.years].sort((a, b) => a - b)
    return {
      ticker: c.ticker,
      primer_ejercicio: yrs[0] ?? null,
      ultimo_ejercicio: yrs[yrs.length - 1] ?? null,
      num_anos: yrs.length,
      fuentes: [...c.sources].sort(),
      blocks: { income: c.income, balance: c.balance, cashflow: c.cashflow, shares: c.shares },
    }
  }).sort((a, b) => (b.num_anos - a.num_anos) || a.ticker.localeCompare(b.ticker))
}

// Empresas de company_fundamentals SIN ninguna fila en financial_history.
export async function getUncoveredCompanies(supabase) {
  const covered = new Set()
  try {
    const rows = await fetchAll(supabase, 'financial_history', 'ticker')
    rows.forEach(r => covered.add(r.ticker))
  } catch { /* tabla aún no creada → todas sin cubrir */ }

  const all = await fetchAll(supabase, 'company_fundamentals', 'ticker')
  return all.map(r => r.ticker).filter(t => !covered.has(t)).sort()
}
