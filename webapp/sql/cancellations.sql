-- Retención y cancelaciones
-- Ejecutar en el SQL Editor de Supabase

-- ── Tabla cancellations ────────────────────────────────────────────────────
create table if not exists cancellations (
  id                        uuid default gen_random_uuid() primary key,
  user_id                   uuid references auth.users(id),
  reason                    text not null,
  feedback                  text,
  plan_type                 text,
  months_as_premium         integer,
  retention_offer_shown     text,
  retention_offer_accepted  boolean default false,
  created_at                timestamptz default now()
);

-- ── Tabla feedback ─────────────────────────────────────────────────────────
create table if not exists feedback (
  id          uuid default gen_random_uuid() primary key,
  user_id     uuid references auth.users(id),
  type        text not null default 'cancellation',
  content     text not null,
  created_at  timestamptz default now()
);

-- ── Columnas de retención en user_settings ─────────────────────────────────
alter table user_settings
  add column if not exists subscription_paused      boolean default false,
  add column if not exists pause_end_date           date,
  add column if not exists retention_discount_used  boolean default false,
  add column if not exists retention_discount_date  date,
  add column if not exists cancelled_at             timestamptz,
  add column if not exists access_until             date;

-- ── RLS: el propietario lee lo suyo; escritura solo service_role ───────────
alter table cancellations enable row level security;
alter table feedback      enable row level security;

create policy "cancellations_owner_read" on cancellations for select using (auth.uid() = user_id);
create policy "feedback_owner_read"      on feedback      for select using (auth.uid() = user_id);
