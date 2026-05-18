"""
Fetches bulk/block deal data from NSE India's public API.
Supplements yfinance insider data which is often incomplete for Indian stocks.
"""
from __future__ import annotations

import logging
import time
from datetime import datetime, timedelta

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

_NSE_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.nseindia.com/",
}

_BULK_URL = "https://www.nseindia.com/api/historical/bulk-deals"
_BLOCK_URL = "https://www.nseindia.com/api/historical/block-deals"

_cache: dict[str, tuple[float, list[dict]]] = {}


def _get_nse_client() -> httpx.Client:
    client = httpx.Client(headers=_NSE_HEADERS, follow_redirects=True, timeout=15)
    client.get("https://www.nseindia.com")
    return client


def _parse_nse_symbol(symbol: str) -> str:
    return symbol.replace(".NS", "").replace(".BO", "").upper()


def _fetch_deals(client: httpx.Client, url: str, nse_sym: str, days: int = 180) -> list[dict]:
    to_date = datetime.now()
    from_date = to_date - timedelta(days=days)
    params = {
        "from": from_date.strftime("%d-%m-%Y"),
        "to": to_date.strftime("%d-%m-%Y"),
    }
    try:
        resp = client.get(url, params=params)
        if resp.status_code != 200:
            return []
        data = resp.json()
        rows = data if isinstance(data, list) else data.get("data", [])
    except Exception as e:
        logger.warning(f"NSE deal fetch failed ({url}): {e}")
        return []

    results = []
    for row in rows:
        sym = row.get("BD_SYMBOL") or row.get("symbol") or ""
        if sym.upper() != nse_sym:
            continue
        buy_sell = (row.get("BD_BUY_SELL") or row.get("buyOrSell") or "").upper()
        tx_type = "Buy" if buy_sell == "BUY" else "Sell" if buy_sell == "SELL" else buy_sell or "Other"
        try:
            qty = int(float(row.get("BD_QTY_TRD") or row.get("quantity") or 0))
        except (ValueError, TypeError):
            qty = None
        try:
            price = float(row.get("BD_TP_WATP") or row.get("avgPrice") or 0)
            val = round(qty * price) if qty and price else None
        except (ValueError, TypeError):
            val = None
        raw_date = row.get("BD_DT_DATE") or row.get("date") or ""
        try:
            parsed_date = datetime.strptime(raw_date[:10], "%d-%b-%Y").strftime("%Y-%m-%d") if raw_date else None
        except ValueError:
            parsed_date = raw_date[:10] if raw_date else None

        results.append({
            "insider_name": row.get("BD_CLIENT_NAME") or row.get("clientName") or "Unknown",
            "position": "Bulk/Block Deal",
            "transaction_type": tx_type,
            "shares": qty,
            "value": val,
            "date": parsed_date,
            "ownership": None,
            "source": "nse_bulk_deals",
        })
    return results


def fetch_nse_bulk_deals(symbol: str) -> list[dict]:
    nse_sym = _parse_nse_symbol(symbol)
    now = time.monotonic()
    cached = _cache.get(nse_sym)
    if cached and (now - cached[0]) < settings.insider_cache_ttl:
        return cached[1]

    try:
        client = _get_nse_client()
    except Exception as e:
        logger.warning(f"NSE session failed: {e}")
        return _cache.get(nse_sym, (0, []))[1]

    try:
        bulk = _fetch_deals(client, _BULK_URL, nse_sym)
        block = _fetch_deals(client, _BLOCK_URL, nse_sym)
        result = bulk + block
        result.sort(key=lambda x: x.get("date") or "", reverse=True)
        _cache[nse_sym] = (now, result)
        return result
    except Exception as e:
        logger.warning(f"NSE bulk deals failed for {symbol}: {e}")
        return []
    finally:
        client.close()
