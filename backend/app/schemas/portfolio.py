from typing import Optional
from pydantic import BaseModel


class StockAdvisory(BaseModel):
    symbol:              str
    signal:              str              # BUY | HOLD | SELL | WATCH
    confidence:          str              # high | medium | low
    composite_score:     float
    technical_score:     float
    prediction_score:    float
    sentiment_score:     float
    rationale:           str
    predicted_7d_return: Optional[float] = None   # percent
    risk_level:          str              # high | medium | low
    last_close:          Optional[float] = None
    rsi:                 Optional[float] = None
    sentiment_label:     Optional[str]   = None
    article_count_7d:    int             = 0

    model_config = {"from_attributes": True}
