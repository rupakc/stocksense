# StockSense

A full-stack Indian stock market monitoring and AI-powered prediction platform. Track NSE and NASDAQ equities, run ML-based price forecasts, analyse news sentiment, manage your portfolio, and set price alerts — all in one place.

## Live App

| Service | URL |
|---------|-----|
| **Frontend** | https://stocksense-frontend-2hrxgxqboa-ew.a.run.app |
| **Backend API** | https://stocksense-backend-2hrxgxqboa-ew.a.run.app |
| **API Docs** | https://stocksense-backend-2hrxgxqboa-ew.a.run.app/docs |
| **GitHub Pages** | https://rupakc.github.io/stocksense/ |
| **Wiki** | https://github.com/rupakc/stocksense/wiki |

---

## Features

| Module | Capabilities |
|--------|-------------|
| **Watchlist & Quotes** | Real-time NSE/BSE/NASDAQ quotes, price history, candlestick charts |
| **ML Predictions** | Prophet + scikit-learn price forecasting; on-demand model training |
| **News & Sentiment** | RSS feed aggregation (Economic Times, Moneycontrol, Google News India) with VADER sentiment scoring |
| **Economic Indicators** | World Bank API — GDP, inflation, interest rates, forex |
| **Portfolio** | Holdings tracking, cost basis, asset allocation, P&L |
| **Trading Strategies** | Strategy definitions, backtesting, signal generation |
| **Stock Screener** | Filter by P/E, market cap, dividend yield, momentum |
| **Compare** | Side-by-side relative performance across any two symbols |
| **Mutual Funds** | Scheme overlap analysis, portfolio comparison |
| **Tax Report** | Capital gains tracking, tax-loss harvesting, FIFO cost basis |
| **Corporate Actions** | Dividend announcements, splits, bonus issues |
| **Alerts** | Price, news, and strategy signal alerts |

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│  Frontend  (React 19 + Vite + TailwindCSS v4)        │
│  Recharts · Lightweight-Charts · TanStack Query       │
│  Zustand state · React Router                        │
└─────────────────────┬────────────────────────────────┘
                      │  REST / JWT
                      ▼
┌──────────────────────────────────────────────────────┐
│  Backend  (FastAPI + Python 3.11+)                   │
│                                                      │
│  API Routes (14 modules)                             │
│  ├── auth, stocks, predictions, news                 │
│  ├── economic, portfolio, strategies, screener       │
│  ├── compare, mf_overlap, tax, corporate_actions     │
│  └── alerts                                          │
│                                                      │
│  Services                                            │
│  ├── NSEFetcher (yfinance .NS/.BO)                  │
│  ├── PredictionService (Prophet + sklearn)           │
│  ├── NewsFetcher (RSS + feedparser)                  │
│  └── SentimentAnalyser (VADER)                       │
│                                                      │
│  Background (Celery + Redis)                         │
│  └── Data refresh · Model retraining · Alert sends   │
│                                                      │
│  Database: SQLite (dev) · PostgreSQL (prod)          │
│  ORM: SQLAlchemy 2.0 async + Alembic migrations      │
└──────────────────────────────────────────────────────┘
        │                         │
        ▼                         ▼
  yfinance / NSE           World Bank API
  RSS feeds                (economic data)
```

---

## Tech Stack

### Backend
| Package | Purpose |
|---------|---------|
| FastAPI 0.111 + uvicorn | Async REST API |
| SQLAlchemy 2.0 + Alembic | Async ORM + schema migrations |
| Prophet 1.1.5 | Time-series price forecasting |
| scikit-learn 1.5 | Feature engineering + regression |
| yfinance 0.2.40 | NSE / BSE / NASDAQ market data |
| vaderSentiment | News sentiment scoring |
| feedparser + beautifulsoup4 | RSS ingestion + HTML parsing |
| Celery 5.4 + Redis 5.0 | Async task queue |
| pyjwt | JWT authentication |
| aiosqlite / aiofiles | Async I/O |
| ruff | Linting + formatting |

### Frontend
| Package | Purpose |
|---------|---------|
| React 19.2 + Vite | UI framework + fast dev build |
| React Router 7 | Client-side routing |
| TanStack Query 5 | Server state & caching |
| Recharts 3 | Portfolio and comparison charts |
| Lightweight-Charts 5 | Candlestick / OHLCV charts |
| TailwindCSS v4 | Utility-first CSS |
| Zustand 5 | Global state (auth, watchlist, theme) |
| Axios | HTTP client |
| Playwright 1.59 | End-to-end tests |

---

## Prerequisites

- Python 3.11+
- Node.js 20+ (or use the Docker path)
- Redis (for Celery background tasks)

---

## Quick Start

### Option A — Shell scripts

```bash
git clone https://github.com/rupakc/stocksense.git
cd stocksense

# Copy and fill in env vars
cp backend/.env.example backend/.env

# Start both servers
./start.sh
```

Frontend: **http://localhost:5173** | Backend: **http://localhost:8000** | API docs: **http://localhost:8000/docs**

```bash
./stop.sh   # graceful shutdown
```

### Option B — Make

```bash
make install   # install all dependencies
make dev       # run backend + frontend in parallel
```

### Option C — Docker

```bash
# Production build
docker-compose up --build

# Dev build (hot-reload)
docker-compose -f docker-compose.dev.yml up --build
```

---

## Manual Setup

### Backend

```bash
cd backend

# Create and activate virtual environment
python -m venv .venv && source .venv/bin/activate

# Install dependencies
pip install -e ".[dev]"

# Apply database migrations
alembic upgrade head

# Start dev server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev        # dev server on :5173
npm run build      # production build
```

---

## Configuration

Copy `backend/.env.example` to `backend/.env`:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ENV` | No | `development` | `development` or `production` |
| `DEBUG` | No | `true` | Enable debug logging |
| `DATABASE_URL` | No | SQLite | Use `postgresql+asyncpg://...` for prod |
| `CORS_ORIGINS` | No | localhost ports | JSON array of allowed origins |
| `MODEL_DIR` | No | `models/saved` | Path to store trained `.joblib` models |
| `JWT_SECRET_KEY` | **Yes (prod)** | placeholder | Strong random secret — rotate before deploying |
| `DEFAULT_USERNAME` | No | `admin` | Seed admin account username |
| `DEFAULT_PASSWORD` | No | `Change-Me-123!` | Seed admin password — change immediately |

> No paid API keys required. Data is sourced from yfinance, World Bank, and public RSS feeds.

---

## API Reference

All routes except `/api/auth/*` and `/health` require a `Bearer <token>` header.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/register` | Create user account |
| `POST` | `/api/auth/login` | Obtain JWT token |
| `GET` | `/api/stocks/watchlist` | Get your watchlist |
| `POST` | `/api/stocks/watchlist` | Add symbol to watchlist |
| `GET` | `/api/stocks/{symbol}/quote` | Live quote (NSE suffix `.NS`) |
| `GET` | `/api/stocks/{symbol}/history` | OHLCV price history |
| `GET` | `/api/predictions/{symbol}` | ML price forecast |
| `POST` | `/api/predictions/train` | Trigger model training |
| `GET` | `/api/news` | Latest news with sentiment scores |
| `GET` | `/api/economic` | World Bank economic indicators |
| `GET/POST` | `/api/portfolio` | Holdings and P&L |
| `GET` | `/api/strategies` | Trading strategies + signals |
| `GET` | `/api/screener` | Filter stocks by criteria |
| `GET` | `/api/compare` | Compare two symbols |
| `GET` | `/api/mf-overlap` | Mutual fund overlap analysis |
| `GET` | `/api/tax` | Capital gains report |
| `GET` | `/api/corporate-actions` | Dividends, splits, bonuses |
| `GET/POST` | `/api/alerts` | Price and news alerts |
| `GET` | `/health` | Health check |

Full interactive docs available at `http://localhost:8000/docs` (Swagger UI).

---

## ML Prediction Pipeline

```
yfinance OHLCV data
    │
    ▼
FeatureBuilder          ← RSI, MACD, Bollinger Bands, rolling stats
    │
    ├── Prophet model   ← trend + seasonality decomposition
    └── sklearn model   ← gradient boosting on technical features
    │
    ▼
Forecasted price series (next N days)
    │
    ▼
/api/predictions/{symbol}   ← served as JSON
```

Models are stored as `.joblib` files in `backend/models/saved/` and auto-retrained when stale (configurable via `prediction_max_age_hours`).

---

## Autonomous Agents

Four Claude Code agents in `.claude/agents/` handle long-running data pipelines:

| Agent | Task |
|-------|------|
| `data-fetcher` | Pull and cache NSE/BSE + economic data |
| `ml-predictor` | Train and evaluate forecasting models |
| `news-analyst` | Process RSS feeds + compute sentiment |
| `portfolio-advisor` | Generate recommendations from signals |

---

## Project Structure

```
stocksense/
├── backend/
│   ├── app/
│   │   ├── main.py                  # App entry, middleware, route registration
│   │   ├── api/routes/              # 14 feature modules
│   │   ├── services/
│   │   │   ├── market_data/         # NSEFetcher, indicators, symbol search
│   │   │   ├── prediction/          # FeatureBuilder, Prophet model
│   │   │   ├── news/                # RSS fetcher, sentiment, web search
│   │   │   ├── portfolio/           # Portfolio advisor
│   │   │   ├── strategy/            # Strategy engine
│   │   │   └── economic/            # World Bank indicators
│   │   ├── db/
│   │   │   ├── models.py            # SQLAlchemy ORM models
│   │   │   └── database.py          # Async engine setup
│   │   ├── schemas/                 # Pydantic request/response models
│   │   └── core/
│   │       ├── config.py            # Env settings
│   │       └── security.py          # JWT utilities
│   ├── alembic/                     # Database migrations
│   ├── models/saved/                # Trained .joblib model files
│   ├── tests/                       # pytest test suite
│   └── pyproject.toml
├── frontend/
│   ├── src/
│   │   ├── pages/                   # One file per route (Dashboard, Portfolio…)
│   │   ├── components/              # Shared UI components
│   │   ├── services/api.js          # Axios client + interceptors
│   │   └── store/                   # Zustand stores (auth, watchlist, theme)
│   ├── e2e/                         # Playwright end-to-end tests
│   └── package.json
├── .claude/agents/                  # Claude Code agent definitions
├── .claude/commands/                # CLI slash commands (analyze, fetch-stock, train)
├── CLAUDE.md                        # Developer architecture guide
├── Makefile                         # Dev shortcuts
├── docker-compose.yml
└── docker-compose.dev.yml
```

---

## Testing

```bash
# Backend unit tests
cd backend && pytest tests/ -v

# Backend linting
cd backend && ruff check app/ && ruff format app/

# Frontend E2E tests (requires running servers)
cd frontend && npx playwright test

# All via Make
make test
make lint
```

---

## Ticker Conventions

- NSE symbols: append `.NS` — e.g. `RELIANCE.NS`, `HDFCBANK.NS`
- BSE symbols: append `.BO` — e.g. `RELIANCE.BO`
- NASDAQ/NYSE: no suffix — e.g. `AAPL`, `TSLA`

---

## License

MIT
