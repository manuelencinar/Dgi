# Recalcula intrinsic_value / valuation_warning / growth_input_used en Supabase
# desde los estados financieros YA guardados (sin yfinance), con la valoración
# sector-aware nueva (mismo compute_valuation que update_fundamentals.py).
# Aplica los modelos nuevos al instante sin esperar al scrape semanal.
#   python scripts/recalc_valuation.py            (dry-run, resumen)
#   python scripts/recalc_valuation.py --write     (persiste en lotes)
#   python scripts/recalc_valuation.py --ticker O  (una sola empresa)
import json, os, sys, urllib.request, urllib.parse
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
WRITE = "--write" in sys.argv
ONLY = None
if "--ticker" in sys.argv:
    ONLY = sys.argv[sys.argv.index("--ticker") + 1]

env = {}
with open(os.path.join(HERE, "..", "webapp", ".env.local")) as f:
    for l in f:
        l = l.strip()
        if l and not l.startswith("#") and "=" in l:
            k, v = l.split("=", 1); env[k.strip()] = v.strip()
URL = env["NEXT_PUBLIC_SUPABASE_URL"]; KEY = env["SUPABASE_SERVICE_ROLE_KEY"]
H = {"apikey": KEY, "Authorization": "Bearer " + KEY, "Content-Type": "application/json"}

# Importar compute_valuation del script principal (sin ejecutar el main / fetch).
src = open(os.path.join(HERE, "update_fundamentals.py"), encoding="utf-8").read()
ns = {"__file__": os.path.join(HERE, "update_fundamentals.py"), "__name__": "uf"}
exec(compile(src[:src.index("# ── Fetch")], "uf", "exec"), ns)
compute_valuation = ns["compute_valuation"]

# Divisa por sufijo de ticker (el recalc no tiene info de yfinance).
_SUFFIX_CCY = {
    "PA": "EUR", "AS": "EUR", "DE": "EUR", "MC": "EUR", "MI": "EUR", "BR": "EUR",
    "LS": "EUR", "VI": "EUR", "IR": "EUR", "HE": "EUR", "F": "EUR",
    "L": "GBP", "SW": "CHF", "ST": "SEK", "CO": "DKK", "OL": "NOK", "HE2": "EUR",
    "TO": "CAD", "V": "CAD", "MX": "MXN", "SA": "BRL", "JO": "ZAR", "NS": "INR",
    "BO": "INR", "JK": "IDR", "IS": "TRY", "T": "JPY", "AX": "AUD", "HK": "HKD",
    "SI": "SGD", "SS": "CNY", "SZ": "CNY", "WA": "PLN", "BD": "HUF", "PR": "CZK",
}
def ccy_of(ticker):
    if "." not in ticker:
        return "USD"
    return _SUFFIX_CCY.get(ticker.split(".")[-1].upper(), "USD")

# Crecimiento interanual reciente (%) desde financial_history_quarterly, para el momentum
# del DCF (mismo criterio que _recent_rev_yoy / buildQuarterlyModel). vals = ingresos por
# trimestre, MÁS RECIENTE PRIMERO.
def _yoy_from_vals_desc(vals):
    def seg(a, b):
        s = vals[a:b]
        return None if (len(s) < b - a or any(v is None for v in s)) else sum(s)
    if len(vals) >= 8:
        cur, prev = seg(0, 4), seg(4, 8)
        if cur is not None and prev not in (None, 0):
            return (cur - prev) / abs(prev) * 100
    if len(vals) >= 5 and vals[0] is not None and vals[4] not in (None, 0):
        return (vals[0] - vals[4]) / abs(vals[4]) * 100
    return None

def load_fhq_yoy():
    """{ticker: crecimiento interanual reciente %} desde el histórico trimestral permanente."""
    rows, offset = [], 0
    while True:
        q = f"{URL}/rest/v1/financial_history_quarterly?select=ticker,period,revenue&offset={offset}&limit=1000"
        page = json.load(urllib.request.urlopen(urllib.request.Request(q, headers=H)))
        rows.extend(page)
        if len(page) < 1000:
            break
        offset += 1000
    by = {}
    for r in rows:
        by.setdefault(r["ticker"], []).append((r["period"], r.get("revenue")))
    out = {}
    for t, lst in by.items():
        lst.sort(key=lambda x: x[0], reverse=True)   # más reciente primero
        yoy = _yoy_from_vals_desc([v for _, v in lst])
        if yoy is not None:
            out[t] = yoy
    return out

def stmt_df(j):
    if not isinstance(j, dict) or "data" not in j or "columns" not in j:
        return pd.DataFrame()
    return pd.DataFrame({lbl: pd.Series(vals) for lbl, vals in j["data"].items()}).T

compute_moat_width = ns["compute_moat_width"]
SELECT = ("ticker,current_price,market_cap_m,revenue_cagr5,fcf_cagr5,div_cagr5,dps,"
          "sector,industry,roic,roic_reported,roic_tangible,gross_margin,operating_margin,"
          "div_streak,roe,price_to_book,payout_eps,intrinsic_value,"
          "income_statement_annual,balance_sheet_annual,cashflow_annual")

def fetch_page(offset, limit):
    q = f"{URL}/rest/v1/company_fundamentals?select={SELECT}&order=ticker&offset={offset}&limit={limit}"
    if ONLY:
        q = f"{URL}/rest/v1/company_fundamentals?select={SELECT}&ticker=eq.{urllib.parse.quote(ONLY)}"
    return json.load(urllib.request.urlopen(urllib.request.Request(q, headers=H)))

def upsert(batch):
    data = json.dumps(batch).encode()
    req = urllib.request.Request(URL + "/rest/v1/company_fundamentals", data=data, headers={**H, "Prefer": "resolution=merge-duplicates,return=minimal"}, method="POST")
    urllib.request.urlopen(req).read()

fhq_yoy = load_fhq_yoy()
print(f"Crecimiento reciente (trimestral) disponible para {len(fhq_yoy)} empresas")

rows, offset = [], 0
while True:
    page = fetch_page(offset, 1000)
    rows.extend(page)
    if ONLY or len(page) < 1000:
        break
    offset += 1000

changed, pending, n_na, n_val = 0, [], 0, 0
for f in rows:
    cur = ccy_of(f["ticker"])
    inc = stmt_df(f.get("income_statement_annual")); bal = stmt_df(f.get("balance_sheet_annual")); cf = stmt_df(f.get("cashflow_annual"))
    shares = (f["market_cap_m"] * 1e6 / f["current_price"]) if f.get("market_cap_m") and f.get("current_price") else None
    try:
        mw = compute_moat_width(f.get("roic_reported"), f.get("roic"), f.get("roic_tangible"),
                                f.get("gross_margin"), f.get("operating_margin"), f.get("fcf_cagr5"),
                                f.get("revenue_cagr5"), f.get("roe"), f.get("market_cap_m"),
                                f.get("div_streak"), f.get("sector"), f.get("industry"))
        iv, warn, used = compute_valuation(inc, bal, cf, shares, f.get("current_price"),
            f.get("revenue_cagr5"), f.get("fcf_cagr5"), f.get("div_cagr5"), f.get("dps"),
            f.get("sector"), f.get("industry"), f.get("roic"), f.get("div_streak"), cur,
            roe=f.get("roe"), pb=f.get("price_to_book"), payout_eps=f.get("payout_eps"),
            ticker=f["ticker"], moat_width=mw, recent_yoy=fhq_yoy.get(f["ticker"]))
    except Exception as e:
        continue
    old = f.get("intrinsic_value")
    n_na += 1 if iv is None else 0
    n_val += 1 if iv is not None else 0
    if (old is None) != (iv is None) or (iv is not None and old is not None and abs(iv - old) > 0.01):
        changed += 1
        if ONLY or changed <= 25:
            px = f.get("current_price")
            mo = f"{(iv-px)/px*100:+.0f}%" if (iv and px) else "NA"
            print(f"  {f['ticker']:14} {str(old):>10} -> {str(round(iv,2) if iv else None):>10}  MoS={mo}")
    pending.append({"ticker": f["ticker"], "intrinsic_value": iv, "valuation_warning": warn, "growth_input_used": used})

print(f"\n{len(rows)} empresas · {n_val} con valor · {n_na} sin valor (NA) · {changed} cambian respecto a lo guardado")
if WRITE:
    for i in range(0, len(pending), 500):
        upsert(pending[i:i + 500])
    print(f"OK - Escritas {len(pending)} filas")
else:
    print("(dry-run — usa --write para persistir)")
