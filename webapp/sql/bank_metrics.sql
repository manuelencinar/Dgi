-- Métricas bancarias manuales por trimestre: NPL (morosidad) + overrides de
-- NIM/ROTE/eficiencia cuando Yahoo no tiene el desglose. Una fila por
-- (ticker, trimestre). period en formato 'YYYYQn' (p.ej. '2025Q1').
-- Se gestiona desde el dashboard (admin, service_role); lectura server-side.

CREATE TABLE IF NOT EXISTS bank_metrics_manual (
  ticker      text NOT NULL,
  period      text NOT NULL,            -- '2025Q1'
  npl         numeric,                  -- % morosidad
  cet1        numeric,                  -- % CET1 (capital tier 1)
  nim         numeric,                  -- % (override del proxy)
  rote        numeric,                  -- %
  efficiency  numeric,                  -- %
  updated_at  timestamptz DEFAULT now(),
  PRIMARY KEY (ticker, period)
);

-- Si la tabla ya existe sin la columna:
ALTER TABLE bank_metrics_manual ADD COLUMN IF NOT EXISTS cet1 numeric;

ALTER TABLE bank_metrics_manual ENABLE ROW LEVEL SECURITY;

-- Lectura publica (dato de referencia, no sensible). Escritura solo service_role.
DROP POLICY IF EXISTS bank_metrics_read ON bank_metrics_manual;

CREATE POLICY bank_metrics_read ON bank_metrics_manual FOR SELECT USING (true);
