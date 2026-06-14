-- Histórico del Score DGI por empresa — para detectar deterioro/mejora silenciosa
-- a lo largo del tiempo (snapshot semanal). No hay backfill posible: empieza a
-- acumular desde el primer run de /api/cron/snapshot-scores.
-- Ejecutar en el SQL Editor de Supabase.

create table if not exists score_history (
  id          uuid default gen_random_uuid() primary key,
  ticker      text not null,
  date        date not null,
  score       numeric,          -- dgiScore.total (0–10), mismo que muestra la ficha
  prepenalty  numeric,          -- nota antes de penalizaciones (contexto)
  sector_type text,
  created_at  timestamptz default now(),
  unique(ticker, date)
);

create index if not exists idx_score_history_ticker_date on score_history(ticker, date desc);

alter table score_history enable row level security;
create policy "score_history: lectura publica" on score_history for select using (true);
