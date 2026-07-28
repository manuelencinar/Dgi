#!/usr/bin/env python3
"""
Backfill puntual del histórico TRIMESTRAL a financial_history_quarterly (acumulativo).

Puebla la tabla YA con los trimestres que yfinance devuelve ahora mismo (~5-6 por empresa),
sin esperar al cron semanal. A partir de ahí, update_fundamentals.py va acumulando: nunca
se borran trimestres. ACUMULATIVO (on_conflict merge) → re-ejecutable sin duplicar.

Reutiliza los helpers de update_fundamentals.py (df_to_stmt, build_quarterly_rows…).

Uso:  python scripts/backfill_quarterly.py [--write] [--limit N] [--ticker X]
      (sin --write = dry-run; imprime cuántos trimestres traería por empresa)

Requiere: yfinance + webapp/.env.local con credenciales de Supabase.
"""
import sys, time, argparse
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

import yfinance as yf
from update_fundamentals import (
    load_env, get_supabase, load_dict_tickers, df_to_stmt, build_quarterly_rows,
)

PAUSE = 1.2   # respetuoso con yfinance


def process(sb, ticker, write):
    tk = yf.Ticker(ticker)
    try:
        info = tk.info or {}
    except Exception:
        info = {}
    currency = info.get("currency")

    def q(getter):
        try:
            df = getter()
            return df_to_stmt(df, 8) if df is not None and not df.empty else None
        except Exception:
            return None

    is_q = q(lambda: tk.quarterly_income_stmt)
    bs_q = q(lambda: tk.quarterly_balance_sheet)
    cf_q = q(lambda: tk.quarterly_cashflow)
    rows = build_quarterly_rows(ticker, currency, is_q, bs_q, cf_q)
    if rows and write:
        sb.table("financial_history_quarterly").upsert(rows, on_conflict="ticker,period,source").execute()
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--ticker", default=None)
    args = ap.parse_args()

    sb = get_supabase(load_env())
    tickers = [args.ticker.upper()] if args.ticker else load_dict_tickers()
    if args.limit and not args.ticker:
        tickers = tickers[:args.limit]
    print(f"Backfill trimestral: {len(tickers)} tickers{'  [dry-run]' if not args.write else ''}\n")

    ok = empty = fail = 0
    total_q = 0
    for i, t in enumerate(tickers, 1):
        try:
            rows = process(sb, t, args.write)
        except Exception as exc:
            fail += 1
            print(f"[{i}/{len(tickers)}] {t:12} ERROR {exc}")
            time.sleep(PAUSE)
            continue
        if rows:
            ok += 1; total_q += len(rows)
            periods = [r["period"] for r in rows]
            print(f"[{i}/{len(tickers)}] {t:12} {len(rows)} trimestres ({periods[-1]}…{periods[0]})")
        else:
            empty += 1
            print(f"[{i}/{len(tickers)}] {t:12} sin datos trimestrales")
        time.sleep(PAUSE)

    print(f"\n{ok} con datos · {empty} sin datos · {fail} errores · {total_q} filas trimestrales"
          + ("" if args.write else "  [dry-run: usa --write para persistir]"))


if __name__ == "__main__":
    main()
