#!/usr/bin/env python3
"""
Backfill puntual — FASE 2: stockanalysis.com (fallback, solo faltantes de la fase 1).

Lee scripts/output/sec_edgar_missing.json y SOLO actúa sobre esos tickers (no repite el
trabajo de la fase 1). Scraping RESPETUOSO de una web sin API pública: user-agent
identificable, pausa de 1-2s, máx. 2 reintentos. Es un job de un solo uso, no un
servicio en producción.

Parsea las tablas HTML de estados financieros (income / balance-sheet / cash-flow) y
mapea sus filas a las mismas columnas que la fase 1. Guarda en financial_history con
source='stockanalysis'. Los que tampoco se consiguen → scripts/output/still_missing.json.

Uso:  python scripts/backfill_stockanalysis.py [--write] [--limit N] [--ticker X]
Requiere: pip install requests beautifulsoup4

OJO: la estructura de stockanalysis.com puede cambiar. Si el parser deja de encontrar
tablas, revisa MATCHERS / la URL. Documenta los mercados sin mapear (se registran en
still_missing con reason='sin_mapeo_mercado').
"""
import os, sys, json, time, argparse, re
import requests
from bs4 import BeautifulSoup

try:  # consola Windows (cp1252)
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
SB_H = {"apikey": SUPA_KEY, "Authorization": "Bearer " + SUPA_KEY, "Content-Type": "application/json"}

UA = {"User-Agent": "Everdiv research backfill contact@everdiv.com (one-off historical data job)"}
PAUSE = 1.5   # 1-2s entre peticiones — respetuoso

# Sufijo de bolsa (Yahoo) → código de mercado de stockanalysis.com (best-effort).
# Los que no estén aquí se marcan sin_mapeo_mercado.
EXCH = {
    ".L": "LSE", ".PA": "EPA", ".DE": "ETR", ".MC": "BME", ".MI": "BIT", ".AS": "AMS",
    ".SW": "SWX", ".BR": "EBR", ".LS": "ELI", ".HE": "HEL", ".ST": "STO", ".OL": "OSL",
    ".CO": "CPH", ".VI": "VIE", ".TO": "TSX", ".V": "CVE", ".HK": "HKG", ".T": "TYO",
    ".AX": "ASX", ".SI": "SGX", ".KS": "KRX", ".TW": "TPE", ".NS": "NSE", ".BO": "BOM",
    ".MX": "BMV", ".SA": "BVMF", ".IR": "ISE", ".WA": "WSE", ".AT": "ATH", ".PR": "PRA",
}

# Fila (por subcadena, minúsculas) → columna. Orden: primer match gana.
MATCHERS = {
    "income": [
        ("revenue", "revenue"), ("gross profit", "gross_profit"), ("operating income", "operating_income"),
        ("net income", "net_income"), ("eps (diluted)", "eps_diluted"), ("diluted eps", "eps_diluted"),
        ("shares outstanding (diluted)", "shares_diluted"), ("diluted shares", "shares_diluted"),
        ("dividend per share", "dividend_per_share"),
    ],
    "balance-sheet": [
        ("total assets", "total_assets"), ("total liabilities", "total_liabilities"),
        ("shareholders' equity", "stockholders_equity"), ("total equity", "stockholders_equity"),
        ("long-term debt", "long_term_debt"), ("cash & equivalents", "cash_and_equivalents"),
        ("cash and cash", "cash_and_equivalents"),
    ],
    "cash-flow-statement": [
        ("operating cash flow", "operating_cash_flow"), ("capital expenditures", "capex"),
        ("common dividends paid", "dividends_paid_total"), ("dividends paid", "dividends_paid_total"),
        ("repurchase of common", "buybacks_total"), ("share buyback", "buybacks_total"),
    ],
}
STMT_PATH = {"income": "financials", "balance-sheet": "financials/balance-sheet",
             "cash-flow-statement": "financials/cash-flow-statement"}
# Filas "trampa" a ignorar (contienen la subcadena de una métrica pero NO son el importe):
# p.ej. "Revenue Growth (YoY)", "Cost of Revenue", "Operating Margin", "EPS Growth"…
BAD_ROW = ("growth", "margin", "yoy", "cost of", "ratio", "% of", "as %", "per employee", "/ sh")
# Columnas por-acción (NO se escalan a millones; el resto de importes vienen en millones).
PER_SHARE = {"eps_diluted", "dividend_per_share"}

def sa_symbol(ticker):
    """Devuelve (url_base, ok). Base tipo https://stockanalysis.com/stocks/AAPL o /quote/LSE/SHEL."""
    t = (ticker or "").upper().strip()
    if "." not in t:
        return f"https://stockanalysis.com/stocks/{t.lower()}", True
    base, suf = t.rsplit(".", 1)
    exch = EXCH.get("." + suf)
    if not exch:
        return None, False
    return f"https://stockanalysis.com/quote/{exch.lower()}/{base.lower()}", True

def parse_num(s):
    if s is None:
        return None
    s = s.strip().replace(",", "").replace("$", "").replace("€", "").replace("£", "")
    if s in ("", "-", "—", "N/A", "n/a", "Upgrade"):
        return None
    neg = s.startswith("(") and s.endswith(")")
    s = s.strip("()").replace("%", "")
    mult = 1
    if s and s[-1] in "BMKT":
        mult = {"K": 1e3, "M": 1e6, "B": 1e9, "T": 1e12}[s[-1]]
        s = s[:-1]
    try:
        v = float(s) * mult
        return -v if neg else v
    except ValueError:
        return None

def fetch(url, tries=2):
    for i in range(tries + 1):
        try:
            r = requests.get(url, headers=UA, timeout=40)
            if r.status_code == 200:
                return r.text
            if r.status_code == 404:
                return None
        except Exception:
            pass
        time.sleep(PAUSE * (i + 1))
    return None

def parse_statement(html, kind):
    """Devuelve {fiscal_year: {col: val}} de la tabla principal de estados financieros."""
    if not html:
        return {}
    soup = BeautifulSoup(html, "html.parser")
    table = None
    for tb in soup.find_all("table"):
        head = tb.find("thead")
        if head and re.search(r"20\d\d", head.get_text()):
            table = tb
            break
    if not table:
        return {}
    # Años de la cabecera
    ths = (table.find("thead").find_all("th") if table.find("thead") else [])
    years = []
    for th in ths[1:]:
        m = re.search(r"(20\d\d)", th.get_text())
        years.append(int(m.group(1)) if m else None)
    out = {}
    for tr in table.find_all("tr"):
        cells = tr.find_all(["td", "th"])
        if len(cells) < 2:
            continue
        label = cells[0].get_text(" ", strip=True).lower()
        if any(b in label for b in BAD_ROW):
            continue
        col = None
        for needle, c in MATCHERS[kind]:
            if needle in label:
                col = c
                break
        if not col:
            continue
        for i, cell in enumerate(cells[1:]):
            if i >= len(years) or years[i] is None:
                continue
            v = parse_num(cell.get_text(strip=True))
            if v is None:
                continue
            # stockanalysis muestra los importes en MILLONES → a valor absoluto (como la
            # SEC). Los per-share (EPS, dividendo/acción) ya vienen en unidad absoluta.
            if col not in PER_SHARE:
                v *= 1_000_000
            out.setdefault(years[i], {}).setdefault(col, v)   # primera fila válida gana
    return out

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
        requests.post(f"{SUPA_URL}/rest/v1/admin_logs", headers={**SB_H, "Prefer": "return=minimal"},
                      data=json.dumps({"event_type": "backfill_stockanalysis", "description": desc, "status": status}), timeout=30)
    except Exception:
        pass

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--ticker", default=None)
    ap.add_argument("--file", default=None, help="JSON con una lista de tickers a procesar")
    args = ap.parse_args()

    if args.ticker:
        tickers = [args.ticker]
    elif args.file:
        with open(args.file, encoding="utf-8") as f:
            tickers = json.load(f)
    else:
        try:
            with open(os.path.join(OUT_DIR, "sec_edgar_missing.json"), encoding="utf-8") as f:
                tickers = json.load(f)
        except FileNotFoundError:
            sys.exit("No existe sec_edgar_missing.json — ejecuta antes la fase 1 (backfill_sec_edgar.py).")
    if args.limit:
        tickers = tickers[:args.limit]
    print(f"Fase 2 (stockanalysis): {len(tickers)} tickers faltantes{'  [dry-run]' if not args.write else ''}\n")

    ok = fail = no_map = 0
    still = []
    for t in tickers:
        base, mapped = sa_symbol(t)
        if not mapped:
            no_map += 1
            still.append({"ticker": t, "reason": "sin_mapeo_mercado"})
            continue
        merged = {}   # fy -> row
        got_any = False
        for kind, path in STMT_PATH.items():
            html = fetch(f"{base}/{path}/")
            time.sleep(PAUSE)
            data = parse_statement(html, kind)
            if data:
                got_any = True
            for fy, vals in data.items():
                row = merged.setdefault(fy, {"ticker": t, "fiscal_year": int(fy), "source": "stockanalysis"})
                row.update(vals)
        # free cash flow
        for row in merged.values():
            ocf, capex = row.get("operating_cash_flow"), row.get("capex")
            if ocf is not None and capex is not None:
                row["free_cash_flow"] = ocf - abs(capex)
        rows = [r for r in merged.values() if r.get("revenue") is not None or r.get("eps_diluted") is not None or r.get("total_assets") is not None]
        if not rows or not got_any:
            fail += 1
            still.append({"ticker": t, "reason": "sin_datos"})
            continue
        if args.write:
            upsert(rows)
        ok += 1
        yrs = [r["fiscal_year"] for r in rows]
        print(f"  {t:<12} {len(rows)} años ({min(yrs)}–{max(yrs)})")

    with open(os.path.join(OUT_DIR, "still_missing.json"), "w", encoding="utf-8") as f:
        json.dump(still, f, ensure_ascii=False, indent=1)

    summary = f"stockanalysis: {len(tickers)} intentados · {ok} con datos · {fail} sin datos · {no_map} sin mapeo de mercado"
    print("\n" + summary)
    print(f"Sin cubrir tras fase 2: {len(still)} → scripts/output/still_missing.json")
    if args.write:
        log_admin(summary)
    else:
        print("[dry-run] usa --write para persistir")

if __name__ == "__main__":
    main()
