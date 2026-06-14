#!/usr/bin/env python3
"""Backfill de COBERTURA TOTAL de yield_avg / yield_avg_years.

Reutiliza el div_history ya guardado en company_fundamentals y descarga SOLO el
histórico de precios de Yahoo en bloque (yf.download por lotes) — sin correr el
pipeline completo de fundamentals. Misma lógica que compute_yield_avg en
update_fundamentals.py (que es la fuente autoritativa en el run semanal).

  yield_año       = dps_año / precio_medio_del_año * 100
  yield_avg       = media de los hasta 5 últimos años COMPLETOS con datos (mín. 2)
  yield_avg_years = nº de años usados

Uso: python scripts/backfill_yield_avg_yahoo.py [--write] [--limit N] [--ticker KO]
"""
import argparse
import sys
from pathlib import Path
from datetime import datetime

import yfinance as yf
import pandas as pd

SCRIPT_DIR = Path(__file__).parent
WEBAPP_DIR = SCRIPT_DIR.parent / "webapp"
ENV_PATH   = WEBAPP_DIR / ".env.local"

MAX_YEARS = 5
MIN_YEARS = 2
BATCH     = 200


def load_env():
    env = {}
    if ENV_PATH.exists():
        for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip()
    return env


def get_supabase(env):
    from supabase import create_client
    url = env.get("NEXT_PUBLIC_SUPABASE_URL", "")
    key = env.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        sys.exit("ERROR: faltan credenciales en webapp/.env.local")
    return create_client(url, key)


def fetch_fundamentals(sb, ticker=None):
    if ticker:
        r = sb.table("company_fundamentals").select("ticker, div_history").eq("ticker", ticker).execute()
        return r.data or []
    rows, frm = [], 0
    while True:
        r = sb.table("company_fundamentals").select("ticker, div_history").range(frm, frm + 999).execute()
        data = r.data or []
        rows.extend(data)
        if len(data) < 1000:
            break
        frm += 1000
    return rows


def compute_yield_avg(div_history, closes):
    """closes: pandas Series de cierres con DatetimeIndex. Igual que en update_fundamentals.py."""
    if not div_history or closes is None or len(closes) == 0:
        return None, None
    try:
        closes = closes.dropna()
        if len(closes) == 0:
            return None, None
        by_year = closes.groupby(closes.index.year).mean()
        cur_year = datetime.now().year
        per_year = []
        for h in div_history:
            if not h or h.get("isPartial"):
                continue
            year, dps = h.get("year"), h.get("dps")
            if year is None or dps is None or dps <= 0 or year >= cur_year:
                continue
            if year not in by_year.index:
                continue
            px = float(by_year[year])
            if px > 0:
                per_year.append((int(year), dps / px * 100))
        per_year.sort(reverse=True)
        recent = per_year[:MAX_YEARS]
        if len(recent) < MIN_YEARS:
            return None, None
        avg = sum(y for _, y in recent) / len(recent)
        return round(avg, 2), len(recent)
    except Exception:
        return None, None


def closes_for(raw, ticker):
    """Extrae la serie Close de un ticker, robusto a los formatos de yf.download:
    MultiIndex (ticker, campo), MultiIndex (campo, ticker) o columna simple."""
    try:
        cols = raw.columns
        if isinstance(cols, pd.MultiIndex):
            lvl0 = cols.get_level_values(0)
            if ticker in lvl0:
                return raw[ticker]["Close"]
            if "Close" in lvl0:
                sub = raw["Close"]
                return sub[ticker] if ticker in sub.columns else None
            return None
        return raw["Close"] if "Close" in cols else None
    except Exception:
        return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--ticker", type=str, default=None)
    args = ap.parse_args()

    env = load_env()
    sb = get_supabase(env)

    rows = fetch_fundamentals(sb, args.ticker)
    div_map = {r["ticker"]: r.get("div_history") for r in rows
               if isinstance(r.get("div_history"), list) and r["div_history"]}
    tickers = list(div_map.keys())
    if args.limit:
        tickers = tickers[:args.limit]
    print(f"Empresas con div_history: {len(tickers)}", "(MODO ESCRITURA)" if args.write else "(dry-run)")

    updates = []
    skipped = 0
    sample = {"KO", "JNJ", "PG", "MMM", "O", "ENB.TO", "BATS.L", "ITX.MC", "MUV2.DE"}

    for i in range(0, len(tickers), BATCH):
        batch = tickers[i:i + BATCH]
        try:
            raw = yf.download(batch, period="6y", group_by="ticker",
                              auto_adjust=False, progress=False, threads=True)
        except Exception as e:
            print(f"  lote {i//BATCH+1}: error descarga ({e})")
            skipped += len(batch)
            continue
        if raw is None or raw.empty:
            skipped += len(batch)
            continue
        for t in batch:
            closes = closes_for(raw, t)
            avg, yrs = compute_yield_avg(div_map[t], closes)
            if avg is None:
                skipped += 1
                continue
            updates.append({"ticker": t, "yield_avg": avg, "yield_avg_years": yrs})
            if t in sample:
                print(f"  {t}: media {avg}% ({yrs} años)")
        print(f"  lote {i//BATCH+1}/{(len(tickers)-1)//BATCH+1} - acumulado {len(updates)} calculados")

    print(f"Calculados: {len(updates)} | sin datos suficientes: {skipped}")

    if args.write and updates:
        ok = 0
        for j in range(0, len(updates), 500):
            chunk = updates[j:j + 500]
            try:
                sb.table("company_fundamentals").upsert(chunk, on_conflict="ticker").execute()
                ok += len(chunk)
            except Exception as e:
                print(f"  ERR upsert lote: {e}")
        print(f"Filas actualizadas en BD: {ok}")


if __name__ == "__main__":
    main()
