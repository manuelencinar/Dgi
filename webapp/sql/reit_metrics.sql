-- Clasificación manual de REITs por sub-tipo (define el % de capex de
-- mantenimiento sobre NOI para estimar el AFFO). Una fila por ticker.
-- Yahoo no distingue bien el sub-tipo (p.ej. los net-lease salen como "Retail"),
-- por eso se fija a mano. maint_pct opcional: override directo del %.

CREATE TABLE IF NOT EXISTS reit_manual (
  ticker     text PRIMARY KEY,
  subtype    text,            -- netlease | lodging | office | retail | residential | industrial | selfstorage | datatowers | healthcare | diversified
  maint_pct  numeric,         -- override directo del % de mantenimiento (opcional)
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE reit_manual ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reit_manual_read ON reit_manual;

CREATE POLICY reit_manual_read ON reit_manual FOR SELECT USING (true);
