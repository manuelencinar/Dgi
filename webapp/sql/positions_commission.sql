-- Comisión total de compra a nivel de POSICIÓN (override manual desde el editor
-- de la cartera). Si está definida, prevalece sobre la suma de comisiones de las
-- transacciones para el "coste real" por acción y el YoC real.
alter table positions
  add column if not exists commission numeric;
