#!/usr/bin/env python3
"""
Sincroniza fundamentales de companies desde funds.json a Supabase.

El fichero funds.json se genera externamente (yfinance) y se publica en GitHub Pages.
Este script lo lee y hace upsert en market_charts(symbol, range='company_v1').

Uso:
  python fetch_fundamentals.py               # todos los tickers del DICT de la webapp
  python fetch_fundamentals.py --all         # todos los tickers de funds.json (1000+)
  python fetch_fundamentals.py --ticker AAPL # un solo ticker
  python fetch_fundamentals.py --force       # ignorar caché de 7 días
  python fetch_fundamentals.py --ttl 14      # TTL personalizado en días
"""

import argparse
import json
import os
import re
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
load_dotenv(".env.local")

# ── Rutas ──────────────────────────────────────────────────────────────────

SCRIPT_DIR  = Path(__file__).parent
WEBAPP_DIR  = SCRIPT_DIR.parent / "webapp"
DICT_PATH   = WEBAPP_DIR / "data" / "dict.js"
ENV_PATH    = WEBAPP_DIR / ".env.local"
FUNDS_URL   = "https://manuelencinar.github.io/Dgi/funds.json"
RANGE_KEY   = "company_v1"
DEFAULT_TTL = 7

# ── Entorno ────────────────────────────────────────────────────────────────

def load_env() -> dict:
    env = {}
    if ENV_PATH.exists():
        for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip()
    # env vars override .env.local
    for k in ("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"):
        if k in os.environ:
            env[k] = os.environ[k]
    return env


def get_supabase(env: dict):
    try:
        from supabase import create_client
    except ImportError:
        sys.exit("ERROR: instala supabase-py →  pip install supabase")
    url = env.get("NEXT_PUBLIC_SUPABASE_URL", "")
    key = env.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        sys.exit("ERROR: faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local")
    return create_client(url, key)

# ── funds.json ─────────────────────────────────────────────────────────────

def fetch_funds_json() -> dict[str, dict]:
    print(f"Descargando {FUNDS_URL} …")
    req = urllib.request.Request(FUNDS_URL, headers={"User-Agent": "mi-indice-dgi/1.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        data = json.loads(r.read().decode("utf-8"))
    by_ticker = {entry["ticker"]: entry for entry in data if entry.get("ticker")}
    print(f"  {len(by_ticker)} tickers en funds.json")
    return by_ticker

# ── DICT ───────────────────────────────────────────────────────────────────

def load_dict_tickers() -> list[str]:
    """Extrae tickers de webapp/data/dict.js."""
    text = DICT_PATH.read_text(encoding="utf-8")
    # Cada entrada: ["Nombre","TICKER","PAIS","MONEDA","SECTOR","SUBSECTOR","TIPO"]
    matches = re.findall(r'\["[^"]*","([^"]+)"', text)
    return matches

# ── divHistory — añade growth e isPartial ─────────────────────────────────

def enrich_div_history(history: list[dict]) -> list[dict]:
    if not history:
        return []
    current_year = datetime.now().year
    sorted_h = sorted(history, key=lambda h: h["year"])
    result = []
    for i, h in enumerate(sorted_h):
        prev_dps = sorted_h[i - 1]["dps"] if i > 0 else None
        growth = round((h["dps"] - prev_dps) / prev_dps, 4) if (prev_dps and prev_dps > 0) else None
        result.append({
            "year":      h["year"],
            "dps":       h["dps"],
            "growth":    growth,
            "isPartial": h["year"] == current_year,
        })
    return result

# ── TTL check ──────────────────────────────────────────────────────────────

def is_fresh(sb, ticker: str, ttl_days: int) -> bool:
    try:
        resp = (
            sb.table("market_charts")
            .select("fetched_at")
            .eq("symbol", ticker)
            .eq("range", RANGE_KEY)
            .maybe_single()
            .execute()
        )
        if not resp.data or not resp.data.get("fetched_at"):
            return False
        fetched = datetime.fromisoformat(resp.data["fetched_at"].replace("Z", "+00:00"))
        return (datetime.now(timezone.utc) - fetched).days < ttl_days
    except Exception:
        return False

# ── Sanitize — elimina NaN e Infinity que JSON no admite ──────────────────

def sanitize(obj):
    import math
    if isinstance(obj, float):
        return None if (math.isnan(obj) or math.isinf(obj)) else obj
    if isinstance(obj, dict):
        return {k: sanitize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [sanitize(v) for v in obj]
    return obj

# ── Upsert ─────────────────────────────────────────────────────────────────

def upsert_company(sb, ticker: str, raw: dict, ttl_days: int, force: bool) -> bool:
    if not force and is_fresh(sb, ticker, ttl_days):
        print(f"  [{ticker}] omitido (datos recientes)")
        return True
    try:
        payload = sanitize({
            **raw,  # todos los campos de funds.json
            "divHistory": enrich_div_history(raw.get("divHistory") or []),
            "syncedAt":   int(datetime.now(timezone.utc).timestamp() * 1000),
        })
        sb.table("market_charts").upsert(
            {
                "symbol":     ticker,
                "range":      RANGE_KEY,
                "data":       payload,
                "fetched_at": datetime.now(timezone.utc).isoformat(),
            },
            on_conflict="symbol,range",
        ).execute()
        price  = raw.get("current_price", "?")
        streak = raw.get("div_streak",    "?")
        cagr   = raw.get("div_cagr5",     "?")
        print(f"  [{ticker}] OK — precio={price}  racha={streak}a  cagr={cagr}%")
        return True
    except Exception as exc:
        print(f"  [{ticker}] ERROR: {exc}")
        return False

# ── CLI ────────────────────────────────────────────────────────────────────

def main():
    env = load_env()
    sb  = get_supabase(env)

    parser = argparse.ArgumentParser(description="Sincroniza funds.json → Supabase")
    group  = parser.add_mutually_exclusive_group()
    group.add_argument("--ticker", help="Ticker concreto, ej: AAPL")
    group.add_argument("--all",    action="store_true", help="Todos los tickers de funds.json")
    parser.add_argument("--force", action="store_true", help="Ignorar caché TTL")
    parser.add_argument("--ttl",   type=int, default=DEFAULT_TTL, help=f"TTL en días (default {DEFAULT_TTL})")
    args = parser.parse_args()

    funds = fetch_funds_json()

    if args.ticker:
        tickers = [args.ticker]
    elif args.all:
        tickers = list(funds.keys())
    else:
        # Solo los tickers que están en el DICT de la webapp
        dict_tickers = load_dict_tickers()
        tickers = [t for t in dict_tickers if t in funds]
        missing = [t for t in dict_tickers if t not in funds]
        if missing:
            print(f"  {len(missing)} tickers del DICT no están en funds.json: {missing[:10]}{'…' if len(missing)>10 else ''}")

    print(f"\nProcesando {len(tickers)} tickers (TTL={args.ttl}d, force={args.force})…\n")

    ok = err = skip = 0
    for i, ticker in enumerate(tickers, 1):
        print(f"[{i}/{len(tickers)}]", end=" ")
        raw = funds.get(ticker)
        if not raw:
            print(f"  [{ticker}] no encontrado en funds.json")
            err += 1
            continue
        result = upsert_company(sb, ticker, raw, args.ttl, args.force)
        if result:
            ok += 1
        else:
            err += 1

    print(f"\n{'─'*40}")
    print(f"Finalizado: {ok} OK  ·  {err} errores")

if __name__ == "__main__":
    main()
