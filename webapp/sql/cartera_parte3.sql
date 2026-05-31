-- Cartera parte 3 — columnas nuevas en user_settings
-- Ejecutar en el SQL Editor de Supabase

-- Resumen mensual por email (Módulo 5)
alter table user_settings add column if not exists monthly_summary boolean default false;

-- Configuración de alertas personalizadas (Módulo 4)
alter table user_settings add column if not exists alert_config jsonb default '{}'::jsonb;
alter table user_settings add column if not exists alert_dismissed jsonb default '[]'::jsonb;
