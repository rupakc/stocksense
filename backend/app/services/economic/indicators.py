"""
Economic indicators service.

Data sources:
  - World Bank Open API (no auth) — annual macro indicators
  - Yahoo Finance via yfinance   — live forex, commodities, sector indices
"""

import logging
from datetime import datetime, timezone

import requests

logger = logging.getLogger(__name__)

WORLD_BANK_BASE = "https://api.worldbank.org/v2"

# ──────────────────────────────────────────────────────────────────────────────
# World Bank indicator catalog
# Format: (country_code, wb_indicator_code, display_label, category)
# ──────────────────────────────────────────────────────────────────────────────
WORLD_BANK_INDICATORS = [
    # ── India Macro ──────────────────────────────────────────────────────────
    ("IN", "NY.GDP.MKTP.KD.ZG", "India GDP Growth (%)", "India Macro"),
    ("IN", "FP.CPI.TOTL.ZG", "India CPI Inflation (%)", "India Macro"),
    ("IN", "FR.INR.RINR", "India Real Interest Rate (%)", "India Macro"),
    ("IN", "SL.UEM.TOTL.ZS", "India Unemployment Rate (%)", "India Macro"),
    ("IN", "NE.TRD.GNFS.ZS", "India Trade (% of GDP)", "India Macro"),
    ("IN", "BN.CAB.XOKA.GD.ZS", "India Current Account (% of GDP)", "India Macro"),
    ("IN", "BX.KLT.DINV.WD.GD.ZS", "India FDI Inflows (% of GDP)", "India Macro"),
    ("IN", "GC.DOD.TOTL.GD.ZS", "India Govt Debt (% of GDP)", "India Macro"),
    ("IN", "FS.AST.DOMS.GD.ZS", "India Private Credit (% of GDP)", "India Macro"),
    ("IN", "NV.IND.TOTL.KD.ZG", "India Industrial Growth (%)", "India Macro"),
    ("IN", "NV.SRV.TOTL.KD.ZG", "India Services Growth (%)", "India Macro"),
    ("IN", "NY.GDP.PCAP.CD", "India GDP per Capita (USD)", "India Macro"),
    # ── Global Macro ─────────────────────────────────────────────────────────
    ("US", "NY.GDP.MKTP.KD.ZG", "US GDP Growth (%)", "Global Macro"),
    ("US", "FP.CPI.TOTL.ZG", "US CPI Inflation (%)", "Global Macro"),
    ("US", "SL.UEM.TOTL.ZS", "US Unemployment Rate (%)", "Global Macro"),
    ("CN", "NY.GDP.MKTP.KD.ZG", "China GDP Growth (%)", "Global Macro"),
    ("CN", "FP.CPI.TOTL.ZG", "China CPI Inflation (%)", "Global Macro"),
    ("1W", "NY.GDP.MKTP.KD.ZG", "World GDP Growth (%)", "Global Macro"),
    ("1W", "FP.CPI.TOTL.ZG", "World Inflation (%)", "Global Macro"),
]

# ──────────────────────────────────────────────────────────────────────────────
# Live market tickers (yfinance)
# Format: (display_label, ticker, category)
# ──────────────────────────────────────────────────────────────────────────────
LIVE_TICKERS = {
    # Forex
    "USD/INR": ("USDINR=X", "Forex"),
    "EUR/INR": ("EURINR=X", "Forex"),
    "GBP/INR": ("GBPINR=X", "Forex"),
    "JPY/INR": ("JPYINR=X", "Forex"),
    "CNY/INR": ("CNYINR=X", "Forex"),
    # Commodities
    "Crude Oil": ("CL=F", "Commodities"),
    "Gold": ("GC=F", "Commodities"),
    "Silver": ("SI=F", "Commodities"),
    "Copper": ("HG=F", "Commodities"),
    "Nat. Gas": ("NG=F", "Commodities"),
    # Indian indices
    "Nifty 50": ("^NSEI", "Indian Indices"),
    "Nifty Bank": ("^NSEBANK", "Indian Indices"),
    "Nifty IT": ("^CNXIT", "Indian Indices"),
    "Nifty Auto": ("^CNXAUTO", "Indian Indices"),
    "Nifty FMCG": ("^CNXFMCG", "Indian Indices"),
    "Nifty Pharma": ("^CNXPHARMA", "Indian Indices"),
    "Nifty Midcap": ("NIFMDCP100.NS", "Indian Indices"),
    "Sensex": ("^BSESN", "Indian Indices"),
    # Global
    "S&P 500": ("^GSPC", "Global Indices"),
    "NASDAQ": ("^IXIC", "Global Indices"),
    "Nikkei 225": ("^N225", "Global Indices"),
    "HSI": ("^HSI", "Global Indices"),
    "US 10Y": ("^TNX", "Global Indices"),
    "VIX": ("^VIX", "Global Indices"),
    "India VIX": ("^INDIAVIX", "Global Indices"),
}


class EconomicService:
    def __init__(self):
        import asyncio

        self._wb_cache: dict = {}
        self._wb_cache_ts: datetime | None = None
        self._live_cache: dict = {}
        self._live_cache_ts: datetime | None = None
        self._wb_lock = asyncio.Lock()
        self._live_lock = asyncio.Lock()

    def _wb_cache_fresh(self) -> bool:
        if not self._wb_cache_ts:
            return False
        return (datetime.now(timezone.utc) - self._wb_cache_ts).total_seconds() < 86400

    def _live_cache_fresh(self) -> bool:
        if not self._live_cache_ts:
            return False
        return (datetime.now(timezone.utc) - self._live_cache_ts).total_seconds() < 300

    # ------------------------------------------------------------------
    # World Bank indicators — grouped by category
    # ------------------------------------------------------------------

    async def get_key_indicators(self) -> dict:
        if self._wb_cache_fresh():
            return self._wb_cache

        async with self._wb_lock:
            if self._wb_cache_fresh():
                return self._wb_cache

            import asyncio

            loop = asyncio.get_event_loop()

            def _fetch_all():
                grouped: dict[str, list] = {}
                for country, code, label, category in WORLD_BANK_INDICATORS:
                    data = self._fetch_world_bank(country, code)
                    entry = {"label": label, **data}
                    grouped.setdefault(category, []).append(entry)
                return grouped

            grouped = await loop.run_in_executor(None, _fetch_all)
            self._wb_cache = grouped
            self._wb_cache_ts = datetime.now(timezone.utc)
            return grouped

    def _fetch_world_bank(self, country: str, indicator: str) -> dict:
        url = f"{WORLD_BANK_BASE}/country/{country}/indicator/{indicator}"
        params = {"format": "json", "mrv": 6, "per_page": 6}
        try:
            resp = requests.get(url, params=params, timeout=(15, 8))
            resp.raise_for_status()
            payload = resp.json()
            if len(payload) < 2 or not payload[1]:
                return {"error": "No data available", "data": []}
            entries = [
                {"year": e["date"], "value": round(e["value"], 3)}
                for e in payload[1]
                if e.get("value") is not None
            ]
            return {"country": country, "indicator": indicator, "data": entries}
        except Exception as exc:
            logger.warning(f"World Bank error {country}/{indicator}: {exc}")
            return {"error": str(exc), "data": []}

    # ------------------------------------------------------------------
    # Live market data — grouped by category
    # ------------------------------------------------------------------

    async def get_forex_rates(self) -> dict:
        """Returns all live tickers grouped by category."""
        if self._live_cache_fresh():
            return self._live_cache

        async with self._live_lock:
            if self._live_cache_fresh():
                return self._live_cache
            return await self._fetch_forex_rates()

    async def _fetch_forex_rates(self) -> dict:
        import asyncio
        import yfinance as yf

        loop = asyncio.get_event_loop()

        def _batch_fetch():
            tickers_list = [tkr for tkr, _cat in LIVE_TICKERS.values()]
            tickers_str = " ".join(tickers_list)

            # Single batch download — much faster than individual Ticker calls
            raw = yf.download(
                tickers_str,
                period="5d",
                progress=False,
                auto_adjust=True,
                group_by="ticker",
                threads=True,
            )

            rates: dict = {}
            for label, (ticker, category) in LIVE_TICKERS.items():
                try:
                    # When only one ticker, yf.download returns flat columns
                    if len(tickers_list) == 1:
                        close_col = raw["Close"].dropna()
                    else:
                        close_col = raw[ticker]["Close"].dropna()

                    if close_col.empty:
                        continue

                    price = float(close_col.iloc[-1])

                    # Compute change_pct from last two closing prices
                    if len(close_col) >= 2:
                        prev = float(close_col.iloc[-2])
                        change_pct = ((price - prev) / prev) * 100 if prev else 0
                    else:
                        change_pct = 0

                    rates[label] = {
                        "ticker": ticker,
                        "category": category,
                        "price": round(price, 4),
                        "change_pct": round(change_pct, 3),
                    }
                except Exception as exc:
                    logger.warning(f"Failed to extract {label} ({ticker}): {exc}")
            return rates

        rates = await loop.run_in_executor(None, _batch_fetch)

        self._live_cache = rates
        self._live_cache_ts = datetime.now(timezone.utc)
        return rates
