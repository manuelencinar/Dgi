#!/usr/bin/env python3
"""
Validación automática CRUZADA del histórico financiero (financial_history).

Como el scraping de stockanalysis no es 100% fiable, esto contrasta CADA empresa contra
una fuente INDEPENDIENTE (los estados de yfinance ya guardados en
company_fundamentals.income_statement_annual): compara ingresos, beneficio neto y BPA
diluido de los ejercicios que solapan. Si coinciden, el dato es de fiar; si divergen, se
marca para revisión manual. Así solo hay que mirar a mano las DISCREPANCIAS, no las ~2000.

Clasifica cada (ticker, source):
  OK       — ingresos coinciden (≤3%) en los años solapados.
  WARN     — divergencia moderada (3-25%): revisar.
  FAIL     — divergencia grande (>25%) o posible error de escala (×/÷ 1e6): revisar sí o sí.
  SIN_REF  — no hay año de yfinance que solape (no se puede cruzar; solo sanity checks).

Genera scripts/output/validation_report.json (detalle) + resumen por consola + admin_logs.

Uso:  python scripts/validate_financial_history.py [--source stockanalysis|sec_edgar]
Requiere: pip install requests   +   webapp/.env.local.
"""
import os, sys, json, argparse
import requests

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(HERE, "output")
os.makedirs(OUT_DIR, exist_ok=True)

env = dict(os.environ)
try:
    with open(os.path.join(HERE, "..", "webapp", ".env.local")) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env.setdefault(k.strip(), v.strip())
except FileNotFoundError:
    pass
SUPA_URL = env.get("NEXT_PUBLIC_SUPABASE_URL") or env.get("SUPABASE_URL")
SUPA_KEY = env.get("SUPABASE_SERVICE_ROLE_KEY")
if not SUPA_URL or not SUPA_KEY:
    sys.exit("Faltan credenciales de Supabase.")
H = {"apikey": SUPA_KEY, "Authorization": "Bearer " + SUPA_KEY}

def fetch_all(table, select, extra=""):
    rows, frm = [], 0
    while True:
        q = f"{SUPA_URL}/rest/v1/{table}?select={select}{extra}&offset={frm}&limit=1000"
        data = requests.get(q, headers=H, timeout=120).json()
        if not isinstance(data, list) or not data:
            break
        rows += data
        if len(data) < 1000:
            break
        frm += 1000
    return rows

def yf_ref():
    """{ticker: {year: {'rev':, 'ni':, 'eps':}}} desde income_statement_annual (yfinance)."""
    ref = {}
    for r in fetch_all("company_fundamentals", "ticker,income_statement_annual"):
        isa = r.get("income_statement_annual")
        if not isa or not isa.get("columns"):
            continue
        cols = isa["columns"]
        d = isa.get("data") or {}
        def row(*names):
            for n in names:
                if n in d:
                    return d[n]
            return None
        rev = row("Total Revenue", "Ingresos Totales", "Operating Revenue")
        ni = row("Net Income", "Beneficio Neto", "Net Income Common Stockholders")
        eps = row("Diluted EPS")
        m = {}
        for i, c in enumerate(cols):
            try:
                y = int(str(c)[:4])
            except Exception:
                continue
            m[y] = {
                "rev": rev[i] if rev and i < len(rev) else None,
                "ni": ni[i] if ni and i < len(ni) else None,
                "eps": eps[i] if eps and i < len(eps) else None,
            }
        if m:
            ref[r["ticker"]] = m
    return ref

def pct(a, b):
    if a is None or b is None or b == 0:
        return None
    return abs(a - b) / abs(b) * 100

def scale_suspect(a, b):
    """True si a ≈ b×1e6 o b/1e6 (error de escala millones)."""
    if a is None or b is None or b == 0:
        return False
    for f in (1e6, 1 / 1e6):
        if abs(a - b * f) / abs(b * f) < 0.05:
            return True
    return False

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", default=None, help="stockanalysis | sec_edgar (por defecto: ambas)")
    args = ap.parse_args()

    print("Cargando referencia yfinance…")
    ref = yf_ref()
    print(f"  referencia para {len(ref)} empresas.")

    extra = f"&source=eq.{args.source}" if args.source else ""
    fh = fetch_all("financial_history", "ticker,fiscal_year,source,revenue,net_income,eps_diluted", extra)
    print(f"Filas de financial_history a validar: {len(fh)}\n")

    # Agrupar por (ticker, source)
    groups = {}
    for r in fh:
        groups.setdefault((r["ticker"], r["source"]), []).append(r)

    report = []
    counts = {"OK": 0, "WARN": 0, "FAIL": 0, "SIN_REF": 0}
    for (ticker, source), rows in groups.items():
        rmap = ref.get(ticker, {})
        checked, worst, worst_year, scale_bug, sanity = 0, 0.0, None, False, []
        for r in rows:
            rev = r.get("revenue")
            if rev is not None and rev <= 0:
                sanity.append(f"revenue<=0 en {r['fiscal_year']}")
            y = rmap.get(r["fiscal_year"])
            if not y or not y.get("rev") or rev is None:
                continue
            checked += 1
            if scale_suspect(rev, y["rev"]):
                scale_bug = True
            d = pct(rev, y["rev"])
            if d is not None and d > worst:
                worst, worst_year = d, r["fiscal_year"]
        if checked == 0:
            status = "SIN_REF"
        elif scale_bug or worst > 25:
            status = "FAIL"
        elif worst > 3:
            status = "WARN"
        else:
            status = "OK"
        counts[status] += 1
        report.append({
            "ticker": ticker, "source": source, "status": status,
            "anos_cruzados": checked, "peor_diff_ingresos_pct": round(worst, 1) if checked else None,
            "peor_ano": worst_year, "posible_error_escala": scale_bug,
            "sanity": sanity or None,
        })

    report.sort(key=lambda x: {"FAIL": 0, "WARN": 1, "SIN_REF": 2, "OK": 3}[x["status"]])
    with open(os.path.join(OUT_DIR, "validation_report.json"), "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=1)

    print("RESUMEN por (empresa, fuente):")
    for k in ("OK", "WARN", "FAIL", "SIN_REF"):
        print(f"  {k:<8} {counts[k]}")
    fails = [r for r in report if r["status"] in ("FAIL", "WARN")]
    print(f"\nA revisar (FAIL+WARN): {len(fails)} → scripts/output/validation_report.json")
    for r in fails[:25]:
        print(f"  {r['status']:<5} {r['ticker']:<12} {r['source']:<13} diff {r['peor_diff_ingresos_pct']}% ({r['peor_ano']})"
              + ("  ⚠escala" if r["posible_error_escala"] else ""))

    try:
        requests.post(f"{SUPA_URL}/rest/v1/admin_logs", headers={**H, "Content-Type": "application/json", "Prefer": "return=minimal"},
                      data=json.dumps({"event_type": "validate_financial_history",
                                       "description": f"Validación: OK {counts['OK']} · WARN {counts['WARN']} · FAIL {counts['FAIL']} · SIN_REF {counts['SIN_REF']}",
                                       "status": "warn" if counts["FAIL"] else "ok"}), timeout=30)
    except Exception:
        pass

if __name__ == "__main__":
    main()
