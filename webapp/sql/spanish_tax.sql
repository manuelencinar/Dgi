-- Fiscalidad personalizada del IRPF español sobre dividendos.
-- Modo de tributación + datos para el cálculo por ingresos (exención + escala del ahorro).
alter table user_settings add column if not exists tax_mode text default 'fixed';        -- 'fixed' | 'income'
alter table user_settings add column if not exists annual_income numeric;                 -- ingresos anuales estimados (€)
alter table user_settings add column if not exists children integer default 0;            -- nº de hijos (<25 o con discapacidad)
alter table user_settings add column if not exists children_under3 integer default 0;     -- de ellos, menores de 3 años
