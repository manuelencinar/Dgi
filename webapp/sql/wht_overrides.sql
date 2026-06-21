-- Overrides de retención en origen por país (Ajustes → Fiscalidad).
-- Mapa { codigoPais: porcentaje }, p.ej. {"CH":15,"DE":15} para un bróker que
-- aplica los tipos de convenio. Si un país no está, se usa el tipo por defecto.
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS wht_overrides jsonb DEFAULT '{}'::jsonb;

-- Retención de destino (impuesto del ahorro del país de residencia, España 19%).
-- Puede que ya exista; el IF NOT EXISTS lo hace idempotente.
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS dest_wht numeric DEFAULT 19;
