-- Capital Discipline Ratio (CDR) — métricas precalculadas por el script Python.
-- CDR = (dividendos + recompras + adquisiciones) / FCF × 100.
-- La app las calcula también al vuelo (lib/capital-discipline.js); estos campos
-- son un precálculo para consultas/ordenaciones.

alter table company_fundamentals
  add column if not exists cdr_last_year         numeric,
  add column if not exists cdr_avg_4y            numeric,
  add column if not exists cdr_years_above_100   integer,
  add column if not exists capital_discipline_flag text;
-- flag: 'excellent' | 'good' | 'watch' | 'concern' | 'critical'
