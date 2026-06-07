-- Gestión avanzada del admin: overrides de índices + cambio de ticker atómico.
-- (Las empresas se editan vía dict_overrides, que ya existe.)

-- ── Overrides de índices/mercados (lib/markets.js es estático) ──────────────
-- Keyed por el symbol estático original. Solo edición/toggle (no add/remove).
create table if not exists markets_overrides (
  symbol      text primary key,          -- symbol estático de lib/markets.js
  name        text,
  country     text,
  region      text,
  yf_ticker   text,                       -- symbol alternativo para yfinance
  active      boolean not null default true,
  updated_at  timestamptz default now()
);
alter table markets_overrides enable row level security;
-- Sin policies de cliente: solo el service_role (API admin).

-- ── Cambio de ticker atómico (todas las tablas o ninguna) ───────────────────
create or replace function rename_ticker(p_old text, p_new text)
returns void
language plpgsql
security definer
as $$
begin
  if p_old is null or p_new is null or p_old = p_new then
    raise exception 'Tickers inválidos';
  end if;
  if exists (select 1 from company_fundamentals where ticker = p_new) then
    raise exception 'El ticker % ya existe en company_fundamentals', p_new;
  end if;

  update company_fundamentals set ticker = p_new where ticker = p_old;
  update positions          set ticker = p_new where ticker = p_old;
  update watchlist          set ticker = p_new where ticker = p_old;
  update transactions       set ticker = p_new where ticker = p_old;
  update dividends_received set ticker = p_new where ticker = p_old;

  begin update index_companies set ticker = p_new where ticker = p_old; exception when undefined_table then null; end;
  begin update daily_prices    set ticker = p_new where ticker = p_old; exception when undefined_table then null; end;
end;
$$;
