from typing import Any, Optional
from pydantic import BaseModel


class StrategyInfo(BaseModel):
    id: str
    name: str
    description: str
    category: str
    parameters: dict[str, Any]
    risk_level: str
    time_horizon: str
    best_for: str
    color: str


class StrategySignal(BaseModel):
    symbol: str
    signal: str
    strength: float
    rationale: str
    entry_price: Optional[float] = None
    stop_loss: Optional[float] = None
    target_price: Optional[float] = None
    last_close: Optional[float] = None
    key_metrics: dict[str, Any] = {}
    last_updated: Optional[str] = None


class StrategySignalsResponse(BaseModel):
    strategy: StrategyInfo
    signals: list[StrategySignal]
    generated_at: str


class TradeRecord(BaseModel):
    entry_date: str
    exit_date: str
    entry_price: float
    exit_price: float
    return_pct: float
    pnl: float
    result: str


class BacktestRequest(BaseModel):
    """Optional body for POST-based backtest with custom parameters."""

    lookback_days: int = 365
    start_date: str | None = None  # "YYYY-MM-DD"
    end_date: str | None = None  # "YYYY-MM-DD"
    params: dict[str, float] | None = None  # strategy parameter overrides
    include_costs: bool = True


class BacktestResult(BaseModel):
    symbol: str
    strategy_id: str
    period_days: int
    total_trades: int
    winning_trades: int
    losing_trades: int
    win_rate: float
    total_return_pct: float
    max_drawdown_pct: float
    sharpe_ratio: float
    buy_and_hold_return_pct: float
    final_equity: float
    equity_curve: list[float]
    trades: list[TradeRecord]
    total_transaction_costs: float = 0.0
