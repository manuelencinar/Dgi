-- ROIC display = el más conservador (menor) de reportado/tangible.
-- Ejecutar en el SQL Editor de Supabase.
-- Nota: el frontend ya deriva este mínimo al vuelo; esta columna lo persiste
-- para queries SQL y para que el script Python lo guarde en cada run.

alter table company_fundamentals
  add column if not exists roic_display numeric;

update company_fundamentals
  set roic_display = LEAST(
    COALESCE(roic_reported, 999),
    COALESCE(roic_tangible, 999)
  )
  where roic_reported is not null or roic_tangible is not null;

update company_fundamentals
  set roic_display = null
  where roic_display = 999;
