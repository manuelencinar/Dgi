-- Guías / artículos del blog SEO, editables desde el panel admin.
-- Contenido en Markdown (subset: ## / - / > / !cta + inline [txt](url) **negrita**).
create table if not exists guias (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  title       text not null,
  description text,
  category    text,
  excerpt     text,
  content     text,             -- markdown
  minutes     int default 5,
  related     text[],           -- slugs relacionados
  published   boolean default false,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
create index if not exists guias_published on guias (published, updated_at desc);

-- Lectura pública SOLO de las publicadas (las páginas usan el service client en
-- servidor, pero dejamos la policy por si se lee con el cliente anon).
alter table guias enable row level security;
drop policy if exists guias_public_read on guias;
create policy guias_public_read on guias for select using (published = true);
