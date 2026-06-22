-- Meta de renta pasiva anual del usuario (estrella polar de la cartera).
-- En la divisa base, importe BRUTO anual objetivo de dividendos. NULL = sin meta.
alter table user_settings add column if not exists income_goal numeric;
