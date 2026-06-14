#!/usr/bin/env python3
"""
Descarga fundamentales de yfinance y escribe en company_fundamentals (Supabase).

Uso:
  python update_fundamentals.py               # todos los tickers del DICT
  python update_fundamentals.py --ticker AAPL # un solo ticker
  python update_fundamentals.py --force       # ignorar caché de 7 días
  python update_fundamentals.py --ttl 14      # TTL personalizado en días
"""

import argparse
import json
import math
import os
import re
import sys
import time
import requests
from datetime import datetime, timezone, timedelta
from pathlib import Path

from dotenv import load_dotenv
load_dotenv(".env.local")

# ── Rutas ─────────────────────────────────────────────────────────────────

SCRIPT_DIR  = Path(__file__).parent
WEBAPP_DIR  = SCRIPT_DIR.parent / "webapp"
DICT_PATH   = WEBAPP_DIR / "data" / "dict.js"
ENV_PATH    = WEBAPP_DIR / ".env.local"
DEFAULT_TTL = 7
BATCH_SIZE       = 50
BATCH_DELAY      = 2.0
PER_TICKER_DELAY = 1.5   # segundos entre tickers para no saturar yfinance

# Fallback de dividendos UK (Yahoo suele no traer los del FTSE) vía Twelve Data
TWELVE_KEY = os.environ.get("TWELVEDATA_API_KEY", "")

# ── Entorno ────────────────────────────────────────────────────────────────

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
    # En CI (GitHub Actions) el secret se llama SUPABASE_URL
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

# ── DICT ──────────────────────────────────────────────────────────────────

def load_dict_tickers():
    text = DICT_PATH.read_text(encoding="utf-8")
    return re.findall(r'\["[^"]*","([^"]+)"', text)

# ── Sanitize ──────────────────────────────────────────────────────────────

def sanitize(obj):
    if isinstance(obj, float):
        return None if (math.isnan(obj) or math.isinf(obj)) else obj
    if isinstance(obj, dict):
        return {k: sanitize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [sanitize(v) for v in obj]
    return obj

def safe(v, scale=1.0):
    try:
        f = float(v) * scale
        return None if (math.isnan(f) or math.isinf(f)) else round(f, 4)
    except (TypeError, ValueError):
        return None

def safe2(v, decimals=2):
    try:
        f = float(v)
        return None if (math.isnan(f) or math.isinf(f)) else round(f, decimals)
    except (TypeError, ValueError):
        return None

# ── Traducciones para el frontend ─────────────────────────────────────────
# El frontend busca por nombre — mapeamos los más críticos al español
# y también dejamos el inglés para que sRow() los encuentre por ambos nombres.

TRANSLATIONS = {
    "Repurchase Of Capital Stock":                "Recompra de Acciones",
    "Common Stock Repurchased":                   "Recompra de Acciones",
    "Total Revenue":                              "Ingresos Totales",
    "Operating Income":                           "EBIT / Bº Operativo",
    "Ebit":                                       "EBIT / Bº Operativo",
    "Research And Development":                   "I+D",
    "Goodwill":                                   "Fondo de Comercio",
    "Total Assets":                               "Activos Totales",
    "Total Debt":                                 "Deuda Total",
    "Cash And Cash Equivalents":                  "Caja y Equivalentes",
    "Cash Cash Equivalents And Short Term Investments": "Caja y Equivalentes",
    "Operating Cash Flow":                        "Cash Flow Operativo",
    "Total Cash From Operating Activities":       "Cash Flow Operativo",
    "Cash Flow From Continuing Operating Activities": "Cash Flow Operativo",
    "Dividends Paid":                             "Dividendos Pagados",
    "Common Stock Dividend Paid":                 "Dividendos Pagados",
    "Free Cash Flow":                             "Flujo de Caja Libre",
    "Net Income":                                 "Beneficio Neto",
    "Net Income Common Stockholders":             "Beneficio Neto",
    "Gross Profit":                               "Beneficio Bruto",
    "Capital Expenditure":                        "Capex",
    "Basic EPS":                                  "BPA Básico",
    "Diluted EPS":                                "BPA Diluido",
    "Total Stockholder Equity":                   "Patrimonio Neto",
    "Stockholders Equity":                        "Patrimonio Neto",
    "Common Stock Equity":                        "Patrimonio Neto",
}

# ── Financial statements ──────────────────────────────────────────────────

def df_to_stmt(df, n=4):
    """DataFrame yfinance → {columns: [], data: {campo: [v0, v1, v2, v3]}}"""
    if df is None or df.empty:
        return None
    try:
        import pandas as pd
        cols = df.columns[:n]
        col_labels = [str(c)[:10] for c in cols]
        data = {}
        for row_key in df.index:
            english = str(row_key)
            spanish = TRANSLATIONS.get(english)
            vals = []
            for c in cols:
                v = df.loc[row_key, c]
                vals.append(None if pd.isna(v) else float(v))
            # Guardar con nombre español (principal) y también inglés
            if spanish:
                data[spanish] = vals
            data[english] = vals
        return {"columns": col_labels, "data": sanitize(data)}
    except Exception:
        return None

# ── Dividend history ───────────────────────────────────────────────────────

def build_div_history(dividends_series):
    if dividends_series is None or len(dividends_series) == 0:
        return []
    try:
        import pandas as pd
        by_year = dividends_series.groupby(dividends_series.index.year).sum()
        current_year = datetime.now().year
        result = []
        years = sorted(by_year.index)
        for i, year in enumerate(years):
            dps = float(by_year[year])
            prev = float(by_year[years[i - 1]]) if i > 0 else None
            growth = round((dps - prev) / prev, 4) if (prev and prev > 0) else None
            result.append({
                "year":      int(year),
                "dps":       round(dps, 4),
                "growth":    growth,
                "isPartial": year == current_year,
            })
        return result
    except Exception:
        return []

def fetch_dividends_twelvedata(sym, key):
    """Fallback de dividendos para UK (.L) vía Twelve Data.
    Devuelve un pandas.Series (fecha → importe en PENIQUES, para casar con el
    precio en GBp de Yahoo) o None si no hay datos."""
    try:
        import pandas as pd
        base = sym.split(".")[0]
        url = (f"https://api.twelvedata.com/dividends?symbol={base}"
               f"&exchange=LSE&range=full&apikey={key}")
        j = None
        for attempt in range(2):
            r = requests.get(url, timeout=20)
            if r.status_code == 429:        # límite free: 8 req/min
                time.sleep(8); continue
            j = r.json(); break
        if not isinstance(j, dict):
            return None
        if j.get("status") == "error":
            return None
        divs = j.get("dividends") or []
        if not divs:
            return None
        cur = ((j.get("meta") or {}).get("currency") or "").upper()
        factor = 100.0 if cur == "GBP" else 1.0   # GBP(libras) → peniques
        rows = []
        for d in divs:
            dt = d.get("ex_date") or d.get("payment_date")
            amt = d.get("amount")
            if dt and amt is not None:
                try:
                    rows.append((dt, float(amt) * factor))
                except (TypeError, ValueError):
                    pass
        if not rows:
            return None
        idx = pd.to_datetime([dt for dt, _ in rows], errors="coerce")
        s = pd.Series([v for _, v in rows], index=idx).dropna()
        return s if len(s) else None
    except Exception:
        return None


def build_dividend_events(series, n=16):
    """Últimos n pagos con su fecha ex: [{ex_date, amount}]. None si no hay."""
    if series is None or len(series) == 0:
        return None
    try:
        import pandas as pd
        s = series.sort_index()
        out = []
        for dt, amt in s.items():
            if amt is None or pd.isna(amt):
                continue
            try:
                out.append({"ex_date": dt.strftime("%Y-%m-%d"), "amount": round(float(amt), 6)})
            except Exception:
                pass
        return out[-n:] if out else None
    except Exception:
        return None


def ts_to_date(v):
    """Timestamp Unix (segundos) de yfinance → 'YYYY-MM-DD'. None si no aplica."""
    try:
        if v is None:
            return None
        return datetime.fromtimestamp(int(v), tz=timezone.utc).strftime("%Y-%m-%d")
    except Exception:
        return None


def compute_streak(div_history):
    full = [h for h in div_history if not h.get("isPartial") and h.get("growth") is not None]
    if not full:
        return 0
    streak = 0
    for h in reversed(full):
        # Solo cuenta como racha DGI un INCREMENTO real (>0). Un dividendo
        # congelado (growth == 0) o recortado rompe la racha (p.ej. Telefónica).
        if h["growth"] > 0:
            streak += 1
        else:
            break
    return streak

def compute_div_cagr5(div_history):
    full = [h for h in div_history if not h.get("isPartial") and h.get("dps", 0) > 0]
    if len(full) < 2:
        return None
    n = min(5, len(full) - 1)
    v0, vn = full[-1 - n]["dps"], full[-1]["dps"]
    if v0 <= 0:
        return None
    try:
        r = ((vn / v0) ** (1 / n) - 1) * 100
        return safe2(r)
    except Exception:
        return None


def compute_ma200(price_hist):
    """Media móvil de las últimas 200 sesiones (cierres). None si faltan datos.
    Indicador técnico: el precio por debajo de la MM200 sugiere zona de entrada."""
    if price_hist is None or len(price_hist) == 0:
        return None
    try:
        closes = (price_hist["Close"] if "Close" in price_hist else price_hist).dropna()
        if len(closes) < 200:
            return None
        return safe2(float(closes.tail(200).mean()))
    except Exception:
        return None


def compute_shares_reduction(is_stmt, bs_stmt):
    """Reducción de acciones en circulación desde el año base (~2022) para el
    ranking de Caníbales. + = ha reducido acciones (recompra neta real, en número
    de acciones, no €). Descarta artefactos (|>50%| = split/cambio de unidad).
    Devuelve (pct, año_base) o (None, None)."""
    def series(stmt, key):
        if not stmt:
            return None
        data = stmt.get("data") or {}
        cols = stmt.get("columns") or []
        arr = data.get(key)
        if not arr or not cols:
            return None
        out = []
        for c, v in zip(cols, arr):
            try:
                y = int(str(c)[:4])
                if v is not None and float(v) > 0:
                    out.append((y, float(v)))
            except (ValueError, TypeError):
                pass
        return out or None
    s = (series(is_stmt, "Diluted Average Shares") or series(is_stmt, "Basic Average Shares")
         or series(bs_stmt, "Ordinary Shares Number") or series(bs_stmt, "Share Issued"))
    if not s or len(s) < 2:
        return None, None
    s.sort(key=lambda p: p[0])
    (by, bv), (ly, lv) = s[0], s[-1]
    cur = datetime.now().year
    if ly < cur - 2 or by < 2019 or bv <= 0:
        return None, None
    pct = (bv - lv) / bv * 100
    if pct > 50 or pct < -100:
        return None, None
    return safe2(pct), by


def compute_yield_avg(div_history, price_hist, max_years=5, min_years=2):
    """Yield histórico medio: media del yield anual (dps_año / precio_medio_del_año)
    de los hasta `max_years` últimos años COMPLETOS con datos. Devuelve
    (yield_avg_%, nº_años) o (None, None). dps (div_history) y precio (price_hist)
    deben estar en la misma divisa — ambos vienen de Yahoo, así que coinciden.
    Alimenta la señal "zona de compra" del screener (yield sobre su media)."""
    if not div_history or price_hist is None or len(price_hist) == 0:
        return None, None
    try:
        closes = price_hist["Close"] if "Close" in price_hist else price_hist
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
        recent = per_year[:max_years]
        if len(recent) < min_years:
            return None, None
        avg = sum(y for _, y in recent) / len(recent)
        return safe2(avg), len(recent)
    except Exception:
        return None, None

# ── Derived metrics ────────────────────────────────────────────────────────

ROIC_HIGH_WARNING = ("ROIC muy elevado — puede reflejar estructura de capital con bajo patrimonio "
                     "contable por recompras de acciones o intangibles no capitalizados. Comparar con peers del sector.")
ROIC_ADQ_WARNING  = "Gran diferencia entre ROIC con y sin goodwill — crecimiento basado en adquisiciones."

def _bal(df, names):
    import pandas as pd
    for r in names:
        if r in df.index:
            v = df.loc[r].iloc[0]
            if not pd.isna(v):
                return float(v)
    return None

def _bal2(df, names):
    """Promedio de los dos últimos ejercicios (suaviza el balance)."""
    import pandas as pd
    for r in names:
        if r in df.index:
            row = df.loc[r]
            v0 = row.iloc[0]
            if pd.isna(v0):
                continue
            v1 = row.iloc[1] if len(row) > 1 else None
            if v1 is not None and not pd.isna(v1):
                return (float(v0) + float(v1)) / 2
            return float(v0)
    return None

def compute_roic_full(income_df, balance_df, currency, sector, industry):
    """ROIC corregido: capital invertido real, reportado y tangible.
    Devuelve dict con roic_reported, roic_tangible, roic_warning, nopat,
    invested_capital, invested_capital_tangible, tax_rate_effective."""
    blank = {
        "roic_reported": None, "roic_tangible": None, "roic_display": None, "roic_warning": None,
        "nopat": None, "invested_capital": None, "invested_capital_tangible": None,
        "tax_rate_effective": None,
    }

    # Sectores donde el ROIC no aplica
    s = (sector or "").lower()
    i = (industry or "").lower()
    if "bank" in i or "savings" in i or "insur" in i or "reit" in i or "real estate investment" in i:
        return blank

    try:
        import pandas as pd

        ebit = _bal(income_df, ["Ebit", "EBIT", "Operating Income"])
        if ebit is None:
            return blank
        total_assets = _bal(balance_df, ["Total Assets"])
        if total_assets is None or total_assets <= 0:
            return blank

        # Tasa impositiva efectiva
        def_tax = 0.21 if currency == "USD" else 0.25 if currency == "EUR" else 0.23
        tax_prov = _bal(income_df, ["Tax Provision", "Income Tax Expense"])
        pretax   = _bal(income_df, ["Pretax Income", "Income Before Tax"])
        tax_rate = (tax_prov / pretax) if (tax_prov is not None and pretax and pretax > 0) else def_tax
        if tax_rate < 0 or tax_rate > 0.50:
            tax_rate = def_tax

        nopat = ebit * (1 - tax_rate)

        # Capital empleado = Deuda total + Patrimonio neto (medio 2 años),
        # sin restar caja (no distorsiona negocios que acumulan mucho efectivo)
        equity = _bal2(balance_df, ["Total Equity Gross Minority Interest", "Stockholders Equity", "Common Stock Equity", "Total Equity"])
        if equity is None:
            return blank
        debt = _bal2(balance_df, ["Total Debt"])
        if debt is None:
            lp = _bal2(balance_df, ["Long Term Debt", "Long Term Debt And Capital Lease Obligation"]) or 0.0
            cp = _bal2(balance_df, ["Current Debt", "Current Debt And Capital Lease Obligation", "Short Long Term Debt"]) or 0.0
            debt = lp + cp

        invested = equity + debt

        # Capital invertido negativo (patrimonio muy negativo) → no calcular
        if invested <= 0:
            return {**blank, "nopat": safe2(nopat), "invested_capital": safe2(invested),
                    "tax_rate_effective": safe2(tax_rate, 3)}

        # Ajuste 1 — mínimo 10% de activos
        floor = 0.10 * total_assets
        if invested < floor:
            invested = floor

        roic_reported = nopat / invested * 100

        gw = _bal(balance_df, ["Goodwill"])
        intang = _bal(balance_df, ["Other Intangible Assets"])
        if gw is None and intang is None:
            gw = _bal(balance_df, ["Goodwill And Other Intangible Assets"]) or 0.0
            intang = 0.0
        gw = gw or 0.0
        intang = intang or 0.0

        ic_tangible = invested - gw - intang
        if ic_tangible < floor:
            ic_tangible = floor
        roic_tangible = nopat / ic_tangible * 100

        warning = None
        if roic_reported > 60 or roic_tangible > 60:
            warning = ROIC_HIGH_WARNING
        if abs(roic_reported - roic_tangible) > 10:
            warning = (warning + " " + ROIC_ADQ_WARNING) if warning else ROIC_ADQ_WARNING

        rep_v = safe2(roic_reported)
        tan_v = safe2(roic_tangible)
        roic_vals = [v for v in [rep_v, tan_v] if v is not None]
        roic_display = min(roic_vals) if roic_vals else None
        return {
            "roic_reported": rep_v,
            "roic_tangible": tan_v,
            "roic_display": roic_display,
            "roic_warning": warning,
            "nopat": safe2(nopat),
            "invested_capital": safe2(invested),
            "invested_capital_tangible": safe2(ic_tangible),
            "tax_rate_effective": safe2(tax_rate, 3),
        }
    except Exception:
        return blank

def build_history(df, row_names):
    """Dict {YYYY: valor} desde un DataFrame."""
    try:
        import pandas as pd
        for r in row_names:
            if r in df.index:
                series = df.loc[r]
                result = {}
                for col, val in series.items():
                    if not pd.isna(val):
                        result[str(col)[:4]] = float(val)
                if result:
                    return dict(sorted(result.items()))
    except Exception:
        pass
    return None

def cagr_from_df(df, row_names, years=5):
    h = build_history(df, row_names)
    if not h or len(h) < 2:
        return None
    keys = sorted(h.keys())
    n = min(years, len(keys) - 1)
    v0, vn = h[keys[-1 - n]], h[keys[-1]]
    if not v0 or v0 == 0 or not vn:
        return None
    try:
        r = ((vn / v0) ** (1 / n) - 1) * 100
        return safe2(r)
    except Exception:
        return None

# ── Valoración (misma lógica corregida que lib/valuation.js) ──────────────

def _series(df, names, n=5):
    import pandas as pd
    for nm in names:
        if nm in df.index:
            return [None if pd.isna(v) else float(v) for v in df.loc[nm].iloc[:n]]
    return []

def _first(df, names):
    vals = _series(df, names, 1)
    return vals[0] if vals else None

def _revenue_declining_3y(income):
    rev = _series(income, ["Total Revenue", "Total Revenues"], 5)
    if len([v for v in rev if v is not None]) < 4:
        return False
    declines = 0
    for i in range(3):
        if rev[i] is not None and rev[i + 1] is not None and rev[i] < rev[i + 1]:
            declines += 1
        else:
            break
    return declines >= 3

def _business_growth(rev_cagr5, fcf_cagr5, revenue_only=False):
    # Corrección 1 — nunca usa div_cagr5
    if revenue_only:
        return (rev_cagr5, "revenue_cagr5") if rev_cagr5 is not None else (0.0, "cero_por_declive")
    if rev_cagr5 is not None and fcf_cagr5 is not None:
        return (rev_cagr5 + fcf_cagr5) / 2, "media_fcf_revenue"
    if fcf_cagr5 is not None:
        return fcf_cagr5, "fcf_cagr5"
    if rev_cagr5 is not None:
        return rev_cagr5, "revenue_cagr5"
    return 0.0, "cero_por_declive"

def _run_dcf(base, g1, g2, gT, r):
    total, cf = 0.0, base
    for i in range(1, 6):
        cf *= (1 + g1); total += cf / ((1 + r) ** i)
    for i in range(1, 6):
        cf *= (1 + g2); total += cf / ((1 + r) ** (5 + i))
    if r > gT:
        total += cf * (1 + gT) / (r - gT) / ((1 + r) ** 10)
    return total

def _reit_multiple(industry):
    i = (industry or "").lower()
    if "office" in i: return 14
    if "retail" in i or "commercial" in i or "shopping" in i: return 13
    if "residential" in i or "apartment" in i: return 18
    if "industrial" in i or "logistic" in i or "warehouse" in i: return 20
    if "healthcare" in i or "medical" in i: return 16
    return 15

def compute_valuation(income, balance, cashflow, shares, price, rev_cagr5, fcf_cagr5,
                      div_cagr5, dps, sector, industry, roic, streak, currency):
    """Devuelve (intrinsic_value, valuation_warning, growth_input_used)."""
    s = (sector or "").lower()
    i = (industry or "").lower()
    if "bank" in i or "savings" in i:                      st = "bank"
    elif "insur" in i:                                     st = "insurer"
    elif "reit" in i or "real estate investment" in i:     st = "reit"
    elif s == "utilities":                                 st = "utilities"
    elif s in ("energy", "basic materials"):               st = "energy"
    elif "drug" in i or "biotech" in i or "pharma" in i or (s == "healthcare" and "plan" not in i):
        st = "pharma"
    else:                                                  st = "general"

    moat = "none"
    if roic is not None and streak is not None:
        if roic > 25 and streak >= 20:   moat = "wide"
        elif roic > 15 and streak >= 10: moat = "narrow"

    eur = currency == "EUR"

    # Aviso de coherencia dividendo vs negocio (Corrección 1 paso 4)
    warning = None
    if div_cagr5 is not None and rev_cagr5 is not None and (div_cagr5 - rev_cagr5) > 5:
        warning = ("El dividendo crece más rápido que el negocio — refleja expansión del "
                   "payout, no crecimiento real de la empresa.")
        if rev_cagr5 < 0:
            warning += " Empresa con ingresos en declive — valoración conservadora aplicada."

    # ── DDM (bancos, aseguradoras) ────────────────────────────────────────
    if st in ("bank", "insurer"):
        if not dps or dps <= 0:
            return None, warning, "div_cagr5"
        g  = max(0.0, min((div_cagr5 / 100 if div_cagr5 is not None else 0.03), 0.15))
        ke = (0.09 if eur else 0.10) if st == "bank" else (0.08 if eur else 0.09)
        gT = 0.02 if eur else 0.025
        if ke <= gT:
            return None, warning, "div_cagr5"
        value, div = 0.0, dps
        for k in range(1, 6):
            div *= (1 + g); value += div / ((1 + ke) ** k)
        value += div * (1 + gT) / (ke - gT) / ((1 + ke) ** 5)
        return safe2(value), warning, "div_cagr5"

    # ── AFFO (REITs) ──────────────────────────────────────────────────────
    if st == "reit":
        ocf = _first(cashflow, ["Operating Cash Flow", "Total Cash From Operating Activities",
                                "Cash Flow From Continuing Operating Activities"])
        if not ocf or ocf <= 0 or not shares:
            return None, warning, None
        mult = _reit_multiple(industry)
        if moat == "wide":   mult = round(mult * 1.1, 1)
        elif moat == "none": mult = round(mult * 0.9, 1)
        return safe2(ocf / shares * mult), warning, None

    # ── DCF (general, utilities, energy, pharma) ──────────────────────────
    revenue_only = st in ("utilities", "energy")
    base = None

    if st == "utilities":
        base = _first(cashflow, ["Operating Cash Flow", "Total Cash From Operating Activities",
                                 "Cash Flow From Continuing Operating Activities"])
        if not base or base <= 0:
            return None, warning, None
        cap, gT = 0.08, 0.02
        disc = 0.06 if moat == "wide" else 0.075 if moat == "narrow" else 0.09
    elif st == "energy":
        vals = [v for v in _series(cashflow, ["Free Cash Flow"], 4) if v is not None]
        if len(vals) < 2:
            return None, warning, None
        base = sum(vals) / len(vals)
        if base <= 0:
            return None, warning, None
        cap, gT = 0.10, 0.02
        disc = 0.10 if moat == "wide" else 0.12 if moat == "narrow" else 0.14
    else:
        # general / pharma — FCF base con fallback a media 4 años (Corrección 4)
        vals   = _series(cashflow, ["Free Cash Flow"], 4)
        nonnan = [v for v in vals if v is not None]
        recent = vals[0] if vals else None
        if recent is not None and recent > 0:
            base = recent
        elif nonnan and sum(nonnan) / len(nonnan) > 0:
            base = sum(nonnan) / len(nonnan)
        else:
            return None, warning, None
        gT = 0.025 if eur else 0.030
        if st == "pharma":
            cap  = 0.15
            disc = 0.10 if moat == "wide" else 0.12 if moat == "narrow" else 0.14
            gw = _first(balance, ["Goodwill"]); at = _first(balance, ["Total Assets"])
            if gw and at and at > 0 and gw / at > 0.50:
                base *= 0.90
            rd = _first(income, ["Research And Development"]); rv = _first(income, ["Total Revenue"])
            if rd and rv and rv > 0 and abs(rd) / rv > 0.20:
                disc -= 0.01
        else:
            cap  = 0.20
            disc = 0.08 if moat == "wide" else 0.10 if moat == "narrow" else 0.12

    if not shares:
        return None, warning, None

    gpct, src = _business_growth(rev_cagr5, fcf_cagr5, revenue_only)
    # Corrección 3 — límites
    g1 = max(-0.15, min(gpct / 100, cap))
    if g1 >= 0:        g2 = g1 / 2
    elif g1 < -0.10:   g2 = -0.05
    else:              g2 = g1 / 2

    # Corrección 2 — penalización por declive
    r = disc
    if rev_cagr5 is not None and rev_cagr5 < 0 and fcf_cagr5 is not None and fcf_cagr5 < 0:
        r += 0.03
    elif rev_cagr5 is not None and rev_cagr5 < 0:
        r += 0.02

    used = src
    if _revenue_declining_3y(income):
        gT = 0.0
        used = "cero_por_declive"

    iv = _run_dcf(base, g1, g2, gT, r) / shares
    return safe2(iv), warning, used

# ── Fetch ─────────────────────────────────────────────────────────────────

def _stmt_row(stmt, *labels):
    """Lee una fila de un estado {columns,data} → {año: valor}."""
    if not isinstance(stmt, dict) or "data" not in stmt or "columns" not in stmt:
        return {}
    d = stmt["data"]; cols = stmt["columns"]
    arr = None
    for l in labels:
        if isinstance(d.get(l), list):
            arr = d[l]; break
    if arr is None:
        return {}
    out = {}
    for i, c in enumerate(cols):
        try:
            y = int(str(c)[:4])
        except Exception:
            continue
        v = arr[i] if i < len(arr) else None
        if v is not None:
            try:
                out[y] = float(v)
            except Exception:
                pass
    return out


def compute_cdr_fields(cf_stmt, bs_stmt):
    """Capital Discipline Ratio — misma lógica que lib/capital-discipline.js.
    CDR = (dividendos + recompras + adquisiciones) / FCF × 100."""
    fcf = _stmt_row(cf_stmt, "Flujo de Caja Libre", "Free Cash Flow")
    div = _stmt_row(cf_stmt, "Dividendos Pagados", "Dividends Paid", "Common Stock Dividend Paid")
    buy = _stmt_row(cf_stmt, "Recompra de Acciones", "Repurchase Of Capital Stock", "Common Stock Repurchased")
    acq = _stmt_row(cf_stmt, "Adquisición de Negocios", "Purchase Of Business", "Net Business Purchase And Sale")
    debt = _stmt_row(bs_stmt, "Deuda Total", "Total Debt")
    cash = _stmt_row(bs_stmt, "Caja y Equivalentes", "Cash And Cash Equivalents")

    yrs = sorted(set(list(fcf) + list(div) + list(buy)))
    by = []
    for y in yrs:
        f = fcf.get(y)
        d_ = abs(div.get(y, 0.0)); b = abs(buy.get(y, 0.0)); a = abs(acq.get(y, 0.0))
        cdr = ((d_ + b + a) / f * 100) if (f is not None and f > 0) else None
        by.append((y, cdr))
    if not by:
        return {}

    last4 = by[-4:]
    cdrs4 = [c for (_, c) in last4 if c is not None]
    avg4 = sum(cdrs4) / len(cdrs4) if cdrs4 else None
    above = sum(1 for (_, c) in last4 if c is not None and c > 100)
    last_cdr = by[-1][1]

    nd = {y: debt[y] - cash[y] for y in debt if y in cash}
    nd_pct = None
    if len(nd) >= 2:
        nys = sorted(nd)
        yE = nys[-1]; yS = nys[max(0, len(nys) - 5)]
        if nd[yS] != 0:
            nd_pct = (nd[yE] - nd[yS]) / abs(nd[yS]) * 100

    all_cdr = [c for (_, c) in by if c is not None]
    all_above = len(all_cdr) > 0 and all(c > 100 for c in all_cdr)
    flag = None
    if avg4 is not None:
        if all_above and nd_pct is not None and nd_pct > 30:
            flag = "critical"
        elif avg4 > 110 or above >= 3:
            flag = "concern"
        elif (90 <= avg4 <= 110) or above >= 1:
            flag = "watch"
        elif avg4 < 60:
            flag = "excellent"
        else:
            flag = "good"

    return {
        "cdr_last_year": round(last_cdr, 2) if last_cdr is not None else None,
        "cdr_avg_4y": round(avg4, 2) if avg4 is not None else None,
        "cdr_years_above_100": above,
        "capital_discipline_flag": flag,
    }


# ── Bonificaciones por tendencia positiva (réplica de lib/bonuses.js) ────────
def _by_year(stmt, *labels):
    return {int(y): v for y, v in _stmt_row(stmt, *labels).items()}

def _improving(vals, higher=True):
    v0 = vals[0] if len(vals) > 0 else None
    v1 = vals[1] if len(vals) > 1 else None
    v2 = vals[2] if len(vals) > 2 else None
    def b(a, c): return (a > c) if higher else (a < c)
    if v0 is not None and v1 is not None and v2 is not None and b(v0, v1) and b(v1, v2):
        return 3
    if v0 is not None and v1 is not None and b(v0, v1):
        return 2
    return 0

def _ma3(vals):
    out = []
    for i in range(0, max(0, len(vals) - 2)):
        a, b, c = vals[i], vals[i + 1], vals[i + 2]
        out.append((a + b + c) / 3 if (a is not None and b is not None and c is not None) else None)
    return out

def _bonus_sector(sector, industry):
    s = (sector or "").lower(); i = (industry or "").lower()
    if "utilities" in s: return "utilities"
    if "reit" in i or "real estate" in s: return "reit"
    if "energy" in s or "basic materials" in s: return "energy"
    return "general"

def compute_bonus_fields(is_stmt, bs_stmt, cf_stmt, div_history, sector, industry):
    TAX = 0.21
    out = {"bonus_roic_trend": 0.0, "bonus_margin_trend": 0.0, "bonus_debt_reduction": 0.0,
           "bonus_fcf_growth": 0.0, "bonus_div_acceleration": 0.0, "bonus_net_cash": 0.0,
           "bonus_total": 0.0, "improving_flag": False}
    cols = (is_stmt or {}).get("columns") or (bs_stmt or {}).get("columns") or []
    if len(cols) < 3:
        return out
    stype = _bonus_sector(sector, industry)

    ebit = _by_year(is_stmt, "EBIT / Bº Operativo", "Operating Income", "Ebit")
    rev = _by_year(is_stmt, "Ingresos Totales", "Total Revenue")
    interest = _by_year(is_stmt, "Gastos por Intereses", "Interest Expense")
    equity = _by_year(bs_stmt, "Patrimonio Neto", "Total Stockholder Equity", "Stockholders Equity", "Common Stock Equity")
    debt = _by_year(bs_stmt, "Deuda Total", "Total Debt")
    assets = _by_year(bs_stmt, "Activos Totales", "Total Assets")
    cash = _by_year(bs_stmt, "Caja y Equivalentes", "Cash And Cash Equivalents", "Cash Cash Equivalents And Short Term Investments")
    fcf = _by_year(cf_stmt, "Flujo de Caja Libre", "Free Cash Flow")
    cfo = _by_year(cf_stmt, "Cash Flow Operativo", "Operating Cash Flow", "Total Cash From Operating Activities")
    dep = _by_year(cf_stmt, "Depreciación y Amortización", "Depreciation And Amortization", "Depreciation Amortization Depletion")

    def desc_years(*maps):
        ys = set()
        for m in maps:
            ys.update(m.keys())
        return sorted(ys, reverse=True)

    # 1. ROIC
    roic = []
    for y in desc_years(ebit, equity, debt):
        e, eq, dt = ebit.get(y), equity.get(y), debt.get(y)
        if e is None or eq is None or dt is None:
            roic.append(None); continue
        cap = eq + dt
        floor = assets.get(y) * 0.10 if assets.get(y) is not None else 0
        if cap < floor: cap = floor
        roic.append((e * (1 - TAX)) / cap * 100 if cap > 0 else None)
    lvl = _improving(roic, True)
    out["bonus_roic_trend"] = 0.3 if lvl == 3 else 0.15 if lvl == 2 else 0.0

    # 2. Márgenes
    opm = [(ebit.get(y) / rev.get(y) * 100) if (ebit.get(y) is not None and rev.get(y) and rev.get(y) > 0) else None
           for y in desc_years(ebit, rev)]
    if stype == "energy":
        lvl = 3 if _improving(_ma3(opm), True) == 3 else 0
    else:
        lvl = _improving(opm, True)
    out["bonus_margin_trend"] = 0.2 if lvl == 3 else 0.1 if lvl == 2 else 0.0

    # 3. Deuda
    nd_years = desc_years(debt, cash)
    netdebt = [(debt.get(y) - cash.get(y)) if (debt.get(y) is not None and cash.get(y) is not None) else None for y in nd_years]
    ndeb = []
    for i, y in enumerate(nd_years):
        ebd = ebit.get(y) + (dep.get(y) or 0) if ebit.get(y) is not None else None
        ndeb.append(netdebt[i] / ebd if (netdebt[i] is not None and ebd and ebd > 0) else None)
    if stype in ("utilities", "reit"):
        cov = [(ebit.get(y) / abs(interest.get(y))) if (ebit.get(y) is not None and interest.get(y)) else None
               for y in desc_years(ebit, interest)]
        out["bonus_debt_reduction"] = 0.2 if _improving(cov, True) == 3 else 0.0
    else:
        lvl = _improving(netdebt, False)
        amt = 0.2 if lvl == 3 else 0.1 if lvl == 2 else 0.0
        if amt == 0 and _improving(ndeb, False) == 3:
            amt = 0.1
        out["bonus_debt_reduction"] = amt

    # 4. FCF (Utilities: CFO)
    m = cfo if stype == "utilities" else fcf
    s = [m[y] for y in sorted(m.keys(), reverse=True)]
    v0 = s[0] if len(s) > 0 else None
    v1 = s[1] if len(s) > 1 else None
    v2 = s[2] if len(s) > 2 else None
    if v0 is not None and v1 is not None and v2 is not None and v0 > v1 > v2 and v0 > 0 and v1 > 0 and v2 > 0:
        out["bonus_fcf_growth"] = 0.2
    elif v0 is not None and v1 is not None and v0 > v1 and v0 > 0 and v1 > 0:
        out["bonus_fcf_growth"] = 0.1

    # 5. Aceleración del dividendo
    full = sorted([h for h in (div_history or []) if h.get("dps") is not None and not h.get("isPartial")],
                  key=lambda h: h["year"])
    if len(full) >= 5:
        last, y3 = full[-1], full[-4]
        if y3["dps"] > 0 and last["dps"] > 0:
            cagr3 = (last["dps"] / y3["dps"]) ** (1 / 3) - 1
            base = full[-11] if len(full) >= 11 else full[0]
            yrs = 10 if len(full) >= 11 else (len(full) - 1)
            cagr10 = (last["dps"] / base["dps"]) ** (1 / yrs) - 1 if (base["dps"] > 0 and yrs > 0) else None
            if cagr10 is not None and cagr3 <= 0.30 and cagr3 > cagr10 * 1.1:
                out["bonus_div_acceleration"] = 0.1

    # 6. Caja neta positiva y mejorando
    if len(netdebt) >= 2 and netdebt[0] is not None and netdebt[1] is not None and netdebt[0] < 0 and netdebt[0] < netdebt[1]:
        out["bonus_net_cash"] = 0.1

    total = min(1.0, round(out["bonus_roic_trend"] + out["bonus_margin_trend"] + out["bonus_debt_reduction"]
                           + out["bonus_fcf_growth"] + out["bonus_div_acceleration"] + out["bonus_net_cash"], 2))
    out["bonus_total"] = total
    out["improving_flag"] = total >= 0.3
    return out


def fetch_ticker(sym):
    try:
        import yfinance as yf
        import pandas as pd

        tk = yf.Ticker(sym)
        info = tk.info or {}

        # DataFrames financieros — silenciar errores individuales
        def safe_df(fn):
            try:
                return fn()
            except Exception:
                return pd.DataFrame()

        income    = safe_df(lambda: tk.income_stmt)
        q_income  = safe_df(lambda: tk.quarterly_income_stmt)
        balance   = safe_df(lambda: tk.balance_sheet)
        q_balance = safe_df(lambda: tk.quarterly_balance_sheet)
        cashflow  = safe_df(lambda: tk.cashflow)
        q_cashflow= safe_df(lambda: tk.quarterly_cashflow)
        dividends = safe_df(lambda: tk.dividends)

        # ── Info básica ───────────────────────────────────────────────────
        price      = safe(info.get("currentPrice") or info.get("regularMarketPrice"))
        mkt_cap_m  = safe(info.get("marketCap"), 1 / 1e6)
        shares     = safe(info.get("sharesOutstanding") or info.get("impliedSharesOutstanding"))
        beta       = safe(info.get("beta"))
        pe_trail   = safe(info.get("trailingPE"))
        pe_fwd     = safe(info.get("forwardPE"))
        pb         = safe(info.get("priceToBook"))
        ev_ebitda  = safe(info.get("enterpriseToEbitda"))
        eps        = safe(info.get("trailingEps"))
        week52h    = safe(info.get("fiftyTwoWeekHigh"))
        week52l    = safe(info.get("fiftyTwoWeekLow"))
        cr         = safe(info.get("currentRatio"))
        roe        = safe(info.get("returnOnEquity"),   100)
        roa        = safe(info.get("returnOnAssets"),   100)
        gm         = safe(info.get("grossMargins"),     100)
        om         = safe(info.get("operatingMargins"), 100)
        nm         = safe(info.get("profitMargins"),    100)
        rev_growth = safe(info.get("revenueGrowth"),    100)
        ear_growth = safe(info.get("earningsGrowth"),   100)
        payout_eps = safe(info.get("payoutRatio"),      100)
        ebitda_v   = info.get("ebitda")

        # ── Dividendos ────────────────────────────────────────────────────
        div_series  = dividends                     # serie indexada por fecha ex
        div_history = build_div_history(div_series)
        # Fallback UK: Yahoo es poco fiable con los dividendos del FTSE.
        # Para .L SIEMPRE consultamos Twelve Data y nos quedamos con el historial
        # más largo (Yahoo suele traer solo los últimos años, o ninguno).
        if sym.endswith(".L") and TWELVE_KEY:
            td = fetch_dividends_twelvedata(sym, TWELVE_KEY)
            if td is not None and len(td):
                td_hist = build_div_history(td)
                if len(td_hist) > len(div_history):
                    div_history = td_hist
                    div_series  = td
                    print(f"  [{sym}] dividendos vía Twelve Data ({len(div_history)} años)")
        div_streak  = compute_streak(div_history)
        div_cagr5   = compute_div_cagr5(div_history)
        # Yield histórico medio (para la señal "zona de compra" del screener).
        # auto_adjust=False → Close real (ajustado solo por splits, igual que los
        # dividendos de Yahoo) para que dps/precio quede en la misma base.
        price_hist = safe_df(lambda: tk.history(period="6y", auto_adjust=False))
        yield_avg_v, yield_avg_years_v = compute_yield_avg(div_history, price_hist)
        ma200_v = compute_ma200(price_hist)
        dividend_events = build_dividend_events(div_series)   # fechas ex históricas
        next_ex_date    = ts_to_date(info.get("exDividendDate"))
        next_pay_date   = ts_to_date(info.get("dividendDate"))

        # ── ¿Reparte dividendo? (basado en RECENCIA) ─────────────────────
        # Año del último reparto real (dps>0) según el histórico.
        _div_years = [h["year"] for h in (div_history or [])
                      if h.get("year") is not None and (h.get("dps") or 0) > 0]
        last_div_year = max(_div_years) if _div_years else None
        cur_year = datetime.now().year
        # Reparte actualmente = repartió el año anterior o en el año en curso.
        recent_div = last_div_year is not None and last_div_year >= cur_year - 1

        dividend_rate = float(info.get("dividendRate") or 0)
        # DPS: NUNCA lastDividendValue (puede ser de hace una década, p.ej.
        # Prisa 2011 → yield falso). Tasa forward si la hay; si no, el dps del
        # último año del histórico, pero solo si el reparto es reciente.
        dps = safe(info.get("dividendRate"))
        if dps is None and recent_div:
            recent = [h for h in div_history if (h.get("dps") or 0) > 0]
            if recent:
                dps = recent[-1]["dps"]

        # Empresas que dejaron de pagar (sin reparto el año anterior ni en el
        # año en curso) quedan como que NO reparten y sin dps → sin yield falso.
        pays_dividend = recent_div or dividend_rate > 0
        if not pays_dividend:
            dps = None
        no_dividend_confirmed_at = None if pays_dividend else datetime.now().isoformat()

        # ── FCF per share ─────────────────────────────────────────────────
        fcf_ps = None
        if not cashflow.empty and shares:
            for r in ["Free Cash Flow"]:
                if r in cashflow.index:
                    v = cashflow.loc[r].iloc[0]
                    if not pd.isna(v) and shares > 0:
                        fcf_ps = safe2(float(v) / shares)
                    break

        # ── Payout FCF ────────────────────────────────────────────────────
        payout_fcf = None
        if dps and shares and shares > 0 and not cashflow.empty:
            for r in ["Free Cash Flow"]:
                if r in cashflow.index:
                    v = cashflow.loc[r].iloc[0]
                    if not pd.isna(v) and float(v) > 0:
                        payout_fcf = safe2(dps * shares / float(v) * 100)
                    break

        # ── Deuda ─────────────────────────────────────────────────────────
        net_debt = debt_ebitda = net_debt_eb = int_cov = None

        if not balance.empty:
            debt_v = cash_v = None
            for r in ["Total Debt"]:
                if r in balance.index:
                    v = balance.loc[r].iloc[0]
                    if not pd.isna(v):
                        debt_v = float(v)
                    break
            for r in ["Cash And Cash Equivalents", "Cash Cash Equivalents And Short Term Investments"]:
                if r in balance.index:
                    v = balance.loc[r].iloc[0]
                    if not pd.isna(v):
                        cash_v = float(v)
                    break
            if debt_v is not None:
                nd = (debt_v or 0) - (cash_v or 0)
                net_debt = safe2(nd / 1e6)
                if ebitda_v and float(ebitda_v) > 0:
                    debt_ebitda = safe2(nd / float(ebitda_v))
                    net_debt_eb = debt_ebitda

        if not income.empty:
            ebit_v = ie_v = None
            for r in ["Ebit", "EBIT", "Operating Income"]:
                if r in income.index:
                    v = income.loc[r].iloc[0]
                    if not pd.isna(v):
                        ebit_v = float(v)
                    break
            for r in ["Interest Expense", "Interest Expense Non Operating"]:
                if r in income.index:
                    v = income.loc[r].iloc[0]
                    if not pd.isna(v):
                        ie_v = abs(float(v))
                    break
            if ebit_v and ie_v and ie_v > 0:
                int_cov = safe2(ebit_v / ie_v)

        # ── ROIC (corregido: reportado + tangible) ────────────────────────
        roic_full = {
            "roic_reported": None, "roic_tangible": None, "roic_display": None, "roic_warning": None,
            "nopat": None, "invested_capital": None, "invested_capital_tangible": None,
            "tax_rate_effective": None,
        }
        if not income.empty and not balance.empty:
            roic_full = compute_roic_full(income, balance, info.get("currency"),
                                          info.get("sector"), info.get("industry"))
        # roic = el más conservador (display) para moat/insights/scoring
        roic = roic_full.get("roic_display")

        # ── CAGR ─────────────────────────────────────────────────────────
        rev_cagr5 = cagr_from_df(income,   ["Total Revenue", "Total Revenues"])
        fcf_cagr5 = cagr_from_df(cashflow, ["Free Cash Flow"])

        # ── Historiales ──────────────────────────────────────────────────
        rev_history = build_history(income,   ["Total Revenue", "Total Revenues"])
        ni_history  = build_history(income,   ["Net Income", "Net Income Common Stockholders"])
        fcf_history = build_history(cashflow, ["Free Cash Flow"])
        eps_history = build_history(income,   ["Basic EPS", "Diluted EPS"])

        # ── Valoración (intrinsic value precalculado) ─────────────────────
        intrinsic_value = valuation_warning = growth_input_used = None
        try:
            intrinsic_value, valuation_warning, growth_input_used = compute_valuation(
                income, balance, cashflow, shares, price, rev_cagr5, fcf_cagr5,
                div_cagr5, dps, info.get("sector"), info.get("industry"),
                roic, div_streak, info.get("currency"))
        except Exception:
            pass

        # ── Estados financieros ───────────────────────────────────────────
        cf_annual = df_to_stmt(cashflow, 4)
        bs_annual = df_to_stmt(balance, 4)
        is_annual = df_to_stmt(income, 4)
        cdr_fields = compute_cdr_fields(cf_annual, bs_annual)
        bonus_fields = compute_bonus_fields(is_annual, bs_annual, cf_annual, div_history,
                                            info.get("sector"), info.get("industry"))
        shares_pct, shares_base = compute_shares_reduction(is_annual, bs_annual)

        return sanitize({
            "ticker":           sym,
            **cdr_fields,
            **bonus_fields,
            "current_price":    price,
            "dps":              dps,
            "pays_dividend":    pays_dividend,
            "no_dividend_confirmed_at": no_dividend_confirmed_at,
            "div_streak":       div_streak,
            "div_cagr5":        div_cagr5,
            "yield_avg":        yield_avg_v,
            "yield_avg_years":  yield_avg_years_v,
            "ma200":            ma200_v,
            "div_history":      div_history,
            "dividend_events":  dividend_events,
            "next_ex_date":     next_ex_date,
            "next_pay_date":    next_pay_date,
            "payout_fcf":       payout_fcf,
            "payout_eps":       payout_eps,
            "fcf_per_share":    fcf_ps,
            "fcf_cagr5":        fcf_cagr5,
            "debt_ebitda":      debt_ebitda,
            "net_debt":         net_debt,
            "net_debt_ebitda":  net_debt_eb,
            "interest_coverage": int_cov,
            "roic":             roic,
            "roe":              roe,
            "roa":              roa,
            "operating_margin": om,
            "net_margin":       nm,
            "gross_margin":     gm,
            "current_ratio":    cr,
            "revenue_cagr5":    rev_cagr5,
            "pe_trailing":      pe_trail,
            "pe_forward":       pe_fwd,
            "ev_ebitda":        ev_ebitda,
            "price_to_book":    pb,
            "beta":             beta,
            "week52_high":      week52h,
            "week52_low":       week52l,
            "market_cap_m":     mkt_cap_m,
            "eps_trailing":     eps,
            "sector":           info.get("sector"),
            "industry":         info.get("industry"),
            "country":          info.get("country"),
            "revenue_growth_yoy":    rev_growth,
            "earnings_growth_yoy":   ear_growth,
            "revenue_history":       rev_history,
            "net_income_history":    ni_history,
            "fcf_history":           fcf_history,
            "eps_history":           eps_history,
            "intrinsic_value":       intrinsic_value,
            "valuation_warning":     valuation_warning,
            "growth_input_used":     growth_input_used,
            "roic_reported":             roic_full["roic_reported"],
            "roic_tangible":             roic_full["roic_tangible"],
            "roic_display":              roic_full.get("roic_display"),
            "roic_warning":              roic_full["roic_warning"],
            "nopat":                     roic_full["nopat"],
            "invested_capital":          roic_full["invested_capital"],
            "invested_capital_tangible": roic_full["invested_capital_tangible"],
            "tax_rate_effective":        roic_full["tax_rate_effective"],
            "shares_reduced_pct":         shares_pct,
            "shares_base_year":           shares_base,
            "income_statement_annual":    is_annual,
            "balance_sheet_annual":       bs_annual,
            "cashflow_annual":            cf_annual,
            "income_statement_quarterly": df_to_stmt(q_income, 4),
            "balance_sheet_quarterly":    df_to_stmt(q_balance, 4),
            "cashflow_quarterly":         df_to_stmt(q_cashflow, 4),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })

    except Exception as exc:
        print(f"    fetch error: {exc}")
        return None

# ── TTL check ─────────────────────────────────────────────────────────────

def is_fresh(sb, ticker, ttl_days):
    try:
        resp = (
            sb.table("company_fundamentals")
            .select("updated_at, current_price, revenue_cagr5")
            .eq("ticker", ticker)
            .maybe_single()
            .execute()
        )
        if not resp.data or not resp.data.get("updated_at"):
            return False
        # Fila stub/incompleta (yfinance devolvió vacío) → reintentar aunque sea reciente
        if resp.data.get("current_price") is None or resp.data.get("revenue_cagr5") is None:
            return False
        updated = datetime.fromisoformat(resp.data["updated_at"].replace("Z", "+00:00"))
        return (datetime.now(timezone.utc) - updated).days < ttl_days
    except Exception:
        return False

# ── Upsert ────────────────────────────────────────────────────────────────

def update_funds(sb):
    """Actualiza precio y distribuciones de los ETFs/fondos de la tabla funds."""
    try:
        rows = (sb.table("funds").select("ticker").execute()).data or []
    except Exception as exc:
        print(f"  funds: no se pudieron leer ({exc})")
        return 0, 0
    if not rows:
        return 0, 0

    import yfinance as yf
    ok = err = 0
    failed = []
    print(f"\n── Actualizando {len(rows)} ETFs/fondos ──")
    for r in rows:
        tk = r["ticker"]
        try:
            t = yf.Ticker(tk)
            info = t.info or {}
            price = safe(info.get("regularMarketPrice") or info.get("currentPrice"))
            divs = t.dividends
            dist = []
            if divs is not None and len(divs):
                for dt, amt in divs.items():
                    dist.append({"date": dt.strftime("%Y-%m-%d"), "amount": float(amt)})

            ytm = None
            if price and dist:
                cutoff = datetime.now() - timedelta(days=365)
                ttm = sum(d["amount"] for d in dist if datetime.strptime(d["date"], "%Y-%m-%d") >= cutoff)
                if ttm > 0:
                    ytm = round(ttm / price * 100, 1)

            ter = info.get("annualReportExpenseRatio")
            ter = round(float(ter) * 100, 3) if ter else None

            if price is None:
                err += 1; failed.append(tk); print(f"  [{tk}] sin precio")
                continue

            upd = {"current_price": price, "updated_at": datetime.now(timezone.utc).isoformat()}
            if ytm is not None:  upd["yield_ttm"] = ytm
            if dist:             upd["distribution_history"] = dist
            if ter is not None:  upd["ter"] = ter

            sb.table("funds").update(sanitize(upd)).eq("ticker", tk).execute()
            ok += 1
            print(f"  [{tk}] OK precio={price} yield={ytm}")
        except Exception as exc:
            err += 1; failed.append(tk)
            print(f"  [{tk}] ERROR: {exc}")
        time.sleep(PER_TICKER_DELAY)

    try:
        sb.table("admin_logs").insert({
            "event_type": "funds_update",
            "description": f"ETFs/fondos: {ok} OK · {err} errores",
            "details": {"ok": ok, "failed": err, "failed_tickers": failed[:50]},
            "status": "error" if err > 0 else "ok",
        }).execute()
    except Exception:
        pass
    return ok, err

def write_admin_log(sb, ok, err, skip, failed_tickers, duration_s):
    """Registra el resultado del run en admin_logs."""
    try:
        status = "error" if err > 0 else "ok"
        mins = int(duration_s // 60)
        secs = int(duration_s % 60)
        sb.table("admin_logs").insert({
            "event_type": "yfinance_run",
            "description": f"{ok} actualizadas · {skip} omitidas · {err} errores",
            "details": {
                "updated": ok,
                "skipped": skip,
                "failed": err,
                "failed_tickers": failed_tickers[:100],
                "duration": f"{mins}m {secs}s",
            },
            "status": status,
        }).execute()
    except Exception as exc:
        print(f"  (no se pudo escribir admin_logs: {exc})")

# Columnas jsonb históricas {año: valor} — se hace MERGE (nunca se borran años)
HISTORY_JSONB = [
    "revenue_history", "net_income_history", "ebitda_history", "ocf_history",
    "fcf_history", "assets_history", "debt_history", "equity_history",
    "dps_annual_history", "eps_history", "div_history",
]

def _as_dict(v):
    if isinstance(v, dict):
        return v
    if isinstance(v, str):
        try:
            return json.loads(v)
        except Exception:
            return {}
    return {}

def apply_manual_protection(sb, ticker, data):
    """Respeta los datos manuales: salta campos protegidos y mergea históricos.
    Devuelve la lista de campos saltados por protección manual."""
    skipped = []
    try:
        cols = "manual_fields," + ",".join(HISTORY_JSONB)
        res = sb.table("company_fundamentals").select(cols).eq("ticker", ticker).limit(1).execute()
        existing = (res.data or [{}])[0] if res.data else {}
    except Exception:
        existing = {}

    manual = _as_dict(existing.get("manual_fields"))

    for field in list(data.keys()):
        if field in ("ticker", "updated_at"):
            continue
        # 1) Campo protegido por dato manual → no sobreescribir
        if manual.get(field) is True:
            data.pop(field, None)
            skipped.append(field)
            continue
        # 2) Históricos jsonb → merge (los años existentes se conservan, se añaden los nuevos)
        if field in HISTORY_JSONB:
            old = _as_dict(existing.get(field))
            new = _as_dict(data[field])
            if old:
                merged = {**new, **old}   # los años existentes ganan; se añaden los nuevos
                data[field] = merged
    return skipped


def upsert_company(sb, ticker, ttl_days, force):
    if not force and is_fresh(sb, ticker, ttl_days):
        print(f"  [{ticker}] omitido (datos recientes)")
        return "skip"

    data = fetch_ticker(ticker)
    if data is None:
        print(f"  [{ticker}] ERROR: no se pudieron descargar datos")
        return "error"

    # Respetar datos manuales (prioridad permanente sobre yfinance)
    skipped = apply_manual_protection(sb, ticker, data)

    try:
        sb.table("company_fundamentals").upsert(data, on_conflict="ticker").execute()
        price  = data.get("current_price", "?")
        streak = data.get("div_streak", 0)
        cagr   = data.get("div_cagr5", "?")
        note = f"  (protegidos: {', '.join(skipped)})" if skipped else ""
        print(f"  [{ticker}] OK — precio={price}  racha={streak}a  div_cagr5={cagr}%{note}")
        if skipped:
            try:
                sb.table("admin_logs").insert({
                    "event_type": "manual_protect",
                    "description": f"Campos {', '.join(skipped)} de {ticker} protegidos — dato manual preservado",
                    "status": "ok",
                }).execute()
            except Exception:
                pass
        return "ok"
    except Exception as exc:
        print(f"  [{ticker}] ERROR upsert: {exc}")
        return "error"

# ── CLI ───────────────────────────────────────────────────────────────────

def main():
    env = load_env()
    sb  = get_supabase(env)

    parser = argparse.ArgumentParser(description="yfinance → company_fundamentals")
    parser.add_argument("--ticker", help="Un solo ticker, ej: AAPL")
    parser.add_argument("--force",  action="store_true", help="Ignorar caché TTL")
    parser.add_argument("--ttl",    type=int, default=DEFAULT_TTL)
    args = parser.parse_args()

    if args.ticker:
        tickers = [args.ticker.upper()]
    else:
        tickers = load_dict_tickers()
        print(f"  {len(tickers)} tickers en el DICT")

    print(f"\nProcesando {len(tickers)} tickers (TTL={args.ttl}d, force={args.force})…\n")

    start = time.time()
    ok = err = skip = 0
    failed_tickers = []
    for i, ticker in enumerate(tickers, 1):
        print(f"[{i}/{len(tickers)}]", end=" ")
        r = upsert_company(sb, ticker, args.ttl, args.force)
        if r == "ok":     ok += 1
        elif r == "skip": skip += 1
        else:             err += 1; failed_tickers.append(ticker)

        # Pausa entre tickers que tocan yfinance (no en los omitidos) para evitar rate limiting
        if r != "skip":
            time.sleep(PER_TICKER_DELAY)
        # Pausa adicional cada lote
        if i % BATCH_SIZE == 0:
            print(f"\n  --- Pausa {BATCH_DELAY}s (lote {i // BATCH_SIZE}) ---\n")
            time.sleep(BATCH_DELAY)

    duration = time.time() - start
    print(f"\n{'─'*40}")
    print(f"Finalizado: {ok} OK  ·  {skip} omitidos  ·  {err} errores")

    # Actualizar ETFs/fondos y registrar en admin_logs (solo en runs completos)
    if not args.ticker:
        try:
            fok, ferr = update_funds(sb)
            print(f"\nETFs/fondos: {fok} OK · {ferr} errores")
        except Exception as exc:
            print(f"  update_funds error: {exc}")
        write_admin_log(sb, ok, err, skip, failed_tickers, duration)

if __name__ == "__main__":
    main()
