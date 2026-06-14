-- Ranking de "Caníbales de acciones": reducción de acciones en circulación desde
-- el año base (~2022) — recompra neta real medida en NÚMERO de acciones (no €).
-- shares_reduced_pct = (acciones_base − acciones_últimas) / acciones_base * 100
--                      (positivo = ha reducido acciones)
-- shares_base_year   = año más antiguo usado (transparencia, ~2022)
-- Se calcula desde los estados ya guardados (Diluted Average Shares).
-- Backfill inmediato: node scripts/recalc_shares.mjs --write
-- Ejecutar en el SQL Editor de Supabase.

alter table company_fundamentals add column if not exists shares_reduced_pct numeric;
alter table company_fundamentals add column if not exists shares_base_year integer;
