-- Métricas de aseguradoras manuales por trimestre. Críticas manuales:
-- combined ratio, loss ratio, expense ratio, solvencia (Solvency II / RBC).
-- Overrides opcionales: investment yield (iy), ROTE, GWP. period 'YYYYQn'.

CREATE TABLE IF NOT EXISTS insurer_metrics_manual (
  ticker      text NOT NULL,
  period      text NOT NULL,
  combined    numeric,
  loss        numeric,
  expense     numeric,
  solvency    numeric,
  iy          numeric,
  rote        numeric,
  gwp         numeric,
  updated_at  timestamptz DEFAULT now(),
  PRIMARY KEY (ticker, period)
);

ALTER TABLE insurer_metrics_manual ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS insurer_metrics_read ON insurer_metrics_manual;

CREATE POLICY insurer_metrics_read ON insurer_metrics_manual FOR SELECT USING (true);
