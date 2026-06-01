-- Soporte para ETFs y fondos de inversión en la cartera
-- Ejecutar en el SQL Editor de Supabase

-- Tabla funds
create table if not exists funds (
  ticker text primary key,
  name text,
  asset_type text not null default 'etf',
  currency text not null default 'USD',
  country text,
  current_price numeric,
  ter numeric,
  yield_ttm numeric,
  distribution_history jsonb,
  price_history jsonb,
  benchmark text,
  category text,
  manager text,
  isin text,
  extra_data jsonb,
  updated_at timestamptz default now()
);

alter table funds enable row level security;

-- Lectura pública, escritura solo service_role
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'funds' and policyname = 'funds lectura pública') then
    create policy "funds lectura pública" on funds for select using (true);
  end if;
end $$;

-- asset_type en positions
alter table positions add column if not exists asset_type text not null default 'stock';

-- ETFs DGI de referencia (precarga — precios se rellenan en el primer lookup/run)
insert into funds (ticker, name, asset_type, currency, country) values
  ('SCHD',   'Schwab US Dividend Equity ETF',      'etf', 'USD', 'US'),
  ('VIG',    'Vanguard Dividend Appreciation ETF',  'etf', 'USD', 'US'),
  ('DGRO',   'iShares Core Dividend Growth ETF',    'etf', 'USD', 'US'),
  ('VYM',    'Vanguard High Dividend Yield ETF',    'etf', 'USD', 'US'),
  ('JEPI',   'JPMorgan Equity Premium Income ETF',  'etf', 'USD', 'US'),
  ('JEPQ',   'JPMorgan Nasdaq Equity Premium ETF',  'etf', 'USD', 'US'),
  ('DVY',    'iShares Select Dividend ETF',         'etf', 'USD', 'US'),
  ('SDY',    'SPDR S&P Dividend ETF',               'etf', 'USD', 'US'),
  ('VHYL.L', 'Vanguard FTSE All-World High Div',     'etf', 'GBP', 'GB'),
  ('IDVY.AS','iShares Euro Dividend UCITS ETF',      'etf', 'EUR', 'NL'),
  ('EXSG.DE','iShares STOXX Global Select Div 100',  'etf', 'EUR', 'DE'),
  ('ISPA.AS','iShares STOXX Global Select Dividend', 'etf', 'EUR', 'NL'),
  ('TDIV.AS','VanEck Morningstar Dev Mkts Dividend', 'etf', 'EUR', 'NL'),
  ('FGEQ.L', 'Fidelity Global Quality Income ETF',   'etf', 'GBP', 'GB')
on conflict (ticker) do nothing;
