"""
update_index_components.py
--------------------------
Descarga la composición de 46 índices bursátiles, mapea los tickers
al formato de yfinance y actualiza el DICT de la app en Supabase.

Flujo por índice:
  1. Obtener componentes desde Wikipedia u otras fuentes
  2. Mapear ticker local → ticker yfinance con sufijo
  3. Verificar que yfinance reconoce el ticker
  4. Si falla: buscar por nombre en OpenFigi
  5. Actualizar tabla index_components en Supabase
  6. Detectar entradas y salidas vs trimestre anterior
  7. Añadir empresas nuevas al DICT (company_fundamentals)

Uso:
  python update_index_components.py              # Todos los índices
  python update_index_components.py --index IBEX # Solo un índice
  python update_index_components.py --dry-run    # Sin guardar en Supabase
  python update_index_components.py --init       # Primera carga completa
"""

import os, re, json, time, logging, argparse
from datetime import datetime, date
from typing import Optional

import requests
import pandas as pd
import yfinance as yf
from bs4 import BeautifulSoup

from dotenv import load_dotenv
load_dotenv(".env.local")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s"
)
log = logging.getLogger(__name__)

SUPABASE_URL     = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY     = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
OPENFIGI_API_KEY = os.environ.get("OPENFIGI_API_KEY", "")

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
}

# ── Sufijos yfinance por mercado ───────────────────────────────────────────
SUFFIX_MAP = {
    "^IBEX":      ".MC",   # España
    "^IBEXM":     ".MC",   # IBEX Medium Cap
    "^IBEXSC":    ".MC",   # IBEX Small Cap
    "^FTSE":      ".L",    # UK FTSE 100
    "^FTMC":      ".L",    # UK FTSE 250
    "^GDAXI":     ".DE",   # Alemania
    "^FCHI":      ".PA",   # Francia
    "^AEX":       ".AS",   # Países Bajos
    "^SSMI":      ".SW",   # Suiza
    "^FTSEMIB":   ".MI",   # Italia
    "^BFX":       ".BR",   # Bélgica
    "^OMXH25":    ".HE",   # Finlandia
    "^OMXS30":    ".ST",   # Suecia
    "^OMXC20":    ".CO",   # Dinamarca
    "OBX.OL":     ".OL",   # Noruega
    "^ATX":       ".VI",   # Austria
    "^ISEQ":      ".IR",   # Irlanda
    "PSI20.LS":   ".LS",   # Portugal
    "WIG20.WA":   ".WA",   # Polonia
    "^BUX":       ".BD",   # Hungría
    "^PX":        ".PR",   # Rep. Checa
    "XU100.IS":   ".IS",   # Turquía
    "^STOXX50E":  "",      # EuroStoxx 50 — mix de sufijos europeos
    "^STOXX600":  "",      # STOXX 600 — mix de sufijos europeos
    "^GSPC":      "",      # S&P 500 — sin sufijo
    "^IXIC":      "",      # Nasdaq — sin sufijo
    "^NDX":       "",      # Nasdaq 100 — sin sufijo
    "^DJI":       "",      # Dow Jones — sin sufijo
    "^RUT":       "",      # Russell 2000 — sin sufijo
    "^MID":       "",      # S&P 400 MidCap — sin sufijo
    "^GSPTSE":    ".TO",   # Canadá
    "^BVSP":      ".SA",   # Brasil
    "^MXX":       ".MX",   # México
    "^MERV":      ".BA",   # Argentina
    "^IPSA":      ".SN",   # Chile
    "^N225":      ".T",    # Japón Nikkei
    "TOPIX100.T": ".T",    # TOPIX
    "^HSI":       ".HK",   # Hong Kong
    "000001.SS":  ".SS",   # Shanghai
    "000300.SS":  ".SS",   # CSI 300
    "^BSESN":     ".BO",   # India SENSEX
    "^NSEI":      ".NS",   # India Nifty
    "^KS11":      ".KS",   # Corea
    "^AXJO":      ".AX",   # Australia
    "^STI":       ".SI",   # Singapur
    "^JN0U.JO":   ".JO",   # Sudáfrica JSE
    "URTH":       "",      # MSCI World ETF — sin sufijo
    "EEM":        "",      # MSCI Emerging — sin sufijo
}

# ── Definición de los 46 índices ───────────────────────────────────────────
INDICES = [
    # EEUU
    {"id": "SP500",     "name": "S&P 500",          "ticker": "^GSPC",     "country": "US", "region": "América",      "source": "wikipedia", "wiki_url": "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies", "wiki_table": 0,  "ticker_col": "Symbol"},
    {"id": "NASDAQ100", "name": "Nasdaq 100",        "ticker": "^NDX",      "country": "US", "region": "América",      "source": "wikipedia", "wiki_url": "https://en.wikipedia.org/wiki/Nasdaq-100", "wiki_table": 4, "ticker_col": "Ticker"},
    {"id": "DOW",       "name": "Dow Jones",         "ticker": "^DJI",      "country": "US", "region": "América",      "source": "wikipedia", "wiki_url": "https://en.wikipedia.org/wiki/Dow_Jones_Industrial_Average", "wiki_table": 1, "ticker_col": "Symbol"},
    {"id": "SP400",     "name": "S&P 400 MidCap",    "ticker": "^MID",      "country": "US", "region": "América",      "source": "wikipedia", "wiki_url": "https://en.wikipedia.org/wiki/List_of_S%26P_400_companies", "wiki_table": 0, "ticker_col": "Ticker symbol"},
    {"id": "NASDAQ",    "name": "Nasdaq Composite",  "ticker": "^IXIC",     "country": "US", "region": "América",      "source": "etf",       "etf_ticker": "QQQ"},
    {"id": "RUSSELL",   "name": "Russell 2000",      "ticker": "^RUT",      "country": "US", "region": "América",      "source": "etf",       "etf_ticker": "IWM"},
    # Europa UK
    {"id": "FTSE100",   "name": "FTSE 100",          "ticker": "^FTSE",     "country": "GB", "region": "Europa",       "source": "wikipedia", "wiki_url": "https://en.wikipedia.org/wiki/FTSE_100_Index", "wiki_table": 3, "ticker_col": "Ticker"},
    {"id": "FTSE250",   "name": "FTSE 250",          "ticker": "^FTMC",     "country": "GB", "region": "Europa",       "source": "wikipedia", "wiki_url": "https://en.wikipedia.org/wiki/FTSE_250_Index", "wiki_table": 1, "ticker_col": "Ticker"},
    # Europa España
    {"id": "IBEX35",    "name": "IBEX 35",           "ticker": "^IBEX",     "country": "ES", "region": "Europa",       "source": "wikipedia", "wiki_url": "https://es.wikipedia.org/wiki/IBEX_35", "wiki_table": 2, "ticker_col": "Ticker"},
    {"id": "IBEXM",     "name": "IBEX Medium Cap",   "ticker": "^IBEXM",    "country": "ES", "region": "Europa",       "source": "wikipedia", "wiki_url": "https://es.wikipedia.org/wiki/IBEX_Medium_Cap", "wiki_table": 1, "ticker_col": "Ticker"},
    {"id": "IBEXSC",    "name": "IBEX Small Cap",    "ticker": "^IBEXSC",   "country": "ES", "region": "Europa",       "source": "wikipedia", "wiki_url": "https://es.wikipedia.org/wiki/IBEX_Small_Cap", "wiki_table": 1, "ticker_col": "Ticker"},
    # Europa Alemania/Francia/etc
    {"id": "DAX",       "name": "DAX 40",            "ticker": "^GDAXI",    "country": "DE", "region": "Europa",       "source": "wikipedia", "wiki_url": "https://en.wikipedia.org/wiki/DAX", "wiki_table": 3, "ticker_col": "Ticker"},
    {"id": "CAC40",     "name": "CAC 40",            "ticker": "^FCHI",     "country": "FR", "region": "Europa",       "source": "wikipedia", "wiki_url": "https://en.wikipedia.org/wiki/CAC_40", "wiki_table": 2, "ticker_col": "Ticker"},
    {"id": "SMI",       "name": "SMI",               "ticker": "^SSMI",     "country": "CH", "region": "Europa",       "source": "wikipedia", "wiki_url": "https://en.wikipedia.org/wiki/Swiss_Market_Index", "wiki_table": 1, "ticker_col": "Ticker"},
    {"id": "AEX",       "name": "AEX",               "ticker": "^AEX",      "country": "NL", "region": "Europa",       "source": "wikipedia", "wiki_url": "https://en.wikipedia.org/wiki/AEX_index", "wiki_table": 1, "ticker_col": "Ticker"},
    {"id": "BEL20",     "name": "BEL 20",            "ticker": "^BFX",      "country": "BE", "region": "Europa",       "source": "wikipedia", "wiki_url": "https://en.wikipedia.org/wiki/BEL_20", "wiki_table": 1, "ticker_col": "Ticker"},
    {"id": "FTSEMIB",   "name": "FTSE MIB",          "ticker": "^FTSEMIB",  "country": "IT", "region": "Europa",       "source": "wikipedia", "wiki_url": "https://en.wikipedia.org/wiki/FTSE_MIB", "wiki_table": 1, "ticker_col": "Ticker"},
    {"id": "ATX",       "name": "ATX",               "ticker": "^ATX",      "country": "AT", "region": "Europa",       "source": "wikipedia", "wiki_url": "https://en.wikipedia.org/wiki/Austrian_Traded_Index", "wiki_table": 1, "ticker_col": "Ticker"},
    {"id": "PSI",       "name": "PSI",               "ticker": "PSI20.LS",  "country": "PT", "region": "Europa",       "source": "wikipedia", "wiki_url": "https://en.wikipedia.org/wiki/PSI-20", "wiki_table": 1, "ticker_col": "Ticker"},
    {"id": "OMXH25",    "name": "OMX Helsinki 25",   "ticker": "^OMXH25",   "country": "FI", "region": "Europa",       "source": "wikipedia", "wiki_url": "https://en.wikipedia.org/wiki/OMX_Helsinki_25", "wiki_table": 1, "ticker_col": "Ticker"},
    {"id": "OMXS30",    "name": "OMX Stockholm 30",  "ticker": "^OMXS30",   "country": "SE", "region": "Europa",       "source": "wikipedia", "wiki_url": "https://en.wikipedia.org/wiki/OMX_Stockholm_30", "wiki_table": 1, "ticker_col": "Ticker"},
    {"id": "OMXC20",    "name": "OMX Copenhagen 20", "ticker": "^OMXC20",   "country": "DK", "region": "Europa",       "source": "wikipedia", "wiki_url": "https://en.wikipedia.org/wiki/OMX_Copenhagen_20", "wiki_table": 1, "ticker_col": "Ticker"},
    {"id": "OBX",       "name": "Oslo OBX",          "ticker": "OBX.OL",    "country": "NO", "region": "Europa",       "source": "wikipedia", "wiki_url": "https://en.wikipedia.org/wiki/OBX_Stock_Index", "wiki_table": 1, "ticker_col": "Ticker"},
    {"id": "WIG20",     "name": "WIG 20",            "ticker": "WIG20.WA",  "country": "PL", "region": "Europa",       "source": "wikipedia", "wiki_url": "https://en.wikipedia.org/wiki/WIG20", "wiki_table": 1, "ticker_col": "Ticker"},
    {"id": "BUX",       "name": "BUX",               "ticker": "^BUX",      "country": "HU", "region": "Europa",       "source": "wikipedia", "wiki_url": "https://en.wikipedia.org/wiki/BUX", "wiki_table": 1, "ticker_col": "Ticker"},
    {"id": "PX",        "name": "PX Index",          "ticker": "^PX",       "country": "CZ", "region": "Europa",       "source": "wikipedia", "wiki_url": "https://en.wikipedia.org/wiki/PX_(index)", "wiki_table": 1, "ticker_col": "Ticker"},
    {"id": "ISEQ",      "name": "ISEQ Overall",      "ticker": "^ISEQ",     "country": "IE", "region": "Europa",       "source": "wikipedia", "wiki_url": "https://en.wikipedia.org/wiki/ISEQ_Overall_Index", "wiki_table": 1, "ticker_col": "Ticker"},
    {"id": "BIST",      "name": "BIST 100",          "ticker": "XU100.IS",  "country": "TR", "region": "Europa",       "source": "wikipedia", "wiki_url": "https://en.wikipedia.org/wiki/BIST_100_Index", "wiki_table": 1, "ticker_col": "Ticker"},
    {"id": "STOXX50",   "name": "Eurostoxx 50",      "ticker": "^STOXX50E", "country": "EU", "region": "Europa",       "source": "wikipedia", "wiki_url": "https://en.wikipedia.org/wiki/Euro_Stoxx_50", "wiki_table": 2, "ticker_col": "Ticker"},
    {"id": "STOXX600",  "name": "STOXX Europe 600",  "ticker": "^STOXX600", "country": "EU", "region": "Europa",       "source": "etf",       "etf_ticker": "EXSA.DE"},
    # América
    {"id": "TSX",       "name": "S&P/TSX Composite", "ticker": "^GSPTSE",   "country": "CA", "region": "América",      "source": "wikipedia", "wiki_url": "https://en.wikipedia.org/wiki/S%26P/TSX_Composite_Index", "wiki_table": 0, "ticker_col": "Symbol"},
    {"id": "BOVESPA",   "name": "IBOVESPA",          "ticker": "^BVSP",     "country": "BR", "region": "América",      "source": "wikipedia", "wiki_url": "https://en.wikipedia.org/wiki/Ibovespa", "wiki_table": 1, "ticker_col": "Ticker"},
    {"id": "IPC",       "name": "S&P/BMV IPC",       "ticker": "^MXX",      "country": "MX", "region": "América",      "source": "wikipedia", "wiki_url": "https://en.wikipedia.org/wiki/S%26P/BMV_IPC", "wiki_table": 1, "ticker_col": "Ticker"},
    {"id": "MERVAL",    "name": "S&P Merval",        "ticker": "^MERV",     "country": "AR", "region": "América",      "source": "wikipedia", "wiki_url": "https://en.wikipedia.org/wiki/MERVAL", "wiki_table": 1, "ticker_col": "Ticker"},
    {"id": "IPSA",      "name": "S&P IPSA",          "ticker": "^IPSA",     "country": "CL", "region": "América",      "source": "wikipedia", "wiki_url": "https://en.wikipedia.org/wiki/IPSA", "wiki_table": 1, "ticker_col": "Ticker"},
    # Asia-Pacífico
    {"id": "NIKKEI",    "name": "Nikkei 225",        "ticker": "^N225",     "country": "JP", "region": "Asia-Pacífico", "source": "wikipedia", "wiki_url": "https://en.wikipedia.org/wiki/Nikkei_225", "wiki_table": 2, "ticker_col": "Code"},
    {"id": "TOPIX",     "name": "TOPIX",             "ticker": "TOPIX100.T","country": "JP", "region": "Asia-Pacífico", "source": "wikipedia", "wiki_url": "https://en.wikipedia.org/wiki/TOPIX_Core_30", "wiki_table": 1, "ticker_col": "Ticker"},
    {"id": "HANGSENG",  "name": "Hang Seng",         "ticker": "^HSI",      "country": "HK", "region": "Asia-Pacífico", "source": "wikipedia", "wiki_url": "https://en.wikipedia.org/wiki/Hang_Seng_Index", "wiki_table": 1, "ticker_col": "Code"},
    {"id": "SSE",       "name": "SSE Composite",     "ticker": "000001.SS", "country": "CN", "region": "Asia-Pacífico", "source": "wikipedia", "wiki_url": "https://en.wikipedia.org/wiki/SSE_50_Index", "wiki_table": 1, "ticker_col": "Code"},
    {"id": "CSI300",    "name": "CSI 300",           "ticker": "000300.SS", "country": "CN", "region": "Asia-Pacífico", "source": "etf",       "etf_ticker": "ASHR"},
    {"id": "SENSEX",    "name": "S&P BSE SENSEX",    "ticker": "^BSESN",    "country": "IN", "region": "Asia-Pacífico", "source": "wikipedia", "wiki_url": "https://en.wikipedia.org/wiki/BSE_SENSEX", "wiki_table": 1, "ticker_col": "Ticker"},
    {"id": "NIFTY",     "name": "Nifty 50",          "ticker": "^NSEI",     "country": "IN", "region": "Asia-Pacífico", "source": "wikipedia", "wiki_url": "https://en.wikipedia.org/wiki/NIFTY_50", "wiki_table": 1, "ticker_col": "Symbol"},
    {"id": "KOSPI",     "name": "KOSPI",             "ticker": "^KS11",     "country": "KR", "region": "Asia-Pacífico", "source": "wikipedia", "wiki_url": "https://en.wikipedia.org/wiki/KOSPI_200", "wiki_table": 1, "ticker_col": "Ticker"},
    {"id": "ASX200",    "name": "S&P/ASX 200",       "ticker": "^AXJO",     "country": "AU", "region": "Asia-Pacífico", "source": "wikipedia", "wiki_url": "https://en.wikipedia.org/wiki/S%26P/ASX_200", "wiki_table": 0, "ticker_col": "Code"},
    {"id": "STI",       "name": "Straits Times",     "ticker": "^STI",      "country": "SG", "region": "Asia-Pacífico", "source": "wikipedia", "wiki_url": "https://en.wikipedia.org/wiki/Straits_Times_Index", "wiki_table": 1, "ticker_col": "Ticker"},
    # África
    {"id": "JSE",       "name": "JSE Top 40",        "ticker": "^JN0U.JO",  "country": "ZA", "region": "África",        "source": "wikipedia", "wiki_url": "https://en.wikipedia.org/wiki/FTSE/JSE_Africa_Top_40_Index", "wiki_table": 1, "ticker_col": "Ticker"},
    # ETFs globales
    {"id": "MSCIWORLD", "name": "MSCI World",        "ticker": "URTH",      "country": "GL", "region": "ETFs globales", "source": "etf",       "etf_ticker": "URTH"},
    {"id": "MSCIEM",    "name": "MSCI Emerging",     "ticker": "EEM",       "country": "GL", "region": "ETFs globales", "source": "etf",       "etf_ticker": "EEM"},
]


# ══════════════════════════════════════════════════════════════════════════
# FUENTE 1 — Wikipedia
# ══════════════════════════════════════════════════════════════════════════
def fetch_from_wikipedia(idx: dict) -> list[dict]:
    """Obtiene componentes de un índice desde Wikipedia."""
    url = idx.get("wiki_url")
    table_num = idx.get("wiki_table", 0)
    ticker_col = idx.get("ticker_col", "Ticker")

    if not url:
        return []

    log.info(f"  [Wikipedia] {url}")
    try:
        r = requests.get(url, headers=HEADERS, timeout=20)
        if r.status_code != 200:
            log.warning(f"  HTTP {r.status_code}")
            return []

        tables = pd.read_html(r.text)
        if table_num >= len(tables):
            log.warning(f"  Tabla {table_num} no encontrada — hay {len(tables)}")
            # Intentar con otras tablas
            for i, t in enumerate(tables):
                cols = [str(c).lower() for c in t.columns]
                if any(x in " ".join(cols) for x in ["ticker","symbol","code","isin"]):
                    log.info(f"  Usando tabla {i} con columnas: {list(t.columns)[:5]}")
                    table_num = i
                    break
            if table_num >= len(tables):
                return []

        df = tables[table_num]
        log.info(f"  Tabla {table_num}: {len(df)} filas, columnas: {list(df.columns)[:6]}")

        # Buscar columna de ticker
        ticker_col_found = None
        for col in df.columns:
            if str(col).lower() in [ticker_col.lower(), "ticker", "symbol",
                                     "code", "isin", "símbolo"]:
                ticker_col_found = col
                break

        if not ticker_col_found:
            log.warning(f"  Columna '{ticker_col}' no encontrada. Columnas: {list(df.columns)}")
            return []

        # Buscar columna de nombre
        name_col = None
        for col in df.columns:
            if str(col).lower() in ["company", "name", "empresa", "nombre",
                                     "security", "componente"]:
                name_col = col
                break

        components = []
        for _, row in df.iterrows():
            ticker_raw = str(row[ticker_col_found]).strip()
            if not ticker_raw or ticker_raw in ["nan", "—", "-", ""]:
                continue
            # Limpiar ticker
            ticker_raw = re.sub(r'\[.*?\]', '', ticker_raw).strip()
            name = str(row[name_col]).strip() if name_col else ticker_raw

            components.append({
                "ticker_local": ticker_raw,
                "name": name,
                "source": "wikipedia"
            })

        log.info(f"  {len(components)} componentes encontrados")
        return components

    except Exception as e:
        log.warning(f"  Error Wikipedia: {e}")
        return []


# ══════════════════════════════════════════════════════════════════════════
# FUENTE 2 — ETF Holdings (iShares, etc.)
# ══════════════════════════════════════════════════════════════════════════
def fetch_from_etf(etf_ticker: str) -> list[dict]:
    """Obtiene los holdings de un ETF via yfinance."""
    log.info(f"  [ETF holdings] {etf_ticker}")
    try:
        etf = yf.Ticker(etf_ticker)
        # Intentar obtener holdings
        info = etf.info or {}
        holdings = info.get("holdings", [])

        if not holdings:
            # Intentar con fund_holdings
            try:
                fh = etf.funds_data
                if fh and hasattr(fh, 'top_holdings'):
                    holdings = [{"symbol": h.get("symbol", ""),
                                "holdingName": h.get("holdingName", "")}
                               for h in fh.top_holdings.to_dict('records')]
            except:
                pass

        if not holdings:
            log.warning(f"  Sin holdings para {etf_ticker}")
            return []

        components = []
        for h in holdings:
            ticker = h.get("symbol", "").strip()
            name = h.get("holdingName", "").strip()
            if ticker and ticker not in ["nan", ""]:
                components.append({
                    "ticker_local": ticker,
                    "name": name,
                    "source": "etf_holdings"
                })

        log.info(f"  {len(components)} holdings encontrados")
        return components

    except Exception as e:
        log.warning(f"  Error ETF holdings: {e}")
        return []


# ══════════════════════════════════════════════════════════════════════════
# MAPEO DE TICKERS
# ══════════════════════════════════════════════════════════════════════════
def map_ticker_to_yfinance(ticker_local: str, index_ticker: str,
                            company_name: str = "") -> Optional[str]:
    """
    Convierte un ticker local al formato yfinance.
    Intenta primero con sufijo automático, luego con OpenFigi.
    """
    suffix = SUFFIX_MAP.get(index_ticker, "")
    candidate = ticker_local + suffix

    # Limpiar caracteres extraños del ticker
    candidate = re.sub(r'[^\w\.]', '', candidate).upper()

    # Verificar con yfinance
    if verify_ticker_yfinance(candidate):
        return candidate

    # Si falla intentar sin sufijo (para EEUU)
    if suffix and verify_ticker_yfinance(ticker_local):
        return ticker_local

    # Intentar con variaciones comunes
    for variant in get_ticker_variants(ticker_local, suffix):
        if verify_ticker_yfinance(variant):
            return variant

    # Fallback a OpenFigi si tenemos nombre
    if company_name and OPENFIGI_API_KEY:
        figi_ticker = search_openfigi(ticker_local, company_name, index_ticker)
        if figi_ticker:
            return figi_ticker

    log.warning(f"    No se pudo mapear: {ticker_local} → {candidate}")
    return None


def get_ticker_variants(ticker: str, suffix: str) -> list[str]:
    """Genera variantes comunes de un ticker."""
    variants = []
    # Algunos índices europeos usan punto en lugar de guión
    if "-" in ticker:
        variants.append(ticker.replace("-", ".") + suffix)
    # Algunos tickers tienen espacios
    if " " in ticker:
        variants.append(ticker.replace(" ", "") + suffix)
    # Clase de acción diferente (B, A, etc.)
    if ticker.endswith("B"):
        variants.append(ticker[:-1] + suffix)
    return variants


def verify_ticker_yfinance(ticker: str) -> bool:
    """Verifica que yfinance reconoce un ticker."""
    if not ticker or len(ticker) < 1:
        return False
    try:
        t = yf.Ticker(ticker)
        info = t.info
        # Si tiene precio o nombre es válido
        return bool(info.get("regularMarketPrice") or
                   info.get("currentPrice") or
                   info.get("longName") or
                   info.get("shortName"))
    except:
        return False


def search_openfigi(ticker_local: str, company_name: str,
                    index_ticker: str) -> Optional[str]:
    """Busca el ticker yfinance de una empresa usando OpenFigi."""
    if not OPENFIGI_API_KEY:
        return None

    log.info(f"    [OpenFigi] Buscando: {company_name}")

    # Detectar exchange code según el índice
    exchange_map = {
        "^IBEX": "SM", "^FTSE": "LN", "^FTMC": "LN", "^GDAXI": "GY",
        "^FCHI": "FP", "^AEX": "NA", "^SSMI": "SW", "^FTSEMIB": "IM",
        "^BFX": "BB", "^OMXH25": "FH", "^OMXS30": "SS", "^OMXC20": "DC",
        "OBX.OL": "NO", "^ATX": "AV", "PSI20.LS": "PL", "WIG20.WA": "PW",
        "^BVSP": "BZ", "^N225": "JT", "^HSI": "HK", "^KS11": "KS",
        "^AXJO": "AT", "^STI": "SP", "^BSESN": "IB", "^NSEI": "IN",
    }
    exch = exchange_map.get(index_ticker, "")

    try:
        # Buscar por ticker local primero
        payloads = [{"idType": "TICKER", "idValue": ticker_local}]
        if exch:
            payloads[0]["exchCode"] = exch

        # Si tenemos nombre buscar también por nombre
        if len(company_name) > 3:
            payloads.append({"idType": "BASE_TICKER", "idValue": ticker_local[:6]})

        headers = {
            "Content-Type": "application/json",
            "X-OPENFIGI-APIKEY": OPENFIGI_API_KEY
        }
        r = requests.post(
            "https://api.openfigi.com/v3/mapping",
            json=payloads[:1],
            headers=headers,
            timeout=10
        )

        if r.status_code != 200:
            return None

        data = r.json()
        if not data or not data[0].get("data"):
            return None

        # Buscar el resultado más relevante
        for item in data[0]["data"]:
            if item.get("securityType2") in ["Common Stock", "ETP"]:
                ticker = item.get("ticker", "")
                exch_code = item.get("exchCode", "")

                # Convertir exchCode a sufijo yfinance
                exch_to_suffix = {
                    "SM": ".MC", "LN": ".L", "GY": ".DE", "FP": ".PA",
                    "NA": ".AS", "SW": ".SW", "IM": ".MI", "BB": ".BR",
                    "FH": ".HE", "SS": ".ST", "DC": ".CO", "NO": ".OL",
                    "AV": ".VI", "PL": ".LS", "PW": ".WA", "BZ": ".SA",
                    "JT": ".T", "HK": ".HK", "KS": ".KS", "AT": ".AX",
                    "SP": ".SI", "IB": ".BO", "IN": ".NS",
                    "UN": "", "UQ": "", "UA": ""  # NYSE, NASDAQ, AMEX
                }
                suffix = exch_to_suffix.get(exch_code, "")
                yf_ticker = ticker + suffix

                if verify_ticker_yfinance(yf_ticker):
                    log.info(f"    OpenFigi encontró: {yf_ticker}")
                    time.sleep(0.1)
                    return yf_ticker

        time.sleep(0.1)
        return None

    except Exception as e:
        log.warning(f"    OpenFigi error: {e}")
        return None


# ══════════════════════════════════════════════════════════════════════════
# SUPABASE
# ══════════════════════════════════════════════════════════════════════════
def get_client():
    from supabase import create_client
    return create_client(SUPABASE_URL, SUPABASE_KEY)


def get_existing_components(index_id: str) -> set[str]:
    """Obtiene los tickers actuales de un índice en Supabase."""
    try:
        client = get_client()
        r = client.table("index_components")\
            .select("ticker")\
            .eq("index_id", index_id)\
            .execute()
        return {row["ticker"] for row in (r.data or [])}
    except Exception as e:
        log.error(f"Error obteniendo componentes de {index_id}: {e}")
        return set()


def get_existing_dict_tickers() -> set[str]:
    """Obtiene todos los tickers que ya están en company_fundamentals."""
    try:
        client = get_client()
        r = client.table("company_fundamentals").select("ticker").execute()
        return {row["ticker"] for row in (r.data or [])}
    except Exception as e:
        log.error(f"Error obteniendo DICT: {e}")
        return set()


def upsert_components(index_id: str, components: list[dict],
                      dry_run: bool = False) -> dict:
    """
    Actualiza los componentes de un índice en Supabase.
    Detecta entradas y salidas respecto al trimestre anterior.
    """
    existing = get_existing_components(index_id)
    new_tickers = {c["ticker_yf"] for c in components if c.get("ticker_yf")}

    entries = new_tickers - existing
    exits = existing - new_tickers

    result = {
        "index_id": index_id,
        "total": len(new_tickers),
        "entries": list(entries),
        "exits": list(exits),
        "unchanged": len(existing & new_tickers)
    }

    if dry_run:
        log.info(f"  [DRY RUN] {len(new_tickers)} componentes, "
                f"{len(entries)} entradas, {len(exits)} salidas")
        return result

    client = get_client()
    today = date.today().isoformat()

    # Marcar salidas como inactivas
    for ticker in exits:
        try:
            client.table("index_components")\
                .update({"active": False, "exit_date": today})\
                .eq("index_id", index_id)\
                .eq("ticker", ticker)\
                .execute()
        except Exception as e:
            log.warning(f"  Error marcando salida {ticker}: {e}")

    # Insertar o reactivar entradas
    records = []
    for comp in components:
        if not comp.get("ticker_yf"):
            continue
        records.append({
            "index_id": index_id,
            "ticker": comp["ticker_yf"],
            "name": comp.get("name", ""),
            "active": True,
            "entry_date": today if comp["ticker_yf"] in entries else None,
            "exit_date": None,
            "updated_at": datetime.now().isoformat()
        })

    # Upsert en lotes
    batch_size = 100
    for i in range(0, len(records), batch_size):
        batch = records[i:i+batch_size]
        try:
            client.table("index_components")\
                .upsert(batch, on_conflict="index_id,ticker")\
                .execute()
        except Exception as e:
            log.error(f"  Error upserting componentes: {e}")

    log.info(f"  ✓ {len(new_tickers)} componentes actualizados, "
            f"{len(entries)} entradas, {len(exits)} salidas")
    return result


def add_new_to_dict(new_tickers: list[str], dry_run: bool = False):
    """
    Añade tickers nuevos a company_fundamentals con datos básicos de yfinance.
    """
    if not new_tickers:
        return

    existing = get_existing_dict_tickers()
    to_add = [t for t in new_tickers if t not in existing]

    if not to_add:
        log.info(f"  Todos los tickers nuevos ya están en el DICT")
        return

    log.info(f"  Añadiendo {len(to_add)} tickers nuevos al DICT...")

    if dry_run:
        log.info(f"  [DRY RUN] Se añadirían: {to_add[:10]}...")
        return

    client = get_client()
    ok = 0

    for ticker in to_add:
        try:
            t = yf.Ticker(ticker)
            info = t.info or {}

            record = {
                "ticker": ticker,
                "name": info.get("longName") or info.get("shortName") or ticker,
                "sector": info.get("sector", ""),
                "industry": info.get("industry", ""),
                "country": info.get("country", ""),
                "currency": info.get("currency", ""),
                "current_price": info.get("regularMarketPrice") or
                                 info.get("currentPrice"),
                "market_cap_m": round(info.get("marketCap", 0) / 1e6, 2)
                                if info.get("marketCap") else None,
                "updated_at": datetime.now().isoformat()
            }

            client.table("company_fundamentals")\
                .upsert(record, on_conflict="ticker")\
                .execute()
            ok += 1
            time.sleep(0.3)

        except Exception as e:
            log.warning(f"  Error añadiendo {ticker}: {e}")

    log.info(f"  ✓ {ok}/{len(to_add)} tickers añadidos al DICT")


def log_run(results: list[dict], dry_run: bool = False):
    """Registra el resultado en admin_logs."""
    if dry_run or not SUPABASE_URL:
        return
    try:
        client = get_client()
        total_entries = sum(len(r.get("entries", [])) for r in results)
        total_exits = sum(len(r.get("exits", [])) for r in results)
        client.table("admin_logs").insert({
            "event_type": "index_components_update",
            "description": (f"{len(results)} índices actualizados, "
                          f"{total_entries} entradas, {total_exits} salidas"),
            "details": json.dumps(results),
            "status": "ok",
            "created_at": datetime.now().isoformat()
        }).execute()
    except Exception as e:
        log.warning(f"Error registrando en admin_logs: {e}")


# ══════════════════════════════════════════════════════════════════════════
# SQL para crear las tablas necesarias
# ══════════════════════════════════════════════════════════════════════════
SQL_SETUP = """
-- Tabla de componentes de índices
create table if not exists index_components (
  id         uuid default gen_random_uuid() primary key,
  index_id   text not null,
  ticker     text not null,
  name       text,
  active     boolean default true,
  entry_date date,
  exit_date  date,
  updated_at timestamptz default now(),
  unique(index_id, ticker)
);
create index if not exists idx_index_components_index
  on index_components(index_id, active);
create index if not exists idx_index_components_ticker
  on index_components(ticker);

-- RLS: lectura pública, escritura solo service_role
alter table index_components enable row level security;
create policy if not exists "index_components: lectura publica"
  on index_components for select using (true);

-- Tabla de definición de índices
create table if not exists indices_config (
  id        text primary key,
  name      text not null,
  ticker    text not null,
  country   text,
  region    text,
  active    boolean default true,
  updated_at timestamptz default now()
);
alter table indices_config enable row level security;
create policy if not exists "indices_config: lectura publica"
  on indices_config for select using (true);
"""


# ══════════════════════════════════════════════════════════════════════════
# PROCESO PRINCIPAL
# ══════════════════════════════════════════════════════════════════════════
def process_index(idx: dict, dry_run: bool = False,
                  init: bool = False) -> Optional[dict]:
    """Procesa un índice completo."""
    log.info(f"\n{'─'*50}")
    log.info(f"Procesando: {idx['name']} ({idx['id']})")
    log.info(f"{'─'*50}")

    # 1. Obtener componentes según la fuente
    raw_components = []
    if idx["source"] == "wikipedia":
        raw_components = fetch_from_wikipedia(idx)
    elif idx["source"] == "etf":
        raw_components = fetch_from_etf(idx.get("etf_ticker", ""))

    if not raw_components:
        log.warning(f"Sin componentes para {idx['name']}")
        return None

    # 2. Mapear tickers a yfinance
    mapped = []
    not_found = []

    for i, comp in enumerate(raw_components):
        ticker_local = comp["ticker_local"]
        name = comp.get("name", "")

        if i > 0 and i % 20 == 0:
            log.info(f"  Mapeando... {i}/{len(raw_components)}")

        ticker_yf = map_ticker_to_yfinance(
            ticker_local, idx["ticker"], name)

        if ticker_yf:
            comp["ticker_yf"] = ticker_yf
            mapped.append(comp)
        else:
            not_found.append({"ticker_local": ticker_local, "name": name})

        time.sleep(0.1)  # Respetar rate limits

    log.info(f"  Mapeados: {len(mapped)}/{len(raw_components)} "
            f"({len(not_found)} no encontrados)")

    if not_found:
        log.info(f"  No encontrados: {[x['ticker_local'] for x in not_found[:10]]}")

    # 3. Actualizar en Supabase
    result = upsert_components(idx["id"], mapped, dry_run=dry_run)
    result["not_found"] = not_found

    # 4. Añadir entradas nuevas al DICT
    if result.get("entries") and (init or result["entries"]):
        add_new_to_dict(result["entries"], dry_run=dry_run)

    return result


def main():
    parser = argparse.ArgumentParser(
        description="Actualiza componentes de índices en Supabase")
    parser.add_argument("--index",   help="Procesar solo este índice (id)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Sin guardar en Supabase")
    parser.add_argument("--init",    action="store_true",
                        help="Primera carga — añadir todos al DICT")
    parser.add_argument("--setup",   action="store_true",
                        help="Mostrar SQL para crear las tablas")
    args = parser.parse_args()

    if args.setup:
        print(SQL_SETUP)
        return

    indices_to_process = INDICES
    if args.index:
        indices_to_process = [i for i in INDICES
                              if i["id"].upper() == args.index.upper()]
        if not indices_to_process:
            log.error(f"Índice '{args.index}' no encontrado")
            log.info(f"IDs disponibles: {[i['id'] for i in INDICES]}")
            return

    log.info(f"{'='*60}")
    log.info(f"update_index_components.py")
    log.info(f"Índices: {len(indices_to_process)} | "
            f"Modo: {'DRY RUN' if args.dry_run else 'PRODUCCIÓN'} | "
            f"{'INIT' if args.init else 'TRIMESTRAL'}")
    log.info(f"{'='*60}")

    results = []
    for idx in indices_to_process:
        result = process_index(idx, dry_run=args.dry_run, init=args.init)
        if result:
            results.append(result)
        time.sleep(2)  # Pausa entre índices

    # Resumen final
    total_entries = sum(len(r.get("entries", [])) for r in results)
    total_exits   = sum(len(r.get("exits", [])) for r in results)
    total_nf      = sum(len(r.get("not_found", [])) for r in results)

    log.info(f"\n{'='*60}")
    log.info(f"COMPLETADO")
    log.info(f"  Índices procesados: {len(results)}/{len(indices_to_process)}")
    log.info(f"  Entradas nuevas:    {total_entries}")
    log.info(f"  Salidas:            {total_exits}")
    log.info(f"  No encontrados:     {total_nf}")
    log.info(f"{'='*60}")

    log_run(results, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
