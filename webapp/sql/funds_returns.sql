-- ETFs/fondos: TER, benchmark y rentabilidades. Ejecutar en el SQL Editor.

alter table funds
  add column if not exists ter                    numeric,
  add column if not exists benchmark_ticker       text,
  add column if not exists benchmark_name         text,
  add column if not exists return_ytd             numeric,
  add column if not exists return_1y              numeric,
  add column if not exists return_3y              numeric,
  add column if not exists return_5y              numeric,
  add column if not exists benchmark_return_ytd   numeric,
  add column if not exists benchmark_return_1y    numeric,
  add column if not exists benchmark_return_3y    numeric,
  add column if not exists benchmark_return_5y    numeric;

-- TER almacenado como decimal (0.0006 = 0.06%)
update funds set ter = 0.0006 where ticker = 'SCHD';
update funds set ter = 0.0006 where ticker = 'VIG';
update funds set ter = 0.0006 where ticker = 'VYM';
update funds set ter = 0.0033 where ticker = 'JEPI';
update funds set ter = 0.0035 where ticker = 'JEPQ';
update funds set ter = 0.0038 where ticker = 'DVY';
update funds set ter = 0.0035 where ticker = 'SDY';
update funds set ter = 0.0022 where ticker = 'DGRO';
update funds set ter = 0.0029 where ticker = 'VHYL.L';
update funds set ter = 0.0032 where ticker = 'IDVY.AS';
update funds set ter = 0.0046 where ticker = 'EXSG.DE';
update funds set ter = 0.0040 where ticker = 'ISPA.AS';
update funds set ter = 0.0038 where ticker = 'TDIV.AS';
update funds set ter = 0.0040 where ticker = 'FGEQ.L';

-- Benchmarks
update funds set benchmark_ticker = 'URTH',   benchmark_name = 'MSCI World'  where ticker in ('VHYL.L','TDIV.AS','FGEQ.L','ISPA.AS');
update funds set benchmark_ticker = '^STOXX', benchmark_name = 'STOXX 600'   where ticker in ('IDVY.AS','EXSG.DE');
update funds set benchmark_ticker = '^GSPC',  benchmark_name = 'S&P 500'     where ticker in ('SCHD','VIG','VYM','JEPI','JEPQ','DVY','SDY','DGRO');
