-- Columnas de ROIC corregido en company_fundamentals
-- Ejecutar en el SQL Editor de Supabase ANTES del próximo run del script

alter table company_fundamentals add column if not exists roic_reported numeric;
alter table company_fundamentals add column if not exists roic_tangible numeric;
alter table company_fundamentals add column if not exists roic_warning text;
alter table company_fundamentals add column if not exists nopat numeric;
alter table company_fundamentals add column if not exists invested_capital numeric;
alter table company_fundamentals add column if not exists invested_capital_tangible numeric;
alter table company_fundamentals add column if not exists tax_rate_effective numeric;
