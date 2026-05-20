import os

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # App
    app_name: str = "StockSense India"
    env: str = "development"
    debug: bool = False

    # Database
    database_url: str = "sqlite+aiosqlite:///./stocksense.db"

    # CORS
    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:3000"]

    # Cache TTL (seconds)
    quote_cache_ttl: int = 900  # 15 minutes
    news_cache_ttl: int = 900  # 15 minutes
    economic_cache_ttl: int = 86400  # 24 hours
    prediction_cache_ttl: int = 3600  # 1 hour
    prediction_max_age_hours: int = 24
    history_freshness_ttl: int = 900  # 15 minutes — skip re-fetch if data is newer
    insider_cache_ttl: int = 86400  # 24 hours — insider data changes rarely

    # Market hours (IST = UTC+5:30)
    market_open_hour_ist: int = 9
    market_open_minute_ist: int = 15
    market_close_hour_ist: int = 15
    market_close_minute_ist: int = 30

    # Prediction confidence thresholds (MAPE %)
    confidence_high_mape: float = 3.0
    confidence_medium_mape: float = 8.0

    # Portfolio advisor thresholds (composite score)
    advisor_buy_threshold: float = 0.30
    advisor_hold_threshold: float = 0.10
    advisor_watch_threshold: float = -0.10

    # Auth / JWT
    jwt_secret_key: str = "CHANGE-ME-IN-ENV"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60  # 1 hour
    default_username: str = "admin"
    default_password: str = "Change-Me-123!"

    # Model storage
    model_dir: str = "models/saved"

    # GCS persistence (production only; empty = disabled in local dev)
    gcs_bucket: str = ""
    gcs_backup_interval_seconds: int = 900  # 15-minute periodic DB backup

    @property
    def db_file_path(self) -> str:
        """Absolute filesystem path for the SQLite database file.

        Derived from DATABASE_URL; returns '' for non-SQLite databases so
        callers can check truthiness before attempting file-level operations.
        """
        import re

        if "sqlite" not in self.database_url:
            return ""
        m = re.search(r"sqlite[^:]*:///(.+)", self.database_url)
        if not m:
            return ""
        return os.path.abspath(m.group(1))  # handles both relative & absolute paths

    # Default watchlist
    default_symbols: list[str] = [
        "RELIANCE.NS",
        "TCS.NS",
        "INFY.NS",
        "HDFCBANK.NS",
        "ICICIBANK.NS",
        "HINDUNILVR.NS",
        "ITC.NS",
        "SBIN.NS",
        "BHARTIARTL.NS",
        "KOTAKBANK.NS",
    ]

    # Market indices (Indian + US)
    nse_indices: dict[str, str] = {
        "NIFTY50": "^NSEI",
        "SENSEX": "^BSESN",
        "BANKNIFTY": "^NSEBANK",
        "NIFTYMIDCAP": "^CNXMIDCAP",
    }
    us_indices: dict[str, str] = {
        "S&P 500": "^GSPC",
        "NASDAQ": "^IXIC",
        "DOW JONES": "^DJI",
    }

    # Exchange → yfinance suffix mapping
    exchange_suffixes: dict[str, str] = {
        "NSE": ".NS",
        "BSE": ".BO",
        "NASDAQ": "",
    }


settings = Settings()
