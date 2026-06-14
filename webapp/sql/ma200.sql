-- Media móvil de 200 sesiones (MM200) por empresa — indicador técnico de compra.
-- Media de los últimos 200 cierres diarios. Se calcula desde el histórico de
-- precios de Yahoo (mismo que yield_avg) en update_fundamentals.py.
-- Backfill inmediato: python scripts/backfill_yield_avg_yahoo.py --write
-- Ejecutar en el SQL Editor de Supabase.

alter table company_fundamentals add column if not exists ma200 numeric;
