-- Tabla de precios de cierre diarios
-- Ejecutar en el SQL Editor de Supabase

create table if not exists daily_prices (
  id          uuid default gen_random_uuid() primary key,
  ticker      text not null,
  date        date not null,
  close_price numeric not null,
  updated_at  timestamptz default now(),
  unique(ticker, date)
);

create index if not exists idx_daily_prices_ticker_date on daily_prices(ticker, date desc);
create index if not exists idx_daily_prices_date        on daily_prices(date desc);

alter table daily_prices enable row level security;
create policy "daily_prices: lectura publica" on daily_prices for select using (true);
