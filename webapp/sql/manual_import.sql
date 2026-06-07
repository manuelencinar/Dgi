-- Sistema de importación manual de datos financieros (Excel Investing.com)
-- Columnas de control en company_fundamentals.
--
-- manual_fields:  qué campos tienen dato manual (prioridad sobre yfinance)
--                 { "revenue": true, "dps": true, "income_statement_annual": true, ... }
-- data_vintage:   hasta qué año/trimestre tiene datos cada estado financiero
--                 { "income_statement_annual_through": 2024, "income_statement_quarterly_through": "2024Q3", ... }
-- last_manual_import:  cuándo fue la última importación manual de esta empresa
-- manual_import_notes: notas libres de la importación

alter table company_fundamentals
  add column if not exists manual_fields       jsonb default '{}'::jsonb,
  add column if not exists data_vintage        jsonb default '{}'::jsonb,
  add column if not exists last_manual_import   timestamptz,
  add column if not exists manual_import_notes  text;

-- Índice para listar rápido las empresas con datos manuales
create index if not exists idx_company_fundamentals_last_manual_import
  on company_fundamentals (last_manual_import desc nulls last);
