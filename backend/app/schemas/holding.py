from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator


class HoldingCreate(BaseModel):
    symbol: str = Field(
        ..., min_length=1, max_length=30, description="Full symbol e.g. RELIANCE.NS"
    )
    quantity: float = Field(..., gt=0, le=1_000_000_000)
    buy_price: float = Field(..., gt=0, le=1_000_000_000)
    buy_date: datetime
    notes: Optional[str] = Field(None, max_length=500)

    @field_validator("symbol")
    @classmethod
    def validate_symbol(cls, v):
        import re

        if not re.match(r"^[A-Z0-9&\.\-]{1,20}(\.(NS|BO))?$", v):
            raise ValueError("Invalid symbol format")
        return v


class HoldingUpdate(BaseModel):
    quantity: Optional[float] = Field(None, gt=0, le=1_000_000_000)
    buy_price: Optional[float] = Field(None, gt=0, le=1_000_000_000)
    buy_date: Optional[datetime] = None
    sell_price: Optional[float] = Field(None, gt=0, le=1_000_000_000)
    sell_date: Optional[datetime] = None
    notes: Optional[str] = Field(None, max_length=500)


class HoldingOut(BaseModel):
    id: int
    symbol: str
    quantity: float
    buy_price: float
    buy_date: datetime
    sell_price: Optional[float] = None
    sell_date: Optional[datetime] = None
    notes: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class PortfolioSummary(BaseModel):
    total_invested: float
    current_value: float
    total_pnl: float
    total_pnl_pct: float
    holdings_count: int
    day_pnl: float
    day_pnl_pct: float
