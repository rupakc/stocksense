"""
Fetches and caches the full NSE equity symbol list from NSE's public CSV.
Falls back to a bundled Nifty-500 list if the live fetch fails.
"""
from __future__ import annotations

import csv
import io
import logging
import time

import httpx

logger = logging.getLogger(__name__)

_cache: list[dict] = []
_cache_time: float = 0
CACHE_TTL = 24 * 3600  # re-fetch once per day

NSE_EQUITY_CSV = "https://archives.nseindia.com/content/equities/EQUITY_L.csv"

_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Referer": "https://www.nseindia.com/",
}

# Bundled fallback — top ~120 liquid NSE stocks across sectors
_FALLBACK: list[dict] = [
    {"symbol": s, "name": n} for s, n in [
        ("RELIANCE","Reliance Industries"),("TCS","Tata Consultancy Services"),
        ("HDFCBANK","HDFC Bank"),("INFY","Infosys"),("ICICIBANK","ICICI Bank"),
        ("HINDUNILVR","Hindustan Unilever"),("ITC","ITC Limited"),
        ("SBIN","State Bank of India"),("BHARTIARTL","Bharti Airtel"),
        ("KOTAKBANK","Kotak Mahindra Bank"),("LT","Larsen & Toubro"),
        ("AXISBANK","Axis Bank"),("ASIANPAINT","Asian Paints"),
        ("MARUTI","Maruti Suzuki"),("BAJFINANCE","Bajaj Finance"),
        ("HCLTECH","HCL Technologies"),("WIPRO","Wipro"),
        ("ULTRACEMCO","UltraTech Cement"),("TITAN","Titan Company"),
        ("NESTLEIND","Nestle India"),("POWERGRID","Power Grid Corporation"),
        ("NTPC","NTPC Limited"),("SUNPHARMA","Sun Pharmaceutical"),
        ("TECHM","Tech Mahindra"),("ONGC","ONGC"),
        ("BAJAJFINSV","Bajaj Finserv"),("ADANIENT","Adani Enterprises"),
        ("ADANIPORTS","Adani Ports"),("COALINDIA","Coal India"),
        ("DIVISLAB","Divi's Laboratories"),("DRREDDY","Dr. Reddy's"),
        ("EICHERMOT","Eicher Motors"),("GRASIM","Grasim Industries"),
        ("HDFCLIFE","HDFC Life"),("HEROMOTOCO","Hero MotoCorp"),
        ("INDUSINDBK","IndusInd Bank"),("JSWSTEEL","JSW Steel"),
        ("M&M","Mahindra & Mahindra"),("SBILIFE","SBI Life Insurance"),
        ("TATAMOTORS","Tata Motors"),("TATASTEEL","Tata Steel"),
        ("CIPLA","Cipla"),("BPCL","BPCL"),("BRITANNIA","Britannia Industries"),
        ("APOLLOHOSP","Apollo Hospitals"),("BAJAJ-AUTO","Bajaj Auto"),
        ("HINDALCO","Hindalco Industries"),("TATACONSUM","Tata Consumer"),
        ("SHREECEM","Shree Cement"),("UPL","UPL Limited"),
        ("VEDL","Vedanta"),("MCDOWELL-N","United Spirits"),
        ("PIDILITIND","Pidilite Industries"),("HAVELLS","Havells India"),
        ("DABUR","Dabur India"),("GODREJCP","Godrej Consumer"),
        ("BERGEPAINT","Berger Paints"),("MARICO","Marico"),
        ("BIOCON","Biocon"),("LUPIN","Lupin"),("TORNTPHARM","Torrent Pharma"),
        ("AUROPHARMA","Aurobindo Pharma"),("ALKEM","Alkem Laboratories"),
        ("MPHASIS","Mphasis"),("LTIM","LTIMindtree"),("PERSISTENT","Persistent Systems"),
        ("COFORGE","Coforge"),("OFSS","Oracle Financial Services"),
        ("NAUKRI","Info Edge"),("ZOMATO","Zomato"),("PAYTM","One 97 Communications"),
        ("POLICYBZR","PB Fintech"),("DELHIVERY","Delhivery"),("NYKAA","FSN E-Commerce"),
        ("IRCTC","Indian Railway Catering"),("RAILTEL","RailTel Corporation"),
        ("IRFC","Indian Railway Finance"),("RVNL","Rail Vikas Nigam"),
        ("HAL","Hindustan Aeronautics"),("BEL","Bharat Electronics"),
        ("BHEL","BHEL"),("SAIL","Steel Authority of India"),
        ("NMDC","NMDC"),("MOIL","MOIL Limited"),("NATIONALUM","National Aluminium"),
        ("APLAPOLLO","APL Apollo Tubes"),("RATNAMANI","Ratnamani Metals"),
        ("KALYANKJIL","Kalyan Jewellers"),("TITAN","Titan Company"),
        ("TRENT","Trent"),("ABFRL","Aditya Birla Fashion"),("PAGEIND","Page Industries"),
        ("MUTHOOTFIN","Muthoot Finance"),("MANAPPURAM","Manappuram Finance"),
        ("CHOLAFIN","Cholamandalam Investment"),("LIChousing","LIC Housing Finance"),
        ("PFC","Power Finance Corporation"),("RECLTD","REC Limited"),
        ("ICICIGI","ICICI Lombard"),("SBICARD","SBI Cards"),
        ("HDFCAMC","HDFC AMC"),("NIPPONLIFE","Nippon India AMC"),
        ("CAMS","Computer Age Management"),("CDSL","CDSL"),
        ("BSE","BSE Limited"),("MCX","MCX India"),
        ("CONCOR","Container Corporation"),("BLUEDART","Blue Dart Express"),
        ("INDIGO","IndiGo"),("SPICEJET","SpiceJet"),
        ("GMRINFRA","GMR Airports"),("ADANIGREEN","Adani Green Energy"),
        ("ADANITRANS","Adani Transmission"),("TATAPOWER","Tata Power"),
        ("TORNTPOWER","Torrent Power"),("CESC","CESC"),
        ("IGL","Indraprastha Gas"),("MGL","Mahanagar Gas"),
        ("GAIL","GAIL India"),("PETRONET","Petronet LNG"),
    ]
]


def _fetch_nse_symbols() -> list[dict]:
    try:
        with httpx.Client(timeout=20, headers=_HEADERS, follow_redirects=True) as client:
            resp = client.get(NSE_EQUITY_CSV)
            resp.raise_for_status()
        reader = csv.DictReader(io.StringIO(resp.text))
        symbols = []
        for row in reader:
            sym    = row.get("SYMBOL", "").strip()
            name   = row.get("NAME OF COMPANY", "").strip()
            # NSE CSV has a leading space in the SERIES column header
            series = row.get(" SERIES", row.get("SERIES", "")).strip()
            if sym and series == "EQ":
                symbols.append({"symbol": sym, "name": name})
        logger.info(f"[NSESymbols] Fetched {len(symbols)} EQ symbols from NSE CSV")
        return symbols
    except Exception as exc:
        logger.warning(f"[NSESymbols] Live fetch failed ({exc}), using fallback list")
        return []


def get_all_symbols() -> list[dict]:
    global _cache, _cache_time
    if _cache and (time.time() - _cache_time) < CACHE_TTL:
        return _cache
    live = _fetch_nse_symbols()
    _cache = live if live else _FALLBACK
    _cache_time = time.time()
    return _cache


def search_symbols(q: str, limit: int = 25) -> list[dict]:
    q = q.strip().upper()
    if not q:
        return []
    pool = get_all_symbols()
    starts   = [s for s in pool if s["symbol"].startswith(q)]
    contains = [s for s in pool if q in s["symbol"] and s not in starts]
    by_name  = [
        s for s in pool
        if q in s["name"].upper() and s not in starts and s not in contains
    ]
    return (starts + contains + by_name)[:limit]
