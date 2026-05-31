-- Panel de administración — ejecutar en el SQL Editor de Supabase

-- 1. Columna role en user_settings
alter table user_settings add column if not exists role text not null default 'user';
create index if not exists idx_user_settings_role on user_settings(role);

-- Marcar al administrador (sustituir el email)
update user_settings set role = 'admin'
where user_id = (select id from auth.users where email = 'vayaebookk@gmail.com');

-- RLS: el usuario solo puede leer su propia fila (incluye su role)
-- (si ya existe una policy de select sobre user_settings, esta es redundante)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'user_settings' and policyname = 'role: solo lectura propia'
  ) then
    create policy "role: solo lectura propia" on user_settings
      for select using (auth.uid() = user_id);
  end if;
end $$;

-- 2. Tabla admin_logs
create table if not exists admin_logs (
  id uuid default gen_random_uuid() primary key,
  event_type text not null,
  description text,
  details jsonb,
  status text not null default 'ok',
  created_at timestamptz default now()
);
alter table admin_logs enable row level security;

-- Solo admin puede leer; escritura solo vía service_role (que ignora RLS)
do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'admin_logs' and policyname = 'admin lee logs'
  ) then
    create policy "admin lee logs" on admin_logs for select using (
      exists (select 1 from user_settings us where us.user_id = auth.uid() and us.role = 'admin')
    );
  end if;
end $$;
