# StockSense India — Claude Code Project Guide

## Project Overview
StockSense is a full-stack web application for monitoring Indian stock market data (NSE/BSE), analyzing news sentiment, tracking global economic indicators, and predicting stock prices using ML models.

## Architecture
- **Backend**: FastAPI (Python 3.11+) in `backend/`
- **Frontend**: React + Vite in `frontend/`
- **ML Pipeline**: scikit-learn + Prophet in `backend/app/services/prediction/`
- **Database**: SQLite (dev) / PostgreSQL (prod) via SQLAlchemy

## Data Sources (All Free, No API Keys Required)
- `yfinance` — Yahoo Finance for NSE/BSE historical data (suffix `.NS` for NSE, `.BO` for BSE)
- `feedparser` — RSS feeds: Economic Times, Moneycontrol, Google News India
- World Bank API — global economic indicators (open, no auth)
- `requests` + `BeautifulSoup4` — web scraping for additional signals
- `vaderSentiment` — local NLP for news sentiment (no API key)

## Separation of Concerns
```
agents/       → Long-running autonomous tasks (data pipelines, training)
services/     → Stateless business logic called by API routes
tasks/        → Background Celery jobs (scheduled fetches)
api/routes/   → Thin HTTP handlers, delegate to services
models/       → ML model classes
db/           → ORM models and session management
schemas/      → Pydantic request/response contracts
```

## Development Commands
```bash
# Backend
cd backend && pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8000

# Frontend
cd frontend && npm install && npm run dev

# Full stack
docker-compose up
```

## Key Conventions
- Use `yfinance` ticker suffix `.NS` for NSE stocks (e.g., `RELIANCE.NS`)
- All timestamps stored as UTC; display in IST (UTC+5:30) on frontend
- News RSS feeds polled every 15 minutes via background task
- Model retraining triggered manually via `/api/predictions/train` endpoint
- Never commit `.env` files; use `.env.example` as template

## Agent Responsibilities
- `data-fetcher` agent: Fetches and caches raw market + economic data
- `news-analyst` agent: Processes RSS feeds and computes sentiment scores
- `ml-predictor` agent: Trains and evaluates prediction models
- `portfolio-advisor` agent: Generates stock recommendations based on signals

## MCP Servers

Two MCP servers are configured in `.mcp.json` and available to all agents in this project.

### Context7 (`mcp__context7__*`)
Provides live, version-accurate documentation for any library used in this project.
Use it whenever you need to check API signatures, configuration options, or changelogs.

```
# Resolve a library to its Context7 ID
mcp__context7__resolve-library-id  { "libraryName": "prophet" }
mcp__context7__resolve-library-id  { "libraryName": "fastapi" }
mcp__context7__resolve-library-id  { "libraryName": "react" }

# Fetch targeted docs (topic narrows the results)
mcp__context7__get-library-docs  { "context7CompatibleLibraryID": "/facebook/prophet", "topic": "regressors" }
mcp__context7__get-library-docs  { "context7CompatibleLibraryID": "/tiangolo/fastapi",  "topic": "background tasks" }
```

**When to use**: Before adding a new dependency, when a library API is unclear, or when
debugging a version-specific issue. Prefer this over web search for library docs.

### Playwright (`mcp__playwright__*`)
Headless browser automation for end-to-end testing and UI verification of the frontend.

```
mcp__playwright__browser_navigate   { "url": "http://localhost:5173" }
mcp__playwright__browser_screenshot { "name": "dashboard" }
mcp__playwright__browser_click      { "element": "Add stock button", "ref": "..." }
mcp__playwright__browser_snapshot   {}   # get accessibility tree for assertions
```

**When to use**:
- Verifying that a new UI component renders correctly
- Running end-to-end smoke tests after backend changes
- Debugging frontend issues that are hard to reproduce from logs alone
- Validating chart data matches API responses

Ensure the frontend dev server is running on port 5173 before using Playwright tools.

## Testing
```bash
cd backend && pytest tests/ -v
cd frontend && npm test
```

## Deployment
- Local: `docker-compose up`
- Production: Set `ENV=production` in `.env`, use `docker-compose -f docker-compose.prod.yml up`
