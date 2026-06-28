-- Fondo de oportunidad: liquidez del usuario disponible para nuevas inversiones.
-- Cada apunte guarda el importe CON SIGNO (+ entra, − sale); el saldo = suma.
--   type: deposit | withdraw | dividend | interest | investment
create table if not exists cash_movements (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  date       date not null default current_date,
  type       text not null,
  amount     numeric not null,           -- con signo
  note       text,
  created_at timestamptz default now()
);

alter table cash_movements enable row level security;
drop policy if exists cash_movements_select on cash_movements;
drop policy if exists cash_movements_insert on cash_movements;
drop policy if exists cash_movements_update on cash_movements;
drop policy if exists cash_movements_delete on cash_movements;
create policy cash_movements_select on cash_movements for select using (auth.uid() = user_id);
create policy cash_movements_insert on cash_movements for insert with check (auth.uid() = user_id);
create policy cash_movements_update on cash_movements for update using (auth.uid() = user_id);
create policy cash_movements_delete on cash_movements for delete using (auth.uid() = user_id);
create index if not exists cash_movements_user_date on cash_movements (user_id, date);

-- Preferencias del fondo en user_settings (TAE del banco + dividendos→fondo).
alter table user_settings
  add column if not exists cash_interest_rate numeric default 0,     -- TAE %
  add column if not exists dividends_to_cash  boolean default false;
