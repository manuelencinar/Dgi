-- Identificadores de la suscripción de Paddle en user_settings (para renovaciones,
-- cancelaciones y conciliación). El estado premium sigue en plan/premium_until.
alter table user_settings
  add column if not exists paddle_subscription_id text,
  add column if not exists paddle_customer_id     text;
