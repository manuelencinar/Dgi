-- ════════════════════════════════════════════════════════════════════════════
-- SCRIPT CONSOLIDADO — ejecútalo entero en el SQL Editor de Supabase.
-- Es idempotente: puedes correrlo varias veces sin romper nada ni duplicar.
-- No pisa valores ya editados (TER, benchmarks…): solo rellena los que falten.
-- (Pega también, si quieres, el ALTER de pays_dividend que ya ejecutaste.)
-- ════════════════════════════════════════════════════════════════════════════

-- ── transactions: comisiones del broker ─────────────────────────────────────
alter table transactions
  add column if not exists commission          numeric default 0,
  add column if not exists commission_currency text,
  add column if not exists total_cost          numeric;

-- ── company_fundamentals: fechas de dividendo ───────────────────────────────
alter table company_fundamentals
  add column if not exists dividend_events jsonb,
  add column if not exists next_ex_date    date,
  add column if not exists next_pay_date   date;

-- ── company_fundamentals: ¿reparte dividendo? (por si no lo corriste) ────────
alter table company_fundamentals
  add column if not exists pays_dividend            boolean,
  add column if not exists no_dividend_confirmed_at timestamptz;

-- ── company_fundamentals: Capital Discipline Ratio ──────────────────────────
alter table company_fundamentals
  add column if not exists cdr_last_year           numeric,
  add column if not exists cdr_avg_4y              numeric,
  add column if not exists cdr_years_above_100     integer,
  add column if not exists capital_discipline_flag text;

-- ── company_fundamentals: importación manual (Excel) ────────────────────────
alter table company_fundamentals
  add column if not exists manual_fields       jsonb default '{}'::jsonb,
  add column if not exists data_vintage        jsonb default '{}'::jsonb,
  add column if not exists last_manual_import   timestamptz,
  add column if not exists manual_import_notes  text;
create index if not exists idx_company_fundamentals_last_manual_import
  on company_fundamentals (last_manual_import desc nulls last);

-- ── company_fundamentals: ROIC display (mínimo de reportado/tangible) ───────
alter table company_fundamentals
  add column if not exists roic_display numeric;
update company_fundamentals
  set roic_display = LEAST(COALESCE(roic_reported, 999), COALESCE(roic_tangible, 999))
  where roic_reported is not null or roic_tangible is not null;
update company_fundamentals set roic_display = null where roic_display = 999;

-- ── funds: TER / benchmark / rentabilidades (SOLO añade columnas) ───────────
alter table funds
  add column if not exists ter                    numeric,
  add column if not exists benchmark_ticker       text,
  add column if not exists benchmark_name         text,
  add column if not exists return_ytd             numeric,
  add column if not exists return_1y              numeric,
  add column if not exists return_3y              numeric,
  add column if not exists return_5y              numeric,
  add column if not exists benchmark_return_ytd   numeric,
  add column if not exists benchmark_return_1y    numeric,
  add column if not exists benchmark_return_3y    numeric,
  add column if not exists benchmark_return_5y    numeric;
-- Seed de TER/benchmark SOLO si están vacíos (no pisa lo editado en el admin):
update funds set ter = v.ter from (values
  ('SCHD',0.0006),('VIG',0.0006),('VYM',0.0006),('JEPI',0.0033),('JEPQ',0.0035),
  ('DVY',0.0038),('SDY',0.0035),('DGRO',0.0022),('VHYL.L',0.0029),('IDVY.AS',0.0032),
  ('EXSG.DE',0.0046),('ISPA.AS',0.0040),('TDIV.AS',0.0038),('FGEQ.L',0.0040)
) as v(ticker,ter) where funds.ticker = v.ticker and funds.ter is null;
update funds set benchmark_ticker='URTH', benchmark_name='MSCI World'
  where ticker in ('VHYL.L','TDIV.AS','FGEQ.L','ISPA.AS') and benchmark_ticker is null;
update funds set benchmark_ticker='^STOXX', benchmark_name='STOXX 600'
  where ticker in ('IDVY.AS','EXSG.DE') and benchmark_ticker is null;
update funds set benchmark_ticker='^GSPC', benchmark_name='S&P 500'
  where ticker in ('SCHD','VIG','VYM','JEPI','JEPQ','DVY','SDY','DGRO') and benchmark_ticker is null;

-- ── user_settings: onboarding ───────────────────────────────────────────────
alter table user_settings add column if not exists onboarding_completed boolean default false;
alter table user_settings add column if not exists onboarding_step      integer default 0;
alter table user_settings add column if not exists experience_level     text default 'intermediate';
update user_settings set onboarding_completed = true where onboarding_completed is not true;

-- ── user_settings: retención / cancelaciones ────────────────────────────────
alter table user_settings
  add column if not exists subscription_paused      boolean default false,
  add column if not exists pause_end_date           date,
  add column if not exists retention_discount_used  boolean default false,
  add column if not exists retention_discount_date  date,
  add column if not exists cancelled_at             timestamptz,
  add column if not exists access_until             date;

-- ── dict_overrides (gestión de empresas en el admin) ────────────────────────
create table if not exists dict_overrides (
  ticker text primary key,
  action text not null check (action in ('add','remove')),
  name text, country text, currency text, sector text, subsector text, type text,
  created_at timestamptz default now()
);
alter table dict_overrides enable row level security;

-- ── markets_overrides + rename_ticker (admin) ───────────────────────────────
create table if not exists markets_overrides (
  symbol text primary key,
  name text, country text, region text, yf_ticker text,
  active boolean not null default true,
  updated_at timestamptz default now()
);
alter table markets_overrides enable row level security;

create or replace function rename_ticker(p_old text, p_new text)
returns void language plpgsql security definer as $$
begin
  if p_old is null or p_new is null or p_old = p_new then raise exception 'Tickers inválidos'; end if;
  if exists (select 1 from company_fundamentals where ticker = p_new) then
    raise exception 'El ticker % ya existe en company_fundamentals', p_new; end if;
  update company_fundamentals set ticker = p_new where ticker = p_old;
  update positions          set ticker = p_new where ticker = p_old;
  update watchlist          set ticker = p_new where ticker = p_old;
  update transactions       set ticker = p_new where ticker = p_old;
  update dividends_received set ticker = p_new where ticker = p_old;
  begin update index_companies set ticker = p_new where ticker = p_old; exception when undefined_table then null; end;
  begin update daily_prices    set ticker = p_new where ticker = p_old; exception when undefined_table then null; end;
end; $$;

-- ── cancellations + feedback ────────────────────────────────────────────────
create table if not exists cancellations (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id),
  reason text not null, feedback text, plan_type text, months_as_premium integer,
  retention_offer_shown text, retention_offer_accepted boolean default false,
  created_at timestamptz default now()
);
create table if not exists feedback (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id),
  type text not null default 'cancellation', content text not null,
  created_at timestamptz default now()
);
alter table cancellations enable row level security;
alter table feedback      enable row level security;
drop policy if exists "cancellations_owner_read" on cancellations;
create policy "cancellations_owner_read" on cancellations for select using (auth.uid() = user_id);
drop policy if exists "feedback_owner_read" on feedback;
create policy "feedback_owner_read" on feedback for select using (auth.uid() = user_id);

-- ── watchlist + notifications ───────────────────────────────────────────────
create table if not exists watchlist (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  ticker text not null,
  target_price numeric, target_yield numeric, notes text,
  alert_price_active boolean default false, alert_yield_active boolean default false,
  alert_price_triggered boolean default false, alert_yield_triggered boolean default false,
  created_at timestamptz default now(),
  unique(user_id, ticker)
);
alter table watchlist enable row level security;
drop policy if exists "owner" on watchlist;
create policy "owner" on watchlist for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists watchlist_user_idx on watchlist(user_id);

create table if not exists notifications (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  type text not null, ticker text, message text not null,
  read boolean default false, created_at timestamptz default now()
);
alter table notifications enable row level security;
drop policy if exists "owner" on notifications;
create policy "owner" on notifications for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists notifications_user_idx on notifications(user_id, read);
