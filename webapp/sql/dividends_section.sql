-- Sección centralizada de Dividendos. dividends_received es la fuente de verdad.
-- status: 'pending' (la app lo generó, sin confirmar) | 'received' (el usuario confirmó el cobro)
-- source: 'auto' (prefill) | 'manual' (introducido/editado por el usuario)
alter table dividends_received
  add column if not exists status                 text not null default 'pending',
  add column if not exists ex_dividend_date        date,
  add column if not exists payment_date_estimated  date,
  add column if not exists shares                  numeric,
  add column if not exists dps                     numeric,
  add column if not exists withholding_origin_pct  numeric,
  add column if not exists withholding_origin       numeric,
  add column if not exists source                  text default 'manual',
  add column if not exists notes                   text,
  add column if not exists updated_at              timestamptz default now();

-- Los dividendos ya registrados a mano se consideran cobrados.
update dividends_received set status = 'received' where status is null or status = '';

-- Exclusiones: dividendos auto que el usuario borró y NO quiere regenerar.
create table if not exists dividend_prefill_exclusions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  ticker text not null,
  period text not null,          -- 'YYYY-MM' del pago estimado
  created_at timestamptz default now(),
  unique(user_id, ticker, period)
);
alter table dividend_prefill_exclusions enable row level security;
drop policy if exists "div_excl_owner" on dividend_prefill_exclusions;
create policy "div_excl_owner" on dividend_prefill_exclusions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Configuración por empresa: frecuencia/meses de pago y exclusión del prefill.
create table if not exists dividend_config (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  ticker text not null,
  frequency integer,              -- 1 anual · 2 semestral · 4 trimestral · 12 mensual
  months jsonb,                   -- [3,6,9,12]
  excluded boolean default false, -- excluir del prefill automático
  updated_at timestamptz default now(),
  unique(user_id, ticker)
);
alter table dividend_config enable row level security;
drop policy if exists "div_config_owner" on dividend_config;
create policy "div_config_owner" on dividend_config
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
