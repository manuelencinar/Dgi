#!/usr/bin/env python3
"""
Orquestador del backfill puntual de histórico financiero.

Ejecuta la FASE 1 (SEC EDGAR) y luego la FASE 2 (stockanalysis) sobre los tickers que
falten, e imprime un resumen final. Proceso MANUAL de una sola ejecución — NO forma
parte del cron semanal (update_fundamentals.py).

Uso:
  python scripts/backfill_financial_history.py             # dry-run de las dos fases
  python scripts/backfill_financial_history.py --write     # persiste en financial_history
  python scripts/backfill_financial_history.py --write --limit 50   # prueba acotada

Requiere: pip install requests beautifulsoup4   +   webapp/.env.local con credenciales.
Tras ejecutarlo, revisa la cobertura en el dashboard → Datos → "Cobertura histórica".
"""
import os, sys, json, subprocess, argparse

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(HERE, "output")

def run_phase(script, args):
    cmd = [sys.executable, os.path.join(HERE, script)]
    if args.write:
        cmd.append("--write")
    if args.limit:
        cmd += ["--limit", str(args.limit)]
    print(f"\n{'='*60}\n▶ {script}\n{'='*60}")
    subprocess.run(cmd, check=False)

def count(path, key=None):
    try:
        with open(os.path.join(OUT_DIR, path), encoding="utf-8") as f:
            data = json.load(f)
        return len(data)
    except Exception:
        return None

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()

    run_phase("backfill_sec_edgar.py", args)
    run_phase("backfill_stockanalysis.py", args)

    missing_after_1 = count("sec_edgar_missing.json")
    still = count("still_missing.json")
    print(f"\n{'='*60}\nRESUMEN\n{'='*60}")
    if missing_after_1 is not None:
        print(f"  Faltantes tras SEC EDGAR (entraron a fase 2): {missing_after_1}")
    if still is not None:
        print(f"  Sin cubrir tras stockanalysis: {still}  (scripts/output/still_missing.json)")
    print("\n  Cobertura detallada: dashboard → Datos → 'Cobertura histórica'.")
    if not args.write:
        print("  [dry-run] añade --write para persistir en financial_history.")

if __name__ == "__main__":
    main()
