-- Bonificaciones por tendencia positiva del scoring DGI (adicionales, cap +1.0).
-- Las calcula update_fundamentals.py desde los jsonb anuales ya descargados.
alter table company_fundamentals
  add column if not exists bonus_roic_trend        numeric default 0,
  add column if not exists bonus_margin_trend      numeric default 0,
  add column if not exists bonus_debt_reduction    numeric default 0,
  add column if not exists bonus_fcf_growth        numeric default 0,
  add column if not exists bonus_div_acceleration  numeric default 0,
  add column if not exists bonus_net_cash          numeric default 0,
  add column if not exists bonus_total             numeric default 0,
  add column if not exists improving_flag          boolean default false;
