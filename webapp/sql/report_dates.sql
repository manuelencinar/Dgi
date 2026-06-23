-- Fecha de presentación de resultados (para la página de Novedades).
-- last_report_period: cierre del último trimestre disponible (YYYY-MM-DD).
-- last_report_date: cuándo se detectó ese trimestre (≈ fecha de publicación).
alter table company_fundamentals add column if not exists last_report_period date;
alter table company_fundamentals add column if not exists last_report_date date;
create index if not exists company_fundamentals_report_date_idx on company_fundamentals(last_report_date);
