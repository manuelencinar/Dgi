-- Caché de la evolución del patrimonio: valor de mercado, capital invertido y
-- dividendos por mes. Lo rellena /api/cartera/evolucion (y un cron mensual).
create table if not exists portfolio_snapshots (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  year integer not null,
  month integer not null,
  market_value numeric,
  invested_capital numeric,
  dividends_received_month numeric,
  dividends_accumulated numeric,
  calculated_at timestamptz default now(),
  unique(user_id, year, month)
);

alter table portfolio_snapshots enable row level security;

drop policy if exists "portfolio_snapshots_owner" on portfolio_snapshots;
create policy "portfolio_snapshots_owner" on portfolio_snapshots
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists portfolio_snapshots_user_year_idx on portfolio_snapshots(user_id, year);
