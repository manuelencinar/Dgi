-- Intensidad de I+D (I+D / ingresos, último año, en %) — precalculada para el screener.
-- Solo relevante en empresas de salud (farmacéuticas/biotec); null en el resto.
alter table company_fundamentals add column if not exists rd_intensity numeric;
