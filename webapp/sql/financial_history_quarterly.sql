-- Histórico financiero TRIMESTRAL permanente y ACUMULATIVO. A diferencia de la ventana
-- viva de company_fundamentals.*_quarterly (que se sobrescribe cada semana con los últimos
-- trimestres), esta tabla NO borra nunca: cada ejecución del cron hace UPSERT de los
-- trimestres nuevos y conserva todos los anteriores. Así se acumula la historia trimestral
-- de aquí en adelante (y se puede backfillear hacia atrás desde SEC 10-Q en el futuro).
--
-- period = fecha de cierre del trimestre 'YYYY-MM-DD' (inequívoca entre empresas y cadencias
-- fiscales distintas). unique(ticker, period, source): distintas fuentes conviven como filas.
-- RLS activada sin policies de cliente: la escriben los scripts con service_role y la lee la
-- ficha con service_role (contenido premium).
create table if not exists financial_history_quarterly (
  id             bigint generated always as identity primary key,
  ticker         text not null,
  period         text not null,                 -- fecha de cierre del trimestre 'YYYY-MM-DD'
  period_end     date,
  source         text not null default 'yfinance',
  currency       text,
  -- Cuenta de resultados (del trimestre)
  revenue                numeric,
  gross_profit           numeric,
  operating_income       numeric,
  net_income             numeric,
  eps_diluted            numeric,
  eps_basic              numeric,
  -- Balance (foto a fin de trimestre)
  total_assets           numeric,
  total_liabilities      numeric,
  stockholders_equity    numeric,
  long_term_debt         numeric,
  cash_and_equivalents   numeric,
  -- Flujo de caja (del trimestre)
  operating_cash_flow    numeric,
  capex                  numeric,
  free_cash_flow         numeric,
  -- Cualquier otro concepto trimestral, sin filtrar
  raw_concepts           jsonb,
  created_at             timestamptz default now(),
  updated_at             timestamptz default now(),
  unique (ticker, period, source)
);

create index if not exists fhq_ticker_idx on financial_history_quarterly (ticker);
create index if not exists fhq_period_idx on financial_history_quarterly (period);

alter table financial_history_quarterly enable row level security;
-- Sin policies para clientes: solo service_role (scripts + ficha) accede.
