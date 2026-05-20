"""
Centralized exchange registry. Adding a new exchange is just a new entry here —
no code changes needed anywhere else.
"""

from __future__ import annotations

EXCHANGES: dict[str, dict] = {
    "NSE": {
        "id": "NSE",
        "label": "NSE",
        "country": "India",
        "flag": "🇮🇳",
        "currency": "INR",
        "currency_symbol": "₹",
        "locale": "en-IN",
        "timezone": "Asia/Kolkata",
        "market_hours": {"open": "09:15", "close": "15:30"},
        "suffix": ".NS",
        "benchmark_index": "^NSEI",
        "indices": {
            "NIFTY 50": "^NSEI",
            "SENSEX": "^BSESN",
            "BANK NIFTY": "^NSEBANK",
        },
    },
    "BSE": {
        "id": "BSE",
        "label": "BSE",
        "country": "India",
        "flag": "🇮🇳",
        "currency": "INR",
        "currency_symbol": "₹",
        "locale": "en-IN",
        "timezone": "Asia/Kolkata",
        "market_hours": {"open": "09:15", "close": "15:30"},
        "suffix": ".BO",
        "benchmark_index": "^BSESN",
        "indices": {
            "SENSEX": "^BSESN",
        },
    },
    "NASDAQ": {
        "id": "NASDAQ",
        "label": "NASDAQ",
        "country": "United States",
        "flag": "🇺🇸",
        "currency": "USD",
        "currency_symbol": "$",
        "locale": "en-US",
        "timezone": "America/New_York",
        "market_hours": {"open": "09:30", "close": "16:00"},
        "suffix": "",
        "benchmark_index": "^GSPC",
        "indices": {
            "S&P 500": "^GSPC",
            "NASDAQ": "^IXIC",
            "DOW JONES": "^DJI",
        },
    },
}

ALL_EXCHANGE_ID = "ALL"
VALID_EXCHANGE_IDS = {ALL_EXCHANGE_ID} | set(EXCHANGES.keys())


def get_exchange(exchange_id: str) -> dict | None:
    return EXCHANGES.get(exchange_id)


def get_suffix(exchange_id: str) -> str:
    ex = EXCHANGES.get(exchange_id)
    return ex["suffix"] if ex else ".NS"


def get_all_indices() -> dict[str, str]:
    result = {}
    for ex in EXCHANGES.values():
        result.update(ex["indices"])
    return result


def get_indices_for_exchange(exchange_id: str) -> dict[str, str]:
    if exchange_id == ALL_EXCHANGE_ID:
        return get_all_indices()
    ex = EXCHANGES.get(exchange_id)
    return ex["indices"] if ex else {}


def get_benchmark(exchange_id: str) -> str | None:
    ex = EXCHANGES.get(exchange_id)
    return ex["benchmark_index"] if ex else None


def exchange_for_symbol(symbol: str) -> str:
    if symbol.endswith(".NS"):
        return "NSE"
    if symbol.endswith(".BO"):
        return "BSE"
    return "NASDAQ"


def get_client_registry() -> list[dict]:
    """Return exchange metadata for the frontend."""
    return [
        {
            "id": ex["id"],
            "label": ex["label"],
            "country": ex["country"],
            "flag": ex["flag"],
            "currency": ex["currency"],
            "currency_symbol": ex["currency_symbol"],
            "locale": ex["locale"],
            "timezone": ex["timezone"],
            "market_hours": ex["market_hours"],
        }
        for ex in EXCHANGES.values()
    ]
