-- ─────────────────────────────────────────────────────────────────────────────
-- Watchlist + notificaciones
-- Ejecutar en el SQL editor de Supabase.
-- ─────────────────────────────────────────────────────────────────────────────

-- Empresas que el usuario sigue (aún no compradas).
create table if not exists watchlist (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  ticker text not null,
  target_price numeric,
  target_yield numeric,
  notes text,
  alert_price_active boolean default false,
  alert_yield_active boolean default false,
  -- Estado interno anti-spam: una alerta no se vuelve a disparar hasta que el
  -- precio/yield sale de la zona objetivo y vuelve a entrar.
  alert_price_triggered boolean default false,
  alert_yield_triggered boolean default false,
  created_at timestamptz default now(),
  unique(user_id, ticker)
);

alter table watchlist enable row level security;

drop policy if exists "owner" on watchlist;
create policy "owner" on watchlist
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists watchlist_user_idx on watchlist(user_id);

-- Notificaciones in-app (campana del menú + página /notificaciones).
create table if not exists notifications (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  type text not null,            -- watchlist_price | watchlist_yield | dividend_cut | recurring
  ticker text,
  message text not null,
  read boolean default false,
  created_at timestamptz default now()
);

alter table notifications enable row level security;

drop policy if exists "owner" on notifications;
create policy "owner" on notifications
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists notifications_user_idx on notifications(user_id, read);
