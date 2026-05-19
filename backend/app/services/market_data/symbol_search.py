"""
Multi-exchange symbol search supporting NSE, BSE, and NASDAQ.
Falls back to bundled lists if live fetches fail.
"""
from __future__ import annotations

import logging
import time

logger = logging.getLogger(__name__)

_cache: dict[str, tuple[float, list[dict]]] = {}
CACHE_TTL = 24 * 3600


_NASDAQ_FALLBACK: list[dict] = [
    {"symbol": s, "name": n} for s, n in [
        ("AAPL", "Apple Inc."), ("MSFT", "Microsoft Corporation"),
        ("GOOGL", "Alphabet Inc. Class A"), ("GOOG", "Alphabet Inc. Class C"),
        ("AMZN", "Amazon.com Inc."), ("NVDA", "NVIDIA Corporation"),
        ("META", "Meta Platforms Inc."), ("TSLA", "Tesla Inc."),
        ("AVGO", "Broadcom Inc."), ("COST", "Costco Wholesale"),
        ("NFLX", "Netflix Inc."), ("AMD", "Advanced Micro Devices"),
        ("ADBE", "Adobe Inc."), ("PEP", "PepsiCo Inc."),
        ("CSCO", "Cisco Systems"), ("INTC", "Intel Corporation"),
        ("TMUS", "T-Mobile US"), ("CMCSA", "Comcast Corporation"),
        ("INTU", "Intuit Inc."), ("TXN", "Texas Instruments"),
        ("QCOM", "Qualcomm Inc."), ("AMGN", "Amgen Inc."),
        ("ISRG", "Intuitive Surgical"), ("HON", "Honeywell International"),
        ("AMAT", "Applied Materials"), ("BKNG", "Booking Holdings"),
        ("LRCX", "Lam Research"), ("VRTX", "Vertex Pharmaceuticals"),
        ("PANW", "Palo Alto Networks"), ("ADP", "Automatic Data Processing"),
        ("REGN", "Regeneron Pharmaceuticals"), ("SBUX", "Starbucks Corporation"),
        ("MU", "Micron Technology"), ("MDLZ", "Mondelez International"),
        ("KLAC", "KLA Corporation"), ("SNPS", "Synopsys Inc."),
        ("CDNS", "Cadence Design Systems"), ("MELI", "MercadoLibre Inc."),
        ("CRWD", "CrowdStrike Holdings"), ("PYPL", "PayPal Holdings"),
        ("ORLY", "O'Reilly Automotive"), ("MAR", "Marriott International"),
        ("ABNB", "Airbnb Inc."), ("FTNT", "Fortinet Inc."),
        ("CTAS", "Cintas Corporation"), ("DASH", "DoorDash Inc."),
        ("WDAY", "Workday Inc."), ("CEG", "Constellation Energy"),
        ("MRVL", "Marvell Technology"), ("TTD", "The Trade Desk"),
        ("DXCM", "DexCom Inc."), ("ODFL", "Old Dominion Freight"),
        ("PCAR", "PACCAR Inc."), ("MNST", "Monster Beverage"),
        ("IDXX", "IDEXX Laboratories"), ("FAST", "Fastenal Company"),
        ("KDP", "Keurig Dr Pepper"), ("EXC", "Exelon Corporation"),
        ("GEHC", "GE HealthCare Technologies"), ("EA", "Electronic Arts"),
        ("VRSK", "Verisk Analytics"), ("CTSH", "Cognizant Technology"),
        ("XEL", "Xcel Energy"), ("ON", "ON Semiconductor"),
        ("DDOG", "Datadog Inc."), ("ANSS", "ANSYS Inc."),
        ("ZS", "Zscaler Inc."), ("TEAM", "Atlassian Corporation"),
        ("CDW", "CDW Corporation"), ("BIIB", "Biogen Inc."),
        ("ILMN", "Illumina Inc."), ("WBD", "Warner Bros. Discovery"),
        ("SPLK", "Splunk Inc."), ("SIRI", "Sirius XM Holdings"),
        ("JD", "JD.com Inc."), ("PDD", "PDD Holdings"),
        ("BIDU", "Baidu Inc."), ("NTES", "NetEase Inc."),
        ("MCHP", "Microchip Technology"), ("LULU", "Lululemon Athletica"),
        ("ROST", "Ross Stores"), ("PAYX", "Paychex Inc."),
        ("KHC", "Kraft Heinz Company"), ("DLTR", "Dollar Tree Inc."),
        ("BKR", "Baker Hughes"), ("FANG", "Diamondback Energy"),
        ("AEP", "American Electric Power"), ("WBA", "Walgreens Boots Alliance"),
        ("COIN", "Coinbase Global"), ("RIVN", "Rivian Automotive"),
        ("LCID", "Lucid Group"), ("SOFI", "SoFi Technologies"),
        ("PLTR", "Palantir Technologies"), ("U", "Unity Software"),
        ("SNOW", "Snowflake Inc."), ("NET", "Cloudflare Inc."),
        ("ROKU", "Roku Inc."), ("ZM", "Zoom Video Communications"),
        ("OKTA", "Okta Inc."), ("SHOP", "Shopify Inc."),
        ("SQ", "Block Inc."), ("UBER", "Uber Technologies"),
        ("LYFT", "Lyft Inc."), ("SNAP", "Snap Inc."),
        ("PINS", "Pinterest Inc."), ("SPOT", "Spotify Technology"),
        ("RBLX", "Roblox Corporation"), ("ARM", "Arm Holdings"),
        ("SMCI", "Super Micro Computer"), ("MSTR", "MicroStrategy"),
    ]
]


def _get_nse_symbols() -> list[dict]:
    """Delegate to the existing NSE symbol fetcher."""
    from app.services.market_data.nse_symbols import get_all_symbols
    return get_all_symbols()


_NASDAQ_LISTED_URL = (
    "https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt"
)
_NASDAQ_FETCH_HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; stocksense/1.0)",
}


def _fetch_nasdaq_symbols() -> list[dict]:
    """Download the official NASDAQ-listed equities file and parse it.

    Format: pipe-delimited with a header row and a trailing metadata line.
    Filters to common equity (non-test, non-ETF, financially normal) entries.
    Falls back to the bundled list on any network or parse error.
    """
    import httpx
    try:
        with httpx.Client(timeout=20, headers=_NASDAQ_FETCH_HEADERS) as client:
            resp = client.get(_NASDAQ_LISTED_URL)
            resp.raise_for_status()

        symbols: list[dict] = []
        lines = resp.text.splitlines()
        if not lines:
            raise ValueError("Empty response")

        # First line is the header; last line is a metadata/timestamp line
        for line in lines[1:-1]:
            parts = line.split("|")
            if len(parts) < 8:
                continue
            sym, name, _mkt, test, fin_status, _lot, etf, _nc = parts[:8]
            sym = sym.strip()
            # Keep only normal, non-test, non-ETF common equity
            if test.strip() != "N" or etf.strip() != "N" or fin_status.strip() != "N":
                continue
            # Exclude warrants, units, rights, preferred (contain / W  + -)
            if any(c in sym for c in ("/", "+", "-")) or sym.endswith(("W", "R", "U")):
                continue
            if sym:
                symbols.append({"symbol": sym, "name": name.strip()})

        if not symbols:
            raise ValueError("Parsed empty symbol list")

        logger.info(f"[SymbolSearch] Fetched {len(symbols)} NASDAQ equities")
        return symbols
    except Exception as exc:
        logger.warning(f"[SymbolSearch] NASDAQ live fetch failed ({exc}), using fallback")
        return []


def _get_nasdaq_symbols() -> list[dict]:
    now = time.time()
    cached = _cache.get("NASDAQ")
    if cached and (now - cached[0]) < CACHE_TTL:
        return cached[1]

    live = _fetch_nasdaq_symbols()
    result = live if live else _NASDAQ_FALLBACK
    _cache["NASDAQ"] = (now, result)
    return result


def _get_symbols_for_exchange(exchange: str) -> list[dict]:
    if exchange == "NASDAQ":
        return _get_nasdaq_symbols()
    return _get_nse_symbols()


def search_symbols(q: str, exchange: str = "NSE", limit: int = 25) -> list[dict]:
    q = q.strip().upper()
    if not q:
        return []
    pool = _get_symbols_for_exchange(exchange)
    starts = [s for s in pool if s["symbol"].startswith(q)]
    contains = [s for s in pool if q in s["symbol"] and s not in starts]
    by_name = [
        s for s in pool
        if q in s["name"].upper() and s not in starts and s not in contains
    ]
    results = (starts + contains + by_name)[:limit]
    for r in results:
        r["exchange"] = exchange
    return results
