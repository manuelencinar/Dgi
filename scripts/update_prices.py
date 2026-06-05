"""
update_prices.py
----------------
Descarga precios de cierre diarios de todas las empresas, ETFs y fondos
usando yfinance bulk download — una sola llamada para todas las empresas.

También actualiza current_price en company_fundamentals y funds.

Uso:
  python update_prices.py              # Descarga precios de hoy
  python update_prices.py --days 5     # Últimos 5 días
  python update_prices.py --dry-run    # Sin subir a Supabase
"""

import os, json, time, logging, argparse
from datetime import datetime, date, timedelta
from typing import Optional

import yfinance as yf
import pandas as pd

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s"
)
log = logging.getLogger(__name__)

# ── Configuración ──────────────────────────────────────────────────────────
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

# Pares de divisas contra EUR
FX_PAIRS = [
    "USD","GBP","JPY","CHF","CAD","AUD","SEK","DKK",
    "NOK","HKD","CNY","SGD","NZD","MXN","BRL","KRW",
    "TWD","INR","ZAR","SAR","AED","PLN","CZK","HUF"
]


# ══════════════════════════════════════════════════════════════════════════
# SUPABASE helpers
# ══════════════════════════════════════════════════════════════════════════
def get_client():
    from supabase import create_client
    return create_client(SUPABASE_URL, SUPABASE_KEY)

def get_all_tickers() -> list[str]:
    """Obtiene todos los tickers de company_fundamentals y funds."""
    try:
        client = get_client()
        # Empresas
        r1 = client.table("company_fundamentals").select("ticker").execute()
        stocks = [row["ticker"] for row in (r1.data or [])]
        # ETFs y fondos
        r2 = client.table("funds").select("ticker").execute()
        funds = [row["ticker"] for row in (r2.data or [])]
        all_tickers = list(set(stocks + funds))
        log.info(f"Tickers: {len(stocks)} empresas + {len(funds)} ETFs/fondos = {len(all_tickers)} total")
        return all_tickers
    except Exception as e:
        log.error(f"Error obteniendo tickers: {e}")
        return []

def get_fx_tickers() -> list[str]:
    """Genera los tickers de yfinance para los pares de divisa."""
    return [f"{currency}EUR=X" for currency in FX_PAIRS]


# ══════════════════════════════════════════════════════════════════════════
# DESCARGA MASIVA DE PRECIOS
# ══════════════════════════════════════════════════════════════════════════
def download_prices_bulk(tickers: list[str], days: int = 2) -> dict:
    """
    Descarga precios de cierre de todos los tickers en una sola llamada.
    Devuelve dict: {ticker: {date_str: price}}
    """
    if not tickers:
        return {}

    log.info(f"Descargando precios de {len(tickers)} tickers en bulk...")
    period = f"{max(days + 2, 5)}d"  # Buffer extra para fines de semana

    try:
        # Dividir en lotes de 500 para evitar URLs demasiado largas
        batch_size = 500
        all_data = {}

        for i in range(0, len(tickers), batch_size):
            batch = tickers[i:i + batch_size]
            log.info(f"  Lote {i//batch_size + 1}/{(len(tickers)-1)//batch_size + 1} "
                    f"({len(batch)} tickers)")
            try:
                if len(batch) == 1:
                    # yfinance descarga individual para un solo ticker
                    t = yf.Ticker(batch[0])
                    hist = t.history(period=period)
                    if hist is not None and not hist.empty:
                        all_data[batch[0]] = {
                            str(dt.date()): round(float(price), 4)
                            for dt, price in hist["Close"].items()
                            if price == price  # skip NaN
                        }
                else:
                    raw = yf.download(
                        batch,
                        period=period,
                        group_by="ticker",
                        auto_adjust=True,
                        progress=False,
                        threads=True,
                    )

                    if raw.empty:
                        log.warning(f"  Lote {i//batch_size + 1}: sin datos")
                        continue

                    # Procesar resultados
                    for ticker in batch:
                        try:
                            if len(batch) == 1:
                                close_series = raw["Close"]
                            else:
                                if ticker not in raw.columns.get_level_values(0):
                                    continue
                                close_series = raw[ticker]["Close"]

                            ticker_data = {}
                            for dt, price in close_series.items():
                                if price == price and price > 0:  # skip NaN
                                    date_str = str(dt.date()) if hasattr(dt, 'date') else str(dt)[:10]
                                    ticker_data[date_str] = round(float(price), 4)

                            if ticker_data:
                                all_data[ticker] = ticker_data
                        except Exception:
                            pass

            except Exception as e:
                log.warning(f"  Error en lote {i//batch_size + 1}: {e}")

            if i + batch_size < len(tickers):
                time.sleep(1)  # Pausa entre lotes

        log.info(f"✓ Precios obtenidos para {len(all_data)}/{len(tickers)} tickers")
        return all_data

    except Exception as e:
        log.error(f"Error en descarga bulk: {e}")
        return {}


def download_fx_rates(days: int = 2) -> dict:
    """
    Descarga tipos de cambio vs EUR.
    Devuelve dict: {currency: {date_str: rate}}
    """
    fx_tickers = get_fx_tickers()
    log.info(f"Descargando {len(fx_tickers)} tipos de cambio...")

    raw_data = download_prices_bulk(fx_tickers, days=days)

    # Mapear de "USDEUR=X" a "USD"
    result = {}
    for fx_ticker, date_data in raw_data.items():
        currency = fx_ticker.replace("EUR=X", "")
        result[currency] = date_data

    log.info(f"✓ Tipos de cambio obtenidos para {len(result)} divisas")
    return result


# ══════════════════════════════════════════════════════════════════════════
# SUBIDA A SUPABASE
# ══════════════════════════════════════════════════════════════════════════
def upsert_daily_prices(ticker_prices: dict, dry_run: bool = False) -> tuple[int, int]:
    """
    Sube precios diarios a la tabla daily_prices.
    Devuelve (insertados, fallidos).
    """
    if dry_run:
        total = sum(len(v) for v in ticker_prices.values())
        log.info(f"[DRY RUN] Se insertarían {total} registros de precios")
        return total, 0

    client = get_client()
    ok, fail = 0, 0

    # Preparar registros en lotes
    records = []
    for ticker, date_prices in ticker_prices.items():
        for date_str, price in date_prices.items():
            records.append({
                "ticker": ticker,
                "date": date_str,
                "close_price": price,
                "updated_at": datetime.now().isoformat()
            })

    # Insertar en lotes de 1000
    batch_size = 1000
    for i in range(0, len(records), batch_size):
        batch = records[i:i + batch_size]
        try:
            client.table("daily_prices").upsert(
                batch,
                on_conflict="ticker,date"
            ).execute()
            ok += len(batch)
        except Exception as e:
            log.error(f"Error insertando lote de precios: {e}")
            fail += len(batch)

    return ok, fail


def upsert_exchange_rates(fx_data: dict, dry_run: bool = False) -> tuple[int, int]:
    """
    Sube tipos de cambio a la tabla exchange_rates.
    Devuelve (insertados, fallidos).
    """
    if dry_run:
        total = sum(len(v) for v in fx_data.values())
        log.info(f"[DRY RUN] Se insertarían {total} registros de tipos de cambio")
        return total, 0

    client = get_client()
    ok, fail = 0, 0

    records = []
    for currency, date_rates in fx_data.items():
        for date_str, rate in date_rates.items():
            records.append({
                "base_currency": currency,
                "quote_currency": "EUR",
                "rate": rate,
                "date": date_str,
            })
        # También guardar el inverso EUR → currency para facilitar consultas
        for date_str, rate in date_rates.items():
            if rate and rate > 0:
                records.append({
                    "base_currency": "EUR",
                    "quote_currency": currency,
                    "rate": round(1 / rate, 6),
                    "date": date_str,
                })

    batch_size = 1000
    for i in range(0, len(records), batch_size):
        batch = records[i:i + batch_size]
        try:
            client.table("exchange_rates").upsert(
                batch,
                on_conflict="base_currency,quote_currency,date"
            ).execute()
            ok += len(batch)
        except Exception as e:
            log.error(f"Error insertando tipos de cambio: {e}")
            fail += len(batch)

    return ok, fail


def update_current_prices(ticker_prices: dict, dry_run: bool = False):
    """
    Actualiza current_price en company_fundamentals y funds
    con el precio de cierre más reciente.
    """
    if dry_run:
        log.info(f"[DRY RUN] Se actualizarían current_price para {len(ticker_prices)} tickers")
        return

    client = get_client()
    ok, fail = 0, 0

    for ticker, date_prices in ticker_prices.items():
        if not date_prices:
            continue
        # Precio más reciente
        latest_date = max(date_prices.keys())
        latest_price = date_prices[latest_date]

        try:
            # Intentar en company_fundamentals primero
            r = client.table("company_fundamentals")\
                .update({"current_price": latest_price,
                        "updated_at": datetime.now().isoformat()})\
                .eq("ticker", ticker).execute()

            if not r.data:
                # Si no está en company_fundamentals intentar en funds
                client.table("funds")\
                    .update({"current_price": latest_price,
                            "updated_at": datetime.now().isoformat()})\
                    .eq("ticker", ticker).execute()
            ok += 1
        except Exception as e:
            log.warning(f"Error actualizando precio de {ticker}: {e}")
            fail += 1

    log.info(f"✓ current_price actualizado: {ok} OK, {fail} fallidos")


def log_run_result(tickers_ok: int, tickers_fail: int,
                   fx_ok: int, duration_seconds: float,
                   dry_run: bool = False):
    """Registra el resultado del run en admin_logs."""
    if dry_run or not SUPABASE_URL:
        return
    try:
        client = get_client()
        client.table("admin_logs").insert({
            "event_type": "prices_update",
            "description": (f"{tickers_ok} precios actualizados, "
                          f"{tickers_fail} fallidos, "
                          f"{fx_ok} tipos de cambio, "
                          f"{duration_seconds:.0f}s de duración"),
            "details": json.dumps({
                "tickers_ok": tickers_ok,
                "tickers_fail": tickers_fail,
                "fx_pairs_ok": fx_ok,
                "duration_seconds": duration_seconds,
            }),
            "status": "ok" if tickers_fail == 0 else "partial",
            "created_at": datetime.now().isoformat()
        }).execute()
    except Exception as e:
        log.warning(f"No se pudo registrar en admin_logs: {e}")


# ══════════════════════════════════════════════════════════════════════════
# SQL para crear las tablas necesarias
# ══════════════════════════════════════════════════════════════════════════
SQL_SETUP = """
-- Tabla de precios diarios
create table if not exists daily_prices (
  id          uuid default gen_random_uuid() primary key,
  ticker      text not null,
  date        date not null,
  close_price numeric not null,
  updated_at  timestamptz default now(),
  unique(ticker, date)
);
create index if not exists idx_daily_prices_ticker_date
  on daily_prices(ticker, date desc);
create index if not exists idx_daily_prices_date
  on daily_prices(date desc);

-- RLS: lectura pública, escritura solo service_role
alter table daily_prices enable row level security;
create policy if not exists "daily_prices: lectura publica"
  on daily_prices for select using (true);

-- Borrar precios de más de 5 años automáticamente (opcional)
-- create or replace function cleanup_old_prices() returns void as $$
--   delete from daily_prices where date < now() - interval '5 years';
-- $$ language sql;
"""


# ══════════════════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════════════════
def main():
    parser = argparse.ArgumentParser(
        description="Actualiza precios diarios y tipos de cambio en Supabase")
    parser.add_argument("--days",    type=int, default=2,
                        help="Días hacia atrás a descargar (default 2)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Sin subir a Supabase")
    parser.add_argument("--setup",   action="store_true",
                        help="Mostrar SQL para crear las tablas")
    parser.add_argument("--fx-only", action="store_true",
                        help="Solo actualizar tipos de cambio")
    parser.add_argument("--prices-only", action="store_true",
                        help="Solo actualizar precios de acciones")
    args = parser.parse_args()

    if args.setup:
        print(SQL_SETUP)
        return

    start = datetime.now()
    log.info(f"{'='*60}")
    log.info(f"update_prices.py — {start.strftime('%Y-%m-%d %H:%M')}")
    log.info(f"Modo: {'DRY RUN' if args.dry_run else 'PRODUCCIÓN'}")
    log.info(f"{'='*60}")

    prices_ok = prices_fail = fx_ok = 0

    # ── Tipos de cambio ────────────────────────────────────────────────────
    if not args.prices_only:
        fx_data = download_fx_rates(days=args.days)
        if fx_data:
            fx_ok, fx_fail = upsert_exchange_rates(fx_data, dry_run=args.dry_run)
            log.info(f"Tipos de cambio: {fx_ok} registros insertados")
            if args.dry_run:
                # Mostrar muestra
                for currency, dates in list(fx_data.items())[:3]:
                    latest = max(dates.keys())
                    print(f"  {currency}/EUR [{latest}]: {dates[latest]}")

    # ── Precios de acciones, ETFs y fondos ────────────────────────────────
    if not args.fx_only:
        if not SUPABASE_URL and not args.dry_run:
            log.error("SUPABASE_URL no configurado")
            return

        tickers = get_all_tickers() if not args.dry_run else [
            "AAPL", "MSFT", "ITX.MC", "ASML.AS", "MUV2.DE",
            "MC.PA", "ULVR.L", "SCHD", "VHYL.L"
        ]

        if not tickers:
            log.warning("No hay tickers para procesar")
            return

        # Índices de referencia (benchmarks) para el cálculo de rentabilidades
        BENCHMARK_TICKERS = ["^GSPC", "^STOXX", "URTH", "^NDX", "^FTSE", "^GDAXI", "^N225"]
        tickers = list(set(tickers + BENCHMARK_TICKERS))

        # Excluir tickers de divisas si están mezclados
        tickers = [t for t in tickers if "=X" not in t]

        price_data = download_prices_bulk(tickers, days=args.days)

        if price_data:
            prices_ok, prices_fail = upsert_daily_prices(
                price_data, dry_run=args.dry_run)
            log.info(f"Precios: {prices_ok} registros insertados, "
                    f"{prices_fail} fallidos")

            # Actualizar current_price en las tablas principales
            update_current_prices(price_data, dry_run=args.dry_run)

            if args.dry_run:
                print(f"\nMuestra de precios obtenidos:")
                for ticker, dates in list(price_data.items())[:5]:
                    latest = max(dates.keys())
                    print(f"  {ticker} [{latest}]: {dates[latest]}")

                missing = [t for t in tickers if t not in price_data]
                if missing:
                    print(f"\nSin datos ({len(missing)}): {missing[:10]}")

    # ── Resumen final ──────────────────────────────────────────────────────
    duration = (datetime.now() - start).total_seconds()
    log.info(f"\n{'='*60}")
    log.info(f"COMPLETADO en {duration:.0f}s")
    log.info(f"  Precios: {prices_ok} insertados, {prices_fail} fallidos")
    log.info(f"  Divisas: {fx_ok} registros")
    log.info(f"{'='*60}")

    log_run_result(prices_ok, prices_fail, fx_ok, duration,
                   dry_run=args.dry_run)


if __name__ == "__main__":
    main()
