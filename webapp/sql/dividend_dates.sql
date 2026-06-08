-- Fechas de dividendo: histórico de fechas ex + próximas fechas confirmadas.
-- Las rellena update_fundamentals.py desde yfinance.
--   dividend_events: [{ "ex_date": "YYYY-MM-DD", "amount": n }, ...] (últimos ~16 pagos)
--   next_ex_date:    próxima fecha ex-dividendo confirmada
--   next_pay_date:   próximo reparto confirmado por la empresa

alter table company_fundamentals
  add column if not exists dividend_events jsonb,
  add column if not exists next_ex_date    date,
  add column if not exists next_pay_date   date;
