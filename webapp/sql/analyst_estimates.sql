-- Estimaciones de analistas (consenso, precargadas por lotes con el script
-- scripts/fetch_analyst_estimates.mjs + workflow diario).
--   analyst_estimates        jsonb       → [{year, revenue, eps, analysts}]
--   analyst_estimates_status text        → 'ok' (con datos) | 'none' (sin cobertura, no reconsultar)
--   analyst_estimates_at     timestamptz → fecha de la última consulta
alter table company_fundamentals
  add column if not exists analyst_estimates        jsonb,
  add column if not exists analyst_estimates_status text,
  add column if not exists analyst_estimates_at     timestamptz;
