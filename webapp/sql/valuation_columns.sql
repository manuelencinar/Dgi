-- Columnas de valoración precalculada en company_fundamentals
-- Ejecutar en el SQL Editor de Supabase ANTES de correr update_fundamentals.py
-- (sin estas columnas el upsert del script fallaría)

alter table company_fundamentals add column if not exists intrinsic_value   numeric;
alter table company_fundamentals add column if not exists valuation_warning text;
alter table company_fundamentals add column if not exists growth_input_used text;
