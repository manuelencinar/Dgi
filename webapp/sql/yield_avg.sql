-- Yield histórico medio por empresa (para la señal "zona de compra" del screener)
-- yield_avg        = media del yield anual (dps_año / precio medio del año) de
--                    hasta los 5 últimos años COMPLETOS con datos, en %.
-- yield_avg_years  = nº de años usados en esa media (transparencia).
-- Se calcula desde div_history (DPS anual) + histórico de precios de Yahoo.
-- Fuente autoritativa: update_fundamentals.py (run semanal).
-- Backfill inmediato / cobertura total: python scripts/backfill_yield_avg_yahoo.py --write
-- Ejecutar en el SQL Editor de Supabase.

alter table company_fundamentals add column if not exists yield_avg       numeric;
alter table company_fundamentals add column if not exists yield_avg_years integer;
