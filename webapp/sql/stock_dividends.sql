-- Dividendos cobrados en acciones (scrip/stock dividend).
-- Método de cobro por posición (cash por defecto).
alter table positions
  add column if not exists dividend_payment_method text not null default 'cash';

-- Datos del cobro en acciones en dividends_received.
alter table dividends_received
  add column if not exists payment_method             text not null default 'cash',
  add column if not exists shares_received             numeric,
  add column if not exists price_per_share_at_payment  numeric;

-- transactions.type admite el valor 'stock_dividend' (la columna ya es text, no
-- requiere cambios de esquema).
