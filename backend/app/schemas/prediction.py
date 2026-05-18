from datetime import datetime
from pydantic import BaseModel


class PredictionPoint(BaseModel):
    date: str
    predicted_close: float
    lower_bound: float
    upper_bound: float


class PredictionOut(BaseModel):
    symbol: str
    model_name: str
    trained_at: datetime
    horizon_days: int
    predictions: list[PredictionPoint]
    metrics: dict | None
    confidence: str  # "high" | "medium" | "low"
    features_used: list[str] = []


class TrainRequest(BaseModel):
    symbol: str
    horizon_days: int = 30
    model_name: str = "prophet"
