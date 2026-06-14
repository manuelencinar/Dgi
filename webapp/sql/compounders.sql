-- Ranking "Máquinas de Compounding": empresas capital-light de alta calidad.
-- capex_cfo_pct = CapEx / Flujo de Caja Operativo (%) medio (CFO = FCF + |CapEx|).
-- Bajo = el negocio no necesita reinvertir para mantenerse → deja caja libre.
-- El ranking combina ROIC alto + capex_cfo bajo + crecimiento estable (en la
-- página, usando roic_display/reported/tangible y revenue_cagr5 ya existentes).
-- Backfill inmediato: node scripts/recalc_capex_cfo.mjs --write
-- Ejecutar en el SQL Editor de Supabase.

alter table company_fundamentals add column if not exists capex_cfo_pct numeric;
