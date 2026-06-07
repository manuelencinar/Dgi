"""
import_investing.py
------------------
Lee un fichero Excel con datos de Investing.com (una pestaña por empresa)
y sube los datos a Supabase company_fundamentals.

Estructura esperada por pestaña:
  - Cols 0-4:  Historial de dividendos
  - Bloque 1 (col ~6):  Cuenta de resultados anual
  - Bloque 2 (col ~17): Cuenta de resultados trimestral
  - Bloque 3 (col ~29): Balance anual
  - Bloque 4 (col ~40): Balance trimestral
  - Bloque 5 (col ~52): Flujo de caja anual
  - Bloque 6 (col ~63): Flujo de caja trimestral

Uso:
  python import_investing.py --file datos.xlsx
  python import_investing.py --file datos.xlsx --dry-run   (sin subir a Supabase)
"""

import pandas as pd
import numpy as np
import json
import re
import argparse
import os
from datetime import datetime

from dotenv import load_dotenv
load_dotenv(".env.local")

# ── Configuración Supabase ─────────────────────────────────────────────────
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

# ── Diccionario de mapeo — etiqueta Investing.com → campo Supabase ─────────
FIELD_MAP = {
    # Cuenta de resultados
    "ingresos totales":                     "revenue",
    "total revenue":                         "revenue",
    "crecimiento de los ingresos totales":   "revenue_growth",
    "beneficio neto":                        "net_income",
    "net income":                            "net_income",
    "crecimiento del beneficio neto":        "net_income_growth",
    "ebitda":                                "ebitda",
    "ebit":                                  "ebit",
    "margen ebitda %":                       "ebitda_margin",
    "margen del beneficio neto %":           "net_margin",
    "margen neto":                           "net_income_value",
    "margen ebit %":                         "ebit_margin",
    "impuesto sobre la renta":               "tax_provision",
    "ebt excepto elementos no habituales":   "pretax_income",
    "ebt incluyendo las partidas inusuales": "pretax_income_total",
    "gastos de explotación totales":         "operating_expense",
    "bpa básico: crecimiento de actividades continuadas": "eps_basic",
    "bpa diluido: actividades continuadas":  "eps_diluted",
    "promedio ponderado básico de acciones en circulación":  "shares_basic",
    "promedio ponderado diluido de acciones en circulación": "shares_diluted",
    "dividendo por acción":                  "dps_year",
    "crecimiento del dividendo por acción":  "dps_growth",
    "i+d":                                   "research_development",
    "investigación y desarrollo":            "research_development",

    # Balance
    "activos totales":                       "total_assets",
    "total assets":                          "total_assets",
    "pasivos totales":                       "total_liabilities",
    "total liabilities":                     "total_liabilities",
    "patrimonio neto":                       "stockholders_equity",
    "total stockholders equity":             "stockholders_equity",
    "caja y equivalentes":                   "cash_and_equivalents",
    "cash and equivalents":                  "cash_and_equivalents",
    "deuda total":                           "total_debt",
    "total debt":                            "total_debt",
    "deuda a largo plazo":                   "long_term_debt",
    "long term debt":                        "long_term_debt",
    "deuda a corto plazo":                   "short_term_debt",
    "current debt":                          "short_term_debt",
    "inventario":                            "inventory",
    "inventory":                             "inventory",
    "fondo de comercio":                     "goodwill",
    "goodwill":                              "goodwill",
    "activos corrientes":                    "current_assets",
    "total current assets":                  "current_assets",
    "pasivo corriente":                      "current_liabilities",
    "total current liabilities":             "current_liabilities",
    "capital de trabajo":                    "working_capital",
    "working capital":                       "working_capital",
    "ganancias retenidas":                   "retained_earnings",
    "retained earnings":                     "retained_earnings",
    "inmovilizado material neto":            "net_ppe",
    "net ppe":                               "net_ppe",

    # Flujo de caja
    "caja generada por las operaciones":     "operating_cash_flow",
    "operating cash flow":                   "operating_cash_flow",
    "flujo de caja libre":                   "free_cash_flow",
    "free cash flow":                        "free_cash_flow",
    "capex":                                 "capex",
    "inversión en activos":                  "capex",
    "compra de inmovilizado":                "capex",
    "purchase of ppe":                       "capex",
    "dividendos pagados":                    "dividends_paid",
    "cash dividends paid":                   "dividends_paid",
    "recompra de acciones":                  "share_repurchases",
    "common stock payments":                 "share_repurchases",
    "amortización y depreciación":           "depreciation",
    "total de depreciación, agotamiento y amortización": "depreciation",
    "depreciación y amortización":           "depreciation",
    "emisión de deuda":                      "debt_issuance",
    "amortización de deuda":                 "debt_repayment",
    "variación de caja":                     "change_in_cash",
    "posición de caja final":                "ending_cash",
    "compensación en acciones":              "stock_compensation",
}

# ── Campos que se guardan como histórico (jsonb) ───────────────────────────
HISTORY_FIELDS = {
    "revenue":             "revenue_history",
    "net_income":          "net_income_history",
    "ebitda":              "ebitda_history",
    "operating_cash_flow": "ocf_history",
    "free_cash_flow":      "fcf_history",
    "total_assets":        "assets_history",
    "total_debt":          "debt_history",
    "stockholders_equity": "equity_history",
    "dps_year":            "dps_annual_history",
    "eps_diluted":         "eps_history",
}

# ── Campos que se guardan como valor único (más reciente) ──────────────────
SINGLE_FIELDS = {
    "net_margin":          "net_margin",
    "ebitda_margin":       "ebitda_margin",
    "ebit_margin":         "op_margin",
    "research_development":"research_development",
    "goodwill":            "goodwill",
    "total_assets":        "total_assets",
    "total_debt":          "total_debt",
    "current_assets":      "current_assets",
    "current_liabilities": "current_liabilities",
    "stockholders_equity": "stockholders_equity",
    "cash_and_equivalents":"cash",
    "working_capital":     "working_capital",
    "net_ppe":             "net_ppe",
    "operating_cash_flow": "operating_cash_flow",
    "free_cash_flow":      "free_cash_flow",
    "capex":               "capex",
    "shares_diluted":      "shares_outstanding_m",
    "eps_diluted":         "eps_diluted",
    "eps_basic":           "eps_basic",
}


def normalize_label(s):
    """Normaliza una etiqueta para buscar en FIELD_MAP."""
    s = str(s).lower().strip()
    s = re.sub(r'\s+', ' ', s)
    return s


def parse_value(v):
    """Convierte un valor de celda a float."""
    if pd.isna(v):
        return None
    s = str(v).strip().replace(',', '.').replace(' ', '')
    s = re.sub(r'[€$£¥%]', '', s)
    if s in ['-', '', 'nan', 'n/a', 'nd']:
        return None
    # Sufijos B/M/K
    m = re.match(r'^(-?\d+\.?\d*)(B|M|K)?$', s, re.IGNORECASE)
    if m:
        val = float(m.group(1))
        suffix = (m.group(2) or '').upper()
        if suffix == 'B':   val *= 1_000_000_000
        elif suffix == 'M': val *= 1_000_000
        elif suffix == 'K': val *= 1_000
        return val
    try:
        return float(s)
    except:
        return None


def find_blocks(df):
    """
    Encuentra todos los bloques financieros buscando 'Período terminado:'.
    Devuelve lista de (row, col) de cada bloque.
    """
    blocks = []
    for r in range(min(5, len(df))):
        for c in range(len(df.columns)):
            val = str(df.iloc[r, c])
            if 'Período terminado' in val or 'Period Ending' in val.title():
                blocks.append((r, c))
    return blocks


def parse_block(df, header_row, header_col, block_name):
    """
    Parsea un bloque financiero.
    Devuelve dict: {campo_supabase: {año: valor}}
    """
    label_col = header_col + 1
    data_start = header_col + 2

    # Extraer años de la fila de cabecera
    years = []
    seen_years = set()
    for c in range(data_start, min(data_start + 20, len(df.columns))):
        val = df.iloc[header_row, c]
        if pd.isna(val):
            break
        try:
            y = int(str(val).strip())
            if 2000 <= y <= 2035 and y not in seen_years:
                years.append((c, y))
                seen_years.add(y)
        except:
            pass

    if not years:
        return {}

    result = {}
    for r in range(header_row + 1, min(header_row + 100, len(df))):
        raw_label = df.iloc[r, label_col]
        if pd.isna(raw_label) or str(raw_label).strip() in ['', '-', 'nan']:
            continue
        label = normalize_label(raw_label)
        supabase_field = FIELD_MAP.get(label)
        if not supabase_field:
            # Búsqueda parcial
            for key, val in FIELD_MAP.items():
                if key in label or label in key:
                    supabase_field = val
                    break
        if not supabase_field:
            continue

        year_data = {}
        for c, y in years:
            v = parse_value(df.iloc[r, c])
            if v is not None:
                year_data[y] = v

        if year_data:
            is_growth = any(x in label for x in ['crecimiento','growth','margen ','margin '])
            is_absolute = supabase_field in ['revenue','net_income','ebitda','operating_cash_flow',
                'free_cash_flow','total_assets','total_debt','stockholders_equity','cash_and_equivalents']
            if is_growth and is_absolute:
                continue
            if supabase_field not in result:
                result[supabase_field] = {}
            existing = result[supabase_field]
            if len(year_data) >= len(existing):
                result[supabase_field].update(year_data)

    return result


def parse_dividends(df):
    """
    Extrae el historial de dividendos de las columnas 0-4.
    Devuelve dict {año: dps_total}
    """
    dividends = {}
    for r in range(1, len(df)):
        ex_date = df.iloc[r, 0]
        amount = df.iloc[r, 1]
        if pd.isna(ex_date) or pd.isna(amount):
            continue
        try:
            date_str = str(ex_date).strip()
            # Formatos: DD.MM.YYYY o YYYY-MM-DD
            if re.match(r'\d{2}\.\d{2}\.\d{4}', date_str):
                year = int(date_str.split('.')[2])
            elif re.match(r'\d{4}-\d{2}-\d{2}', date_str):
                year = int(date_str[:4])
            else:
                continue
            v = parse_value(amount)
            if v is not None:
                dividends[year] = dividends.get(year, 0) + v
        except:
            continue
    return dividends


def calculate_derived_metrics(data):
    """
    Calcula métricas derivadas: net_debt, current_ratio, revenue_cagr5, etc.
    """
    derived = {}

    # Deuda neta
    if "total_debt" in data and "cash" in data:
        debt = data["total_debt"]
        cash = data["cash"]
        if debt is not None and cash is not None:
            derived["net_debt"] = debt - cash

    # Ratio corriente
    if "current_assets" in data and "current_liabilities" in data:
        ca = data["current_assets"]
        cl = data["current_liabilities"]
        if ca is not None and cl is not None and cl != 0:
            derived["current_ratio"] = round(ca / cl, 2)

    # Revenue CAGR 5 años desde historial
    rev_hist = data.get("_revenue_hist", {})
    if rev_hist and len(rev_hist) >= 2:
        years_sorted = sorted(rev_hist.keys())
        if len(years_sorted) >= 2:
            y_end = years_sorted[-1]
            y_start = years_sorted[max(0, len(years_sorted)-6)]
            n = y_end - y_start
            if n > 0 and rev_hist[y_start] > 0:
                cagr = (rev_hist[y_end] / rev_hist[y_start]) ** (1/n) - 1
                derived["revenue_cagr5"] = round(cagr * 100, 2)

    # FCF CAGR 5 años
    fcf_hist = data.get("_fcf_hist", {})
    if fcf_hist and len(fcf_hist) >= 2:
        years_sorted = sorted([y for y, v in fcf_hist.items() if v > 0])
        if len(years_sorted) >= 2:
            y_end = years_sorted[-1]
            y_start = years_sorted[max(0, len(years_sorted)-6)]
            n = y_end - y_start
            if n > 0 and fcf_hist.get(y_start, 0) > 0:
                cagr = (fcf_hist[y_end] / fcf_hist[y_start]) ** (1/n) - 1
                derived["fcf_cagr5"] = round(cagr * 100, 2)

    # Deuda/EBITDA
    ebitda_hist = data.get("_ebitda_hist", {})
    if ebitda_hist and "net_debt" in derived:
        latest_ebitda = ebitda_hist.get(max(ebitda_hist.keys())) if ebitda_hist else None
        if latest_ebitda and latest_ebitda != 0:
            derived["net_debt_ebitda"] = round(derived["net_debt"] / latest_ebitda, 2)

    return derived


def process_sheet(df, ticker):
    """
    Procesa una pestaña completa y devuelve el registro para Supabase.
    """
    blocks = find_blocks(df)
    if not blocks:
        print(f"  ⚠ No se encontraron bloques financieros en {ticker}")
        return None

    # Identificar bloques por contenido (anual vs trimestral, y tipo)
    annual_blocks = []
    for br, bc in blocks:
        label_col = bc + 1
        # Ver primeras etiquetas para identificar tipo
        labels = []
        for r in range(br+1, min(br+5, len(df))):
            lbl = df.iloc[r, label_col]
            if pd.notna(lbl):
                labels.append(normalize_label(lbl))
        annual_blocks.append((br, bc, labels))

    # Parsear todos los bloques anuales
    all_data = {}
    block_names = ['income_annual', 'income_quarterly',
                   'balance_annual', 'balance_quarterly',
                   'cashflow_annual', 'cashflow_quarterly']

    for i, (br, bc, labels) in enumerate(annual_blocks[:6]):
        name = block_names[i] if i < len(block_names) else f'block_{i}'
        block_data = parse_block(df, br, bc, name)
        for field, year_data in block_data.items():
            if field not in all_data:
                all_data[field] = {}
            all_data[field].update(year_data)

    # Dividendos
    div_history = parse_dividends(df)

    # Construir registro Supabase
    record = {"ticker": ticker}

    # Históricos como jsonb
    for internal_field, supabase_hist_field in HISTORY_FIELDS.items():
        if internal_field in all_data:
            hist = {str(y): round(v, 4) for y, v in sorted(all_data[internal_field].items())}
            if hist:
                record[supabase_hist_field] = json.dumps(hist)

    # Almacenar historial para cálculos derivados
    calc_data = {}
    if "revenue" in all_data:     calc_data["_revenue_hist"] = all_data["revenue"]
    if "free_cash_flow" in all_data: calc_data["_fcf_hist"] = all_data["free_cash_flow"]
    if "ebitda" in all_data:       calc_data["_ebitda_hist"] = all_data["ebitda"]

    # Valores únicos (más reciente disponible)
    for internal_field, supabase_field in SINGLE_FIELDS.items():
        if internal_field in all_data:
            year_data = all_data[internal_field]
            if year_data:
                latest_year = max(year_data.keys())
                val = year_data[latest_year]
                if val is not None:
                    record[supabase_field] = round(val, 4)

    # Historial de dividendos
    if div_history:
        record["div_history"] = json.dumps(
            {str(y): round(v, 6) for y, v in sorted(div_history.items())}
        )
        # DPS año anterior (último año completo)
        current_year = datetime.now().year
        prev_years = [y for y in div_history.keys() if y < current_year]
        if prev_years:
            record["dps"] = round(div_history[max(prev_years)], 6)

    # Métricas derivadas
    for field, val in calculate_derived_metrics({**record, **calc_data}).items():
        if val is not None:
            record[field] = val

    # Campos de estados financieros completos (jsonb)
    for blk_idx, blk_name in enumerate(['income_statement_annual', 'income_statement_quarterly',
                                          'balance_sheet_annual', 'balance_sheet_quarterly',
                                          'cashflow_annual', 'cashflow_quarterly']):
        if blk_idx < len(annual_blocks):
            br, bc, _ = annual_blocks[blk_idx]
            raw_block = parse_block(df, br, bc, blk_name)
            if raw_block:
                # Convertir a formato {partida: {año: valor}}
                formatted = {}
                for field, year_data in raw_block.items():
                    formatted[field] = {str(y): v for y, v in sorted(year_data.items())}
                record[blk_name] = json.dumps(formatted)

    record["updated_at"] = datetime.now().isoformat()
    return record


def upload_to_supabase(records, dry_run=False):
    """Sube los registros a Supabase via upsert."""
    if dry_run:
        print("\n[DRY RUN] No se sube nada a Supabase")
        return

    try:
        from supabase import create_client
    except ImportError:
        print("⚠ supabase-py no instalado. Ejecuta: pip install supabase-py")
        return

    if not SUPABASE_URL or not SUPABASE_KEY:
        print("⚠ Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en variables de entorno")
        return

    client = create_client(SUPABASE_URL, SUPABASE_KEY)
    ok = 0
    for rec in records:
        try:
            client.table("company_fundamentals").upsert(
                rec, on_conflict="ticker"
            ).execute()
            ok += 1
        except Exception as e:
            print(f"  ✗ Error subiendo {rec.get('ticker')}: {e}")
    print(f"\n✓ {ok}/{len(records)} empresas subidas a Supabase")


def main():
    parser = argparse.ArgumentParser(description="Importa datos de Investing.com Excel a Supabase")
    parser.add_argument("--file", required=True, help="Ruta al fichero Excel")
    parser.add_argument("--dry-run", action="store_true", help="Solo parsear, no subir a Supabase")
    parser.add_argument("--ticker", help="Procesar solo esta pestaña/ticker")
    args = parser.parse_args()

    if not os.path.exists(args.file):
        print(f"✗ Fichero no encontrado: {args.file}")
        return

    xl = pd.ExcelFile(args.file)
    sheets = [s for s in xl.sheet_names if not args.ticker or s == args.ticker]
    print(f"Procesando {len(sheets)} empresa(s) de {args.file}\n")

    records = []
    for sheet in sheets:
        print(f"→ {sheet}")
        df = pd.read_excel(args.file, sheet_name=sheet, header=None)
        record = process_sheet(df, sheet)
        if record:
            # Mostrar resumen
            fields_found = [k for k in record.keys() if k not in ('ticker', 'updated_at')]
            print(f"  ✓ {len(fields_found)} campos extraídos: {', '.join(fields_found[:8])}{'...' if len(fields_found)>8 else ''}")
            records.append(record)
        else:
            print(f"  ✗ Sin datos")

    print(f"\nResumen: {len(records)}/{len(sheets)} empresas procesadas correctamente")

    if records:
        if args.dry_run:
            print("\n=== EJEMPLO DE REGISTRO (primer ticker) ===")
            rec = records[0].copy()
            # Truncar jsonb para mostrar
            for k, v in rec.items():
                if isinstance(v, str) and len(v) > 100:
                    rec[k] = v[:100] + "..."
            for k, v in rec.items():
                print(f"  {k}: {v}")
        else:
            upload_to_supabase(records, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
