-- Payout sector-aware para REITs y BDC (las advertencias de "dividendos en riesgo"
-- y la seguridad del dividendo no pueden usar FCF/EPS en estos sectores).
--   payout_affo: dividendo / AFFO (REITs). AFFO = FFO − capex de mantenimiento
--                (NOI × % por sub-tipo, con override manual en reit_manual).
--   payout_nii:  dividendo / NII (BDC). NII ≈ ingresos de inversión − gastos
--                operativos (≈ beneficio recurrente, sin plusvalías valorativas).
alter table company_fundamentals add column if not exists payout_affo numeric;
alter table company_fundamentals add column if not exists payout_nii  numeric;
