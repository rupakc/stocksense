import re
from datetime import datetime
from pydantic import BaseModel, Field, field_validator


class StockPriceOut(BaseModel):
    symbol: str
    timestamp_utc: datetime
    open: float
    high: float
    low: float
    close: float
    volume: int
    adj_close: float | None = None

    model_config = {"from_attributes": True}


class StockQuote(BaseModel):
    symbol: str
    name: str | None
    current_price: float
    previous_close: float
    change: float
    change_pct: float
    day_high: float
    day_low: float
    volume: int
    market_cap: float | None
    pe_ratio: float | None
    week_52_high: float
    week_52_low: float
    fetched_at: datetime


class WatchedSymbolOut(BaseModel):
    symbol: str
    name: str | None
    sector: str | None
    exchange: str
    is_active: bool
    added_at: datetime

    model_config = {"from_attributes": True}


class AddSymbolRequest(BaseModel):
    symbol: str = Field(..., description="Ticker e.g. RELIANCE for NSE, AAPL for NASDAQ")
    exchange: str = Field(default="NSE", description="NSE, BSE, or NASDAQ")

    @field_validator("exchange")
    @classmethod
    def validate_exchange(cls, v):
        allowed = {"NSE", "BSE", "NASDAQ"}
        if v.upper() not in allowed:
            raise ValueError(f"Exchange must be one of {allowed}")
        return v.upper()

    @field_validator("symbol")
    @classmethod
    def validate_symbol(cls, v):
        if not re.match(r"^[A-Z0-9&\.\-]{1,20}$", v.upper()):
            raise ValueError("Invalid symbol format")
        return v.upper()


class InsiderTransaction(BaseModel):
    insider_name: str
    position: str | None = None
    transaction_type: str
    shares: int | None = None
    value: float | None = None
    date: str | None = None
    ownership: str | None = None
    source: str = "yfinance"


class InsiderTradesResponse(BaseModel):
    symbol: str
    transactions: list[InsiderTransaction]
    data_sources: list[str]
    last_updated: str
