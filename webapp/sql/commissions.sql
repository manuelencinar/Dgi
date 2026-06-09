-- Comisiones del broker en cada operación.
--   commission          → comisión de compraventa + canon de bolsa (en la divisa de la operación)
--   commission_currency → divisa de la comisión (= divisa de la operación)
--   total_cost          → coste real total = (shares × price) + commission + fx_commission_eur
alter table transactions
  add column if not exists commission          numeric default 0,
  add column if not exists commission_currency text,
  add column if not exists total_cost          numeric;
