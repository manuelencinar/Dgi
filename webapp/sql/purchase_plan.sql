-- Calendario de compras: cola de aportaciones planificadas del usuario.
-- La lee/escribe el módulo /cartera/calendario-compras. RLS por usuario, igual que
-- positions/transactions (CRUD directo desde el cliente con el token de sesión).
create table if not exists purchase_plan (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  ticker       text not null,
  company_name text,
  currency     text default 'EUR',          -- divisa del rango de precio (la de la acción)
  target_date  date,                          -- mes/fecha objetivo de la aportación
  amount_eur   numeric,                       -- importe estimado (o shares; uno de los dos)
  shares       numeric,                       -- nº de acciones estimado (o amount_eur)
  price_min    numeric,                       -- rango de entrada mínimo (ej. Iberdrola 20)
  price_max    numeric,                       -- rango de entrada máximo (ej. 22)
  notes        text,
  status       text not null default 'pending'
               check (status in ('pending', 'executed', 'discarded')),
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

create index if not exists purchase_plan_user_date_idx on purchase_plan (user_id, target_date);

alter table purchase_plan enable row level security;

drop policy if exists purchase_plan_select on purchase_plan;
drop policy if exists purchase_plan_insert on purchase_plan;
drop policy if exists purchase_plan_update on purchase_plan;
drop policy if exists purchase_plan_delete on purchase_plan;

create policy purchase_plan_select on purchase_plan for select using (auth.uid() = user_id);
create policy purchase_plan_insert on purchase_plan for insert with check (auth.uid() = user_id);
create policy purchase_plan_update on purchase_plan for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy purchase_plan_delete on purchase_plan for delete using (auth.uid() = user_id);
