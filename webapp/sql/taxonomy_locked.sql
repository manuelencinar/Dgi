-- Bloqueo de taxonomía manual: cuando el admin asigna sector/industria a mano
-- desde el dashboard, se marca la fila para que el run semanal de yfinance NO
-- sobreescriba el sector/industria con el valor de Yahoo.

ALTER TABLE company_fundamentals
  ADD COLUMN IF NOT EXISTS taxonomy_locked boolean DEFAULT false;
