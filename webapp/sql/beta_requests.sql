-- Solicitudes de la oferta beta fundadores (pago por Bizum, activación manual).
-- Se escriben vía /api/beta/solicitar (service_role) y se leen solo en el dashboard
-- admin → RLS activada SIN policies (nadie accede con el cliente anon).
create table if not exists beta_requests (
  id           uuid primary key default gen_random_uuid(),
  email        text not null,
  name         text,
  bizum_ref    text,
  status       text not null default 'pending',   -- pending | activated | rejected
  note         text,
  created_at   timestamptz default now(),
  activated_at timestamptz
);
create index if not exists beta_requests_status on beta_requests (status, created_at desc);
alter table beta_requests enable row level security;
