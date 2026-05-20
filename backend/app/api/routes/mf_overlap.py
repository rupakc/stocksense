import logging

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.database import get_db
from app.db.models import Holding, User, WatchedSymbol

router = APIRouter()
logger = logging.getLogger(__name__)

# Top MF schemes and their approximate top holdings (% weight)
# Data sourced from public AMFI disclosures
TOP_MF_SCHEMES = {
    "SBI Bluechip Fund": {
        "category": "Large Cap",
        "aum_cr": 48000,
        "holdings": {
            "HDFCBANK.NS": 9.5,
            "ICICIBANK.NS": 8.2,
            "RELIANCE.NS": 7.8,
            "INFY.NS": 6.5,
            "TCS.NS": 5.8,
            "BHARTIARTL.NS": 4.2,
            "ITC.NS": 3.8,
            "LT.NS": 3.5,
            "SBIN.NS": 3.2,
            "AXISBANK.NS": 2.8,
            "HCLTECH.NS": 2.5,
            "KOTAKBANK.NS": 2.3,
            "SUNPHARMA.NS": 2.1,
            "MARUTI.NS": 1.9,
            "HINDUNILVR.NS": 1.8,
        },
    },
    "HDFC Mid-Cap Opportunities": {
        "category": "Mid Cap",
        "aum_cr": 42000,
        "holdings": {
            "MPHASIS.NS": 3.5,
            "INDIANB.NS": 3.2,
            "PERSISTENT.NS": 3.0,
            "COFORGE.NS": 2.8,
            "MAXHEALTH.NS": 2.5,
            "SUNDARMFIN.NS": 2.3,
            "ASTRAL.NS": 2.1,
            "VOLTAS.NS": 2.0,
            "CUMMINSIND.NS": 1.9,
            "OBEROIRLTY.NS": 1.8,
            "AUBANK.NS": 1.7,
            "ESCORTS.NS": 1.6,
        },
    },
    "Axis Growth Opp Fund": {
        "category": "Large & Mid Cap",
        "aum_cr": 18000,
        "holdings": {
            "BAJFINANCE.NS": 5.2,
            "RELIANCE.NS": 4.8,
            "HDFCBANK.NS": 4.5,
            "ICICIBANK.NS": 4.0,
            "INFY.NS": 3.8,
            "TCS.NS": 3.5,
            "TITAN.NS": 3.2,
            "DMART.NS": 2.8,
            "BHARTIARTL.NS": 2.5,
            "NESTLEIND.NS": 2.2,
            "HCLTECH.NS": 2.0,
        },
    },
    "Parag Parikh Flexi Cap": {
        "category": "Flexi Cap",
        "aum_cr": 55000,
        "holdings": {
            "HDFCBANK.NS": 7.5,
            "ICICIBANK.NS": 5.8,
            "ITC.NS": 4.5,
            "BAJAJHLDNG.NS": 3.8,
            "COALINDIA.NS": 3.2,
            "BHARTIARTL.NS": 2.8,
            "KOTAKBANK.NS": 2.5,
            "SBIN.NS": 2.2,
            "POWERGRID.NS": 2.0,
            "ONGC.NS": 1.8,
        },
    },
    "Mirae Asset Large Cap": {
        "category": "Large Cap",
        "aum_cr": 38000,
        "holdings": {
            "HDFCBANK.NS": 9.0,
            "RELIANCE.NS": 8.5,
            "ICICIBANK.NS": 7.0,
            "INFY.NS": 6.0,
            "TCS.NS": 5.5,
            "BHARTIARTL.NS": 4.0,
            "LT.NS": 3.5,
            "SBIN.NS": 3.0,
            "AXISBANK.NS": 2.8,
            "HCLTECH.NS": 2.5,
            "SUNPHARMA.NS": 2.2,
            "KOTAKBANK.NS": 2.0,
            "ITC.NS": 1.8,
            "HINDUNILVR.NS": 1.5,
        },
    },
    "Nippon India Small Cap": {
        "category": "Small Cap",
        "aum_cr": 45000,
        "holdings": {
            "KPITTECH.NS": 2.5,
            "TUBE.NS": 2.2,
            "EMAMILTD.NS": 2.0,
            "CERA.NS": 1.8,
            "CARBORUNIV.NS": 1.7,
            "RATNAMANI.NS": 1.6,
            "GRINDWELL.NS": 1.5,
            "GARFIBRES.NS": 1.4,
            "AFFLE.NS": 1.3,
        },
    },
}


@router.get("/overlap")
async def check_mf_overlap(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Check portfolio overlap with top mutual fund schemes."""
    # Get user's holdings
    holdings_result = await db.execute(
        select(Holding.symbol).where(
            Holding.user_id == current_user.id,
            Holding.sell_date.is_(None),
        )
    )
    holding_symbols = set(row[0] for row in holdings_result.all())

    # Also check watchlist
    watch_result = await db.execute(
        select(WatchedSymbol.symbol).where(
            WatchedSymbol.is_active == True,  # noqa: E712
            WatchedSymbol.user_id == current_user.id,
        )
    )
    watchlist_symbols = set(row[0] for row in watch_result.all())

    user_symbols = holding_symbols | watchlist_symbols

    overlaps = []
    for scheme_name, scheme_data in TOP_MF_SCHEMES.items():
        scheme_holdings = set(scheme_data["holdings"].keys())
        common = user_symbols & scheme_holdings

        if common:
            overlap_pct = round(sum(scheme_data["holdings"][s] for s in common), 2)
            overlaps.append(
                {
                    "scheme_name": scheme_name,
                    "category": scheme_data["category"],
                    "aum_cr": scheme_data["aum_cr"],
                    "overlap_count": len(common),
                    "overlap_pct": overlap_pct,
                    "total_holdings": len(scheme_data["holdings"]),
                    "common_stocks": [
                        {"symbol": s, "weight_pct": scheme_data["holdings"][s]}
                        for s in sorted(
                            common,
                            key=lambda x: scheme_data["holdings"][x],
                            reverse=True,
                        )
                    ],
                }
            )

    overlaps.sort(key=lambda x: x["overlap_pct"], reverse=True)

    # Find most popular stocks across schemes
    stock_frequency = {}
    for scheme_data in TOP_MF_SCHEMES.values():
        for sym in scheme_data["holdings"]:
            if sym in user_symbols:
                stock_frequency[sym] = stock_frequency.get(sym, 0) + 1

    popular = sorted(stock_frequency.items(), key=lambda x: x[1], reverse=True)

    return {
        "user_stock_count": len(user_symbols),
        "schemes_analyzed": len(TOP_MF_SCHEMES),
        "overlaps": overlaps,
        "most_popular_holdings": [
            {"symbol": sym, "found_in_schemes": count} for sym, count in popular[:10]
        ],
    }
