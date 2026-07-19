-- Histórico financiero completo (backfill puntual desde SEC EDGAR + stockanalysis).
-- NO lo alimenta el cron semanal (update_fundamentals.py) — es un proceso aparte de una
-- sola ejecución (scripts/backfill_financial_history.py). RLS activada sin policies de
-- cliente: lo escriben los scripts con service_role y lo lee el dashboard con service_role.
--
-- unique(ticker, fiscal_year, source): así los datos parciales de SEC EDGAR y los de
-- stockanalysis conviven como filas separadas (se ve la procedencia de cada dato y la
-- fase 2 no pisa silenciosamente lo que trajo la fase 1).
create table if not exists financial_history (
  id             bigint generated always as identity primary key,
  ticker         text not null,
  fiscal_year    int  not null,
  source         text not null,                 -- 'sec_edgar' | 'stockanalysis'
  currency       text,
  form_type      text,                          -- 10-K / 20-F / (null en stockanalysis)
  filed_date     date,
  -- Cuenta de resultados
  revenue                numeric,
  gross_profit           numeric,
  operating_income       numeric,
  net_income             numeric,
  eps_diluted            numeric,
  -- Balance
  total_assets           numeric,
  total_liabilities      numeric,
  stockholders_equity    numeric,
  long_term_debt         numeric,
  cash_and_equivalents   numeric,
  -- Flujo de caja
  operating_cash_flow    numeric,
  capex                  numeric,
  free_cash_flow         numeric,
  dividends_paid_total   numeric,
  buybacks_total         numeric,
  dividend_per_share     numeric,
  -- Acciones
  shares_diluted         numeric,
  shares_basic           numeric,
  -- Cualquier otro concepto anual descargado, sin filtrar (para no re-golpear la API luego)
  raw_concepts           jsonb,
  created_at             timestamptz default now(),
  unique (ticker, fiscal_year, source)
);

create index if not exists financial_history_ticker_idx on financial_history (ticker);
create index if not exists financial_history_year_idx   on financial_history (fiscal_year);

alter table financial_history enable row level security;
-- Sin policies para clientes: solo service_role (scripts + dashboard) accede.
