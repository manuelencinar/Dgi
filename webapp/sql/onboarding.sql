-- Onboarding de usuarios nuevos. Ejecutar en el SQL Editor de Supabase.

alter table user_settings add column if not exists onboarding_completed boolean default false;
alter table user_settings add column if not exists onboarding_step      integer default 0;
alter table user_settings add column if not exists experience_level     text default 'intermediate';

-- Los usuarios existentes (con fila) ya conocen la app → marcarlos completado
-- para que no vean el onboarding. Solo los nuevos lo verán.
update user_settings set onboarding_completed = true where onboarding_completed is not true;
