"""
update_funds.py
---------------
Descarga y actualiza datos de ETFs y fondos de inversión en Supabase.
Usa cascada de fuentes: yfinance → OpenFigi → JustETF / ETF.com / CNMV / Morningstar

Uso:
  python update_funds.py                     # Actualiza todos los fondos en Supabase
  python update_funds.py --ticker SCHD       # Solo un ticker
  python update_funds.py --ticker IE0031442068 # Por ISIN
  python update_funds.py --dry-run           # Sin subir a Supabase
"""

import os, re, time, json, argparse, logging
from datetime import datetime, date
from typing import Optional

import requests
import yfinance as yf
from bs4 import BeautifulSoup

from dotenv import load_dotenv
load_dotenv(".env.local")

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

# ── Configuración ──────────────────────────────────────────────────────────
SUPABASE_URL     = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY     = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
OPENFIGI_API_KEY = os.environ.get("OPENFIGI_API_KEY", "")

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

# ── Helpers ────────────────────────────────────────────────────────────────
def safe_float(v, default=None):
    try:
        f = float(str(v).replace(",", ".").replace("%", "").strip())
        return None if (f != f) else f  # NaN check
    except:
        return default

def detect_type(ticker: str, isin: str = "") -> str:
    """Detecta si es ETF o fondo basándose en ticker e ISIN."""
    t = ticker.upper()
    # Tickers con sufijos de bolsa suelen ser ETFs
    if re.search(r'\.(L|AS|DE|PA|SW|MI|MC|CO|ST|HE|BR|LS|OL|AX|TO|HK|T)$', t):
        return "etf"
    # Sin sufijo y cortos suelen ser ETFs americanos
    if re.match(r'^[A-Z]{2,5}$', t):
        return "etf"
    # ISIN específicos de fondos
    if isin:
        # Fondos luxemburgueses y irlandeses suelen ser fondos o ETFs
        if isin[:2] in ["LU", "IE", "ES", "FR", "DE", "GB"]:
            return "fund"
    return "etf"

def detect_country(ticker: str, isin: str = "") -> str:
    """Detecta el país del instrumento."""
    suffix_map = {
        ".L": "GB", ".AS": "NL", ".DE": "DE", ".PA": "FR", ".SW": "CH",
        ".MI": "IT", ".MC": "ES", ".CO": "DK", ".ST": "SE", ".HE": "FI",
        ".BR": "BE", ".LS": "PT", ".OL": "NO", ".AX": "AU", ".TO": "CA",
        ".HK": "HK", ".T": "JP",
    }
    for suffix, country in suffix_map.items():
        if ticker.upper().endswith(suffix):
            return country
    if isin and len(isin) >= 2:
        return isin[:2]
    return "US"


# ══════════════════════════════════════════════════════════════════════════
# FUENTE 1 — yfinance
# ══════════════════════════════════════════════════════════════════════════
def fetch_yfinance(ticker: str) -> dict:
    log.info(f"[yfinance] {ticker}")
    try:
        t = yf.Ticker(ticker)
        info = t.info or {}

        result = {
            "name":          info.get("longName") or info.get("shortName"),
            "current_price": safe_float(info.get("regularMarketPrice") or info.get("previousClose")),
            "currency":      info.get("currency"),
            "ter":           safe_float(info.get("annualReportExpenseRatio")),
            "category":      info.get("category"),
            "manager":       info.get("fundFamily"),
            "beta":          safe_float(info.get("beta3Year") or info.get("beta")),
            "isin":          info.get("isin"),
            "benchmark":     info.get("benchmarkTicker"),
            "nav":           safe_float(info.get("navPrice")),
            "total_assets":  safe_float(info.get("totalAssets")),
        }

        # Distribuciones históricas
        try:
            divs = t.dividends
            if divs is not None and len(divs) > 0:
                dist_hist = {}
                for dt, amt in divs.items():
                    year = str(dt.year)
                    dist_hist[year] = round(dist_hist.get(year, 0) + float(amt), 6)
                result["distribution_history"] = json.dumps(dist_hist)
                # Yield TTM
                if result["current_price"] and result["current_price"] > 0:
                    ttm = sum(float(v) for k, v in divs.items()
                              if dt.year >= datetime.now().year - 1)
                    result["yield_ttm"] = round(ttm / result["current_price"] * 100, 4)
        except:
            pass

        # Historial de precios últimos 3 años
        try:
            hist = t.history(period="3y")
            if hist is not None and len(hist) > 0:
                price_hist = {
                    str(dt.date()): round(float(close), 4)
                    for dt, close in hist["Close"].items()
                    if not (close != close)  # skip NaN
                }
                # Guardar solo último precio de cada mes para no inflar
                monthly = {}
                for d_str, price in sorted(price_hist.items()):
                    month_key = d_str[:7]
                    monthly[month_key] = price
                result["price_history"] = json.dumps(monthly)
        except:
            pass

        # Rentabilidades
        extra = {}
        for key, label in [
            ("threeYearAverageReturn", "return_3y"),
            ("fiveYearAverageReturn",  "return_5y"),
            ("ytdReturn",              "return_ytd"),
            ("oneYearTotalReturn",     "return_1y"),
        ]:
            v = safe_float(info.get(key))
            if v is not None:
                extra[label] = round(v * 100, 2)

        if extra:
            result["extra_data"] = json.dumps(extra)

        return {k: v for k, v in result.items() if v is not None}
    except Exception as e:
        log.warning(f"[yfinance] Error en {ticker}: {e}")
        return {}


# ══════════════════════════════════════════════════════════════════════════
# FUENTE 2 — OpenFigi (ticker → ISIN + metadata)
# ══════════════════════════════════════════════════════════════════════════
def fetch_openfigi(ticker: str) -> dict:
    log.info(f"[OpenFigi] {ticker}")
    if not OPENFIGI_API_KEY:
        log.warning("[OpenFigi] Sin API key — saltando")
        return {}
    try:
        # Detectar exchange code según sufijo
        exchange_map = {
            ".L": "LN", ".AS": "NA", ".DE": "GY", ".PA": "FP",
            ".SW": "SW", ".MI": "IM", ".MC": "SM", ".CO": "DC",
            ".ST": "SS", ".HE": "FH", ".BR": "BB", ".LS": "PL",
            ".OL": "NO", ".AX": "AT", ".TO": "CT", ".HK": "HK",
        }
        ticker_base = ticker
        exchange_code = "US"
        for suffix, ex in exchange_map.items():
            if ticker.upper().endswith(suffix):
                ticker_base = ticker[:-(len(suffix))]
                exchange_code = ex
                break

        payload = [{"idType": "TICKER", "idValue": ticker_base,
                    "exchCode": exchange_code}]
        headers = {"Content-Type": "application/json",
                   "X-OPENFIGI-APIKEY": OPENFIGI_API_KEY}
        r = requests.post("https://api.openfigi.com/v3/mapping",
                         json=payload, headers=headers, timeout=10)
        if r.status_code != 200:
            return {}

        data = r.json()
        if not data or not data[0].get("data"):
            return {}

        item = data[0]["data"][0]
        result = {}
        if item.get("name"):
            result["name"] = item["name"]
        if item.get("isin"):
            result["isin"] = item["isin"]
        if item.get("securityType"):
            st = item["securityType"].lower()
            if "etf" in st or "exchange" in st:
                result["asset_type"] = "etf"
            elif "fund" in st or "fondo" in st:
                result["asset_type"] = "fund"
        return result
    except Exception as e:
        log.warning(f"[OpenFigi] Error: {e}")
        return {}


# ══════════════════════════════════════════════════════════════════════════
# FUENTE 3 — JustETF (ETFs europeos por ISIN)
# ══════════════════════════════════════════════════════════════════════════
def fetch_justetf(isin: str) -> dict:
    if not isin:
        return {}
    log.info(f"[JustETF] {isin}")
    try:
        url = f"https://www.justetf.com/es/etf-profile.html?isin={isin}"
        r = requests.get(url, headers=HEADERS, timeout=15)
        if r.status_code != 200:
            return {}
        soup = BeautifulSoup(r.text, "html.parser")

        result = {}

        # Nombre
        h1 = soup.find("h1", class_="h1")
        if h1:
            result["name"] = h1.get_text(strip=True)

        # TER
        for label in soup.find_all(class_=re.compile("label")):
            text = label.get_text(strip=True).lower()
            if "ter" in text or "gastos" in text or "coste" in text:
                val_el = label.find_next(class_=re.compile("val|value"))
                if val_el:
                    v = safe_float(val_el.get_text(strip=True).replace("%", ""))
                    if v is not None:
                        result["ter"] = round(v / 100 if v > 1 else v, 4)

        # Datos de la ficha — buscar en tabla de características
        rows = soup.find_all("tr")
        for row in rows:
            cells = row.find_all("td")
            if len(cells) >= 2:
                label = cells[0].get_text(strip=True).lower()
                value = cells[1].get_text(strip=True)
                if "ter" in label or "gastos corrientes" in label:
                    v = safe_float(value.replace("%", ""))
                    if v: result["ter"] = round(v/100 if v>1 else v, 4)
                elif "réplica" in label or "replica" in label or "replication" in label:
                    result["extra_data"] = result.get("extra_data", {})
                    if isinstance(result["extra_data"], str):
                        result["extra_data"] = json.loads(result["extra_data"])
                    result["extra_data"]["replication"] = value
                elif "distribución" in label or "distribucion" in label:
                    result["extra_data"] = result.get("extra_data", {})
                    if isinstance(result["extra_data"], str):
                        result["extra_data"] = json.loads(result["extra_data"])
                    result["extra_data"]["distribution_policy"] = value
                elif "lanzamiento" in label or "inception" in label:
                    result["extra_data"] = result.get("extra_data", {})
                    if isinstance(result["extra_data"], str):
                        result["extra_data"] = json.loads(result["extra_data"])
                    result["extra_data"]["inception_date"] = value
                elif "índice" in label or "benchmark" in label or "indice" in label:
                    result["benchmark"] = value
                elif "gestora" in label or "emisor" in label or "issuer" in label:
                    result["manager"] = value

        # Holdings top 10
        holdings = []
        holdings_table = soup.find("table", class_=re.compile("holdings|constituents"))
        if holdings_table:
            for row in holdings_table.find_all("tr")[1:11]:
                cells = row.find_all("td")
                if len(cells) >= 2:
                    name = cells[0].get_text(strip=True)
                    weight = safe_float(cells[-1].get_text(strip=True).replace("%", ""))
                    if name and weight:
                        holdings.append({"name": name, "weight": weight})
        if holdings:
            if "extra_data" not in result:
                result["extra_data"] = {}
            if isinstance(result["extra_data"], str):
                result["extra_data"] = json.loads(result["extra_data"])
            result["extra_data"]["top_holdings"] = holdings

        # Serializar extra_data
        if "extra_data" in result and isinstance(result["extra_data"], dict):
            result["extra_data"] = json.dumps(result["extra_data"])

        time.sleep(1)
        return {k: v for k, v in result.items() if v is not None}
    except Exception as e:
        log.warning(f"[JustETF] Error: {e}")
        return {}


# ══════════════════════════════════════════════════════════════════════════
# FUENTE 4 — ETF.com (ETFs americanos)
# ══════════════════════════════════════════════════════════════════════════
def fetch_etfcom(ticker: str) -> dict:
    log.info(f"[ETF.com] {ticker}")
    try:
        ticker_base = ticker.split(".")[0].upper()
        url = f"https://www.etf.com/{ticker_base}"
        r = requests.get(url, headers=HEADERS, timeout=15)
        if r.status_code != 200:
            return {}
        soup = BeautifulSoup(r.text, "html.parser")

        result = {}

        # Buscar TER / Expense Ratio
        for el in soup.find_all(string=re.compile(r"Expense Ratio|expense ratio")):
            parent = el.parent
            if parent:
                nxt = parent.find_next(class_=re.compile("value|val|data"))
                if nxt:
                    v = safe_float(nxt.get_text(strip=True).replace("%", ""))
                    if v: result["ter"] = round(v/100 if v>1 else v, 4)
                    break

        # Buscar en tablas
        for row in soup.find_all("tr"):
            cells = row.find_all("td")
            if len(cells) >= 2:
                label = cells[0].get_text(strip=True).lower()
                value = cells[1].get_text(strip=True)
                extra = {}
                if "expense ratio" in label:
                    v = safe_float(value.replace("%", ""))
                    if v: result["ter"] = round(v/100 if v>1 else v, 4)
                elif "index" in label or "benchmark" in label:
                    result["benchmark"] = value
                elif "issuer" in label or "provider" in label:
                    result["manager"] = value
                elif "aum" in label or "assets" in label:
                    v = safe_float(re.sub(r'[^\d.]', '', value))
                    if v:
                        extra["aum"] = v
                elif "dividend" in label and "yield" in label:
                    v = safe_float(value.replace("%", ""))
                    if v: result["yield_ttm"] = v
                elif "inception" in label:
                    extra["inception_date"] = value
                elif "holdings" in label and "number" in label:
                    v = safe_float(value.replace(",", ""))
                    if v: extra["num_holdings"] = int(v)

                if extra:
                    if "extra_data" not in result:
                        result["extra_data"] = {}
                    if isinstance(result.get("extra_data"), str):
                        result["extra_data"] = json.loads(result["extra_data"])
                    result["extra_data"].update(extra)

        # Holdings
        holdings = []
        for table in soup.find_all("table"):
            headers = [th.get_text(strip=True).lower() for th in table.find_all("th")]
            if any("holding" in h or "weight" in h for h in headers):
                for row in table.find_all("tr")[1:11]:
                    cells = row.find_all("td")
                    if len(cells) >= 2:
                        name = cells[0].get_text(strip=True)
                        weight = safe_float(cells[-1].get_text(strip=True).replace("%", ""))
                        if name and weight:
                            holdings.append({"name": name, "weight": weight})
                break

        if holdings:
            if "extra_data" not in result:
                result["extra_data"] = {}
            if isinstance(result.get("extra_data"), str):
                result["extra_data"] = json.loads(result["extra_data"])
            result["extra_data"]["top_holdings"] = holdings

        if "extra_data" in result and isinstance(result["extra_data"], dict):
            result["extra_data"] = json.dumps(result["extra_data"])

        time.sleep(1)
        return {k: v for k, v in result.items() if v is not None}
    except Exception as e:
        log.warning(f"[ETF.com] Error: {e}")
        return {}


# ══════════════════════════════════════════════════════════════════════════
# FUENTE 5 — CNMV (fondos españoles por ISIN)
# ══════════════════════════════════════════════════════════════════════════
def fetch_cnmv(isin: str) -> dict:
    if not isin or not isin.startswith("ES"):
        return {}
    log.info(f"[CNMV] {isin}")
    try:
        # API pública de la CNMV
        url = f"https://www.cnmv.es/portal/Consultas/IIC/Fondo.aspx?isin={isin}"
        r = requests.get(url, headers=HEADERS, timeout=15)
        if r.status_code != 200:
            return {}
        soup = BeautifulSoup(r.text, "html.parser")

        result = {"asset_type": "fund", "country": "ES", "currency": "EUR"}

        # Nombre
        title = soup.find("h1") or soup.find("h2")
        if title:
            result["name"] = title.get_text(strip=True)

        # Buscar datos en tablas
        extra = {}
        for row in soup.find_all("tr"):
            cells = row.find_all("td")
            if len(cells) >= 2:
                label = cells[0].get_text(strip=True).lower()
                value = cells[1].get_text(strip=True)
                if "valor liquidativo" in label or "nav" in label:
                    v = safe_float(value.replace("€", "").replace(",", "."))
                    if v: result["current_price"] = v
                elif "comisión de gestión" in label or "ter" in label or "gastos" in label:
                    v = safe_float(value.replace("%", "").replace(",", "."))
                    if v: result["ter"] = round(v/100 if v>1 else v, 4)
                elif "gestora" in label or "sociedad gestora" in label:
                    result["manager"] = value
                elif "categoría" in label or "tipo de fondo" in label:
                    result["category"] = value
                elif "patrimonio" in label:
                    v = safe_float(re.sub(r'[^\d.]', '', value.replace(".", "").replace(",", ".")))
                    if v: extra["patrimonio_m"] = round(v / 1_000_000, 2)
                elif "partícipes" in label or "participes" in label:
                    v = safe_float(value.replace(".", "").replace(",", ""))
                    if v: extra["participes"] = int(v)
                elif "fecha de constitución" in label or "lanzamiento" in label:
                    extra["inception_date"] = value

        # Intentar obtener valor liquidativo actual via API JSON de CNMV
        try:
            api_url = f"https://www.cnmv.es/portal/Alerta/Fondos/BusquedaFondos.aspx"
            params = {"isin": isin, "tipo": "FI"}
            rj = requests.get(
                f"https://www.cnmv.es/portal/FondosInversion/Datos.aspx?isin={isin}",
                headers=HEADERS, timeout=10)
            if rj.status_code == 200:
                soup2 = BeautifulSoup(rj.text, "html.parser")
                for span in soup2.find_all(["span", "td"]):
                    text = span.get_text(strip=True)
                    if re.match(r'^\d+[.,]\d+$', text):
                        v = safe_float(text)
                        if v and v > 0.1:
                            result["current_price"] = v
                            break
        except:
            pass

        if extra:
            result["extra_data"] = json.dumps(extra)

        time.sleep(1)
        return {k: v for k, v in result.items() if v is not None}
    except Exception as e:
        log.warning(f"[CNMV] Error: {e}")
        return {}


# ══════════════════════════════════════════════════════════════════════════
# FUENTE 6 — Morningstar (fallback universal)
# ══════════════════════════════════════════════════════════════════════════
def fetch_morningstar(isin: str, ticker: str = "") -> dict:
    if not isin and not ticker:
        return {}
    log.info(f"[Morningstar] {isin or ticker}")
    try:
        # Endpoint de búsqueda de Morningstar
        search_term = isin or ticker.split(".")[0]
        url = (f"https://www.morningstar.es/es/funds/SecuritySearchResults.aspx"
               f"?search={search_term}&type=fund")
        r = requests.get(url, headers=HEADERS, timeout=15)
        if r.status_code != 200:
            return {}
        soup = BeautifulSoup(r.text, "html.parser")

        result = {}
        extra = {}

        # Buscar en tabla de resultados
        table = soup.find("table", class_=re.compile("search|results|fund"))
        if table:
            rows = table.find_all("tr")[1:2]  # Solo primer resultado
            for row in rows:
                cells = row.find_all("td")
                if cells:
                    link = cells[0].find("a")
                    if link:
                        result["name"] = link.get_text(strip=True)
                        href = link.get("href", "")
                        # Navegar a la ficha del fondo
                        if href:
                            fund_url = ("https://www.morningstar.es" + href
                                       if href.startswith("/") else href)
                            rf = requests.get(fund_url, headers=HEADERS, timeout=15)
                            if rf.status_code == 200:
                                soup_f = BeautifulSoup(rf.text, "html.parser")
                                # TER
                                for el in soup_f.find_all(
                                    string=re.compile(r"Gastos corrientes|TER|Expense")):
                                    nxt = el.parent.find_next(
                                        class_=re.compile("val|value|data"))
                                    if nxt:
                                        v = safe_float(
                                            nxt.get_text(strip=True).replace("%",""))
                                        if v:
                                            result["ter"] = round(
                                                v/100 if v > 1 else v, 4)
                                        break
                                # Categoría
                                for el in soup_f.find_all(
                                    string=re.compile(r"Categoría|Category")):
                                    nxt = el.parent.find_next(
                                        class_=re.compile("val|value|data"))
                                    if nxt:
                                        result["category"] = nxt.get_text(strip=True)
                                        break
                                # Rentabilidades
                                for period, label in [
                                    ("1Y","return_1y"),("3Y","return_3y"),("5Y","return_5y")]:
                                    for el in soup_f.find_all(
                                        string=re.compile(period + r"\s|" + period + "$")):
                                        nxt = el.parent.find_next(
                                            class_=re.compile("val|return|perf"))
                                        if nxt:
                                            v = safe_float(
                                                nxt.get_text(strip=True).replace("%",""))
                                            if v: extra[label] = v
                                            break

        if extra:
            result["extra_data"] = json.dumps(extra)

        time.sleep(1.5)
        return {k: v for k, v in result.items() if v is not None}
    except Exception as e:
        log.warning(f"[Morningstar] Error: {e}")
        return {}


# ══════════════════════════════════════════════════════════════════════════
# ORQUESTADOR PRINCIPAL — cascada de fuentes
# ══════════════════════════════════════════════════════════════════════════
def fetch_fund_data(ticker: str) -> dict:
    """
    Descarga datos de un ETF o fondo usando cascada de fuentes.
    Devuelve registro completo para Supabase.
    """
    log.info(f"\n{'='*50}\nProcesando: {ticker}\n{'='*50}")
    result = {"ticker": ticker, "asset_type": detect_type(ticker)}

    # 1. yfinance — siempre primero
    yf_data = fetch_yfinance(ticker)
    result.update(yf_data)
    time.sleep(0.5)

    # 2. OpenFigi — obtener ISIN y confirmar tipo
    figi_data = fetch_openfigi(ticker)
    if figi_data:
        # Solo actualizar campos vacíos
        for k, v in figi_data.items():
            if k not in result or not result[k]:
                result[k] = v
    time.sleep(0.3)

    isin = result.get("isin", "")
    country = detect_country(ticker, isin)
    result["country"] = result.get("country") or country

    # 3. Fuente específica según origen
    is_european = any(ticker.upper().endswith(s) for s in
                     [".L",".AS",".DE",".PA",".SW",".MI",".MC",
                      ".CO",".ST",".HE",".BR",".LS",".OL"])
    is_american = re.match(r'^[A-Z]{2,5}$', ticker.upper())
    is_spanish_fund = isin.startswith("ES") and result.get("asset_type") == "fund"
    is_lu_ie_fund = (isin.startswith("LU") or isin.startswith("IE")) and \
                    result.get("asset_type") == "fund"

    if is_european and isin:
        log.info("→ Usando JustETF")
        source_data = fetch_justetf(isin)
        for k, v in source_data.items():
            if k not in result or not result[k]:
                result[k] = v

    elif is_american:
        log.info("→ Usando ETF.com")
        source_data = fetch_etfcom(ticker)
        for k, v in source_data.items():
            if k not in result or not result[k]:
                result[k] = v

    elif is_spanish_fund:
        log.info("→ Usando CNMV")
        source_data = fetch_cnmv(isin)
        for k, v in source_data.items():
            if k not in result or not result[k]:
                result[k] = v

    # 4. Morningstar como fallback si faltan datos clave
    missing_key_fields = not result.get("ter") or not result.get("category")
    if missing_key_fields and (is_lu_ie_fund or (isin and not result.get("ter"))):
        log.info("→ Usando Morningstar como fallback")
        ms_data = fetch_morningstar(isin, ticker)
        for k, v in ms_data.items():
            if k not in result or not result[k]:
                result[k] = v

    # 5. Consolidar extra_data (puede haber varios JSONs de diferentes fuentes)
    extra_parts = []
    for k in list(result.keys()):
        if k == "extra_data" and result[k]:
            try:
                d = json.loads(result[k]) if isinstance(result[k], str) else result[k]
                extra_parts.append(d)
            except:
                pass
    if extra_parts:
        merged_extra = {}
        for part in extra_parts:
            merged_extra.update(part)
        result["extra_data"] = json.dumps(merged_extra)

    result["updated_at"] = datetime.now().isoformat()

    # Resumen de campos obtenidos
    fields = [k for k, v in result.items() if v and k not in ("ticker","updated_at")]
    log.info(f"✓ {len(fields)} campos obtenidos: {', '.join(fields[:10])}"
             f"{'...' if len(fields)>10 else ''}")

    return result


# ══════════════════════════════════════════════════════════════════════════
# SUPABASE
# ══════════════════════════════════════════════════════════════════════════
def get_supabase_tickers() -> list:
    """Obtiene todos los tickers de fondos/ETFs en Supabase."""
    if not SUPABASE_URL or not SUPABASE_KEY:
        return []
    try:
        from supabase import create_client
        client = create_client(SUPABASE_URL, SUPABASE_KEY)
        r = client.table("funds").select("ticker").execute()
        return [row["ticker"] for row in (r.data or [])]
    except Exception as e:
        log.error(f"Error obteniendo tickers de Supabase: {e}")
        return []


def upsert_supabase(record: dict) -> bool:
    """Sube un registro a Supabase."""
    if not SUPABASE_URL or not SUPABASE_KEY:
        return False
    try:
        from supabase import create_client
        client = create_client(SUPABASE_URL, SUPABASE_KEY)
        client.table("funds").upsert(record, on_conflict="ticker").execute()
        return True
    except Exception as e:
        log.error(f"Error en upsert {record.get('ticker')}: {e}")
        return False


def log_to_supabase(tickers_ok: list, tickers_fail: list):
    """Registra el resultado del run en admin_logs."""
    if not SUPABASE_URL or not SUPABASE_KEY:
        return
    try:
        from supabase import create_client
        client = create_client(SUPABASE_URL, SUPABASE_KEY)
        client.table("admin_logs").insert({
            "event_type": "funds_update",
            "description": f"{len(tickers_ok)} ETFs/fondos actualizados, {len(tickers_fail)} fallidos",
            "details": json.dumps({
                "updated": tickers_ok,
                "failed": tickers_fail
            }),
            "status": "ok" if not tickers_fail else "partial",
            "created_at": datetime.now().isoformat()
        }).execute()
    except Exception as e:
        log.warning(f"No se pudo registrar en admin_logs: {e}")


# ══════════════════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════════════════
def main():
    parser = argparse.ArgumentParser(description="Actualiza ETFs y fondos en Supabase")
    parser.add_argument("--ticker",   help="Procesar solo este ticker o ISIN")
    parser.add_argument("--dry-run",  action="store_true", help="Sin subir a Supabase")
    parser.add_argument("--delay",    type=float, default=2.0,
                        help="Segundos entre tickers (default 2)")
    args = parser.parse_args()

    if args.ticker:
        tickers = [args.ticker]
    else:
        tickers = get_supabase_tickers()
        if not tickers:
            log.warning("No hay tickers en Supabase. Usa --ticker XXXX para probar.")
            return

    log.info(f"Procesando {len(tickers)} ETF(s)/fondo(s)")

    ok, fail = [], []
    for i, ticker in enumerate(tickers):
        log.info(f"\n[{i+1}/{len(tickers)}]")
        try:
            record = fetch_fund_data(ticker)
            if args.dry_run:
                print(f"\n{'─'*40}")
                print(f"Ticker: {record['ticker']}")
                for k, v in record.items():
                    if k != "ticker" and v:
                        val_str = str(v)[:80] + ("..." if len(str(v)) > 80 else "")
                        print(f"  {k}: {val_str}")
            else:
                if upsert_supabase(record):
                    ok.append(ticker)
                else:
                    fail.append(ticker)
        except Exception as e:
            log.error(f"Error procesando {ticker}: {e}")
            fail.append(ticker)

        if i < len(tickers) - 1:
            time.sleep(args.delay)

    print(f"\n{'='*50}")
    print(f"✓ OK: {len(ok)} | ✗ Fallidos: {len(fail)}")
    if fail:
        print(f"Fallidos: {fail}")

    if not args.dry_run:
        log_to_supabase(ok, fail)


if __name__ == "__main__":
    main()
