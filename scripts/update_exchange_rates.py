#!/usr/bin/env python3
"""
Descarga tipos de cambio históricos de yfinance y escribe en exchange_rates (Supabase).

Todos los pares se almacenan con quote_currency = 'EUR'.
Si ya hay más de 100 filas para un par, solo descarga los últimos 7 días.

Uso:
  python update_exchange_rates.py            # todos los pares
  python update_exchange_rates.py --full     # forzar descarga completa
"""

import argparse
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
load_dotenv(".env.local")

SCRIPT_DIR = Path(__file__).parent
WEBAPP_DIR  = SCRIPT_DIR.parent / "webapp"
ENV_PATH    = WEBAPP_DIR / ".env.local"

PAIRS = [
    "USD", "GBP", "JPY", "CHF", "CAD", "AUD",
    "SEK", "DKK", "NOK", "HKD", "CNY", "SGD",
    "NZD", "MXN", "BRL", "KRW", "TWD", "INR",
    "ZAR", "SAR", "AED", "PLN", "CZK", "HUF",
]


def load_env():
    env = {}
    if ENV_PATH.exists():
        for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip()
    for k in ("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"):
        if k in os.environ:
            env[k] = os.environ[k]
    if "NEXT_PUBLIC_SUPABASE_URL" not in env and "SUPABASE_URL" in os.environ:
        env["NEXT_PUBLIC_SUPABASE_URL"] = os.environ["SUPABASE_URL"]
    return env


def get_supabase(env):
    try:
        from supabase import create_client
    except ImportError:
        sys.exit("ERROR: pip install supabase yfinance pandas")
    url = env.get("NEXT_PUBLIC_SUPABASE_URL", "")
    key = env.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        sys.exit("ERROR: faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY")
    return create_client(url, key)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--full", action="store_true", help="Forzar descarga completa")
    args = parser.parse_args()

    env = load_env()
    sb  = get_supabase(env)

    try:
        import yfinance as yf
        import pandas as pd
    except ImportError:
        sys.exit("ERROR: pip install yfinance pandas")

    ok     = 0
    errors = []
    start  = datetime.now(timezone.utc)

    for currency in PAIRS:
        try:
            # Decidir período según filas existentes
            if not args.full:
                res   = sb.from_("exchange_rates") \
                          .select("id", count="exact") \
                          .eq("base_currency", currency) \
                          .eq("quote_currency", "EUR") \
                          .execute()
                count = res.count or 0
                period = "7d" if count > 100 else "max"
            else:
                period = "max"
                count  = 0

            label = "últimos 7d" if period == "7d" else "historial completo"
            print(f"  {currency}/EUR: descargando {label}…", end=" ", flush=True)

            ticker_sym = f"{currency}EUR=X"
            df = yf.download(ticker_sym, period=period, interval="1d",
                             auto_adjust=True, progress=False)

            if df is None or df.empty:
                print("sin datos")
                continue

            if isinstance(df.columns, pd.MultiIndex):
                df.columns = df.columns.get_level_values(0)

            close_col = "Close" if "Close" in df.columns else df.columns[0]

            rows = []
            for idx, row in df.iterrows():
                rate = row[close_col]
                if pd.isna(rate) or rate <= 0:
                    continue
                date_str = idx.strftime("%Y-%m-%d") if hasattr(idx, "strftime") else str(idx)[:10]
                rows.append({
                    "base_currency":  currency,
                    "quote_currency": "EUR",
                    "rate":           round(float(rate), 6),
                    "date":           date_str,
                })

            if not rows:
                print("sin filas válidas")
                continue

            # Upsert en lotes de 500
            for i in range(0, len(rows), 500):
                sb.from_("exchange_rates").upsert(
                    rows[i:i + 500],
                    on_conflict="base_currency,quote_currency,date"
                ).execute()

            print(f"{len(rows)} filas ✓")
            ok += 1
            time.sleep(0.4)

        except Exception as exc:
            errors.append(f"{currency}: {exc}")
            print(f"ERROR — {exc}")

    elapsed = (datetime.now(timezone.utc) - start).total_seconds()
    print(f"\n✓ {ok}/{len(PAIRS)} pares — {elapsed:.0f}s")
    if errors:
        print("Errores:", errors)


if __name__ == "__main__":
    main()
