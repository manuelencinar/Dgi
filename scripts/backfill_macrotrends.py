#!/usr/bin/env python3
"""
Backfill puntual — FUENTE Macrotrends (profundidad histórica para no-US).

ACUMULATIVO: no descarta lo de otras fuentes. Guarda sus años con source='macrotrends'
(unique(ticker,fiscal_year,source) → se suman a SEC/stockanalysis/ESEF). Objetivo:
maximizar el rango de años por ticker.

OJO — CLOUDFLARE: macrotrends.net bloquea las IPs de datacenter (403). Este script usa
curl_cffi impersonando Chrome, que suele pasar desde una IP RESIDENCIAL (tu PC). Si te da
403 en bucle, es que tu IP también está bloqueada (usa otra red / VPN residencial).

Cubre tickers NO-US (con sufijo de bolsa); el símbolo base (sin sufijo) es el que usa
macrotrends para los ADR. Los falsos matches (base que casa con otra empresa US) los
detecta después validate_financial_history.py contra yfinance, igual que en SEC.

Uso:  python scripts/backfill_macrotrends.py [--write] [--limit N] [--ticker X] [--all-nonus]
      (por defecto procesa los tickers no-US; --ticker X para uno; sin --write = dry-run)

Requiere: pip install curl_cffi requests   +   webapp/.env.local con credenciales.
"""
import os, sys, json, time, re, argparse
import requests
try:
    from curl_cffi import requests as cr
except ImportError:
    sys.exit("Falta curl_cffi. Instala:  pip install curl_cffi")

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
SB_H = {"apikey": SUPA_KEY, "Authorization": "Bearer " + SUPA_KEY, "Content-Type": "application/json"}

PAUSE = 1.2   # respetuoso

# Columna → slug de la página de métrica de macrotrends. eps_diluted es per-share (no escala);
# el resto son importes en MILLONES (se escalan a absoluto) o acciones en millones.
METRICS = {
    "revenue": "revenue",
    "gross_profit": "gross-profit",
    "operating_income": "operating-income",
    "net_income": "net-income",
    "eps_diluted": "eps-earnings-per-share-diluted",
    "total_assets": "total-assets",
    "total_liabilities": "total-liabilities",
    "stockholders_equity": "total-share-holder-equity",
    "long_term_debt": "long-term-debt",
    "cash_and_equivalents": "cash-on-hand",
    "operating_cash_flow": "cash-flow-from-operating-activities",
    "capex": "capital-expenditures",
    "shares_diluted": "shares-outstanding",
}
PER_SHARE = {"eps_diluted"}
COLS_ALL = [
    "ticker", "fiscal_year", "source", "currency", "form_type", "filed_date",
    "revenue", "gross_profit", "operating_income", "net_income", "eps_diluted",
    "total_assets", "total_liabilities", "stockholders_equity", "long_term_debt", "cash_and_equivalents",
    "operating_cash_flow", "capex", "free_cash_flow", "dividends_paid_total", "buybacks_total", "dividend_per_share",
    "shares_diluted", "shares_basic", "raw_concepts",
]

def base_symbol(ticker):
    return (ticker or "").upper().split(".")[0]

def load_nonus_tickers():
    out, frm = [], 0
    while True:
        q = f"{SUPA_URL}/rest/v1/company_fundamentals?select=ticker&order=ticker&offset={frm}&limit=1000"
        data = requests.get(q, headers=SB_H, timeout=60).json()
        if not isinstance(data, list) or not data:
            break
        out += [r["ticker"] for r in data]
        if len(data) < 1000:
            break
        frm += 1000
    return [t for t in out if "." in t]   # no-US = con sufijo de bolsa

def parse_val(s):
    if s is None:
        return None
    s = str(s).strip().replace(",", "").replace("$", "")
    if s in ("", "-"):
        return None
    try:
        return float(s)
    except ValueError:
        return None

def fetch(session, url, tries=2):
    for i in range(tries + 1):
        try:
            r = session.get(url, timeout=40)
            if r.status_code == 200:
                return r.text, r.url
            if r.status_code == 404:
                return None, None
        except Exception:
            pass
        time.sleep(PAUSE * (i + 1))
    return None, None

SLUG_RE = re.compile(r"/charts/[^/]+/([^/]+)/")
DATA_RE = re.compile(r"var originalData = (\[.*?\]);", re.S)

def metric_series(session, base, slug, metric_slug):
    """{year: valor} de una página de métrica (var originalData)."""
    html, _ = fetch(session, f"https://www.macrotrends.net/stocks/charts/{base}/{slug}/{metric_slug}")
    if not html:
        return {}
    m = DATA_RE.search(html)
    if not m:
        return {}
    try:
        arr = json.loads(m.group(1))
    except Exception:
        return {}
    out = {}
    for row in arr:
        date = row.get("date") or ""
        v = parse_val(row.get("v1"))
        if len(str(date)) >= 4 and v is not None:
            try:
                out[int(str(date)[:4])] = v
            except ValueError:
                pass
    return out

def resolve_slug(session, base):
    """Slug canónico de macrotrends (o None si no existe)."""
    html, final = fetch(session, f"https://www.macrotrends.net/stocks/charts/{base}/x/revenue")
    if not final:
        return None
    m = SLUG_RE.search(final)
    return m.group(1) if m else None

def build_rows(ticker, series_by_col):
    years = sorted({y for m in series_by_col.values() for y in m})
    rows = []
    for y in years:
        row = {"ticker": ticker, "fiscal_year": int(y), "source": "macrotrends"}
        for col, m in series_by_col.items():
            v = m.get(y)
            if v is None:
                continue
            row[col] = v if col in PER_SHARE else v * 1_000_000   # macrotrends en millones → absoluto
        ocf, capex = row.get("operating_cash_flow"), row.get("capex")
        if ocf is not None and capex is not None:
            row["free_cash_flow"] = ocf - abs(capex)
        # solo filas con algo de sustancia
        if row.get("revenue") is not None or row.get("net_income") is not None or row.get("total_assets") is not None:
            rows.append(row)
    return rows

def upsert(rows):
    if not rows:
        return
    payload = [{c: r.get(c) for c in COLS_ALL} for r in rows]
    url = f"{SUPA_URL}/rest/v1/financial_history?on_conflict=ticker,fiscal_year,source"
    r = requests.post(url, headers={**SB_H, "Prefer": "resolution=merge-duplicates,return=minimal"},
                      data=json.dumps(payload), timeout=120)
    if r.status_code >= 300:
        print(f"    upsert error {r.status_code}: {r.text[:200]}")

def log_admin(desc, status="ok"):
    try:
        requests.post(f"{SUPA_URL}/rest/v1/admin_logs", headers={**SB_H, "Prefer": "return=minimal"},
                      data=json.dumps({"event_type": "backfill_macrotrends", "description": desc, "status": status}), timeout=30)
    except Exception:
        pass

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--ticker", default=None)
    args = ap.parse_args()

    tickers = [args.ticker] if args.ticker else load_nonus_tickers()
    if args.limit and not args.ticker:
        tickers = tickers[:args.limit]
    print(f"Macrotrends: {len(tickers)} tickers{'  [dry-run]' if not args.write else ''}\n")

    session = cr.Session(impersonate="chrome")
    # calentar cookies de Cloudflare
    try:
        session.get("https://www.macrotrends.net/", timeout=30)
    except Exception:
        pass

    ok = no_page = fail = 0
    still = []
    for t in tickers:
        base = base_symbol(t)
        slug = resolve_slug(session, base)
        time.sleep(PAUSE)
        if not slug:
            no_page += 1
            still.append({"ticker": t, "reason": "no_en_macrotrends"})
            continue
        series = {}
        for col, mslug in METRICS.items():
            series[col] = metric_series(session, base, slug, mslug)
            time.sleep(PAUSE)
        rows = build_rows(t, series)
        if not rows:
            fail += 1
            still.append({"ticker": t, "reason": "sin_datos"})
            continue
        if args.write:
            upsert(rows)
        ok += 1
        yrs = [r["fiscal_year"] for r in rows]
        print(f"  {t:<12} {len(rows)} años ({min(yrs)}–{max(yrs)})")

    with open(os.path.join(OUT_DIR, "macrotrends_missing.json"), "w", encoding="utf-8") as f:
        json.dump(still, f, ensure_ascii=False, indent=1)
    summary = f"macrotrends: {len(tickers)} intentados · {ok} con datos · {fail} sin datos · {no_page} no están en la web"
    print("\n" + summary)
    if args.write:
        log_admin(summary)
    else:
        print("[dry-run] usa --write para persistir")

if __name__ == "__main__":
    main()
