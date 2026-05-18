import re
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator


ALERT_TYPES = [
    "price_above",
    "price_below",
    "change_pct_above",
    "change_pct_below",
    "rsi_above",
    "rsi_below",
    "volume_above",
]

_SYMBOL_RE = re.compile(r'^[A-Z0-9&_.-]{1,20}$')


class AlertCreate(BaseModel):
    symbol: str = Field(..., min_length=1, max_length=20)
    alert_type: str = Field(..., description="One of: " + ", ".join(ALERT_TYPES))
    threshold: float

    @field_validator('symbol')
    @classmethod
    def validate_symbol(cls, v):
        if not _SYMBOL_RE.match(v):
            raise ValueError('Invalid symbol format')
        return v


class AlertOut(BaseModel):
    id: int
    symbol: str
    alert_type: str
    threshold: float
    is_active: bool
    triggered_at: Optional[datetime] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class TriggeredAlert(BaseModel):
    id: int
    symbol: str
    alert_type: str
    threshold: float
    current_value: float
    triggered_at: datetime
