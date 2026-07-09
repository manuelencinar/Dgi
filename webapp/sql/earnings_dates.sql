-- Próxima fecha de publicación de resultados por empresa.
-- La rellena update_fundamentals.py (semanal) desde el calendario de resultados y el
-- backfill scripts/backfill_earnings_dates.mjs. La leen: Novedades ("presentan
-- resultados esta semana"), la ficha de empresa y el resumen mensual por email.
alter table company_fundamentals
  add column if not exists next_earnings_date date;
