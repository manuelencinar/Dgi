-- Gastos mensuales del usuario, para el "Contador de Libertad Financiera" de la
-- home (% de gastos cubiertos por los ingresos pasivos). Se guarda vía /api/ajustes.
alter table user_settings
  add column if not exists monthly_expenses numeric;
