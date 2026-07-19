-- Tracking de actividad de usuarios (pestaña "Actividad" del dashboard).
-- Los eventos los inserta proxy.js con la sesión del usuario (fire-and-forget). El
-- usuario puede ESCRIBIR sus propios eventos pero NO leerlos: la lectura y la limpieza
-- son solo desde el dashboard vía service_role (mismo patrón que /api/ajustes / admin_logs).
create table if not exists user_events (
  id          bigint generated always as identity primary key,
  user_id     uuid references auth.users(id) on delete cascade,
  section     text,
  event_name  text default 'page_view',
  path        text,
  metadata    jsonb,
  created_at  timestamptz default now()
);

create index if not exists user_events_user_section_idx on user_events (user_id, section);
create index if not exists user_events_created_idx on user_events (created_at);

alter table user_events enable row level security;

-- Única policy para clientes: INSERT de los eventos propios. Sin SELECT/UPDATE/DELETE
-- para el rol anónimo/autenticado → el dashboard lee con service_role (bypass RLS).
drop policy if exists user_events_insert on user_events;
create policy user_events_insert on user_events for insert with check (auth.uid() = user_id);
