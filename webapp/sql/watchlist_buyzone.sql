-- Alerta de watchlist "zona de compra" (por valoración, sin precio objetivo manual).
-- El cron /api/check-watchlist-alerts la dispara cuando el Score DGI ≥ 6,5 y el
-- margen de seguridad ≥ 20%. alert_buyzone_triggered es el flag anti-spam.
alter table watchlist add column if not exists alert_buyzone_active    boolean default false;
alter table watchlist add column if not exists alert_buyzone_triggered boolean default false;
