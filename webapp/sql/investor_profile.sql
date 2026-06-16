-- Perfil de inversor de la cartera (defensivo / equilibrado / crecimiento).
-- Se guarda asociado a la cuenta del usuario para que persista entre dispositivos.
-- Se escribe vía /api/ajustes (service_role, whitelist).

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS investor_profile text DEFAULT 'equilibrado';
