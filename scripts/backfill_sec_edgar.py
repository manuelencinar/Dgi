#!/usr/bin/env python3
"""
Backfill puntual — FASE 1: SEC EDGAR (companyfacts).

Descarga el máximo histórico posible de estados financieros (ingresos, BPA diluido,
balance, flujo de caja, acciones) de las empresas de company_fundamentals que tengan
CIK en el mapeo oficial de la SEC (US + foreign private issuers con 20-F, incluidos
muchos ADR europeos/asiáticos). Fuente oficial, gratis, sin API key.

Guarda cada ejercicio en financial_history con source='sec_edgar' + procedencia
(filed_date, form_type, currency) y TODOS los conceptos anuales en raw_concepts.

Los tickers que NO se consiguen (sin CIK, o sin Revenues/EPS) se escriben en
scripts/output/sec_edgar_missing.json para alimentar la fase 2 (stockanalysis).

Uso:  python scripts/backfill_sec_edgar.py [--write] [--limit N] [--ticker X]
      (sin --write hace un dry-run: descarga y cuenta, pero no persiste)

Requiere: pip install requests   +   webapp/.env.local con SUPABASE_URL/SERVICE_ROLE_KEY.
IMPORTANTE: NO forma parte del cron semanal; es un proceso manual de una sola ejecución.
"""
import os, sys, json, time, argparse
from datetime import date, datetime
import requests

try:  # consola Windows (cp1252) — evita UnicodeEncodeError en los prints
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(HERE, "output")
os.makedirs(OUT_DIR, exist_ok=True)

# ── Credenciales (env o webapp/.env.local) ──────────────────────────────────
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
    sys.exit("Faltan credenciales de Supabase (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).")
SB_H = {"apikey": SUPA_KEY, "Authorization": "Bearer " + SUPA_KEY, "Content-Type": "application/json"}

# La SEC exige un User-Agent identificable con contacto y ≤10 req/s.
SEC_UA = {"User-Agent": "Everdiv research backfill contact@everdiv.com"}
SEC_PAUSE = 0.18   # ~5-6 req/s, holgado bajo el límite de la SEC

# ── Mapeo concepto → columna. Primer tag disponible de cada lista (us-gaap +
#    equivalentes IFRS para foreign private issuers que reportan en ifrs-full). ──
COLMAP = {
    "revenue":              (["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "SalesRevenueNet", "Revenue"], "money"),
    "eps_diluted":          (["EarningsPerShareDiluted", "DilutedEarningsLossPerShare"], "eps"),
    "net_income":           (["NetIncomeLoss", "ProfitLoss"], "money"),
    "operating_income":     (["OperatingIncomeLoss", "ProfitLossFromOperatingActivities"], "money"),
    "gross_profit":         (["GrossProfit"], "money"),
    "total_assets":         (["Assets"], "money"),
    "total_liabilities":    (["Liabilities"], "money"),
    "stockholders_equity":  (["StockholdersEquity", "Equity"], "money"),
    "long_term_debt":       (["LongTermDebtNoncurrent", "LongTermDebt", "NoncurrentPortionOfBorrowings"], "money"),
    "cash_and_equivalents": (["CashAndCashEquivalentsAtCarryingValue", "CashAndCashEquivalents"], "money"),
    "operating_cash_flow":  (["NetCashProvidedByUsedInOperatingActivities", "CashFlowsFromUsedInOperatingActivities"], "money"),
    "capex":                (["PaymentsToAcquirePropertyPlantAndEquipment", "PurchaseOfPropertyPlantAndEquipment"], "money"),
    "dividends_paid_total": (["PaymentsOfDividends", "PaymentsOfDividendsCommonStock", "DividendsPaidClassifiedAsFinancingActivities"], "money"),
    "buybacks_total":       (["PaymentsForRepurchaseOfCommonStock"], "money"),
    "dividend_per_share":   (["CommonStockDividendsPerShareDeclared", "DividendsPerShare"], "eps"),
    "shares_diluted":       (["WeightedAverageNumberOfDilutedSharesOutstanding", "WeightedAverageShares"], "shares"),
    "shares_basic":         (["WeightedAverageNumberOfSharesOutstandingBasic"], "shares"),
}
ANNUAL_FORMS = ("10-K", "20-F", "10-K/A", "20-F/A", "10-KT", "40-F")

def norm_sym(ticker):
    """Símbolo base para casar con el mapeo de la SEC (sin sufijo de bolsa)."""
    t = (ticker or "").upper().strip()
    return t.split(".")[0]

def load_db_tickers():
    out, frm = [], 0
    while True:
        q = f"{SUPA_URL}/rest/v1/company_fundamentals?select=ticker&order=ticker&offset={frm}&limit=1000"
        data = requests.get(q, headers=SB_H, timeout=60).json()
        if not data:
            break
        out += [r["ticker"] for r in data]
        if len(data) < 1000:
            break
        frm += 1000
    return out

def load_cik_map():
    r = requests.get("https://www.sec.gov/files/company_tickers.json", headers=SEC_UA, timeout=60)
    r.raise_for_status()
    m = {}
    for row in r.json().values():
        sym = str(row.get("ticker", "")).upper()
        cik = str(row.get("cik_str", "")).zfill(10)
        if sym and sym not in m:
            m[sym] = cik
    return m

def _period_ok(e):
    """Para conceptos de flujo, exige periodo ~anual (300-400 días). Instantáneos (balance) pasan."""
    s, en = e.get("start"), e.get("end")
    if not s or not en:
        return True
    try:
        d = (date.fromisoformat(en) - date.fromisoformat(s)).days
        return 300 <= d <= 400
    except Exception:
        return True

def pick_annual(units, kind):
    """Devuelve ({fy: {'val','filed','form','end'}}, currency) para un concepto."""
    keys = list(units.keys())
    if kind == "eps":
        uk = next((u for u in keys if "/" in u), keys[0] if keys else None)
    elif kind == "shares":
        uk = "shares" if "shares" in units else (keys[0] if keys else None)
    else:
        uk = next((u for u in keys if u != "shares" and "/" not in u), keys[0] if keys else None)
    if not uk:
        return {}, None
    currency = uk if kind == "money" else None
    best = {}
    for e in units[uk]:
        if e.get("form") not in ANNUAL_FORMS or e.get("fp") != "FY":
            continue
        # OJO: el campo `fy` es el del INFORME, no el del periodo — un 10-K incluye las
        # comparativas de años anteriores con el mismo `fy`. El ejercicio real es el año
        # de FIN del periodo (`end`); _period_ok garantiza que es un periodo ANUAL.
        end = e.get("end")
        if not end or not _period_ok(e):
            continue
        try:
            yr = int(str(end)[:4])
        except Exception:
            continue
        filed = e.get("filed", "")
        prev = best.get(yr)
        if prev is None or filed > prev["filed"]:
            best[yr] = {"val": e.get("val"), "filed": filed, "form": e.get("form"), "end": end}
    return best, currency

def extract_column(facts, tags, kind):
    """Valor anual por ejercicio, fusionando los tags por PRIORIDAD por año: para cada
    fiscal_year se usa el primer tag (en orden de la lista, us-gaap antes que ifrs) que
    tenga dato ese año. Evita que un tag legacy que existe pero está vacío en años
    recientes (p.ej. 'Revenues' en Apple) tape al tag que sí trae los datos actuales."""
    merged = {}
    currency = None
    for tag in tags:
        for ns in ("us-gaap", "ifrs-full"):
            node = (facts.get(ns) or {}).get(tag)
            if not node or not node.get("units"):
                continue
            best, cur = pick_annual(node["units"], kind)
            if cur and not currency:
                currency = cur
            for fy, info in best.items():
                merged.setdefault(fy, info)   # primer tag con dato ese año gana
    return merged, currency

def all_annual_raw(facts):
    """Todos los conceptos con valor anual FY (para raw_concepts por año). {fy: {tag: val}}."""
    out = {}
    for ns in ("us-gaap", "ifrs-full"):
        block = facts.get(ns) or {}
        for tag, node in block.items():
            units = node.get("units") or {}
            kind = "shares" if "shares" in units and len(units) == 1 else ("eps" if any("/" in u for u in units) else "money")
            best, _ = pick_annual(units, kind)
            for fy, info in best.items():
                out.setdefault(fy, {})[tag] = info["val"]
    return out

def build_rows(ticker, facts):
    """Construye las filas por ejercicio a partir de companyfacts."""
    cols = {}       # col -> {fy: info}
    currency = None
    for col, (tags, kind) in COLMAP.items():
        best, cur = extract_column(facts, tags, kind)
        if best:
            cols[col] = best
        if cur and not currency:
            currency = cur
    # Años presentes
    fys = sorted({fy for m in cols.values() for fy in m})
    raw = all_annual_raw(facts)
    rows = []
    for fy in fys:
        row = {"ticker": ticker, "fiscal_year": int(fy), "source": "sec_edgar", "currency": currency}
        filed, form = None, None
        for col, m in cols.items():
            info = m.get(fy)
            if info:
                row[col] = info["val"]
                if filed is None:
                    filed, form = info["filed"], info["form"]
        # free cash flow = OCF - capex (capex viene positivo en la SEC → se resta)
        ocf, capex = row.get("operating_cash_flow"), row.get("capex")
        if ocf is not None and capex is not None:
            row["free_cash_flow"] = ocf - abs(capex)
        row["filed_date"] = filed
        row["form_type"] = form
        row["raw_concepts"] = raw.get(fy)
        rows.append(row)
    return rows

# Todas las columnas persistibles — PostgREST exige que todas las filas del insert
# masivo tengan EXACTAMENTE las mismas claves, así que se normaliza cada fila.
COLS_ALL = [
    "ticker", "fiscal_year", "source", "currency", "form_type", "filed_date",
    "revenue", "gross_profit", "operating_income", "net_income", "eps_diluted",
    "total_assets", "total_liabilities", "stockholders_equity", "long_term_debt", "cash_and_equivalents",
    "operating_cash_flow", "capex", "free_cash_flow", "dividends_paid_total", "buybacks_total", "dividend_per_share",
    "shares_diluted", "shares_basic", "raw_concepts",
]

def upsert(rows):
    if not rows:
        return
    payload = [{c: r.get(c) for c in COLS_ALL} for r in rows]
    url = f"{SUPA_URL}/rest/v1/financial_history?on_conflict=ticker,fiscal_year,source"
    h = {**SB_H, "Prefer": "resolution=merge-duplicates,return=minimal"}
    r = requests.post(url, headers=h, data=json.dumps(payload), timeout=120)
    if r.status_code >= 300:
        print(f"    upsert error {r.status_code}: {r.text[:200]}")

def log_admin(desc, status="ok"):
    try:
        requests.post(f"{SUPA_URL}/rest/v1/admin_logs",
                      headers={**SB_H, "Prefer": "return=minimal"},
                      data=json.dumps({"event_type": "backfill_sec_edgar", "description": desc, "status": status}),
                      timeout=30)
    except Exception:
        pass

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--ticker", default=None)
    args = ap.parse_args()

    print("Descargando mapeo ticker→CIK de la SEC…")
    cik_map = load_cik_map()
    print(f"  {len(cik_map)} tickers en el mapeo de la SEC.")

    tickers = [args.ticker] if args.ticker else load_db_tickers()
    if args.limit and not args.ticker:
        tickers = tickers[:args.limit]
    print(f"Empresas a procesar: {len(tickers)}{'  [dry-run]' if not args.write else ''}\n")

    processed = ok = no_cik = no_data = 0
    missing = []
    for t in tickers:
        processed += 1
        cik = cik_map.get(norm_sym(t)) or cik_map.get((t or "").upper())
        if not cik:
            no_cik += 1
            missing.append({"ticker": t, "reason": "sin_cik"})
            continue
        try:
            r = requests.get(f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json", headers=SEC_UA, timeout=60)
            time.sleep(SEC_PAUSE)
            if r.status_code != 200:
                missing.append({"ticker": t, "reason": f"http_{r.status_code}"})
                no_data += 1
                continue
            facts = r.json().get("facts") or {}
            rows = build_rows(t, facts)
            has_core = any(row.get("revenue") is not None or row.get("eps_diluted") is not None for row in rows)
            if not rows or not has_core:
                missing.append({"ticker": t, "reason": "sin_revenue_eps", "cik": cik})
                no_data += 1
                continue
            if args.write:
                upsert(rows)
            ok += 1
            yrs = [row["fiscal_year"] for row in rows]
            print(f"  {t:<12} CIK {cik}  {len(rows)} años ({min(yrs)}–{max(yrs)})")
        except Exception as e:
            missing.append({"ticker": t, "reason": f"error:{e}"})
            no_data += 1

    # Lista de faltantes para la fase 2
    with open(os.path.join(OUT_DIR, "sec_edgar_missing.json"), "w", encoding="utf-8") as f:
        json.dump([m["ticker"] for m in missing], f, ensure_ascii=False, indent=0)
    with open(os.path.join(OUT_DIR, "sec_edgar_missing_detail.json"), "w", encoding="utf-8") as f:
        json.dump(missing, f, ensure_ascii=False, indent=1)

    summary = f"SEC EDGAR: {processed} procesados · {ok} con datos · {no_cik} sin CIK · {no_data} con CIK pero sin datos"
    print("\n" + summary)
    print(f"Faltantes (para fase 2): {len(missing)} → scripts/output/sec_edgar_missing.json")
    if args.write:
        log_admin(summary)
    else:
        print("[dry-run] usa --write para persistir en financial_history")
    return ok

if __name__ == "__main__":
    main()
