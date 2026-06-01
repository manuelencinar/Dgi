-- FX y preferencias de usuario
-- Ejecutar en el SQL Editor de Supabase

-- ── Tabla exchange_rates ───────────────────────────────────────────────────
create table if not exists exchange_rates (
  id             uuid default gen_random_uuid() primary key,
  base_currency  text not null,
  quote_currency text not null,
  rate           numeric not null,
  date           date not null,
  created_at     timestamptz default now(),
  unique(base_currency, quote_currency, date)
);

create index if not exists idx_exchange_rates_date on exchange_rates(date desc);
create index if not exists idx_exchange_rates_pair on exchange_rates(base_currency, quote_currency);

alter table exchange_rates enable row level security;
create policy "exchange_rates_public_read" on exchange_rates for select using (true);

-- ── Columnas FX en transactions ────────────────────────────────────────────
alter table transactions
  add column if not exists currency                  text,
  add column if not exists amount_original           numeric,
  add column if not exists exchange_rate             numeric,
  add column if not exists exchange_rate_date        date,
  add column if not exists fx_commission_pct         numeric,
  add column if not exists fx_commission_eur         numeric,
  add column if not exists total_cost_base_currency  numeric;

-- ── Preferencias en user_settings ─────────────────────────────────────────
alter table user_settings
  add column if not exists base_currency         text    not null default 'EUR',
  add column if not exists country_residence     text    not null default 'ES',
  add column if not exists broker_name           text,
  add column if not exists fx_commission_pct     numeric not null default 0,
  add column if not exists fx_alert_threshold    numeric          default 10,
  add column if not exists benchmark_index       text             default 'MSCI World',
  add column if not exists monthly_summary_active boolean         default false,
  add column if not exists alerts_email_active   boolean         default false;
