#!/usr/bin/env python3
"""
Descarga fundamentales de yfinance y los escribe en Supabase (company_fundamentals).
Se ejecuta automáticamente cada domingo via GitHub Actions.

Uso local:
  pip install -r scripts/requirements.txt
  python scripts/update_fundamentals.py                # todos los tickers del DICT
  python scripts/update_fundamentals.py --ticker AAPL  # un solo ticker
  python scripts/update_fundamentals.py --update-existing  # solo los ya en Supabase
"""

import argparse
import logging
import math
import os
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd
import yfinance as yf

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-7s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

# ── Paths ──────────────────────────────────────────────────────────────────

SCRIPT_DIR = Path(__file__).parent
WEBAPP_DIR  = SCRIPT_DIR.parent
DICT_PATH   = WEBAPP_DIR / "data" / "dict.js"
ENV_PATH    = WEBAPP_DIR / ".env.local"

BATCH_SIZE  = 50     # filas por upsert a Supabase
DELAY_SECS  = 2.0    # segundos entre tickers

# ── Traducción de partidas ─────────────────────────────────────────────────

TRANSLATIONS = {
    "Total Revenue":                              "Ingresos Totales",
    "Net Income":                                 "Beneficio Neto",
    "Net Income Common Stockholders":             "Beneficio Neto",
    "EBITDA":                                     "EBITDA",
    "Normalized EBITDA":                          "EBITDA Normalizado",
    "Gross Profit":                               "Beneficio Bruto",
    "Operating Income":                           "EBIT / Bº Operativo",
    "Ebit":                                       "EBIT / Bº Operativo",
    "Research And Development":                   "I+D",
    "Selling General And Administration":         "Gastos Generales y Admin.",
    "Total Expenses":                             "Gastos Totales",
    "Depreciation And Amortization":              "D&A",
    "Income Tax Expense":                         "Impuesto sobre Bº",
    "Diluted EPS":                                "BPA Diluido",
    "Basic EPS":                                  "BPA Básico",
    "Interest Expense":                           "Gasto por Intereses",
    "Net Interest Income":                        "Ingreso Neto por Intereses",
    "Total Assets":                               "Activos Totales",
    "Total Liabilities Net Minority Interest":    "Total Pasivo",
    "Current Assets":                             "Activos Corrientes",
    "Total Non Current Assets":                   "Activos No Corrientes",
    "Current Liabilities":                        "Pasivo Corriente",
    "Long Term Debt":                             "Deuda a L/P",
    "Total Debt":                                 "Deuda Total",
    "Net Debt":                                   "Deuda Neta",
    "Cash And Cash Equivalents":                  "Caja y Equivalentes",
    "Cash Cash Equivalents And Short Term Investments": "Caja y Equivalentes",
    "Inventory":                                  "Inventario",
    "Accounts Receivable":                        "Cuentas a Cobrar",
    "Common Stock Equity":                        "Patrimonio Neto",
    "Stockholders Equity":                        "Patrimonio Neto",
    "Retained Earnings":                          "Ganancias Retenidas",
    "Operating Cash Flow":                        "Cash Flow Operativo",
    "Capital Expenditure":                        "Capex",
    "Free Cash Flow":                             "Flujo de Caja Libre",
    "Dividends Paid":                             "Dividendos Pagados",
    "Gross Dividends":                            "Dividendos Brutos",
    "Repurchase Of Capital Stock":                "Recompra de Acciones",
    "Issuance Of Debt":                           "Emisión de Deuda",
    "Repayment Of Debt":                          "Amortización de Deuda",
    "Changes In Cash":                            "Variación de Caja",
    "Net Income From Continuing Operations":      "Bº Operaciones Continuadas",
    "Total Cash From Operating Activities":       "Cash Flow Operativo",
    "Capital Expenditures":                       "Capex",
    "Change In Cash":                             "Variación de Caja",
}

IMPORTANT_IS = {
    "Ingresos Totales", "Beneficio Bruto", "EBIT / Bº Operativo",
    "EBITDA", "EBITDA Normalizado", "Beneficio Neto",
}
IMPORTANT_BS = {
    "Activos Totales", "Deuda Total", "Caja y Equivalentes",
    "Patrimonio Neto", "Deuda a L/P",
}
IMPORTANT_CF = {
    "Cash Flow Operativo", "Capex", "Flujo de Caja Libre",
    "Dividendos Pagados",
}

# ── Helpers ────────────────────────────────────────────────────────────────

def clean(v):
    """Convierte tipos numpy, NaN e Inf a Python nativo o None."""
    if v is None:
        return None
    if isinstance(v, (float, np.floating)):
        if math.isnan(v) or math.isinf(v):
            return None
        return float(v)
    if isinstance(v, (np.integer,)):
        return int(v)
    if isinstance(v, bool):
        return bool(v)
    return v


def pct(v, dec=1):
    """Decimal → porcentaje redondeado (ej: 0.15 → 15.0)."""
    v = clean(v)
    return round(v * 100, dec) if v is not None else None


def df_to_json(df: Optional[pd.DataFrame], important_set: set) -> Optional[dict]:
    """Convierte un DataFrame de yfinance a dict JSON-serializable."""
    if df is None or df.empty:
        return None
    try:
        cols = [str(c)[:10] for c in df.columns]  # "2024-12-31"
        data = {}
        important_found = []
        for label in df.index:
            label_str = str(label)
            translated = TRANSLATIONS.get(label_str, label_str)
            # Evita duplicados (múltiples keys → mismo translated)
            if translated in data:
                continue
            row = [clean(v) for v in df.loc[label].values]
            if all(v is None for v in row):
                continue
            data[translated] = row
            if translated in important_set:
                important_found.append(translated)
        # Orden: importantes primero
        ordered = {k: data[k] for k in important_found if k in data}
        ordered.update({k: v for k, v in data.items() if k not in ordered})
        return {"columns": cols, "data": ordered, "important": important_found}
    except Exception as exc:
        log.warning(f"df_to_json error: {exc}")
        return None


def get_row(df: pd.DataFrame, *candidates) -> Optional[float]:
    """Busca la primera fila que coincide con algún candidato y devuelve su primer valor."""
    for c in candidates:
        match = next((r for r in df.index if c.lower() in str(r).lower()), None)
        if match is not None:
            v = clean(df.loc[match].iloc[0])
            if v is not None:
                return v
    return None

# ── Métricas de dividendo ──────────────────────────────────────────────────

def compute_div_metrics(dividends: pd.Series):
    """Devuelve (dps, div_streak, div_cagr5, div_history)."""
    if dividends is None or len(dividends) == 0:
        return None, 0, None, None

    current_year = datetime.now().year
    by_year: dict[int, float] = {}
    for date, amount in dividends.items():
        y = date.year
        by_year[y] = by_year.get(y, 0.0) + float(amount)

    years = sorted(by_year)
    complete = [y for y in years if y < current_year]
    dps = round(by_year[complete[-1]], 4) if complete else None

    history = []
    for i, y in enumerate(years):
        prev = by_year[years[i - 1]] if i > 0 else None
        growth = round((by_year[y] - prev) / prev, 4) if (prev and prev > 0) else None
        history.append({
            "year":      y,
            "dps":       round(by_year[y], 4),
            "growth":    growth,
            "isPartial": y == current_year,
        })

    full = [h for h in history if not h["isPartial"]]
    streak = 0
    for h in reversed(full):
        if h["growth"] is not None and h["growth"] >= 0:
            streak += 1
        else:
            break

    cagr = None
    if len(complete) >= 2:
        n = min(len(complete) - 1, 5)
        start = by_year[complete[-(n + 1)]]
        end   = by_year[complete[-1]]
        if start > 0:
            cagr = round(((end / start) ** (1 / n) - 1) * 100, 2)

    return dps, streak, cagr, history

# ── Métricas de FCF ────────────────────────────────────────────────────────

def compute_fcf_metrics(cashflow: Optional[pd.DataFrame], shares: Optional[float]):
    if cashflow is None or cashflow.empty:
        return None, None, None

    op_cf_v = get_row(cashflow, "Operating Cash Flow", "Total Cash From Operating Activities")
    capex_v = get_row(cashflow, "Capital Expenditure", "Capital Expenditures")

    if op_cf_v is None:
        return None, None, None

    # Historial FCF por año (millones)
    fcf_hist = {}
    try:
        op_rows = [r for r in cashflow.index if "operating cash" in str(r).lower() or "total cash from op" in str(r).lower()]
        cp_rows = [r for r in cashflow.index if "capital expend" in str(r).lower()]
        if op_rows:
            op_series = cashflow.loc[op_rows[0]]
            cp_series = cashflow.loc[cp_rows[0]] if cp_rows else pd.Series(0, index=cashflow.columns)
            fcf_series = op_series + cp_series.fillna(0)
            for col in cashflow.columns:
                yr = str(col)[:4]
                v = clean(fcf_series[col])
                if v is not None:
                    fcf_hist[yr] = round(v / 1e6, 1)
    except Exception:
        pass

    latest_fcf = list(fcf_hist.values())[0] if fcf_hist else None
    latest_fcf_abs = latest_fcf * 1e6 if latest_fcf else None
    fcf_ps = round(latest_fcf_abs / shares, 2) if (latest_fcf_abs and shares and shares > 0) else None

    # FCF CAGR5
    cagr = None
    vals = list(fcf_hist.values())
    if len(vals) >= 2:
        n = min(len(vals) - 1, 5)
        v0, vn = vals[-1], vals[0]
        if v0 and v0 > 0 and vn:
            cagr = round(((vn / v0) ** (1 / n) - 1) * 100, 2)

    return fcf_ps, cagr, fcf_hist or None

# ── Métricas de deuda ──────────────────────────────────────────────────────

def compute_debt_metrics(balance: Optional[pd.DataFrame], income: Optional[pd.DataFrame]):
    if balance is None or balance.empty:
        return None, None, None, None, None

    try:
        total_debt = get_row(balance, "Total Debt", "Long Term Debt And Capital Lease Obligation")
        cash       = get_row(balance, "Cash Cash Equivalents And Short Term Investments", "Cash And Cash Equivalents", "Cash")
        equity     = get_row(balance, "Common Stock Equity", "Stockholders Equity", "Total Stockholder Equity")

        net_debt = round((total_debt - cash) / 1e6, 1) if (total_debt and cash) else None

        ebitda_v = debt_ebitda = net_debt_ebitda = int_cov = roic = None

        if income is not None and not income.empty:
            ebitda_v = get_row(income, "EBITDA", "Normalized EBITDA")
            ebit_v   = get_row(income, "Ebit", "Operating Income")
            interest = get_row(income, "Interest Expense", "Net Interest Income")
            tax_exp  = get_row(income, "Income Tax Expense", "Tax Provision")

            if ebitda_v and total_debt and ebitda_v > 0:
                debt_ebitda = round(total_debt / ebitda_v, 2)
            if ebitda_v and net_debt is not None and ebitda_v > 0:
                nd_abs = (total_debt - cash) if (total_debt and cash) else None
                if nd_abs is not None:
                    net_debt_ebitda = round(nd_abs / ebitda_v, 2)
            if ebit_v and interest and interest != 0:
                int_cov = round(abs(ebit_v / interest), 1)
            if ebit_v and equity and total_debt and cash:
                t = abs(tax_exp / ebit_v) if (tax_exp and ebit_v and ebit_v > 0) else 0.25
                t = min(0.40, max(0.0, t))
                invested = equity + total_debt - cash
                if invested > 0:
                    roic = round(ebit_v * (1 - t) / invested * 100, 1)

        return net_debt, debt_ebitda, net_debt_ebitda, int_cov, roic
    except Exception as exc:
        log.debug(f"compute_debt_metrics: {exc}")
        return None, None, None, None, None

# ── Historial de ingresos / beneficio / EPS ────────────────────────────────

def extract_series(df: Optional[pd.DataFrame], *candidates) -> Optional[dict]:
    if df is None or df.empty:
        return None
    v = get_row(df, *candidates)
    if v is None:
        return None
    try:
        row_label = next(r for r in df.index if any(c.lower() in str(r).lower() for c in candidates))
        return {
            str(col)[:4]: round(clean(df.loc[row_label, col]) / 1e6, 1)
            for col in df.columns
            if clean(df.loc[row_label, col]) is not None
        }
    except Exception:
        return None

# ── Revenue CAGR5 ──────────────────────────────────────────────────────────

def cagr5_from_hist(hist: Optional[dict]) -> Optional[float]:
    if not hist or len(hist) < 2:
        return None
    years = sorted(hist)
    n  = min(len(years) - 1, 5)
    v0 = hist[years[0]]
    vn = hist[years[-1]]
    if v0 and v0 > 0 and vn:
        return round(((vn / v0) ** (1 / n) - 1) * 100, 2)
    return None

# ── Procesado de un ticker ─────────────────────────────────────────────────

def process_ticker(ticker: str) -> Optional[dict]:
    try:
        stock  = yf.Ticker(ticker)
        info   = stock.info or {}

        price = clean(info.get("currentPrice") or info.get("regularMarketPrice"))
        if price is None:
            log.warning(f"[{ticker}] sin precio — omitido")
            return None

        shares = clean(info.get("sharesOutstanding"))

        # ── Dividendos ──────────────────────────────────────────────────────
        divs = stock.dividends
        dps, div_streak, div_cagr5, div_history = compute_div_metrics(divs)

        # ── Estados financieros ─────────────────────────────────────────────
        income_a  = stock.financials
        income_q  = stock.quarterly_financials
        balance_a = stock.balance_sheet
        balance_q = stock.quarterly_balance_sheet
        cf_a      = stock.cashflow
        cf_q      = stock.quarterly_cashflow

        # ── FCF ─────────────────────────────────────────────────────────────
        fcf_ps, fcf_cagr5, fcf_hist = compute_fcf_metrics(cf_a, shares)

        # ── Deuda / ROIC ────────────────────────────────────────────────────
        net_debt, debt_ebitda, net_debt_ebitda, int_cov, roic = \
            compute_debt_metrics(balance_a, income_a)

        # ── Historial ───────────────────────────────────────────────────────
        rev_hist = extract_series(income_a, "Total Revenue")
        ni_hist  = extract_series(income_a, "Net Income", "Net Income Common Stockholders")
        eps_hist = None
        if income_a is not None and not income_a.empty:
            eps_row = next((r for r in income_a.index if "Diluted EPS" in str(r) or "Basic EPS" in str(r)), None)
            if eps_row:
                eps_hist = {str(col)[:4]: clean(income_a.loc[eps_row, col])
                            for col in income_a.columns
                            if clean(income_a.loc[eps_row, col]) is not None}

        rev_cagr5 = cagr5_from_hist(rev_hist)

        # ── Payout FCF ──────────────────────────────────────────────────────
        payout_fcf = round(dps / fcf_ps * 100, 1) if (dps and fcf_ps and fcf_ps > 0) else None

        # ── Fila para Supabase ──────────────────────────────────────────────
        row = {
            "ticker":           ticker,
            "name":             info.get("longName") or info.get("shortName") or ticker,
            "current_price":    price,
            "dps":              dps,
            "div_streak":       div_streak,
            "div_cagr5":        div_cagr5,
            "div_history":      div_history,
            "payout_fcf":       payout_fcf,
            "payout_eps":       pct(info.get("payoutRatio")),
            "fcf_per_share":    fcf_ps,
            "fcf_cagr5":        fcf_cagr5,
            "debt_ebitda":      debt_ebitda,
            "net_debt":         net_debt,
            "net_debt_ebitda":  net_debt_ebitda,
            "interest_coverage": int_cov,
            "roic":             roic,
            "roe":              pct(info.get("returnOnEquity")),
            "roa":              pct(info.get("returnOnAssets")),
            "operating_margin": pct(info.get("operatingMargins")),
            "net_margin":       pct(info.get("profitMargins")),
            "gross_margin":     pct(info.get("grossMargins")),
            "current_ratio":    clean(info.get("currentRatio")),
            "revenue_cagr5":    rev_cagr5,
            "revenue_growth_yoy": pct(info.get("revenueGrowth")),
            "earnings_growth_yoy": pct(info.get("earningsGrowth")),
            "eps_trailing":     clean(info.get("trailingEps")),
            "eps_forward":      clean(info.get("forwardEps")),
            "pe_trailing":      clean(info.get("trailingPE")),
            "pe_forward":       clean(info.get("forwardPE")),
            "ev_ebitda":        clean(info.get("enterpriseToEbitda")),
            "beta":             clean(info.get("beta")),
            "week52_high":      clean(info.get("fiftyTwoWeekHigh")),
            "week52_low":       clean(info.get("fiftyTwoWeekLow")),
            "market_cap_m":     round(info["marketCap"] / 1e6, 1) if info.get("marketCap") else None,
            "sector":           info.get("sector"),
            "industry":         info.get("industry"),
            "country":          info.get("country"),
            "revenue_history":  rev_hist,
            "net_income_history": ni_hist,
            "fcf_history":      fcf_hist,
            "eps_history":      eps_hist,
            # Estados financieros completos
            "income_statement_annual":    df_to_json(income_a, IMPORTANT_IS),
            "balance_sheet_annual":       df_to_json(balance_a, IMPORTANT_BS),
            "cashflow_annual":            df_to_json(cf_a,      IMPORTANT_CF),
            "income_statement_quarterly": df_to_json(income_q,  IMPORTANT_IS),
            "balance_sheet_quarterly":    df_to_json(balance_q, IMPORTANT_BS),
            "cashflow_quarterly":         df_to_json(cf_q,      IMPORTANT_CF),
            "updated_at":       datetime.now(timezone.utc).isoformat(),
        }
        return row

    except Exception as exc:
        log.error(f"[{ticker}] ERROR: {exc}")
        return None

# ── Carga de tickers ───────────────────────────────────────────────────────

def load_dict_tickers() -> list[str]:
    text = DICT_PATH.read_text(encoding="utf-8")
    return re.findall(r'\["[^"]*","([^"]+)"', text)

# ── Main ───────────────────────────────────────────────────────────────────

def main():
    # Cargar .env.local si existe (para uso local)
    if ENV_PATH.exists():
        for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                if k.strip() not in os.environ:
                    os.environ[k.strip()] = v.strip()

    url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        sys.exit("ERROR: Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY")

    try:
        from supabase import create_client
        sb = create_client(url, key)
    except ImportError:
        sys.exit("ERROR: pip install supabase")

    parser = argparse.ArgumentParser()
    group  = parser.add_mutually_exclusive_group()
    group.add_argument("--ticker",          help="Un ticker concreto, ej: AAPL")
    group.add_argument("--update-existing", action="store_true",
                       help="Solo actualizar tickers ya en company_fundamentals")
    parser.add_argument("--delay", type=float, default=DELAY_SECS)
    parser.add_argument("--batch", type=int,   default=BATCH_SIZE)
    args = parser.parse_args()

    if args.ticker:
        tickers = [args.ticker]
    elif args.update_existing:
        resp    = sb.table("company_fundamentals").select("ticker").execute()
        tickers = [r["ticker"] for r in resp.data]
        log.info(f"Actualizando {len(tickers)} tickers existentes en Supabase")
    else:
        tickers = load_dict_tickers()
        log.info(f"Leyendo {len(tickers)} tickers desde dict.js")

    total = len(tickers)
    est_min = round(total * args.delay / 60)
    log.info(f"Total: {total} tickers · delay={args.delay}s · estimado ~{est_min} min")

    ok_list  = []
    err_list = []
    batch    = []

    def flush_batch():
        if not batch:
            return
        try:
            sb.table("company_fundamentals").upsert(batch, on_conflict="ticker").execute()
        except Exception as exc:
            log.error(f"Supabase batch error: {exc}")
        batch.clear()

    for i, ticker in enumerate(tickers, 1):
        log.info(f"[{i}/{total}] {ticker}")
        row = process_ticker(ticker)

        if row:
            batch.append(row)
            ok_list.append(ticker)
            log.info(f"  ✓  {row.get('name', '')}  precio={row.get('current_price')}  "
                     f"racha={row.get('div_streak')}a  cagr={row.get('div_cagr5')}%")
            if len(batch) >= args.batch:
                flush_batch()
        else:
            err_list.append(ticker)

        time.sleep(args.delay)

    flush_batch()  # últimos registros

    # ── Resumen ─────────────────────────────────────────────────────────────
    log.info("=" * 60)
    log.info(f"Finalizado: {len(ok_list)} OK  ·  {len(err_list)} errores")
    if err_list:
        log.info(f"Tickers con error: {err_list}")

    # Log opcional en Supabase (tabla sync_logs, si existe)
    try:
        sb.table("sync_logs").insert({
            "script":     "update_fundamentals",
            "ok_count":   len(ok_list),
            "err_count":  len(err_list),
            "err_tickers": err_list[:100],
            "run_at":     datetime.now(timezone.utc).isoformat(),
        }).execute()
    except Exception:
        pass


if __name__ == "__main__":
    main()
