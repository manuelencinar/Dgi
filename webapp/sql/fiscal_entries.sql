-- Entradas fiscales del usuario (prefill automático + edición manual).
-- type:   dividend | gain | loss
-- source: auto (calculado por la app) | manual (introducido/editado por el usuario)
-- deleted: las auto-entradas eliminadas se marcan deleted=true para no regenerarlas.
-- ex_date / ref: fecha ex-dividendo estimada (dividendos) usada para deduplicar.
create table if not exists fiscal_entries (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  exercise integer not null,
  type text not null,
  ticker text,
  company_name text,
  country text,
  shares numeric,
  dps numeric,
  gross_amount numeric,
  withholding_origin numeric,
  withholding_origin_pct numeric,
  net_amount numeric,
  buy_date date,
  sell_date date,
  ex_date date,
  buy_price_total numeric,
  sell_price_total numeric,
  gain_loss numeric,
  is_manual boolean default false,
  is_confirmed boolean default false,
  deleted boolean default false,
  source text default 'auto',
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table fiscal_entries enable row level security;

drop policy if exists "fiscal_entries_owner" on fiscal_entries;
create policy "fiscal_entries_owner" on fiscal_entries
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists fiscal_entries_user_ex_idx on fiscal_entries(user_id, exercise);
