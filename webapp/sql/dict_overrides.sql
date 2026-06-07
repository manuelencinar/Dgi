-- Overrides del DICT estático (data/dict.js) gestionables desde el dashboard.
-- action='remove' → oculta una empresa (fusionada/desaparecida).
-- action='add'    → añade una empresa que no está en el DICT estático.
-- Se fusiona con el DICT en runtime (lib/dict.js). Escritura solo vía API admin (service_role).

create table if not exists dict_overrides (
  ticker      text primary key,
  action      text not null check (action in ('add', 'remove')),
  name        text,
  country     text,
  currency    text,
  sector      text,
  subsector   text,
  type        text,
  created_at  timestamptz default now()
);

alter table dict_overrides enable row level security;
-- Sin policies de cliente: solo el service_role (API admin) lee/escribe.
